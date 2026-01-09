import OpenAI from "openai"
import { prisma } from "@/lib/prisma"
import { EntityService } from "./entity.service"
import { GroupService } from "./group.service"
import { CampaignType } from "@prisma/client"

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set")
  }
  return new OpenAI({ apiKey })
}

export interface GeneratedEmailDraft {
  subject: string
  body: string
  htmlBody: string
  suggestedRecipients: {
    entityIds?: string[]
    groupIds?: string[]
  }
  suggestedCampaignName?: string
  suggestedCampaignType?: CampaignType
}

export class AIEmailGenerationError extends Error {
  constructor(
    message: string,
    public code: "AI_TIMEOUT" | "AI_ERROR",
    public retryable: boolean
  ) {
    super(message)
    this.name = "AIGenerationError"
  }
}

export class AIEmailGenerationService {
  static async generateDraft(data: {
    organizationId: string
    prompt: string
    selectedRecipients?: {
      entityIds?: string[]
      groupIds?: string[]
    }
    correlationId?: string
  }): Promise<GeneratedEmailDraft> {
    // Get organization context
    const organization = await prisma.organization.findUnique({
      where: { id: data.organizationId }
    })

    // Get entities and groups for context
    const entities = await EntityService.findByOrganization(data.organizationId)
    const groups = await GroupService.findByOrganization(data.organizationId)

    // Build context for AI
    const context = {
      organization: organization?.name,
      entities: entities.map(e => ({
        id: e.id,
        name: e.firstName,
        email: e.email
      })),
      groups: groups.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description
      }))
    }

    // Generate email with GPT-4o-mini (with timeout)
    const openai = getOpenAIClient()
    const AI_TIMEOUT_MS = 30000 // 30 seconds
    const correlationId = data.correlationId || "unknown"
    
    console.log(JSON.stringify({
      event: "ai_generation_start",
      correlationId,
      organizationId: data.organizationId,
      timestamp: new Date().toISOString()
    }))
    
    let timeoutId: NodeJS.Timeout | null = null
    let aborted = false
    
    try {
      const abortController = new AbortController()
      
      // Set up timeout that aborts the request
      timeoutId = setTimeout(() => {
        aborted = true
        abortController.abort()
      }, AI_TIMEOUT_MS)
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an AI assistant that helps generate professional email drafts for accounting teams. 
            Analyze the user's natural language prompt and generate:
            1. A professional email subject line
            2. A clear, professional email body (both plain text and HTML)
            3. Suggested recipients (entity IDs or group IDs from the context)
            4. A suggested campaign name and type if applicable
            
            Respond with a JSON object containing:
            - subject: string
            - body: string (plain text)
            - htmlBody: string (HTML formatted)
            - suggestedRecipients: { entityIds?: string[], groupIds?: string[] }
            - suggestedCampaignName?: string
            - suggestedCampaignType?: string (one of: W9, COI, EXPENSE, TIMESHEET, INVOICE, RECEIPT, CUSTOM)
            
            Match recipient suggestions to entities/groups mentioned in the prompt (e.g., "employees" -> employee group, "vendors" -> vendor group).
            If a campaign type is mentioned (W-9, COI, Expense, etc.), suggest a campaign name and matching campaign type.`
          },
          {
            role: "user",
            content: `Context: ${JSON.stringify(context, null, 2)}\n\nUser prompt: ${data.prompt}\n\nGenerate the email draft.`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
      }, { signal: abortController.signal as any })
      
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      
      console.log(JSON.stringify({
        event: "ai_generation_complete",
        correlationId,
        timestamp: new Date().toISOString()
      }))

      const response = completion.choices[0]?.message?.content
      if (!response) {
        throw new AIEmailGenerationError("No response from OpenAI", "AI_ERROR", false)
      }

    const parsed = JSON.parse(response) as GeneratedEmailDraft

    // Use selected recipients if provided, otherwise validate AI suggestions
    let validatedRecipients: GeneratedEmailDraft["suggestedRecipients"] = {
      entityIds: [],
      groupIds: []
    }

    if (data.selectedRecipients) {
      // Use user-selected recipients
      validatedRecipients = {
        entityIds: data.selectedRecipients.entityIds || [],
        groupIds: data.selectedRecipients.groupIds || []
      }
    } else {
      // Validate and filter AI-suggested recipients
      if (parsed.suggestedRecipients?.entityIds) {
        const validEntityIds = entities
          .filter(e => parsed.suggestedRecipients.entityIds?.includes(e.id))
          .map(e => e.id)
        validatedRecipients.entityIds = validEntityIds
      }

      if (parsed.suggestedRecipients?.groupIds) {
        const validGroupIds = groups
          .filter(g => parsed.suggestedRecipients.groupIds?.includes(g.id))
          .map(g => g.id)
        validatedRecipients.groupIds = validGroupIds
      }
    }

    // Validate suggested campaign type
    const validCampaignTypes: CampaignType[] = ['W9', 'COI', 'EXPENSE', 'TIMESHEET', 'INVOICE', 'RECEIPT', 'CUSTOM']
    let suggestedCampaignType: CampaignType | undefined
    if (parsed.suggestedCampaignType && validCampaignTypes.includes(parsed.suggestedCampaignType as CampaignType)) {
      suggestedCampaignType = parsed.suggestedCampaignType as CampaignType
    }

      return {
        subject: parsed.subject || "Email",
        body: parsed.body || "",
        htmlBody: parsed.htmlBody || parsed.body || "",
        suggestedRecipients: validatedRecipients,
        suggestedCampaignName: parsed.suggestedCampaignName,
        suggestedCampaignType
      }
    } catch (error: any) {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      
      if (aborted || error.name === "AbortError" || error.message?.includes("timeout")) {
        console.log(JSON.stringify({
          event: "ai_generation_timeout",
          correlationId,
          timestamp: new Date().toISOString()
        }))
        throw new AIEmailGenerationError("AI generation timed out after 30 seconds", "AI_TIMEOUT", true)
      }
      
      console.log(JSON.stringify({
        event: "ai_generation_error",
        correlationId,
        error: error.message,
        timestamp: new Date().toISOString()
      }))
      
      throw new AIEmailGenerationError(
        error.message || "AI generation failed",
        "AI_ERROR",
        false
      )
    }
  }
}


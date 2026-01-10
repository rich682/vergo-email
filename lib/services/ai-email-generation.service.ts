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
    senderName?: string
    senderEmail?: string
    senderCompany?: string
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

    // Generate email with GPT-4o-mini (hard 2s timeout for <2s completion)
    const openai = getOpenAIClient()
    const AI_TIMEOUT_MS = 2000 // 2 seconds hard limit for fast completion
    const correlationId = data.correlationId || "unknown"
    const aiStartTime = Date.now()
    
    console.log(JSON.stringify({
      event: "ai_generation_start",
      correlationId,
      idempotencyKey: null, // Set by caller if available
      organizationId: data.organizationId,
      timestamp: new Date().toISOString(),
      timeMs: aiStartTime
    }))
    
    // Deterministic template fallback for fast completion
    const getTemplateFallback = (): GeneratedEmailDraft => {
      const subject = data.prompt.length > 50 
        ? data.prompt.substring(0, 47) + "..."
        : data.prompt
      
      // Build signature for fallback
      const signatureParts: string[] = []
      if (data.senderName) signatureParts.push(data.senderName)
      if (data.senderCompany) signatureParts.push(data.senderCompany)
      if (data.senderEmail) signatureParts.push(data.senderEmail)
      const signature = signatureParts.length > 0 ? signatureParts.join('\n') : (data.senderEmail || '')
      
      const bodyWithSignature = signature
        ? `${data.prompt}\n\n${signature}`
        : data.prompt
      
      const htmlBodyWithSignature = signature
        ? `<p>${data.prompt.replace(/\n/g, '<br>')}</p><br><br>${signature.replace(/\n/g, '<br>')}`
        : `<p>${data.prompt.replace(/\n/g, '<br>')}</p>`
      
      return {
        subject: `Request: ${subject}`,
        body: bodyWithSignature,
        htmlBody: htmlBodyWithSignature,
        suggestedRecipients: {
          entityIds: data.selectedRecipients?.entityIds || [],
          groupIds: data.selectedRecipients?.groupIds || []
        },
        suggestedCampaignName: undefined,
        suggestedCampaignType: undefined
      }
    }
    
    let timeoutId: NodeJS.Timeout | null = null
    let aborted = false
    
    try {
      const abortController = new AbortController()
      
      // Set up 2s timeout that aborts the request
      timeoutId = setTimeout(() => {
        aborted = true
        abortController.abort()
      }, AI_TIMEOUT_MS)
      
      // Build sender signature
      const signatureParts: string[] = []
      if (data.senderName) signatureParts.push(data.senderName)
      if (data.senderCompany) signatureParts.push(data.senderCompany)
      if (data.senderEmail) signatureParts.push(data.senderEmail)
      const signature = signatureParts.length > 0 ? signatureParts.join('\n') : (data.senderEmail || '')

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an AI assistant that helps generate professional, polite email drafts for accounting teams.
            
            Transform the user's request into a polished email with:
            1. A concise, specific subject line (avoid "Request:" prefix unless truly necessary)
            2. A polite email body (6-10 lines) with:
               - Professional greeting
               - Clear ask with deadline if mentioned
               - What to do next (e.g., "reply with attachment", "click link")
               - Professional closing
               - Sender signature (provided separately)
            
            Be concise, professional, and polite. Keep body to 6-10 lines.
            
            Respond with a JSON object containing:
            - subject: string (concise, specific, no "Request:" prefix unless needed)
            - body: string (plain text, 6-10 lines, includes signature at end)
            - htmlBody: string (HTML formatted, same content with <br> for line breaks)
            - suggestedRecipients: { entityIds?: string[], groupIds?: string[] }
            - suggestedCampaignName?: string
            - suggestedCampaignType?: string (one of: W9, COI, EXPENSE, TIMESHEET, INVOICE, RECEIPT, CUSTOM)
            
            The signature will be appended automatically - do NOT include it in body/htmlBody.`
          },
          {
            role: "user",
            content: `Context: ${JSON.stringify(context, null, 2)}

User request: ${data.prompt}

Sender signature to append:
${signature}

Generate a polite, professional email draft. Keep it concise (6-10 lines in body).`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
      }, { signal: abortController.signal as any })
      
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      
      const aiEndTime = Date.now()
      console.log(JSON.stringify({
        event: "ai_generation_complete",
        correlationId,
        idempotencyKey: null,
        timestamp: new Date().toISOString(),
        timeMs: aiEndTime,
        durationMs: aiEndTime - aiStartTime
      }))

      const response = completion.choices[0]?.message?.content
      if (!response) {
        // No response - return template fallback instead of throwing
        console.log(JSON.stringify({
          event: "ai_generation_no_response_fallback",
          correlationId,
          timestamp: new Date().toISOString(),
          usedTemplate: true
        }))
        return getTemplateFallback()
      }

    const parsed = JSON.parse(response) as GeneratedEmailDraft

    // Append signature to body (signature already built above)
    const bodyWithSignature = signature 
      ? `${parsed.body || ""}\n\n${signature}`
      : (parsed.body || "")
    
    const htmlBodyWithSignature = signature
      ? `${parsed.htmlBody || parsed.body || ""}<br><br>${signature.replace(/\n/g, '<br>')}`
      : (parsed.htmlBody || parsed.body || "")

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
        body: bodyWithSignature,
        htmlBody: htmlBodyWithSignature,
        suggestedRecipients: validatedRecipients,
        suggestedCampaignName: parsed.suggestedCampaignName,
        suggestedCampaignType
      }
    } catch (error: any) {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      
      const aiEndTime = Date.now()
      if (aborted || error.name === "AbortError" || error.message?.includes("timeout")) {
        console.log(JSON.stringify({
          event: "ai_generation_timeout_fallback",
          correlationId,
          idempotencyKey: null,
          timestamp: new Date().toISOString(),
          timeMs: aiEndTime,
          durationMs: aiEndTime - aiStartTime,
          usedTemplate: true
        }))
        // Return deterministic template immediately (not an error)
        return getTemplateFallback()
      }
      
      console.log(JSON.stringify({
        event: "ai_generation_error_fallback",
        correlationId,
        idempotencyKey: null,
        error: error.message,
        timestamp: new Date().toISOString(),
        timeMs: aiEndTime,
        durationMs: aiEndTime - aiStartTime,
        usedTemplate: true
      }))
      
      // On any error, return template fallback immediately (deterministic)
      return getTemplateFallback()
    }
  }
}


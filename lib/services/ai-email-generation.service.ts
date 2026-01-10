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
  // Template versions (with {{Tag Name}} placeholders for personalization)
  subjectTemplate?: string
  bodyTemplate?: string
  htmlBodyTemplate?: string
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
    // Personalization fields
    availableTags?: string[] // Array of tag names that can be used in templates
    personalizationMode?: "none" | "contact" | "csv"
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

    // Generate email with GPT-4o-mini (10s timeout for reliable completion)
    const openai = getOpenAIClient()
    const AI_TIMEOUT_MS = 10000 // 10 seconds timeout for reliable LLM completion
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
      
      const subjectTemplate = `Request: ${subject}`
      
      return {
        subject: subjectTemplate,
        body: bodyWithSignature,
        htmlBody: htmlBodyWithSignature,
        subjectTemplate: subjectTemplate,
        bodyTemplate: bodyWithSignature,
        htmlBodyTemplate: htmlBodyWithSignature,
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
            
            Transform the user's request into a polished, professional email. The email should:
            - Start with a professional greeting (e.g., "Dear {{First Name}}," or "Hello,")
            - Clearly state what you need from the recipient
            - Mention any deadlines or due dates if provided
            - Explain what action they need to take (e.g., "Please reply with the attached document", "Click the link below to submit")
            - End with a professional closing (e.g., "Thank you for your prompt attention to this matter.", "Please let me know if you have any questions.")
            - Be concise (6-10 lines total, not including greeting/closing)
            - Be polite and professional in tone
            
            ${data.availableTags && data.availableTags.length > 0 ? `
            PERSONALIZATION: This email will be personalized per recipient using these available tags: ${data.availableTags.join(', ')}
            - Use {{Tag Name}} syntax to insert dynamic values (e.g., {{Invoice Number}}, {{Due Date}}, {{First Name}})
            - Use tags naturally in the email where appropriate
            - If a tag name has spaces, use the exact format shown (e.g., "{{Due Date}}" not "{{DueDate}}")
            - Example: "Dear {{First Name}}, your invoice {{Invoice Number}} for ${{Amount}} is due on {{Due Date}}."
            ` : ''}
            
            The sender signature will be appended automatically by the system - do NOT include it in your response.
            
            Respond with a JSON object containing:
            - subject: string (concise, specific subject line. ${data.availableTags && data.availableTags.length > 0 ? 'May include {{Tag Name}} placeholders if relevant.' : 'Avoid generic prefixes like "Request:" - be specific, e.g., "2024 Payroll Slips Request" instead of "Request: payroll slips"'} )
            - body: string (plain text email body, 6-10 lines. Include greeting, main message, closing. ${data.availableTags && data.availableTags.length > 0 ? 'Use {{Tag Name}} syntax for personalization.' : ''} NO signature)
            - htmlBody: string (HTML formatted version with <br> for line breaks, same content as body)
            - subjectTemplate: string (same as subject, but explicitly use {{Tag Name}} if personalization is enabled)
            - bodyTemplate: string (same as body, but explicitly use {{Tag Name}} if personalization is enabled)
            - htmlBodyTemplate: string (same as htmlBody, but explicitly use {{Tag Name}} if personalization is enabled)
            - suggestedRecipients: { entityIds?: string[], groupIds?: string[] } (optional)
            - suggestedCampaignName?: string (optional)
            - suggestedCampaignType?: string (optional, one of: W9, COI, EXPENSE, TIMESHEET, INVOICE, RECEIPT, CUSTOM)
            
            ${data.availableTags && data.availableTags.length > 0 ? `
            Example with personalization:
            {
              "subject": "Invoice {{Invoice Number}} - Payment Due",
              "subjectTemplate": "Invoice {{Invoice Number}} - Payment Due",
              "body": "Dear {{First Name}},\n\nYour invoice {{Invoice Number}} for ${{Amount}} is due on {{Due Date}}. Please submit payment by clicking the link below.\n\nThank you for your prompt attention.\n\nBest regards,",
              "bodyTemplate": "Dear {{First Name}},\n\nYour invoice {{Invoice Number}} for ${{Amount}} is due on {{Due Date}}. Please submit payment by clicking the link below.\n\nThank you for your prompt attention.\n\nBest regards,",
              "htmlBody": "Dear {{First Name}},<br><br>Your invoice {{Invoice Number}} for ${{Amount}} is due on {{Due Date}}. Please submit payment by clicking the link below.<br><br>Thank you for your prompt attention.<br><br>Best regards,",
              "htmlBodyTemplate": "Dear {{First Name}},<br><br>Your invoice {{Invoice Number}} for ${{Amount}} is due on {{Due Date}}. Please submit payment by clicking the link below.<br><br>Thank you for your prompt attention.<br><br>Best regards,"
            }
            ` : `
            Example format (no personalization):
            {
              "subject": "2024 Payroll Slips Submission",
              "subjectTemplate": "2024 Payroll Slips Submission",
              "body": "Hello,\n\nWe need your payroll slips for 2024 by year end (December 31, 2024). Please reply to this email with the payroll slips attached.\n\nThank you for your prompt attention to this matter.\n\nBest regards,",
              "bodyTemplate": "Hello,\n\nWe need your payroll slips for 2024 by year end (December 31, 2024). Please reply to this email with the payroll slips attached.\n\nThank you for your prompt attention to this matter.\n\nBest regards,",
              "htmlBody": "Hello,<br><br>We need your payroll slips for 2024 by year end (December 31, 2024). Please reply to this email with the payroll slips attached.<br><br>Thank you for your prompt attention to this matter.<br><br>Best regards,",
              "htmlBodyTemplate": "Hello,<br><br>We need your payroll slips for 2024 by year end (December 31, 2024). Please reply to this email with the payroll slips attached.<br><br>Thank you for your prompt attention to this matter.<br><br>Best regards,"
            }
            `}`
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

      // Parse JSON response with error handling
      let parsed: GeneratedEmailDraft
      try {
        parsed = JSON.parse(response) as GeneratedEmailDraft
      } catch (parseError: any) {
        console.log(JSON.stringify({
          event: "ai_generation_parse_error",
          correlationId,
          error: parseError.message,
          responsePreview: response.substring(0, 200),
          timestamp: new Date().toISOString(),
          usedTemplate: true
        }))
        return getTemplateFallback()
      }

      // Validate that we got a proper email body
      if (!parsed.body || parsed.body.trim().length === 0) {
        console.log(JSON.stringify({
          event: "ai_generation_empty_body",
          correlationId,
          parsedKeys: Object.keys(parsed),
          timestamp: new Date().toISOString(),
          usedTemplate: true
        }))
        return getTemplateFallback()
      }

      // Log successful AI generation
      console.log(JSON.stringify({
        event: "ai_generation_success",
        correlationId,
        subjectPreview: parsed.subject?.substring(0, 50),
        bodyLength: parsed.body?.length || 0,
        timestamp: new Date().toISOString()
      }))

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

      // Use template versions if available, otherwise use regular versions
      // Templates should NOT include signature (signature is appended during per-recipient rendering)
      const subjectTemplate = parsed.subjectTemplate || parsed.subject || "Email"
      const bodyTemplate = parsed.bodyTemplate || parsed.body || ""
      const htmlBodyTemplate = parsed.htmlBodyTemplate || parsed.htmlBody || bodyTemplate

      // Templates should be tag-ready (without signature)
      // Signature will be appended during per-recipient rendering if personalization is enabled
      // For non-personalized, we use the body with signature as-is

      return {
        subject: parsed.subject || subjectTemplate || "Email",
        body: bodyWithSignature, // Final rendered body with signature (for non-personalized)
        htmlBody: htmlBodyWithSignature, // Final rendered HTML with signature (for non-personalized)
        subjectTemplate: subjectTemplate, // Template without signature (for personalized)
        bodyTemplate: bodyTemplate, // Template without signature (for personalized)
        htmlBodyTemplate: htmlBodyTemplate, // Template without signature (for personalized)
        suggestedRecipients: validatedRecipients,
        suggestedCampaignName: parsed.suggestedCampaignName,
        suggestedCampaignType
      }
    } catch (error: any) {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      
      const aiEndTime = Date.now()
      if (aborted || error.name === "AbortError" || error.message?.includes("timeout") || error.message?.includes("aborted")) {
        console.log(JSON.stringify({
          event: "ai_generation_timeout_fallback",
          correlationId,
          idempotencyKey: null,
          errorType: error.name,
          errorMessage: error.message,
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
        errorType: error.name,
        errorMessage: error.message,
        errorCode: (error as any).code,
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


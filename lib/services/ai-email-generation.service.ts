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
      
      // For template fallback, create a basic template that includes variables if available
      let bodyText = data.prompt
      let subjectText = `Request: ${subject}`
      
      if (data.availableTags && data.availableTags.length > 0) {
        // Create a simple template that incorporates variables naturally
        // This is a fallback, so keep it simple but useful
        const lowerPrompt = data.prompt.toLowerCase()
        
        // Try to detect context and create appropriate template
        if (lowerPrompt.includes('invoice') || lowerPrompt.includes('payment')) {
          const invoiceVar = data.availableTags.find(t => t.toLowerCase().includes('invoice') || t.toLowerCase().includes('number')) || data.availableTags[0]
          const dueDateVar = data.availableTags.find(t => t.toLowerCase().includes('due') || t.toLowerCase().includes('date'))
          
          bodyText = `Hello,\n\nI am looking for an update on invoice {{${invoiceVar}}}`
          if (dueDateVar) {
            bodyText += ` with a due date of {{${dueDateVar}}}, which is past due`
            subjectText = `Invoice {{${invoiceVar}}} - Payment Due {{${dueDateVar}}}`
          } else {
            subjectText = `Invoice {{${invoiceVar}}} - Payment Due`
          }
          bodyText += `. Can you let us know when you'll be able to pay it?\n\nThank you for your prompt attention.\n\nBest regards,`
        } else {
          // Generic template with variables - use first variable in subject if available
          const firstVar = data.availableTags[0]
          bodyText = `Hello,\n\n${data.prompt}\n\nRelevant details: ${data.availableTags.map(t => `{{${t}}}`).join(', ')}\n\nThank you for your prompt attention.\n\nBest regards,`
          subjectText = firstVar ? `Request: {{${firstVar}}}` : `Request: ${subject}`
        }
      }
      
      const bodyWithSignature = signature
        ? `${bodyText}\n\n${signature}`
        : bodyText
      
      const htmlBodyWithSignature = signature
        ? `<p>${bodyText.replace(/\n/g, '<br>')}</p><br><br>${signature.replace(/\n/g, '<br>')}`
        : `<p>${bodyText.replace(/\n/g, '<br>')}</p>`
      
      // Templates should not include signature (signature is appended during per-recipient rendering)
      const bodyTemplate = bodyText
      const htmlBodyTemplate = bodyText.replace(/\n/g, '<br>')
      const subjectTemplate = subjectText
      
      return {
        subject: subjectTemplate,
        body: bodyWithSignature,
        htmlBody: htmlBodyWithSignature,
        subjectTemplate: subjectTemplate,
        bodyTemplate: bodyTemplate,
        htmlBodyTemplate: htmlBodyTemplate,
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
            
            Transform the user's request into a polished, professional email that intelligently incorporates available variables.
            
            The email should:
            - Start with a professional greeting:
              * If "{{First Name}}" is available (lookup from contact database), use "Dear {{First Name}}," 
              * Otherwise, use a generic greeting like "Hello," or "Dear [Recipient],"
            - Use variables in the SUBJECT LINE when relevant to make it specific and actionable (e.g., "Invoice {{Invoice Number}} - Payment Due {{Due Date}}")
            - Understand the SEMANTIC MEANING of each variable and use it contextually
            - Create natural, flowing sentences that incorporate variables meaningfully (don't just list them - weave them into your message)
            - Use proper paragraph structure with line breaks for readability (use \n for line breaks in plain text, <br> for HTML)
            - Clearly state what you need from the recipient, using variables to make it specific (e.g., "I am looking for an update on invoice {{Invoice Number}}")
            - Use variables to add context and urgency where appropriate (e.g., "with a due date of {{Due Date}}, which is past due")
            - Explain what action they need to take (e.g., "Can you let us know when you'll be able to pay it?")
            - End with a professional closing (e.g., "Thank you for your prompt attention to this matter.", "Please let me know if you have any questions.")
            - Be concise (6-10 lines total, not including greeting/closing)
            - Be polite and professional in tone
            - Make the email feel personalized and specific, not generic
            - Format the email with proper paragraphs - separate greeting, main message, and closing with line breaks
            
            ${data.availableTags && data.availableTags.length > 0 ? `
            CRITICAL - INTELLIGENT PERSONALIZATION WITH VARIABLES:
            
            Available variables: ${data.availableTags.map(t => `"${t}"`).join(', ')}
            
            You MUST analyze what each variable represents semantically and use them intelligently in the email:
            ${data.availableTags.map(t => {
              const lower = t.toLowerCase()
              let meaning = ''
              if (lower.includes('invoice') && lower.includes('number')) meaning = '= specific invoice identifier (use in context like "invoice {{' + t + '}}")'
              else if (lower.includes('due') && lower.includes('date')) meaning = '= payment deadline or due date (use in context like "with a due date of {{' + t + '}}, which is past due")'
              else if (lower.includes('amount') || lower.includes('total')) meaning = '= monetary value (use in context like "amount of ${{' + t + '}}")'
              else if ((lower.includes('first') || lower.includes('name')) && !lower.includes('last')) meaning = "= recipient's first name (use in greeting like 'Dear {{' + t + '}}')"
              else meaning = '= interpret based on variable name and use contextually'
              return `            - "${t}" ${meaning}`
            }).join('\n')}
            
            REQUIREMENTS FOR VARIABLE USAGE:
            1. Use {{Variable Name}} syntax EXACTLY as provided (preserve spaces, capitalization, and exact spelling)
            2. Weave variables naturally into sentences - don't list them separately
            3. Create contextually meaningful sentences that use variables to add specificity and urgency
            4. Match the user's intent from their original request while incorporating variables meaningfully
            5. Make the email feel personal and specific, not generic
            
            EXAMPLE OF INTELLIGENT USAGE:
            - User request: "update on outstanding invoices"
            - Variables: ["${data.availableTags[0] || 'Invoice Number'}", "${data.availableTags[1] || 'Due Date'}"]
            - Good output: "I am looking for an update on invoice {{${data.availableTags[0] || 'Invoice Number'}}} with a due date of {{${data.availableTags[1] || 'Due Date'}}}, which is past due. Can you let us know when you'll be able to pay it?"
            - Bad output: "Invoice: {{${data.availableTags[0] || 'Invoice Number'}}}, Due: {{${data.availableTags[1] || 'Due Date'}}}" (too generic, just listing variables)
            
            Always use variables to make the email specific, contextual, and actionable. Weave them into natural, flowing sentences that match the user's intent.
            ` : ''}
            
            The sender signature will be appended automatically by the system - do NOT include it in your response.
            
            Respond with a JSON object containing:
            - subject: string (concise, specific subject line. ${data.availableTags && data.availableTags.length > 0 ? `USE VARIABLES IN SUBJECT when relevant (e.g., "Invoice {{Invoice Number}} - Payment Due {{Due Date}}"). Use these variables: ${data.availableTags.map(t => `{{${t}}}`).join(', ')}. You may also use {{First Name}} if available from contact database.` : 'Avoid generic prefixes like "Request:" - be specific, e.g., "2024 Payroll Slips Request" instead of "Request: payroll slips"'} )
            - body: string (plain text email body, 6-10 lines. Use \\n for line breaks between paragraphs. Include greeting: use "Dear {{First Name}}," if available, otherwise "Hello,". Main message, closing. ${data.availableTags && data.availableTags.length > 0 ? `Use these variables: ${data.availableTags.map(t => `{{${t}}}`).join(', ')}. You may also use {{First Name}} in the greeting if available.` : 'Use "Dear {{First Name}}," if available, otherwise "Hello," for greeting.'} NO signature)
            - htmlBody: string (HTML formatted version with <br> for line breaks between paragraphs, same content as body. Use <br><br> for paragraph breaks)
            - subjectTemplate: string (same as subject, but explicitly use {{Tag Name}} if personalization is enabled, including {{First Name}} if relevant)
            - bodyTemplate: string (same as body, but explicitly use {{Tag Name}} if personalization is enabled, including {{First Name}} in greeting if available. Use \\n for line breaks)
            - htmlBodyTemplate: string (same as htmlBody, but explicitly use {{Tag Name}} if personalization is enabled, including {{First Name}} in greeting if available. Use <br> for line breaks, <br><br> for paragraph breaks)
            - suggestedRecipients: { entityIds?: string[], groupIds?: string[] } (optional)
            - suggestedCampaignName?: string (optional)
            - suggestedCampaignType?: string (optional, one of: W9, COI, EXPENSE, TIMESHEET, INVOICE, RECEIPT, CUSTOM)
            
            ${data.availableTags && data.availableTags.length > 0 ? `
            Example with intelligent variable usage (variables: "Invoice Number", "Due Date", prompt: "update on outstanding invoices"):
            {
              "subject": "Update Requested: Invoice {{Invoice Number}} - Payment Past Due",
              "subjectTemplate": "Update Requested: Invoice {{Invoice Number}} - Payment Past Due",
              "body": "Hello,\n\nI am looking for an update on invoice {{Invoice Number}} with a due date of {{Due Date}}, which is past due. Can you let us know when you'll be able to pay it?\n\nIf you've already sent payment, please provide confirmation and we'll update our records accordingly.\n\nThank you for your prompt attention to this matter.\n\nBest regards,",
              "bodyTemplate": "Hello,\n\nI am looking for an update on invoice {{Invoice Number}} with a due date of {{Due Date}}, which is past due. Can you let us know when you'll be able to pay it?\n\nIf you've already sent payment, please provide confirmation and we'll update our records accordingly.\n\nThank you for your prompt attention to this matter.\n\nBest regards,",
              "htmlBody": "Hello,<br><br>I am looking for an update on invoice {{Invoice Number}} with a due date of {{Due Date}}, which is past due. Can you let us know when you'll be able to pay it?<br><br>If you've already sent payment, please provide confirmation and we'll update our records accordingly.<br><br>Thank you for your prompt attention to this matter.<br><br>Best regards,",
              "htmlBodyTemplate": "Hello,<br><br>I am looking for an update on invoice {{Invoice Number}} with a due date of {{Due Date}}, which is past due. Can you let us know when you'll be able to pay it?<br><br>If you've already sent payment, please provide confirmation and we'll update our records accordingly.<br><br>Thank you for your prompt attention to this matter.<br><br>Best regards,"
            }
            
            IMPORTANT: 
            - ONLY use variables that are in the available tags list - do NOT invent variables like "{{First Name}}" unless it's provided
            - Use proper paragraph formatting with line breaks (\\n in plain text, <br> in HTML)
            - Separate greeting, main message, and closing with blank lines (\\n\\n in plain text, <br><br> in HTML)
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

User request: "${data.prompt}"
${data.availableTags && data.availableTags.length > 0 ? `

CRITICAL - INTELLIGENT VARIABLE USAGE:
Available variables that MUST be used: ${data.availableTags.map(t => `"${t}"`).join(', ')}

SPECIAL VARIABLE: "First Name" may be available from the contact database even if not in the user-defined variables list. If available, use it in greetings (e.g., "Dear {{First Name}},"). If not available, use a generic greeting like "Hello,".

ANALYSIS REQUIRED:
1. Read the user's request carefully: "${data.prompt}"
2. Understand what each variable represents:
   ${data.availableTags.map(t => {
     const lower = t.toLowerCase()
     let meaning = ''
     if (lower.includes('invoice') && lower.includes('number')) meaning = '= specific invoice identifier (use in subject like "Invoice {{' + t + '}} - Payment Due" and in body like "invoice {{' + t + '}}")'
     else if (lower.includes('due') && lower.includes('date')) meaning = '= payment deadline or due date (use in subject like "Invoice {{Invoice Number}} - Due {{' + t + '}}" and in body like "with a due date of {{' + t + '}}, which is past due")'
     else if (lower.includes('amount') || lower.includes('total')) meaning = '= monetary value (use like "amount of ${{' + t + '}}")'
     else meaning = '= interpret based on variable name and use contextually in both subject and body when relevant'
     return `   - "${t}" ${meaning}`
   }).join('\n')}

3. Create natural sentences that weave variables into the user's request:
   - User wants: "${data.prompt}"
   - Variables available: ${data.availableTags.map(t => `{{${t}}}`).join(', ')}
   - Your task: Transform "${data.prompt}" into a specific email that uses ONLY these variables naturally
   - DO NOT use variables that are not in the list above (e.g., do NOT use "{{First Name}}" unless it's explicitly in the list)
   
4. Example of intelligent transformation:
   - User request: "update on outstanding invoices"
   - Variables: ["Invoice Number", "Due Date"]
   - Subject should be: "Invoice {{Invoice Number}} - Payment Due {{Due Date}}" (USE VARIABLES IN SUBJECT)
   - Body should be: "Dear {{First Name}},\\n\\nI am looking for an update on invoice {{Invoice Number}} with a due date of {{Due Date}}, which is past due. Can you let us know when you'll be able to pay it?\\n\\nThank you for your prompt attention.\\n\\nBest regards," (or "Hello," if {{First Name}} is not available)
   - HTML version: "Dear {{First Name}},<br><br>I am looking for an update on invoice {{Invoice Number}} with a due date of {{Due Date}}, which is past due. Can you let us know when you'll be able to pay it?<br><br>Thank you for your prompt attention.<br><br>Best regards,"
   
   Notice how:
   - Variables are woven into natural sentences (not just listed)
   - The email has proper paragraph breaks (\\n\\n between paragraphs in plain text, <br><br> in HTML)
   - The email is specific and contextual (mentions "past due" when using "Due Date")
   - The tone matches the user's request (asking for an update)
   - Variables add meaning and context to make it actionable
   - NO variables were used that aren't in the list

5. REQUIREMENTS:
   - Use variables in the SUBJECT LINE when relevant to make it specific (e.g., "Invoice {{Invoice Number}} - Payment Due {{Due Date}}")
   - Use ALL available variables in your email body where they make sense
   - You may use {{First Name}} in greetings if available (from contact database), otherwise use "Hello,"
   - Create natural, flowing sentences - don't just list variables
   - Format with proper paragraphs - use \\n\\n for paragraph breaks in plain text body/bodyTemplate, <br><br> in HTML versions
   - Separate greeting, main message, and closing with blank lines
   - Make the email specific and actionable using variables in both subject and body
   - Match the user's intent and tone from their original request
   - Variables should enhance the message, not distract from it

` : ''}

Sender signature to append:
${signature}

Generate a polite, professional email draft that ${data.availableTags && data.availableTags.length > 0 ? `intelligently transforms "${data.prompt}" into a specific, contextual email that naturally incorporates these variables: ${data.availableTags.map(t => `{{${t}}}`).join(', ')}. USE VARIABLES IN THE SUBJECT LINE when relevant. Use {{First Name}} in greeting if available (from contact database), otherwise use "Hello,". Use proper paragraph formatting with line breaks (\\n\\n for paragraph breaks in plain text, <br><br> in HTML). Make it feel like a real, personalized request - not a template. ` : 'clearly addresses the user\'s request. Use "Dear {{First Name}}," if available, otherwise "Hello," for greeting. '}Keep it concise (6-10 lines in body) with proper paragraph breaks.`
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


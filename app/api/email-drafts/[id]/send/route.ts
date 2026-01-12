import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailDraftService } from "@/lib/services/email-draft.service"
import { EmailSendingService } from "@/lib/services/email-sending.service"
import { EntityService } from "@/lib/services/entity.service"
import { PersonalizationDataService } from "@/lib/services/personalization-data.service"
import { renderTemplate, extractTags } from "@/lib/utils/template-renderer"
import { normalizeTagName } from "@/lib/utils/csv-parser"
import { prisma } from "@/lib/prisma"
import { resolveRecipientsWithFilter } from "@/lib/services/recipient-filter.service"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { recipients: recipientsPayload, campaignName, emailAccountId, remindersConfig } = body

    const draft = await EmailDraftService.findById(
      params.id,
      session.user.organizationId
    )

    if (!draft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      )
    }

    // Get user and organization for signature
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { organization: true }
    })
    
    // Use user's custom signature if available, otherwise build from user/org data
    let signature: string
    if (user?.signature && user.signature.trim() !== '') {
      signature = user.signature
    } else {
      // Build signature from user/org data as fallback
      const signatureParts: string[] = []
      if (user?.name) signatureParts.push(user.name)
      if (user?.organization?.name) signatureParts.push(user.organization.name)
      if (user?.email) signatureParts.push(user.email)
      signature = signatureParts.length > 0 ? signatureParts.join('\n') : (user?.email || '')
    }

    // Use templates if available, otherwise fall back to generated fields
    const subjectTemplate = (draft as any).subjectTemplate || draft.generatedSubject || ""
    const bodyTemplate = (draft as any).bodyTemplate || draft.generatedBody || ""
    const htmlBodyTemplate = (draft as any).htmlBodyTemplate || draft.generatedHtmlBody || bodyTemplate
    const personalizationMode = (draft as any).personalizationMode || "none"
    const blockOnMissingValues = (draft as any).blockOnMissingValues ?? true
    const availableTags = (draft as any).availableTags ? (typeof (draft as any).availableTags === 'string' ? JSON.parse((draft as any).availableTags) : (draft as any).availableTags) : []
    const deadlineDate = (draft as any).deadlineDate ? new Date((draft as any).deadlineDate) : null

    if (!subjectTemplate || !bodyTemplate) {
      return NextResponse.json(
        { error: "Draft not ready" },
        { status: 400 }
      )
    }

    // Resolve recipients based on personalization mode
    let recipientList: Array<{ email: string; name?: string; entityId?: string }> = []
    let existingPersonalizationData: any[] = [] // Store for use in CSV mode rendering

    if (personalizationMode === "csv") {
      // In CSV mode, recipients come from personalization data (stored during generation)
      existingPersonalizationData = await PersonalizationDataService.findByDraftId(params.id)
      
      if (existingPersonalizationData.length === 0) {
        return NextResponse.json(
          { error: "No personalization data found. Please upload a CSV and generate the draft first." },
          { status: 400 }
        )
      }
      
      for (const pd of existingPersonalizationData) {
        // Try to find entity by email to get name
        const entity = pd.contactId ? await EntityService.findById(pd.contactId, session.user.organizationId) : 
                      await EntityService.findByEmail(pd.recipientEmail, session.user.organizationId)
        
        recipientList.push({
          email: pd.recipientEmail,
          name: entity?.firstName || pd.recipientEmail.split('@')[0],
          entityId: entity?.id || pd.contactId || undefined
        })
      }
    } else {
      // Contact mode: resolve from selected recipients (with optional filter)
      let selectedRecipients = recipientsPayload ?? (draft as any).suggestedRecipients ?? {}
      if (typeof selectedRecipients === "string") {
        try {
          selectedRecipients = JSON.parse(selectedRecipients)
        } catch {
          selectedRecipients = {}
        }
      }

      const resolved = await resolveRecipientsWithFilter(session.user.organizationId, selectedRecipients)
      recipientList = resolved.recipients
    }

    if (recipientList.length === 0) {
      return NextResponse.json(
        { error: "No valid recipients" },
        { status: 400 }
      )
    }

    // Build per-recipient personalization data
    const personalizationDataArray: Array<{
      emailDraftId: string
      recipientEmail: string
      contactId?: string
      dataJson: Record<string, string>
    }> = []

    const renderedEmails: Array<{
      email: string
      name?: string
      subject: string
      body: string
      htmlBody: string
      renderStatus: "ok" | "missing" | "failed"
      renderErrors?: string[]
    }> = []

    // Extract tags from templates
    const tagsInSubject = extractTags(subjectTemplate)
    const tagsInBody = extractTags(bodyTemplate)
    const allTagsUsed = [...new Set([...tagsInSubject, ...tagsInBody])]

    // Build dataJson for each recipient
    if (personalizationMode === "csv") {
      // Use personalization data already fetched (no need to fetch again)
      // Build a map for quick lookup
      const personalizationMap = new Map<string, any>()
      existingPersonalizationData.forEach(p => {
        personalizationMap.set(p.recipientEmail.toLowerCase(), p)
      })
      
      for (const recipient of recipientList) {
        const personalizationData = personalizationMap.get(recipient.email.toLowerCase())
        if (personalizationData) {
          // Enrich dataJson with recipient info if entity exists (always include First Name if available)
          const dataJson = { ...(personalizationData.dataJson as Record<string, string>) }
          
          // If entity exists and has firstName, always add "First Name" to dataJson if not already present
          // This allows the template renderer to use {{First Name}} if it's in the template
          const entity = recipient.entityId ? await EntityService.findById(recipient.entityId, session.user.organizationId) : null
          if (entity?.firstName && !dataJson["First Name"] && !dataJson["first name"] && !dataJson["firstName"]) {
            dataJson["First Name"] = entity.firstName
          }
          
          // Render templates for this recipient
          const subjectResult = renderTemplate(subjectTemplate, dataJson)
          const bodyResult = renderTemplate(bodyTemplate, dataJson)
          
          // Ensure HTML body has proper line breaks - convert \n to <br> if not already present
          // First, render the template, then convert any remaining \n to <br>
          const htmlBodyTemplateProcessed = htmlBodyTemplate.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')
          const htmlBodyResult = renderTemplate(htmlBodyTemplateProcessed, dataJson)
          // Convert any \n that might be in the rendered values to <br>
          const htmlBodyRendered = htmlBodyResult.rendered.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')
          
          const missingTags = [...new Set([...subjectResult.missingTags, ...bodyResult.missingTags, ...htmlBodyResult.missingTags])]
          
          // Map missing tags back to original tag names for display
          const missingTagNames = missingTags.map(tag => {
            // Find original tag name from dataJson keys or availableTags array
            const originalTag = Object.keys(dataJson).find(k => normalizeTagName(k) === tag) || 
                               (Array.isArray(availableTags) ? availableTags.find(t => normalizeTagName(t) === tag) : undefined) ||
                               tag
            return `{{${originalTag}}}`
          })
          
          // Append signature to rendered body for personalized emails
          const renderedBodyWithSignature = bodyResult.rendered + (signature ? `\n\n${signature}` : '')
          const renderedHtmlBodyWithSignature = htmlBodyRendered + (signature ? `<br><br>${signature.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')}` : '')
          
          if (blockOnMissingValues && missingTags.length > 0) {
            renderedEmails.push({
              email: recipient.email,
              name: recipient.name,
              subject: subjectResult.rendered,
              body: renderedBodyWithSignature,
              htmlBody: renderedHtmlBodyWithSignature,
              renderStatus: "missing",
              renderErrors: [`Missing tags: ${missingTagNames.join(", ")}`]
            })
          } else {
            renderedEmails.push({
              email: recipient.email,
              name: recipient.name,
              subject: subjectResult.rendered,
              body: renderedBodyWithSignature,
              htmlBody: renderedHtmlBodyWithSignature,
              renderStatus: missingTags.length > 0 ? "missing" : "ok",
              renderErrors: missingTags.length > 0 ? [`Missing tags: ${missingTagNames.join(", ")}`] : undefined
            })
          }
        } else {
          // No personalization data found for this recipient - render with empty data
          const emptyData: Record<string, string> = {}
          const emptySubjectResult = renderTemplate(subjectTemplate, emptyData)
          const emptyBodyResult = renderTemplate(bodyTemplate, emptyData)
          const emptyHtmlBodyResult = renderTemplate(htmlBodyTemplate, emptyData)
          const emptyMissingTags = [...new Set([...emptySubjectResult.missingTags, ...emptyBodyResult.missingTags, ...emptyHtmlBodyResult.missingTags])]
          
          // Get tag names from templates (extract original tag names)
          const templateTags = [...extractTags(subjectTemplate), ...extractTags(bodyTemplate)]
          const emptyMissingTagNames = emptyMissingTags.map(tag => {
            const originalTag = templateTags.find(t => normalizeTagName(t) === tag) || tag
            return `{{${originalTag}}}`
          })
          
          // Append signature to rendered body
          const emptyRenderedBodyWithSignature = emptyBodyResult.rendered + (signature ? `\n\n${signature}` : '')
          // Ensure HTML body has proper line breaks
          const emptyHtmlBodyProcessed = emptyHtmlBodyResult.rendered.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')
          const emptyRenderedHtmlBodyWithSignature = emptyHtmlBodyProcessed + (signature ? `<br><br>${signature.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')}` : '')
          
          renderedEmails.push({
            email: recipient.email,
            name: recipient.name,
            subject: emptySubjectResult.rendered,
            body: emptyRenderedBodyWithSignature,
            htmlBody: emptyRenderedHtmlBodyWithSignature,
            renderStatus: "missing",
            renderErrors: [`No personalization data for ${recipient.email}. Missing: ${emptyMissingTagNames.join(", ")}`]
          })
        }
      }
    } else if (personalizationMode === "contact") {
      // Use contact fields
      for (const recipient of recipientList) {
        const entity = recipient.entityId ? await EntityService.findById(recipient.entityId, session.user.organizationId) : null
        const dataJson: Record<string, string> = {
          "First Name": entity?.firstName || recipient.name || "",
          "Email": recipient.email
        }
        
        const subjectResult = renderTemplate(subjectTemplate, dataJson)
        const bodyResult = renderTemplate(bodyTemplate, dataJson)
        
        // Ensure HTML body has proper line breaks
        const contactHtmlBodyTemplateProcessed = htmlBodyTemplate.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')
        const htmlBodyResult = renderTemplate(contactHtmlBodyTemplateProcessed, dataJson)
        const contactHtmlBodyRendered = htmlBodyResult.rendered.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')
        
        // Append signature to rendered body for personalized emails
        const contactRenderedBodyWithSignature = bodyResult.rendered + (signature ? `\n\n${signature}` : '')
        const contactRenderedHtmlBodyWithSignature = contactHtmlBodyRendered + (signature ? `<br><br>${signature.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')}` : '')
        
        renderedEmails.push({
          email: recipient.email,
          name: recipient.name,
          subject: subjectResult.rendered,
          body: contactRenderedBodyWithSignature,
          htmlBody: contactRenderedHtmlBodyWithSignature,
          renderStatus: "ok",
          renderErrors: undefined
        })
        
        // Store personalization data
        personalizationDataArray.push({
          emailDraftId: params.id,
          recipientEmail: recipient.email,
          contactId: recipient.entityId,
          dataJson
        })
      }
    } else {
      // No personalization - use template as-is (signature already included in template from AI generation)
      // Ensure HTML body has proper line breaks
      const noPersonalizationHtmlBody = htmlBodyTemplate.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')
      
      for (const recipient of recipientList) {
        renderedEmails.push({
          email: recipient.email,
          name: recipient.name,
          subject: subjectTemplate,
          body: bodyTemplate, // Already includes signature from AI generation
          htmlBody: noPersonalizationHtmlBody, // Already includes signature from AI generation, with proper HTML formatting
          renderStatus: "ok",
          renderErrors: undefined
        })
      }
    }

    // Check for missing values if blocking is enabled
    if (blockOnMissingValues && personalizationMode !== "none") {
      const recipientsWithMissing = renderedEmails.filter(e => e.renderStatus === "missing")
      if (recipientsWithMissing.length > 0) {
        return NextResponse.json(
          {
            error: `Missing required tags for ${recipientsWithMissing.length} recipient(s)`,
            code: "MISSING_TAGS",
            recipients: recipientsWithMissing.map(r => ({
              email: r.email,
              errors: r.renderErrors
            }))
          },
          { status: 400 }
        )
      }
    }

    // Persist personalization data and rendered emails
    if (personalizationDataArray.length > 0) {
      // Delete existing personalization data first
      await PersonalizationDataService.deleteByDraftId(params.id)
      // Create new personalization data
      await PersonalizationDataService.createMany(
        personalizationDataArray.map(data => ({
          ...data,
          renderSubject: renderedEmails.find(e => e.email === data.recipientEmail)?.subject || null,
          renderBody: renderedEmails.find(e => e.email === data.recipientEmail)?.body || null,
          renderHtmlBody: renderedEmails.find(e => e.email === data.recipientEmail)?.htmlBody || null,
          renderStatus: renderedEmails.find(e => e.email === data.recipientEmail)?.renderStatus || "ok",
          renderErrors: renderedEmails.find(e => e.email === data.recipientEmail)?.renderErrors || undefined
        }))
      )
    } else if (personalizationMode === "csv") {
      // Update existing personalization data with rendered content
      const existingPersonalizationData = await PersonalizationDataService.findByDraftId(params.id)
      for (const existing of existingPersonalizationData) {
        const rendered = renderedEmails.find(e => e.email === existing.recipientEmail)
        if (rendered) {
          await PersonalizationDataService.updateRender(existing.id, {
            renderSubject: rendered.subject,
            renderBody: rendered.body,
            renderHtmlBody: rendered.htmlBody,
            renderStatus: rendered.renderStatus,
            renderErrors: rendered.renderErrors
          })
        }
      }
    }

    // Send emails with per-recipient rendering
    const results = await EmailSendingService.sendBulkEmail({
      organizationId: session.user.organizationId,
      recipients: renderedEmails.map(e => ({ email: e.email, name: e.name })),
      subject: subjectTemplate, // Will be overridden per-recipient if personalization
      body: bodyTemplate, // Will be overridden per-recipient if personalization
      htmlBody: htmlBodyTemplate, // Will be overridden per-recipient if personalization
      campaignName: campaignName || draft.suggestedCampaignName || undefined,
      accountId: emailAccountId,
      deadlineDate: deadlineDate || undefined,
      remindersConfig: remindersConfig || undefined,
      // Pass per-recipient rendered emails if personalization is enabled
      perRecipientEmails: personalizationMode !== "none" ? renderedEmails.map(e => ({
        email: e.email,
        subject: e.subject,
        body: e.body,
        htmlBody: e.htmlBody
      })) : undefined
    })

    // Update draft status
    await EmailDraftService.update(
      params.id,
      session.user.organizationId,
      { status: "SENT" }
    )

    return NextResponse.json({
      success: true,
      results
    })
  } catch (error: any) {
    console.error("Error sending email:", error)
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}


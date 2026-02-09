/**
 * Job Request Draft Endpoint
 * 
 * POST /api/task-instances/[id]/request/draft - Generate draft email from Item context
 * 
 * This is a thin helper that generates subject/body using Item context.
 * It does NOT create any EmailDraft/Quest/Task records.
 * 
 * Execution uses existing Quest endpoints:
 * - POST /api/quests (create)
 * - POST /api/quests/[id]/execute (send)
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { TaskInstanceService, TaskInstanceStakeholder } from "@/lib/services/task-instance.service"
import { AIEmailGenerationService } from "@/lib/services/ai-email-generation.service"
import { prisma } from "@/lib/prisma"
import { UserRole, ContactType } from "@prisma/client"

interface StakeholderContact {
  id: string
  email: string | null
  firstName: string
  lastName: string | null
  contactType?: string
  stakeholderType: "contact_type" | "group" | "individual"
  stakeholderName: string
}

/**
 * Resolve stakeholder contacts from stakeholder definitions
 * Mirrors the frontend logic in fetchStakeholderContacts
 */
async function resolveStakeholderContacts(
  stakeholders: TaskInstanceStakeholder[],
  organizationId: string
): Promise<StakeholderContact[]> {
  if (stakeholders.length === 0) return []

  const allContacts: StakeholderContact[] = []

  for (const stakeholder of stakeholders) {
    if (stakeholder.type === "individual") {
      // For individual stakeholders, we need to look up the entity
      const entity = await prisma.entity.findFirst({
        where: { id: stakeholder.id, organizationId }
      })
      if (entity) {
        allContacts.push({
          id: entity.id,
          firstName: entity.firstName,
          lastName: entity.lastName,
          email: entity.email,
          contactType: entity.contactType || undefined,
          stakeholderType: "individual",
          stakeholderName: stakeholder.name
        })
      }
    } else if (stakeholder.type === "group") {
      // Get all entities in this group
      const groupEntities = await prisma.entity.findMany({
        where: {
          organizationId,
          groups: { some: { id: stakeholder.id } }
        }
      })
      for (const entity of groupEntities) {
        allContacts.push({
          id: entity.id,
          firstName: entity.firstName,
          lastName: entity.lastName,
          email: entity.email,
          contactType: entity.contactType || undefined,
          stakeholderType: "group",
          stakeholderName: stakeholder.name
        })
      }
    } else if (stakeholder.type === "contact_type") {
      // Get all entities with this contact type
      const typeEntities = await prisma.entity.findMany({
        where: {
          organizationId,
          contactType: stakeholder.id as ContactType
        }
      })
      for (const entity of typeEntities) {
        allContacts.push({
          id: entity.id,
          firstName: entity.firstName,
          lastName: entity.lastName,
          email: entity.email,
          contactType: entity.contactType || undefined,
          stakeholderType: "contact_type",
          stakeholderName: stakeholder.name
        })
      }
    }
  }

  // Deduplicate by entity ID
  const uniqueContacts = allContacts.filter((contact, index, self) =>
    index === self.findIndex(c => c.id === contact.id)
  )

  return uniqueContacts
}

/**
 * Generate deterministic fallback draft when AI fails
 */
function generateFallbackDraft(
  job: { name: string; description: string | null; dueDate: Date | null },
  recipientCount: number
): { subject: string; body: string } {
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const subject = `Request: ${job.name}`
  
  let body = `Hi {{First Name}},

I'm reaching out regarding ${job.name}.`

  if (job.description) {
    body += `

${job.description}`
  }

  if (job.dueDate) {
    body += `

This is needed by ${formatDate(job.dueDate)}.`
  }

  body += `

Please let me know if you have any questions.

Best regards`

  return { subject, body }
}

interface RequestBody {
  recipients?: Array<{
    id: string
    name: string
    email: string
    type: "user" | "entity"
  }>
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId || !session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const organizationId = session.user.organizationId
    const userId = session.user.id
    const userRole = session.user.role || UserRole.MEMBER
    const { id: jobId } = await params

    // Parse request body
    let body: RequestBody = {}
    try {
      body = await request.json()
    } catch {
      // Body is optional, continue with empty
    }

    // Fetch task instance with full context
    const job = await TaskInstanceService.findById(jobId, organizationId)
    if (!job) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      )
    }

    // Check view permission (required to generate draft)
    const canView = await TaskInstanceService.canUserAccess(userId, userRole, job, 'view')
    if (!canView) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      )
    }

    const labels = job.labels as any

    // Determine recipients - either from request body (new flow) or from stakeholders (legacy)
    let recipientsWithEmail: Array<{
      id: string
      email: string | null
      firstName: string
      lastName: string | null
      contactType?: string
      stakeholderType?: "contact_type" | "group" | "individual"
      stakeholderName?: string
    }> = []

    if (body.recipients && body.recipients.length > 0) {
      // New flow: recipients selected by user
      recipientsWithEmail = body.recipients.map(r => {
        // Parse first name from full name
        const nameParts = r.name.split(' ')
        return {
          id: r.id,
          email: r.email,
          firstName: nameParts[0] || r.name,
          lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : null,
          contactType: undefined,
          stakeholderType: undefined,
          stakeholderName: undefined
        }
      })
    } else {
      // Legacy flow: resolve from task stakeholders (for backwards compatibility)
      const stakeholders: TaskInstanceStakeholder[] = labels?.stakeholders || []
      const resolvedRecipients = await resolveStakeholderContacts(stakeholders, organizationId)
      recipientsWithEmail = resolvedRecipients.filter(r => r.email)
    }

    // Build item context for response
    const itemContext = {
      name: job.name,
      description: job.description,
      dueDate: job.dueDate?.toISOString() || null,
      labels: labels?.tags || []
    }

    // If no recipients with email, return fallback immediately
    if (recipientsWithEmail.length === 0) {
      const fallback = generateFallbackDraft(job, 0)
      return NextResponse.json({
        success: true,
        draft: fallback,
        recipients: [],
        itemContext,
        usedFallback: true,
        noRecipients: true
      })
    }

    // Get user info for signature
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, signature: true }
    })

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true }
    })

    // Build signature
    let senderSignature: string | undefined
    if (user?.signature && user.signature.trim() !== '') {
      senderSignature = user.signature
    } else {
      const signatureParts: string[] = []
      if (user?.name) signatureParts.push(user.name)
      if (organization?.name) signatureParts.push(organization.name)
      if (user?.email) signatureParts.push(user.email)
      senderSignature = signatureParts.length > 0 ? signatureParts.join('\n') : undefined
    }

    // Build prompt from Item context
    // Build recipient summary for prompt
    const recipientSummary = recipientsWithEmail
      .map(r => `${r.firstName}${r.lastName ? ` ${r.lastName}` : ''} (${r.email})`)
      .slice(0, 5) // Limit to first 5 for brevity
      .join(', ')
    const moreRecipients = recipientsWithEmail.length > 5 
      ? ` and ${recipientsWithEmail.length - 5} more` 
      : ''

    let prompt = `Email the following recipients to request what's needed for this item.

Item: ${job.name}`

    if (job.description) {
      prompt += `
Description: ${job.description}`
    }

    if (labels?.tags && labels.tags.length > 0) {
      prompt += `
Labels: ${labels.tags.join(', ')}`
    }

    prompt += `
Recipients: ${recipientSummary}${moreRecipients}
Number of recipients: ${recipientsWithEmail.length}`

    // Try AI generation
    let draft: { subject: string; body: string }
    let usedFallback = false
    let fallbackReason: string | undefined

    try {
      const generated = await AIEmailGenerationService.generateDraft({
        organizationId,
        prompt,
        senderName: user?.name || undefined,
        senderEmail: user?.email || undefined,
        senderCompany: organization?.name || undefined,
        senderSignature,
        deadlineDate: job.dueDate,
        personalizationMode: "contact",
        availableTags: ["First Name", "Email"]
      })

      draft = {
        subject: generated.subjectTemplate || generated.subject,
        body: generated.bodyTemplate || generated.body
      }
      
      // Check if AI service used fallback internally
      if (generated.usedAI === false) {
        usedFallback = true
        fallbackReason = generated.fallbackReason
        console.warn(`[Request Draft] AI generation used fallback: ${fallbackReason}`)
      }
    } catch (error: any) {
      console.error("AI draft generation failed, using fallback:", error.message)
      draft = generateFallbackDraft(job, recipientsWithEmail.length)
      usedFallback = true
      fallbackReason = error.message
    }

    return NextResponse.json({
      success: true,
      draft,
      recipients: recipientsWithEmail.map(r => ({
        id: r.id,
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        contactType: r.contactType
      })),
      itemContext,
      usedFallback,
      fallbackReason: usedFallback ? fallbackReason : undefined
    })

  } catch (error: any) {
    console.error("Job request draft error:", error)
    return NextResponse.json(
      { error: "Failed to generate draft" },
      { status: 500 }
    )
  }
}

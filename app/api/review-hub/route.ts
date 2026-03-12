/**
 * Review Hub Feed API
 *
 * GET /api/review-hub - Get pending review items across all categories
 *
 * Query params:
 *   category?: IconType - Filter by content category (request, reply, form, etc.)
 *   boardId?: string - Filter by board/period
 *   limit?: number (default 50, max 100)
 *   cursor?: string - ISO timestamp for cursor-based pagination
 *
 * Two pillars:
 * 1. Agent outputs — completed WorkflowRuns not yet reviewed
 * 2. Inbound items — email replies, form submissions needing attention
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canPerformAction } from "@/lib/permissions"

export const dynamic = "force-dynamic"

export type IconType = "reply" | "form" | "reconciliation" | "report" | "analysis"

export interface ReviewItem {
  id: string
  type: "agent_output" | "email_reply" | "form_submission"
  iconType: IconType
  isAgent: boolean
  title: string
  subtitle: string
  sourceUrl: string
  createdAt: string
  boardName?: string
  metadata: Record<string, any>
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { organizationId } = session.user
    const permissions = session.user.orgActionPermissions

    if (!canPerformAction(session.user.role, "review:view", permissions)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Check feature flag
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { features: true },
    })
    const features = (org?.features as Record<string, any>) || {}
    if (!features.reviewHub) {
      return NextResponse.json({ error: "Feature not available" }, { status: 404 })
    }

    const searchParams = request.nextUrl.searchParams
    const categoryFilter = searchParams.get("category") as IconType | null
    const sourceFilter = searchParams.get("source") as "agent" | "manual" | null
    const boardId = searchParams.get("boardId")
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const cursor = searchParams.get("cursor")

    const cursorDate = cursor ? new Date(cursor) : undefined

    const items: ReviewItem[] = []
    const queries: Promise<void>[] = []

    // ── Pillar 1: Agent Outputs (WorkflowRun) ──────────────────────────────
    if (canPerformAction(session.user.role, "agents:view", permissions)) {
      queries.push(
        prisma.workflowRun.findMany({
          where: {
            organizationId,
            status: "COMPLETED",
            reviewedAt: null,
            ...(cursorDate && { completedAt: { lt: cursorDate } }),
            ...(boardId && { triggerContext: { path: ["boardId"], equals: boardId } }),
          },
          include: {
            automationRule: {
              select: { name: true, taskType: true, lineageId: true },
            },
          },
          orderBy: { completedAt: "desc" },
          take: limit,
        }).then(async (runs) => {
          for (const run of runs) {
            const stepResults = (run.stepResults as any[]) || []
            const triggerContext = (run.triggerContext as Record<string, any>) || {}
            const ruleName = run.automationRule?.name || "Automation"
            const taskType = run.automationRule?.taskType || ""

            // Build summary from step results
            let subtitle = ""
            const successSteps = stepResults.filter(s => s.outcome === "success")

            if (taskType === "request" || taskType === "form") {
              // Bucket at task level — count recipients
              const count = successSteps.length || 1
              subtitle = `${count} ${taskType === "form" ? "form" : "request"}${count !== 1 ? "s" : ""} sent`
            } else if (taskType === "reconciliation") {
              const exceptionCount = successSteps[0]?.data?.exceptionCount
              const variance = successSteps[0]?.data?.variance
              subtitle = exceptionCount != null
                ? `${exceptionCount} exception${exceptionCount !== 1 ? "s" : ""}${variance != null ? `, $${Math.abs(variance).toLocaleString()} variance` : ""}`
                : `${successSteps.length} step${successSteps.length !== 1 ? "s" : ""} completed`
            } else {
              subtitle = `${successSteps.length} step${successSteps.length !== 1 ? "s" : ""} completed`
            }

            // Determine source URL — always link to the actual task/output
            const targetId = successSteps[0]?.data?.targetId
            const taskInstanceId = triggerContext.taskInstanceId
            let sourceUrl = ""

            if ((taskType === "request" || taskType === "form") && taskInstanceId) {
              sourceUrl = `/dashboard/jobs/${taskInstanceId}`
            } else if (taskType === "report" && targetId) {
              sourceUrl = `/dashboard/reports/${targetId}`
            } else if (taskType === "reconciliation") {
              const configId = successSteps[0]?.data?.configId
              sourceUrl = configId
                ? `/dashboard/reconciliations/${configId}`
                : `/dashboard/reconciliations`
            } else if (taskType === "analysis" && targetId) {
              sourceUrl = `/dashboard/analysis/chat/${targetId}`
            }

            // Fallback: task instance → board → automations
            if (!sourceUrl) {
              sourceUrl = taskInstanceId
                ? `/dashboard/jobs/${taskInstanceId}`
                : `/dashboard/automations`
            }

            // Look up board name if available
            let boardName: string | undefined
            if (triggerContext.boardId) {
              const board = await prisma.board.findUnique({
                where: { id: triggerContext.boardId },
                select: { name: true },
              })
              boardName = board?.name || undefined
            }

            // Map taskType to iconType
            const iconTypeMap: Record<string, IconType> = {
              request: "reply",
              form: "form",
              reconciliation: "reconciliation",
              report: "report",
              analysis: "analysis",
            }
            const iconType: IconType = iconTypeMap[taskType] || "report"

            items.push({
              id: run.id,
              type: "agent_output",
              iconType,
              isAgent: true,
              title: `${ruleName}`,
              subtitle,
              sourceUrl,
              createdAt: (run.completedAt || run.createdAt).toISOString(),
              boardName,
              metadata: {
                automationName: ruleName,
                taskType,
                stepCount: successSteps.length,
                triggerContext,
              },
            })
          }
        })
      )
    }

    // ── Pillar 2a: Email Replies ────────────────────────────────────────────
    if (canPerformAction(session.user.role, "inbox:review", permissions)) {
      queries.push(
        prisma.message.findMany({
          where: {
            direction: "INBOUND",
            reviewStatus: "UNREVIEWED",
            isAutoReply: false,
            ...(cursorDate && { createdAt: { lt: cursorDate } }),
            request: {
              organizationId,
              ...(boardId && { taskInstance: { boardId } }),
            },
          },
          include: {
            request: {
              select: {
                id: true,
                campaignName: true,
                entity: {
                  select: { firstName: true, lastName: true, email: true },
                },
                taskInstance: {
                  select: {
                    id: true,
                    name: true,
                    board: { select: { name: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
        }).then(messages => {
          for (const msg of messages) {
            const entity = msg.request?.entity
            const contactName = entity
              ? [entity.firstName, entity.lastName].filter(Boolean).join(" ") || entity.email
              : "Unknown"
            const campaignName = msg.request?.campaignName
            const taskName = msg.request?.taskInstance?.name

            const subtitleParts: string[] = []
            if (campaignName) subtitleParts.push(campaignName)
            if (taskName) subtitleParts.push(taskName)

            items.push({
              id: msg.id,
              type: "email_reply",
              iconType: "reply",
              isAgent: false,
              title: `Reply from ${contactName}`,
              subtitle: subtitleParts.join(" · ") || "Email reply",
              sourceUrl: `/dashboard/review/${msg.id}`,
              createdAt: msg.createdAt.toISOString(),
              boardName: msg.request?.taskInstance?.board?.name,
              metadata: {
                contactName,
                campaignName,
              },
            })
          }
        })
      )
    }

    // ── Pillar 2b: Form Submissions ────────────────────────────────────────
    if (canPerformAction(session.user.role, "forms:view_submissions", permissions)) {
      queries.push(
        prisma.formRequest.findMany({
          where: {
            organizationId,
            status: "SUBMITTED",
            reviewedAt: null,
            ...(cursorDate && { submittedAt: { lt: cursorDate } }),
            ...(boardId && { taskInstance: { boardId } }),
          },
          include: {
            formDefinition: { select: { name: true } },
            recipientEntity: { select: { firstName: true, lastName: true, email: true } },
            recipientUser: { select: { name: true, email: true } },
            taskInstance: {
              select: {
                id: true,
                name: true,
                board: { select: { name: true } },
              },
            },
          },
          orderBy: { submittedAt: "desc" },
          take: limit,
        }).then(formRequests => {
          for (const fr of formRequests) {
            const formName = fr.formDefinition?.name || "Form"
            const recipient = fr.recipientEntity
              ? [fr.recipientEntity.firstName, fr.recipientEntity.lastName].filter(Boolean).join(" ") || fr.recipientEntity.email
              : fr.recipientUser?.name || fr.recipientUser?.email || "Unknown"
            const taskName = fr.taskInstance?.name

            items.push({
              id: fr.id,
              type: "form_submission",
              iconType: "form",
              isAgent: false,
              title: `${formName} from ${recipient}`,
              subtitle: taskName || "Form submission",
              sourceUrl: `/dashboard/jobs/${fr.taskInstanceId}`,
              createdAt: (fr.submittedAt || fr.createdAt).toISOString(),
              boardName: fr.taskInstance?.board?.name,
              metadata: {
                formName,
                contactName: recipient,
                taskName,
              },
            })
          }
        })
      )
    }

    await Promise.all(queries)

    // Filter by content category and/or source
    let filteredItems = items
    if (categoryFilter) {
      filteredItems = filteredItems.filter(item => item.iconType === categoryFilter)
    }
    if (sourceFilter) {
      filteredItems = filteredItems.filter(item =>
        sourceFilter === "agent" ? item.isAgent : !item.isAgent
      )
    }

    // Sort all items by createdAt descending and apply limit
    filteredItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const paginatedItems = filteredItems.slice(0, limit)

    // Compute counts by iconType from the full (unfiltered) set
    const counts: Record<string, number> = {}
    for (const item of items) {
      counts[item.iconType] = (counts[item.iconType] || 0) + 1
    }

    const nextCursor = paginatedItems.length === limit
      ? paginatedItems[paginatedItems.length - 1].createdAt
      : undefined

    return NextResponse.json({
      items: paginatedItems,
      counts,
      nextCursor,
    })
  } catch (error: any) {
    console.error("[ReviewHub] Feed error:", error)
    return NextResponse.json(
      { error: "Failed to fetch review items" },
      { status: 500 }
    )
  }
}

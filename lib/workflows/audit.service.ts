/**
 * Workflow Audit Service
 *
 * Writes audit log entries for every action taken during a workflow run.
 * Provides compliance-grade traceability for accounting automations.
 */

import { prisma } from "@/lib/prisma"
import type { AuditActionType, AuditTargetType } from "./types"

export interface WriteAuditLogInput {
  workflowRunId: string
  organizationId: string
  stepId?: string
  actionType: AuditActionType
  targetType?: AuditTargetType
  targetId?: string
  outcome?: "success" | "failed" | "skipped"
  detail?: Record<string, unknown>
  actorType?: "system" | "human"
  actorId?: string
}

export class WorkflowAuditService {
  static async log(input: WriteAuditLogInput): Promise<void> {
    try {
      await prisma.workflowAuditLog.create({
        data: {
          workflowRunId: input.workflowRunId,
          organizationId: input.organizationId,
          stepId: input.stepId || null,
          actionType: input.actionType,
          targetType: input.targetType || null,
          targetId: input.targetId || null,
          outcome: input.outcome || null,
          detail: (input.detail ?? undefined) as any,
          actorType: input.actorType || "system",
          actorId: input.actorId || null,
        },
      })
    } catch (error) {
      // Audit logging should never block workflow execution
      console.error("[WorkflowAudit] Failed to write audit log:", error)
    }
  }

  static async logMany(inputs: WriteAuditLogInput[]): Promise<void> {
    try {
      await prisma.workflowAuditLog.createMany({
        data: inputs.map((input) => ({
          workflowRunId: input.workflowRunId,
          organizationId: input.organizationId,
          stepId: input.stepId || null,
          actionType: input.actionType,
          targetType: input.targetType || null,
          targetId: input.targetId || null,
          outcome: input.outcome || null,
          detail: (input.detail || null) as any,
          actorType: input.actorType || "system",
          actorId: input.actorId || null,
        })),
      })
    } catch (error) {
      console.error("[WorkflowAudit] Failed to write audit logs:", error)
    }
  }
}

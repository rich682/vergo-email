/**
 * Generate May 2026 tasks for TMG Construction Management
 *
 * Carries over all tasks from the April 2026 board into the (already-existing)
 * May 2026 board, deduped by lineageId. Computes new dueDates from targetDateRule
 * for May's period.
 *
 * Why this is needed: TMG's future monthly boards (May–Dec 2026) were already
 * present in the DB when April's tasks landed, so the auto-create-period-boards
 * cron treated the series as "caught up" and never carried tasks forward.
 *
 * Usage: npx tsx scripts/seed-tmg-may-2026.ts
 */

import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  // 1. Find the TMG organization
  const org = await prisma.organization.findFirst({
    where: { name: { contains: "TMG" } },
  })
  if (!org) {
    throw new Error("TMG Construction Management organization not found")
  }
  console.log(`Found org: ${org.name} (${org.id})`)

  // 2. Find the April 2026 board (source)
  const aprilBoard = await prisma.board.findFirst({
    where: {
      organizationId: org.id,
      cadence: "MONTHLY",
      periodStart: {
        gte: new Date(Date.UTC(2026, 3, 1)), // Apr 1, 2026
        lt: new Date(Date.UTC(2026, 4, 1)),  // May 1, 2026
      },
    },
  })
  if (!aprilBoard) {
    throw new Error("April 2026 board not found for TMG")
  }
  console.log(`Found April 2026 board: ${aprilBoard.name} (${aprilBoard.id})`)

  // 3. Get all tasks from April 2026
  const aprilTasks = await prisma.taskInstance.findMany({
    where: {
      boardId: aprilBoard.id,
      organizationId: org.id,
    },
    include: {
      collaborators: true,
    },
  })
  console.log(`Found ${aprilTasks.length} tasks in April 2026 board`)

  if (aprilTasks.length === 0) {
    console.log("No tasks to carry over. Exiting.")
    return
  }

  // 4. Find the existing May 2026 board (destination)
  const mayPeriodStart = new Date(Date.UTC(2026, 4, 1))   // May 1, 2026
  const mayPeriodEnd = new Date(Date.UTC(2026, 4, 31, 23, 59, 59, 999)) // May 31, 2026

  const mayBoard = await prisma.board.findFirst({
    where: {
      organizationId: org.id,
      cadence: "MONTHLY",
      periodStart: {
        gte: mayPeriodStart,
        lt: new Date(Date.UTC(2026, 5, 1)),
      },
    },
  })
  if (!mayBoard) {
    throw new Error(
      "May 2026 board not found for TMG — expected one to exist (auto-create cron pre-creates it)."
    )
  }
  console.log(`Using existing May 2026 board: ${mayBoard.name} (${mayBoard.id})`)

  // 5. Carry over tasks from April to May (dedup by lineageId)
  let tasksCreated = 0
  let tasksSkipped = 0

  for (const task of aprilTasks) {
    if (task.lineageId) {
      const existing = await prisma.taskInstance.findFirst({
        where: {
          boardId: mayBoard.id,
          organizationId: org.id,
          lineageId: task.lineageId,
        },
      })
      if (existing) {
        tasksSkipped++
        continue
      }
    }

    // Compute dueDate from targetDateRule for May's period
    const taskAny = task as any
    let dueDate: Date | null = null

    if (taskAny.targetDateRule) {
      try {
        const { computeDueDateFromRule, isValidTargetDateRule } = await import("../lib/target-date-rules")
        if (isValidTargetDateRule(taskAny.targetDateRule)) {
          const computed = computeDueDateFromRule(
            taskAny.targetDateRule,
            mayPeriodStart.toISOString(),
            mayPeriodEnd.toISOString()
          )
          if (computed) dueDate = computed
        }
      } catch {
        dueDate = new Date(Date.UTC(2026, 4, 31))
      }
    }

    if (!dueDate) {
      dueDate = new Date(Date.UTC(2026, 4, 31))
    }

    const newTask = await prisma.taskInstance.create({
      data: {
        organizationId: org.id,
        boardId: mayBoard.id,
        lineageId: task.lineageId,
        name: task.name,
        description: task.description,
        ownerId: task.ownerId,
        clientId: task.clientId,
        status: "NOT_STARTED",
        dueDate,
        customFields: task.customFields as any,
        labels: task.labels as any,
        taskType: taskAny.taskType || null,
        targetDateRule: taskAny.targetDateRule || null,
        reconciliationConfigId: taskAny.reconciliationConfigId || null,
        reportDefinitionId: taskAny.reportDefinitionId || null,
        reportFilterBindings: taskAny.reportFilterBindings || null,
        formDefinitionId: taskAny.formDefinitionId || null,
      },
    })

    if (task.collaborators.length > 0) {
      await prisma.taskInstanceCollaborator.createMany({
        data: task.collaborators.map((c) => ({
          taskInstanceId: newTask.id,
          userId: c.userId,
          role: c.role,
          addedBy: c.addedBy,
        })),
      })
    }

    tasksCreated++
    console.log(`  Created: ${task.name} (due: ${dueDate.toISOString().split("T")[0]})`)
  }

  console.log(`\n--- Summary ---`)
  console.log(`Tasks carried over: ${tasksCreated}`)
  console.log(`Tasks skipped (already exist in May): ${tasksSkipped}`)
  console.log(`Board: May 2026 (${mayBoard.id})`)
  console.log(`Done!`)
}

main()
  .catch((e) => {
    console.error("Error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

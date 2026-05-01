/**
 * Generate April 2026 tasks for TMG Construction Management
 *
 * Finds the March 2026 board, creates an April 2026 board if needed,
 * and carries over all tasks (with dedup by lineageId).
 *
 * Usage: npx tsx scripts/seed-tmg-april-2026.ts
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

  // Check timezone configuration
  const orgTimezone = (org as any).timezone
  if (!orgTimezone || orgTimezone === "UTC") {
    console.warn(
      `\n⚠️  WARNING: TMG org timezone is "${orgTimezone || "null"}".`
    )
    console.warn(
      `   The auto-create-period-boards cron job SKIPS orgs without a timezone.`
    )
    console.warn(
      `   Set the timezone in Settings → Accounting Calendar to enable automatic carryover.\n`
    )
  } else {
    console.log(`Org timezone: ${orgTimezone}`)
  }

  // 2. Find the March 2026 board (source)
  const march2026Board = await prisma.board.findFirst({
    where: {
      organizationId: org.id,
      cadence: "MONTHLY",
      periodStart: {
        gte: new Date(Date.UTC(2026, 2, 1)), // Mar 1, 2026
        lt: new Date(Date.UTC(2026, 3, 1)),  // Apr 1, 2026
      },
    },
  })
  if (!march2026Board) {
    throw new Error("March 2026 board not found for TMG")
  }
  console.log(`Found March 2026 board: ${march2026Board.name} (${march2026Board.id})`)

  // 3. Get all tasks from March 2026
  const marchTasks = await prisma.taskInstance.findMany({
    where: {
      boardId: march2026Board.id,
      organizationId: org.id,
    },
    include: {
      collaborators: true,
    },
  })
  console.log(`Found ${marchTasks.length} tasks in March 2026 board`)

  if (marchTasks.length === 0) {
    console.log("No tasks to carry over. Exiting.")
    return
  }

  // 4. Find or create the April 2026 board
  const aprilPeriodStart = new Date(Date.UTC(2026, 3, 1))  // Apr 1, 2026
  const aprilPeriodEnd = new Date(Date.UTC(2026, 3, 30, 23, 59, 59, 999)) // Apr 30, 2026

  let aprilBoard = await prisma.board.findFirst({
    where: {
      organizationId: org.id,
      cadence: "MONTHLY",
      periodStart: {
        gte: new Date(Date.UTC(2026, 3, 1)),
        lt: new Date(Date.UTC(2026, 4, 1)),
      },
    },
  })

  if (aprilBoard) {
    console.log(`April 2026 board already exists: ${aprilBoard.name} (${aprilBoard.id})`)
  } else {
    // Find an admin user for createdById
    const adminUser = await prisma.user.findFirst({
      where: { organizationId: org.id, role: "ADMIN" },
    })
    if (!adminUser) {
      throw new Error("No admin user found in TMG org")
    }

    aprilBoard = await prisma.board.create({
      data: {
        organizationId: org.id,
        name: "April 2026",
        cadence: "MONTHLY",
        periodStart: aprilPeriodStart,
        periodEnd: aprilPeriodEnd,
        status: "NOT_STARTED",
        automationEnabled: true,
        ownerId: march2026Board.ownerId,
        createdById: adminUser.id,
        skipWeekends: march2026Board.skipWeekends,
      },
    })
    console.log(`Created April 2026 board: ${aprilBoard.name} (${aprilBoard.id})`)
  }

  // 5. Carry over tasks from March to April
  let tasksCreated = 0
  let tasksSkipped = 0

  for (const task of marchTasks) {
    // Dedup by lineageId
    if (task.lineageId) {
      const existing = await prisma.taskInstance.findFirst({
        where: {
          boardId: aprilBoard.id,
          organizationId: org.id,
          lineageId: task.lineageId,
        },
      })
      if (existing) {
        tasksSkipped++
        continue
      }
    }

    // Compute dueDate from targetDateRule for April's period
    const taskAny = task as any
    let dueDate: Date | null = null

    if (taskAny.targetDateRule) {
      try {
        const { computeDueDateFromRule, isValidTargetDateRule } = await import("../lib/target-date-rules")
        if (isValidTargetDateRule(taskAny.targetDateRule)) {
          const computed = computeDueDateFromRule(
            taskAny.targetDateRule,
            aprilPeriodStart.toISOString(),
            aprilPeriodEnd.toISOString()
          )
          if (computed) dueDate = computed
        }
      } catch {
        // Fall back to last day of April
        dueDate = new Date(Date.UTC(2026, 3, 30))
      }
    }

    if (!dueDate) {
      // Default: last day of April
      dueDate = new Date(Date.UTC(2026, 3, 30))
    }

    const newTask = await prisma.taskInstance.create({
      data: {
        organizationId: org.id,
        boardId: aprilBoard.id,
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

    // Copy collaborators
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
  console.log(`Tasks skipped (already exist): ${tasksSkipped}`)
  console.log(`Board: April 2026 (${aprilBoard.id})`)
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

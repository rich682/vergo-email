/**
 * Seed TMG Construction Management report tasks across all monthly boards
 * from January 2023 to March 2026.
 *
 * Usage: npx tsx scripts/seed-tmg-report-tasks.ts
 */

import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

async function main() {
  // 1. Find the TMG organization
  const org = await prisma.organization.findFirst({
    where: { name: { contains: "TMG" } },
  })
  if (!org) {
    throw new Error("TMG Construction Management organization not found")
  }
  console.log(`Found org: ${org.name} (${org.id})`)

  // 2. Find the February 2026 board
  const feb2026Board = await prisma.board.findFirst({
    where: {
      organizationId: org.id,
      cadence: "MONTHLY",
      periodStart: {
        gte: new Date(Date.UTC(2026, 1, 1)),  // Feb 1, 2026
        lt: new Date(Date.UTC(2026, 2, 1)),    // Mar 1, 2026
      },
    },
  })
  if (!feb2026Board) {
    throw new Error("February 2026 board not found for TMG")
  }
  console.log(`Found Feb 2026 board: ${feb2026Board.name} (${feb2026Board.id})`)

  // 3. Get the template tasks from Feb 2026 board
  const templateTasks = await prisma.taskInstance.findMany({
    where: {
      boardId: feb2026Board.id,
      organizationId: org.id,
      taskType: "report",
    },
    include: {
      collaborators: true,
    },
  })

  if (templateTasks.length === 0) {
    throw new Error("No report tasks found in Feb 2026 board")
  }
  console.log(`Found ${templateTasks.length} template tasks:`)
  for (const t of templateTasks) {
    console.log(`  - ${t.name} (owner: ${t.ownerId}, lineageId: ${t.lineageId})`)
  }

  // 4. Get a createdBy user (use the first admin in the org)
  const adminUser = await prisma.user.findFirst({
    where: { organizationId: org.id, role: "ADMIN" },
  })
  if (!adminUser) {
    throw new Error("No admin user found in TMG org")
  }
  console.log(`Using admin user: ${adminUser.name} (${adminUser.id})`)

  // 5. Generate list of all months from Jan 2023 to Mar 2026
  const months: { year: number; month: number }[] = []
  const startYear = 2023
  const startMonth = 0 // January (0-indexed)
  const endYear = 2026
  const endMonth = 2 // March (0-indexed)

  for (let y = startYear; y <= endYear; y++) {
    const mStart = y === startYear ? startMonth : 0
    const mEnd = y === endYear ? endMonth : 11
    for (let m = mStart; m <= mEnd; m++) {
      // Skip Feb 2026 since tasks already exist there
      if (y === 2026 && m === 1) continue
      months.push({ year: y, month: m })
    }
  }
  console.log(`\nWill process ${months.length} months (Jan 2023 - Mar 2026, excluding Feb 2026)`)

  // 6. For each month, ensure board exists and create tasks
  let boardsCreated = 0
  let tasksCreated = 0
  let tasksSkipped = 0

  for (const { year, month } of months) {
    const periodStart = new Date(Date.UTC(year, month, 1))
    const periodEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
    const boardName = `${MONTH_NAMES[month]} ${year}`

    // Find or create the board
    let board = await prisma.board.findFirst({
      where: {
        organizationId: org.id,
        cadence: "MONTHLY",
        periodStart: {
          gte: new Date(Date.UTC(year, month, 1)),
          lt: new Date(Date.UTC(year, month + 1, 1)),
        },
      },
    })

    if (!board) {
      board = await prisma.board.create({
        data: {
          organizationId: org.id,
          name: boardName,
          cadence: "MONTHLY",
          periodStart,
          periodEnd,
          status: "NOT_STARTED",
          automationEnabled: true,
          createdById: adminUser.id,
        },
      })
      boardsCreated++
      console.log(`  Created board: ${boardName}`)
    }

    // Calculate due date: last day of the month (matching the Feb 28 pattern)
    const dueDate = new Date(Date.UTC(year, month + 1, 0)) // last day of month

    // Create tasks in this board
    for (const template of templateTasks) {
      // Check if task already exists (by lineageId or name)
      const existing = await prisma.taskInstance.findFirst({
        where: {
          boardId: board.id,
          organizationId: org.id,
          OR: [
            ...(template.lineageId ? [{ lineageId: template.lineageId }] : []),
            { name: template.name },
          ],
        },
      })

      if (existing) {
        tasksSkipped++
        continue
      }

      const newTask = await prisma.taskInstance.create({
        data: {
          organizationId: org.id,
          boardId: board.id,
          lineageId: template.lineageId,
          name: template.name,
          description: template.description,
          ownerId: template.ownerId,
          clientId: template.clientId,
          status: "NOT_STARTED",
          dueDate,
          customFields: template.customFields as any,
          labels: template.labels as any,
          taskType: (template as any).taskType || "report",
          targetDateRule: (template as any).targetDateRule || null,
          reconciliationConfigId: (template as any).reconciliationConfigId || null,
          reportDefinitionId: (template as any).reportDefinitionId || null,
          reportFilterBindings: (template as any).reportFilterBindings || null,
        },
      })

      // Copy collaborators
      if (template.collaborators.length > 0) {
        await prisma.taskInstanceCollaborator.createMany({
          data: template.collaborators.map((c) => ({
            taskInstanceId: newTask.id,
            userId: c.userId,
            role: c.role,
            addedBy: c.addedBy,
          })),
        })
      }

      tasksCreated++
    }

    console.log(`  ${boardName}: ${templateTasks.length - tasksSkipped} tasks created`)
    // Reset per-board skip counter isn't needed since we track global
  }

  console.log(`\n--- Summary ---`)
  console.log(`Boards created: ${boardsCreated}`)
  console.log(`Tasks created: ${tasksCreated}`)
  console.log(`Tasks skipped (already exist): ${tasksSkipped}`)
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

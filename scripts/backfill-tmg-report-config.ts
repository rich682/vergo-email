/**
 * Backfill report configuration from January 2023 tasks to all sibling tasks
 * (matched by name) across all boards for TMG Construction Management.
 *
 * Also fixes tasks that have an incorrect reportDefinitionId (e.g. Caleb PNL
 * Review pointing to All Project's report definition).
 *
 * Usage:
 *   npx tsx scripts/backfill-tmg-report-config.ts            # live run
 *   npx tsx scripts/backfill-tmg-report-config.ts --dry-run   # preview only
 */

import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const dryRun = process.argv.includes("--dry-run")

async function main() {
  if (dryRun) {
    console.log("=== DRY RUN MODE — no changes will be made ===\n")
  }

  // 1. Find the TMG organization
  const org = await prisma.organization.findFirst({
    where: { name: { contains: "TMG" } },
  })
  if (!org) {
    throw new Error("TMG Construction Management organization not found")
  }
  console.log(`Found org: ${org.name} (${org.id})`)

  // 2. Find the January 2023 board
  const jan2023Board = await prisma.board.findFirst({
    where: {
      organizationId: org.id,
      cadence: "MONTHLY",
      periodStart: {
        gte: new Date(Date.UTC(2023, 0, 1)), // Jan 1, 2023
        lt: new Date(Date.UTC(2023, 1, 1)),   // Feb 1, 2023
      },
    },
  })
  if (!jan2023Board) {
    throw new Error("January 2023 board not found for TMG")
  }
  console.log(`Found Jan 2023 board: ${jan2023Board.name} (${jan2023Board.id})`)

  // 3. Get tasks in Jan 2023 that have reportDefinitionId configured
  const templateTasks = await prisma.taskInstance.findMany({
    where: {
      boardId: jan2023Board.id,
      organizationId: org.id,
      reportDefinitionId: { not: null },
    },
  })

  if (templateTasks.length === 0) {
    console.log("No tasks with reportDefinitionId found in January 2023 board. Nothing to backfill.")
    return
  }
  console.log(`\nFound ${templateTasks.length} configured template tasks:`)
  for (const t of templateTasks) {
    console.log(`  - "${t.name}" → reportDefId: ${t.reportDefinitionId}`)
  }

  // 4. For each template, update all tasks with the same name that have
  //    a missing or incorrect reportDefinitionId
  let totalUpdated = 0

  for (const template of templateTasks) {
    // Find tasks with same name that need updating (null or wrong reportDefinitionId)
    const where = {
      organizationId: org.id,
      name: template.name,
      id: { not: template.id },
      OR: [
        { reportDefinitionId: null },
        { reportDefinitionId: { not: template.reportDefinitionId } },
      ],
    }

    if (dryRun) {
      const toUpdate = await prisma.taskInstance.findMany({
        where,
        select: { id: true, reportDefinitionId: true, board: { select: { name: true } } },
      })
      const nullCount = toUpdate.filter(t => !t.reportDefinitionId).length
      const wrongCount = toUpdate.filter(t => t.reportDefinitionId && t.reportDefinitionId !== template.reportDefinitionId).length
      console.log(`\n[DRY RUN] "${template.name}": ${toUpdate.length} tasks to update (${nullCount} missing, ${wrongCount} wrong)`)
      if (wrongCount > 0) {
        const wrongTasks = toUpdate.filter(t => t.reportDefinitionId)
        for (const t of wrongTasks.slice(0, 3)) {
          console.log(`  Fix: ${t.board?.name} — ${t.reportDefinitionId} → ${template.reportDefinitionId}`)
        }
        if (wrongTasks.length > 3) console.log(`  ... and ${wrongTasks.length - 3} more`)
      }
      totalUpdated += toUpdate.length
    } else {
      const result = await prisma.taskInstance.updateMany({
        where,
        data: {
          reportDefinitionId: template.reportDefinitionId,
          reportFilterBindings: template.reportFilterBindings ?? undefined,
        },
      })
      console.log(`\n"${template.name}": updated ${result.count} tasks`)
      totalUpdated += result.count
    }
  }

  console.log(`\n--- Summary ---`)
  console.log(`Template tasks: ${templateTasks.length}`)
  console.log(`Tasks ${dryRun ? "would be updated" : "updated"}: ${totalUpdated}`)
  console.log("Done!")
}

main()
  .catch((e) => {
    console.error("Error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

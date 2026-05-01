/**
 * Delete TMG's empty future monthly boards (June 2026 → December 2026).
 *
 * These were pre-created (probably by an earlier auto-create run racing ahead),
 * which prevents the auto-create-period-boards cron from carrying tasks forward:
 * the cron only spawns tasks at board-creation time, so once a future board
 * exists empty, it stays empty.
 *
 * After deletion, the cron will create each future month's board on the 1st of
 * the month and carry tasks forward at that time.
 *
 * Safety: aborts if any target board has tasks, collaborators, or generated
 * reports (i.e. anything that might represent real user work).
 *
 * Usage: npx tsx scripts/delete-tmg-empty-future-boards.ts
 */

import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const org = await prisma.organization.findFirst({
    where: { name: { contains: "TMG" } },
  })
  if (!org) throw new Error("TMG org not found")
  console.log(`Org: ${org.name} (${org.id})`)

  // Range: June 1, 2026 (inclusive) → January 1, 2027 (exclusive) = Jun–Dec 2026
  const rangeStart = new Date(Date.UTC(2026, 5, 1))
  const rangeEnd = new Date(Date.UTC(2027, 0, 1))

  const boards = await prisma.board.findMany({
    where: {
      organizationId: org.id,
      cadence: "MONTHLY",
      periodStart: { gte: rangeStart, lt: rangeEnd },
    },
    orderBy: { periodStart: "asc" },
    include: {
      _count: {
        select: {
          taskInstances: true,
          collaborators: true,
          generatedReports: true,
        },
      },
    },
  })

  console.log(`Found ${boards.length} boards in Jun–Dec 2026 range`)
  for (const b of boards) {
    console.log(
      `  ${b.name} (${b.id}) tasks=${b._count.taskInstances} collaborators=${b._count.collaborators} reports=${b._count.generatedReports}`
    )
  }

  // Safety: every target board must be fully empty
  const nonEmpty = boards.filter(
    (b) =>
      b._count.taskInstances > 0 ||
      b._count.collaborators > 0 ||
      b._count.generatedReports > 0
  )
  if (nonEmpty.length > 0) {
    console.error(
      `\nABORT: ${nonEmpty.length} board(s) have related records. Refusing to delete:`
    )
    for (const b of nonEmpty) console.error(`  - ${b.name} (${b.id})`)
    process.exit(1)
  }

  if (boards.length === 0) {
    console.log("Nothing to delete.")
    return
  }

  const result = await prisma.board.deleteMany({
    where: { id: { in: boards.map((b) => b.id) } },
  })
  console.log(`\nDeleted ${result.count} empty future boards.`)
}

main()
  .catch((e) => {
    console.error("Error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

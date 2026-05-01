import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

async function main() {
  const org = await prisma.organization.findFirst({
    where: { name: { contains: "TMG" } },
  })
  if (!org) { console.log("No TMG org"); return }
  console.log("ORG:", {
    id: org.id,
    name: org.name,
    timezone: (org as any).timezone,
    fiscalYearStartMonth: (org as any).fiscalYearStartMonth,
  })

  const boards = await prisma.board.findMany({
    where: { organizationId: org.id, cadence: "MONTHLY" },
    orderBy: { periodStart: "desc" },
    select: {
      id: true, name: true, periodStart: true, periodEnd: true,
      status: true, automationEnabled: true,
      _count: { select: { taskInstances: true } },
    },
  })
  console.log("\nALL MONTHLY BOARDS:")
  for (const b of boards) {
    console.log(`  ${b.name} | start=${b.periodStart?.toISOString().slice(0,10)} | end=${b.periodEnd?.toISOString().slice(0,10)} | status=${b.status} | auto=${b.automationEnabled} | tasks=${b._count.taskInstances}`)
  }

  const may = boards.find(b => b.name === "May 2026")
  if (may) {
    const mayTasks = await prisma.taskInstance.findMany({
      where: { boardId: may.id },
      select: { id: true, name: true, status: true, lineageId: true, dueDate: true },
    })
    console.log("\nMAY 2026 TASKS:")
    for (const t of mayTasks) {
      console.log(`  ${t.name} | status=${t.status} | lineageId=${t.lineageId} | due=${t.dueDate?.toISOString().slice(0,10)}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())

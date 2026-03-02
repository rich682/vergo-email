/**
 * March 2026 Accounting Tasks Seed Script
 *
 * Seeds realistic March tasks for a mid-sized accounting team:
 * - March 2026 Close board with month-end close tasks
 * - Tax Season 2026 board with tax prep tasks
 * - Q1 2026 Year-End Wrap board with quarterly tasks
 * - Tasks spread across NOT_STARTED, IN_PROGRESS, COMPLETE, BLOCKED
 * - Subtasks for complex multi-step tasks
 * - Various task types (reconciliation, request, report, other)
 * - Assigned across team members with clients linked
 *
 * Usage: npx tsx scripts/march-tasks-seed.ts
 */

import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { PrismaClient, JobStatus, SubtaskStatus } from '@prisma/client'

const prisma = new PrismaClient()

const ADMIN_EMAIL = 'rich@getvergo.com'

async function main() {
  console.log('📊 Seeding March 2026 accounting tasks...\n')

  // Find the organization
  const adminUser = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    include: { organization: true }
  })

  if (!adminUser || !adminUser.organization) {
    throw new Error(`Could not find organization for ${ADMIN_EMAIL}`)
  }

  const orgId = adminUser.organization.id
  console.log(`✓ Found organization: ${adminUser.organization.name} (${orgId})`)

  // Get all users for task assignment rotation
  const users = await prisma.user.findMany({
    where: { organizationId: orgId }
  })
  console.log(`✓ Found ${users.length} team members`)

  const getOwner = (index: number) => users[index % users.length].id

  // Get existing clients for linking
  const clients = await prisma.entity.findMany({
    where: { organizationId: orgId },
    take: 10
  })
  const getClient = (index: number) => clients.length > 0 ? clients[index % clients.length].id : undefined

  // ============ BOARDS ============
  let marchClose = await prisma.board.findFirst({ where: { name: 'March 2026 Close', organizationId: orgId } })
  let taxSeason = await prisma.board.findFirst({ where: { name: 'Tax Season 2026', organizationId: orgId } })
  let q1Wrap = await prisma.board.findFirst({ where: { name: 'Q1 2026 Year-End Wrap', organizationId: orgId } })

  if (!marchClose) {
    marchClose = await prisma.board.create({
      data: {
        name: 'March 2026 Close',
        description: 'March 2026 month-end close procedures',
        status: 'IN_PROGRESS',
        cadence: 'MONTHLY',
        periodStart: new Date('2026-03-01'),
        periodEnd: new Date('2026-03-31'),
        organization: { connect: { id: orgId } },
        createdBy: { connect: { id: adminUser.id } },
        owner: { connect: { id: adminUser.id } },
      }
    })
  }

  if (!taxSeason) {
    taxSeason = await prisma.board.create({
      data: {
        name: 'Tax Season 2026',
        description: '2025 tax year filings and preparation',
        status: 'IN_PROGRESS',
        cadence: 'YEAR_END',
        periodStart: new Date('2026-01-15'),
        periodEnd: new Date('2026-04-15'),
        organization: { connect: { id: orgId } },
        createdBy: { connect: { id: adminUser.id } },
        owner: { connect: { id: adminUser.id } },
      }
    })
  }

  if (!q1Wrap) {
    q1Wrap = await prisma.board.create({
      data: {
        name: 'Q1 2026 Year-End Wrap',
        description: 'Quarterly close and reporting for Q1 2026',
        status: 'NOT_STARTED',
        cadence: 'QUARTERLY',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-03-31'),
        organization: { connect: { id: orgId } },
        createdBy: { connect: { id: adminUser.id } },
        owner: { connect: { id: adminUser.id } },
      }
    })
  }

  console.log(`✓ Boards ready`)

  // ============ TASK DEFINITIONS ============
  interface TaskDef {
    name: string
    desc: string
    status: JobStatus
    dueDate: string
    boardId: string
    taskType?: string
    clientIdx?: number
    subtasks?: { title: string; status: SubtaskStatus; dueDate?: string }[]
  }

  const tasks: TaskDef[] = [
    // ────────── MARCH 2026 CLOSE ──────────
    // Complete tasks (early March items already done)
    {
      name: 'Post February Depreciation Entries',
      desc: 'Calculate and post monthly depreciation for all fixed asset classes',
      status: JobStatus.COMPLETE,
      dueDate: '2026-03-03',
      boardId: marchClose.id,
      taskType: 'other',
      subtasks: [
        { title: 'Run depreciation schedule in fixed asset module', status: SubtaskStatus.DONE },
        { title: 'Review unusual variances', status: SubtaskStatus.DONE },
        { title: 'Post journal entry', status: SubtaskStatus.DONE },
      ]
    },
    {
      name: 'Reconcile Operating Bank Account - Feb',
      desc: 'Reconcile main operating checking account for February',
      status: JobStatus.COMPLETE,
      dueDate: '2026-03-05',
      boardId: marchClose.id,
      taskType: 'reconciliation',
    },
    {
      name: 'Reconcile Payroll Bank Account - Feb',
      desc: 'Reconcile payroll clearing account and verify all February payroll transactions',
      status: JobStatus.COMPLETE,
      dueDate: '2026-03-05',
      boardId: marchClose.id,
      taskType: 'reconciliation',
    },
    {
      name: 'Review February AP Aging',
      desc: 'Review aged payables report, flag overdue invoices, verify vendor balances',
      status: JobStatus.COMPLETE,
      dueDate: '2026-03-07',
      boardId: marchClose.id,
      taskType: 'report',
      clientIdx: 5,
    },
    {
      name: 'February Revenue Recognition',
      desc: 'Complete ASC 606 revenue recognition entries for February contracts',
      status: JobStatus.COMPLETE,
      dueDate: '2026-03-07',
      boardId: marchClose.id,
      taskType: 'other',
    },

    // In Progress tasks (mid-March items being worked on now)
    {
      name: 'Collect Employee Expense Reports - March',
      desc: 'Gather and review expense reports from all employees for March reimbursement',
      status: JobStatus.IN_PROGRESS,
      dueDate: '2026-03-15',
      boardId: marchClose.id,
      taskType: 'request',
      subtasks: [
        { title: 'Send expense report reminders to all staff', status: SubtaskStatus.DONE },
        { title: 'Review submitted reports for policy compliance', status: SubtaskStatus.IN_PROGRESS },
        { title: 'Approve or return reports', status: SubtaskStatus.NOT_STARTED },
        { title: 'Post to GL', status: SubtaskStatus.NOT_STARTED },
      ]
    },
    {
      name: 'Credit Card Statement Reconciliation',
      desc: 'Reconcile all corporate credit card statements against receipts and GL entries',
      status: JobStatus.IN_PROGRESS,
      dueDate: '2026-03-12',
      boardId: marchClose.id,
      taskType: 'reconciliation',
      subtasks: [
        { title: 'Download March statements from all card issuers', status: SubtaskStatus.DONE },
        { title: 'Match transactions to receipts', status: SubtaskStatus.IN_PROGRESS },
        { title: 'Code missing transactions to GL accounts', status: SubtaskStatus.NOT_STARTED },
        { title: 'Investigate unreconciled items', status: SubtaskStatus.NOT_STARTED },
      ]
    },
    {
      name: 'Intercompany Reconciliation',
      desc: 'Reconcile intercompany balances across entities and prepare elimination entries',
      status: JobStatus.IN_PROGRESS,
      dueDate: '2026-03-18',
      boardId: marchClose.id,
      taskType: 'reconciliation',
      clientIdx: 2,
    },
    {
      name: 'Collect Vendor W-9s for New Vendors',
      desc: 'Request and file W-9 forms from vendors added in Q1',
      status: JobStatus.IN_PROGRESS,
      dueDate: '2026-03-20',
      boardId: marchClose.id,
      taskType: 'request',
      clientIdx: 6,
    },
    {
      name: 'Review AR Aging & Collections',
      desc: 'Review accounts receivable aging, send collection notices for 60+ day balances',
      status: JobStatus.IN_PROGRESS,
      dueDate: '2026-03-14',
      boardId: marchClose.id,
      taskType: 'report',
      clientIdx: 0,
      subtasks: [
        { title: 'Run AR aging report', status: SubtaskStatus.DONE },
        { title: 'Identify 60+ day balances', status: SubtaskStatus.DONE },
        { title: 'Draft collection notices', status: SubtaskStatus.IN_PROGRESS },
        { title: 'Call top 5 overdue accounts', status: SubtaskStatus.NOT_STARTED },
      ]
    },

    // Blocked task
    {
      name: 'Inventory Valuation Adjustment',
      desc: 'Adjust inventory valuation based on physical count results — waiting on warehouse count data',
      status: JobStatus.BLOCKED,
      dueDate: '2026-03-20',
      boardId: marchClose.id,
      taskType: 'other',
      clientIdx: 4,
    },

    // Not Started tasks (late March items)
    {
      name: 'Post March Accruals',
      desc: 'Prepare and post month-end accrual entries for March expenses',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-03-28',
      boardId: marchClose.id,
      taskType: 'other',
    },
    {
      name: 'Reconcile Operating Bank Account - March',
      desc: 'Reconcile main operating checking account for March',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-03-31',
      boardId: marchClose.id,
      taskType: 'reconciliation',
    },
    {
      name: 'Reconcile Money Market Account - March',
      desc: 'Reconcile money market savings account and verify interest income',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-03-31',
      boardId: marchClose.id,
      taskType: 'reconciliation',
    },
    {
      name: 'Prepare March Flash Report',
      desc: 'Prepare preliminary P&L and balance sheet for management review',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-03-31',
      boardId: marchClose.id,
      taskType: 'report',
    },
    {
      name: 'Record Loan Interest & Principal Payments',
      desc: 'Post March loan payment entries and verify amortization schedule',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-03-25',
      boardId: marchClose.id,
      taskType: 'other',
    },

    // ────────── TAX SEASON 2026 ──────────
    // Complete
    {
      name: 'ACME Corporation - 1120S Preparation',
      desc: 'Prepare S-Corp tax return for ACME Corporation for tax year 2025',
      status: JobStatus.COMPLETE,
      dueDate: '2026-03-15',
      boardId: taxSeason.id,
      taskType: 'other',
      clientIdx: 0,
      subtasks: [
        { title: 'Gather financials and trial balance', status: SubtaskStatus.DONE },
        { title: 'Prepare M-1 adjustments', status: SubtaskStatus.DONE },
        { title: 'Calculate shareholder basis', status: SubtaskStatus.DONE },
        { title: 'Prepare K-1 schedules', status: SubtaskStatus.DONE },
        { title: 'Manager review', status: SubtaskStatus.DONE },
        { title: 'Client approval and e-file', status: SubtaskStatus.DONE },
      ]
    },
    {
      name: 'TechStartup Inc - 1120 Preparation',
      desc: 'Prepare C-Corp tax return for TechStartup Inc, includes R&D credit',
      status: JobStatus.COMPLETE,
      dueDate: '2026-03-15',
      boardId: taxSeason.id,
      taskType: 'other',
      clientIdx: 1,
      subtasks: [
        { title: 'Gather financials', status: SubtaskStatus.DONE },
        { title: 'Calculate R&D tax credit (Form 6765)', status: SubtaskStatus.DONE },
        { title: 'Prepare return', status: SubtaskStatus.DONE },
        { title: 'Partner review and e-file', status: SubtaskStatus.DONE },
      ]
    },

    // In Progress
    {
      name: 'Blue Ocean Ventures - 1065 Partnership Return',
      desc: 'Prepare partnership tax return for Blue Ocean Ventures LP',
      status: JobStatus.IN_PROGRESS,
      dueDate: '2026-03-15',
      boardId: taxSeason.id,
      taskType: 'other',
      clientIdx: 2,
      subtasks: [
        { title: 'Collect partner capital account info', status: SubtaskStatus.DONE },
        { title: 'Prepare Schedule K allocations', status: SubtaskStatus.DONE },
        { title: 'Draft K-1s for partners', status: SubtaskStatus.IN_PROGRESS },
        { title: 'Review and e-file', status: SubtaskStatus.NOT_STARTED },
      ]
    },
    {
      name: 'RetailPlus LLC - 1120S Preparation',
      desc: 'Prepare S-Corp return for RetailPlus LLC with multi-state filing',
      status: JobStatus.IN_PROGRESS,
      dueDate: '2026-03-15',
      boardId: taxSeason.id,
      taskType: 'other',
      clientIdx: 3,
      subtasks: [
        { title: 'Gather trial balance and financials', status: SubtaskStatus.DONE },
        { title: 'Prepare state apportionment schedules', status: SubtaskStatus.IN_PROGRESS },
        { title: 'Calculate shareholder basis', status: SubtaskStatus.NOT_STARTED },
        { title: 'Manager review', status: SubtaskStatus.NOT_STARTED },
        { title: 'Client approval and e-file', status: SubtaskStatus.NOT_STARTED },
      ]
    },
    {
      name: 'Collect Outstanding Client Documents',
      desc: 'Follow up with clients who have not provided all required tax documents',
      status: JobStatus.IN_PROGRESS,
      dueDate: '2026-03-10',
      boardId: taxSeason.id,
      taskType: 'request',
      subtasks: [
        { title: 'Send second reminder to Blue Ocean re: K-1 info', status: SubtaskStatus.DONE },
        { title: 'Follow up with Sunrise Mfg on depreciation schedules', status: SubtaskStatus.IN_PROGRESS },
        { title: 'Request missing 1099s from RetailPlus', status: SubtaskStatus.NOT_STARTED },
      ]
    },
    {
      name: 'Sunrise Manufacturing - 1120 Preparation',
      desc: 'Prepare C-Corp return for Sunrise Manufacturing including Section 199A analysis',
      status: JobStatus.IN_PROGRESS,
      dueDate: '2026-03-15',
      boardId: taxSeason.id,
      taskType: 'other',
      clientIdx: 4,
      subtasks: [
        { title: 'Gather financials', status: SubtaskStatus.DONE },
        { title: 'Fixed asset review and Section 179 elections', status: SubtaskStatus.IN_PROGRESS },
        { title: 'Calculate estimated tax payments', status: SubtaskStatus.NOT_STARTED },
        { title: 'Prepare return and review', status: SubtaskStatus.NOT_STARTED },
      ]
    },

    // Blocked
    {
      name: 'Quarterly Payroll Tax Returns (941)',
      desc: 'Prepare and file Q1 Form 941 for all clients — waiting on March payroll to close',
      status: JobStatus.BLOCKED,
      dueDate: '2026-04-01',
      boardId: taxSeason.id,
      taskType: 'other',
    },

    // Not Started (extension and later filings)
    {
      name: 'Prepare Tax Extensions (7004)',
      desc: 'File automatic extensions for clients who will not meet March 15 deadline',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-03-15',
      boardId: taxSeason.id,
      taskType: 'other',
    },
    {
      name: 'Individual Returns - Thompson Family',
      desc: 'Prepare 1040 for Michael Thompson, includes Schedule C and rental properties',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-04-15',
      boardId: taxSeason.id,
      taskType: 'other',
      clientIdx: 0,
    },
    {
      name: 'Individual Returns - Walsh Family',
      desc: 'Prepare 1040 for Jennifer Walsh, stock option exercises and AMT analysis',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-04-15',
      boardId: taxSeason.id,
      taskType: 'other',
      clientIdx: 1,
    },
    {
      name: 'Sales Tax Returns - All Clients',
      desc: 'Prepare and file Q1 state sales tax returns for applicable clients',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-04-20',
      boardId: taxSeason.id,
      taskType: 'report',
    },

    // ────────── Q1 2026 YEAR-END WRAP ──────────
    // In Progress
    {
      name: 'Prepare Q1 Financial Statements',
      desc: 'Compile consolidated financial statements for Q1 2026 including footnotes',
      status: JobStatus.IN_PROGRESS,
      dueDate: '2026-04-10',
      boardId: q1Wrap.id,
      taskType: 'report',
      subtasks: [
        { title: 'Draft income statement', status: SubtaskStatus.DONE },
        { title: 'Draft balance sheet', status: SubtaskStatus.IN_PROGRESS },
        { title: 'Prepare cash flow statement', status: SubtaskStatus.NOT_STARTED },
        { title: 'Draft footnotes', status: SubtaskStatus.NOT_STARTED },
        { title: 'Management review', status: SubtaskStatus.NOT_STARTED },
      ]
    },
    {
      name: 'Collect COIs from All Vendors',
      desc: 'Annual certificate of insurance collection for all active vendors',
      status: JobStatus.IN_PROGRESS,
      dueDate: '2026-03-31',
      boardId: q1Wrap.id,
      taskType: 'request',
      clientIdx: 7,
    },

    // Not Started
    {
      name: 'Q1 Budget vs Actual Analysis',
      desc: 'Prepare variance analysis comparing Q1 actuals to budget, document explanations for material variances',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-04-15',
      boardId: q1Wrap.id,
      taskType: 'analysis',
    },
    {
      name: 'Update Cash Flow Forecast',
      desc: 'Update rolling 12-month cash flow forecast with Q1 actuals',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-04-10',
      boardId: q1Wrap.id,
      taskType: 'report',
    },
    {
      name: 'Board of Directors Financial Package',
      desc: 'Prepare quarterly financial package for board meeting including KPI dashboard',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-04-15',
      boardId: q1Wrap.id,
      taskType: 'report',
    },
    {
      name: 'Review Insurance Coverage',
      desc: 'Annual review of all insurance policies — verify adequate coverage and competitive pricing',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-03-31',
      boardId: q1Wrap.id,
      taskType: 'request',
      clientIdx: 9,
    },
    {
      name: 'Reconcile Prepaid Expenses & Amortization',
      desc: 'Review all prepaid accounts, verify amortization schedules, adjust for Q1',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-04-05',
      boardId: q1Wrap.id,
      taskType: 'reconciliation',
    },
    {
      name: 'Fixed Asset Register Update',
      desc: 'Update fixed asset register with Q1 additions, disposals, and transfers',
      status: JobStatus.NOT_STARTED,
      dueDate: '2026-04-10',
      boardId: q1Wrap.id,
      taskType: 'other',
    },
  ]

  // ============ CREATE TASKS & SUBTASKS ============
  let tasksCreated = 0
  let subtasksCreated = 0

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i]
    const existing = await prisma.taskInstance.findFirst({
      where: { name: t.name, boardId: t.boardId, organizationId: orgId }
    })

    if (existing) {
      console.log(`  → Skipped (exists): ${t.name}`)
      continue
    }

    const completedAt = t.status === JobStatus.COMPLETE ? new Date(t.dueDate) : undefined

    const task = await prisma.taskInstance.create({
      data: {
        name: t.name,
        description: t.desc,
        status: t.status,
        dueDate: new Date(t.dueDate),
        ownerId: getOwner(i),
        boardId: t.boardId,
        organizationId: orgId,
        taskType: t.taskType,
        clientId: t.clientIdx !== undefined ? getClient(t.clientIdx) : undefined,
        completedAt,
      }
    })
    tasksCreated++

    // Create subtasks if defined
    if (t.subtasks) {
      for (let s = 0; s < t.subtasks.length; s++) {
        const sub = t.subtasks[s]
        await prisma.subtask.create({
          data: {
            title: sub.title,
            status: sub.status,
            sortOrder: s,
            taskInstanceId: task.id,
            organizationId: orgId,
            ownerId: getOwner(i + s),
            completedAt: sub.status === SubtaskStatus.DONE ? new Date() : undefined,
          }
        })
        subtasksCreated++
      }
    }

    console.log(`  ✓ ${t.status.padEnd(12)} | ${t.name}`)
  }

  // ============ SUMMARY ============
  const statusCounts = tasks.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  console.log('\n' + '='.repeat(55))
  console.log('📊 MARCH 2026 ACCOUNTING TASKS SEEDED!')
  console.log('='.repeat(55))
  console.log(`\n  Tasks created:    ${tasksCreated}`)
  console.log(`  Subtasks created: ${subtasksCreated}`)
  console.log(`\n  Status breakdown:`)
  console.log(`    NOT_STARTED:  ${statusCounts.NOT_STARTED || 0}`)
  console.log(`    IN_PROGRESS:  ${statusCounts.IN_PROGRESS || 0}`)
  console.log(`    COMPLETE:     ${statusCounts.COMPLETE || 0}`)
  console.log(`    BLOCKED:      ${statusCounts.BLOCKED || 0}`)
  console.log(`\n  Boards:`)
  console.log(`    • March 2026 Close (${tasks.filter(t => t.boardId === marchClose!.id).length} tasks)`)
  console.log(`    • Tax Season 2026 (${tasks.filter(t => t.boardId === taxSeason!.id).length} tasks)`)
  console.log(`    • Q1 2026 Year-End Wrap (${tasks.filter(t => t.boardId === q1Wrap!.id).length} tasks)`)
  console.log()
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

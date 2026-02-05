/**
 * Investor Demo Seed Script
 * 
 * Creates comprehensive demo data for investor presentations with accounting-relevant content:
 * - Monthly boards for book close periods
 * - Classic accounting tasks (bank rec, AP review, etc.)
 * - Vendors, clients, and auditor contacts
 * - Database examples (Vendor Master, Fixed Assets)
 * - Form definitions and requests
 * - Report definitions
 * 
 * Usage: npx ts-node scripts/seed-investor-demo.ts <email>
 * Example: npx ts-node scripts/seed-investor-demo.ts rich@tryvergo.com
 */

import { PrismaClient, BoardCadence, JobStatus, ContactType, TaskStatus, SubtaskStatus } from "@prisma/client"
import { randomUUID } from "crypto"

const prisma = new PrismaClient()

// ============================================================================
// DEMO DATA CONFIGURATION
// ============================================================================

// Vendors (external stakeholders)
const VENDORS = [
  { firstName: "Amazon", lastName: "Web Services", email: "billing@aws.example.com", companyName: "Amazon Web Services", contactType: "VENDOR" as ContactType },
  { firstName: "John", lastName: "Anderson", email: "john.anderson@acmesupplies.com", companyName: "Acme Office Supplies", contactType: "VENDOR" as ContactType },
  { firstName: "Sarah", lastName: "Mitchell", email: "sarah@techsolutions.com", companyName: "Tech Solutions Inc", contactType: "VENDOR" as ContactType },
  { firstName: "Michael", lastName: "Chen", email: "mchen@cloudservices.io", companyName: "Cloud Services LLC", contactType: "VENDOR" as ContactType },
  { firstName: "Emily", lastName: "Rodriguez", email: "emily.r@globallogistics.com", companyName: "Global Logistics Co", contactType: "VENDOR" as ContactType },
  { firstName: "James", lastName: "Wilson", email: "jwilson@securitypro.net", companyName: "Security Pro Services", contactType: "VENDOR" as ContactType },
]

// Clients
const CLIENTS = [
  { firstName: "David", lastName: "Thompson", email: "dthompson@acmecorp.com", companyName: "Acme Corporation", contactType: "CLIENT" as ContactType },
  { firstName: "Jennifer", lastName: "Lee", email: "jlee@globaltech.io", companyName: "Global Tech Industries", contactType: "CLIENT" as ContactType },
  { firstName: "Robert", lastName: "Martinez", email: "rmartinez@innovatellc.com", companyName: "Innovate LLC", contactType: "CLIENT" as ContactType },
]

// External auditors
const AUDITORS = [
  { firstName: "Patricia", lastName: "Williams", email: "pwilliams@bigfouraudit.com", companyName: "Big Four Audit LLP", contactType: "CONTRACTOR" as ContactType },
  { firstName: "Christopher", lastName: "Brown", email: "cbrown@auditpartners.com", companyName: "Audit Partners Group", contactType: "CONTRACTOR" as ContactType },
]

// Book close tasks - classic accounting items
const BOOK_CLOSE_TASKS = [
  { name: "Bank Reconciliation", description: "Reconcile all bank accounts against GL balances", dueDayOffset: 3, status: "COMPLETE" as JobStatus },
  { name: "Accounts Payable Review", description: "Review and validate open AP balances, process vendor payments", dueDayOffset: 4, status: "IN_PROGRESS" as JobStatus },
  { name: "Accounts Receivable Aging", description: "Review AR aging, follow up on past-due invoices", dueDayOffset: 4, status: "IN_PROGRESS" as JobStatus },
  { name: "Payroll Reconciliation", description: "Reconcile payroll register to GL, verify tax withholdings", dueDayOffset: 5, status: "NOT_STARTED" as JobStatus },
  { name: "Intercompany Eliminations", description: "Process and document intercompany eliminations", dueDayOffset: 6, status: "NOT_STARTED" as JobStatus },
  { name: "Revenue Recognition Review", description: "Review deferred revenue and recognize per ASC 606", dueDayOffset: 6, status: "NOT_STARTED" as JobStatus },
  { name: "Expense Accruals", description: "Accrue all known expenses not yet invoiced", dueDayOffset: 7, status: "NOT_STARTED" as JobStatus },
  { name: "Fixed Asset Roll-Forward", description: "Update fixed asset register, calculate depreciation", dueDayOffset: 7, status: "NOT_STARTED" as JobStatus },
  { name: "Prepaid Expense Amortization", description: "Amortize prepaid expenses per schedule", dueDayOffset: 8, status: "NOT_STARTED" as JobStatus },
  { name: "Inventory Count Verification", description: "Verify inventory counts and adjust for variances", dueDayOffset: 8, status: "NOT_STARTED" as JobStatus },
  { name: "Tax Provision Calculation", description: "Calculate quarterly tax provision estimate", dueDayOffset: 10, status: "NOT_STARTED" as JobStatus },
  { name: "Financial Statement Preparation", description: "Prepare draft P&L, Balance Sheet, Cash Flow", dueDayOffset: 12, status: "NOT_STARTED" as JobStatus },
  { name: "Management Review Package", description: "Compile variance analysis and management commentary", dueDayOffset: 14, status: "NOT_STARTED" as JobStatus },
  { name: "Audit PBC List", description: "Gather documents for external auditors (PBC)", dueDayOffset: 15, status: "NOT_STARTED" as JobStatus },
]

// Subtasks for some tasks
const SUBTASKS_BY_TASK: Record<string, string[]> = {
  "Bank Reconciliation": [
    "Download bank statements",
    "Export GL detail for cash accounts",
    "Identify outstanding checks",
    "Investigate uncleared deposits",
    "Document reconciling items",
    "Obtain manager sign-off",
  ],
  "Accounts Payable Review": [
    "Run AP aging report",
    "Match invoices to POs",
    "Review vendor statements",
    "Process payment batch",
    "Update vendor files",
  ],
  "Fixed Asset Roll-Forward": [
    "Review asset additions",
    "Process disposals",
    "Calculate monthly depreciation",
    "Update asset register",
    "Reconcile to GL",
  ],
}

// Database schemas
const VENDOR_MASTER_SCHEMA = {
  columns: [
    { key: "vendor_name", label: "Vendor Name", dataType: "text", order: 0, required: true },
    { key: "contact_name", label: "Contact Name", dataType: "text", order: 1 },
    { key: "email", label: "Email", dataType: "email", order: 2 },
    { key: "phone", label: "Phone", dataType: "text", order: 3 },
    { key: "payment_terms", label: "Payment Terms", dataType: "dropdown", order: 4, options: ["Net 30", "Net 45", "Net 60", "Due on Receipt"] },
    { key: "w9_status", label: "W-9 Status", dataType: "dropdown", order: 5, options: ["Received", "Pending", "Expired", "Not Required"] },
    { key: "annual_spend", label: "Annual Spend", dataType: "currency", order: 6 },
    { key: "last_payment_date", label: "Last Payment", dataType: "date", order: 7 },
  ],
  version: 1,
}

const VENDOR_MASTER_ROWS = [
  { vendor_name: "Amazon Web Services", contact_name: "AWS Billing", email: "billing@aws.example.com", phone: "", payment_terms: "Net 30", w9_status: "Received", annual_spend: 125000.00, last_payment_date: "2026-01-15", _status: "ACTIVE", _rowId: randomUUID() },
  { vendor_name: "Acme Office Supplies", contact_name: "John Anderson", email: "john.anderson@acmesupplies.com", phone: "555-0101", payment_terms: "Net 30", w9_status: "Received", annual_spend: 8500.00, last_payment_date: "2026-01-20", _status: "ACTIVE", _rowId: randomUUID() },
  { vendor_name: "Tech Solutions Inc", contact_name: "Sarah Mitchell", email: "sarah@techsolutions.com", phone: "555-0102", payment_terms: "Net 45", w9_status: "Pending", annual_spend: 45000.00, last_payment_date: "2026-01-10", _status: "ACTIVE", _rowId: randomUUID() },
  { vendor_name: "Cloud Services LLC", contact_name: "Michael Chen", email: "mchen@cloudservices.io", phone: "555-0103", payment_terms: "Net 30", w9_status: "Received", annual_spend: 36000.00, last_payment_date: "2026-01-25", _status: "ACTIVE", _rowId: randomUUID() },
  { vendor_name: "Global Logistics Co", contact_name: "Emily Rodriguez", email: "emily.r@globallogistics.com", phone: "555-0104", payment_terms: "Net 60", w9_status: "Expired", annual_spend: 72000.00, last_payment_date: "2025-12-28", _status: "ACTIVE", _rowId: randomUUID() },
  { vendor_name: "Security Pro Services", contact_name: "James Wilson", email: "jwilson@securitypro.net", phone: "555-0105", payment_terms: "Due on Receipt", w9_status: "Received", annual_spend: 24000.00, last_payment_date: "2026-01-05", _status: "ACTIVE", _rowId: randomUUID() },
]

const FIXED_ASSET_SCHEMA = {
  columns: [
    { key: "asset_id", label: "Asset ID", dataType: "text", order: 0, required: true },
    { key: "description", label: "Description", dataType: "text", order: 1 },
    { key: "category", label: "Category", dataType: "dropdown", order: 2, options: ["Computer Equipment", "Furniture", "Vehicles", "Leasehold Improvements", "Software"] },
    { key: "acquisition_date", label: "Acquisition Date", dataType: "date", order: 3 },
    { key: "acquisition_cost", label: "Acquisition Cost", dataType: "currency", order: 4 },
    { key: "useful_life_years", label: "Useful Life (Years)", dataType: "number", order: 5 },
    { key: "accumulated_depreciation", label: "Accumulated Depreciation", dataType: "currency", order: 6 },
    { key: "net_book_value", label: "Net Book Value", dataType: "currency", order: 7 },
    { key: "location", label: "Location", dataType: "text", order: 8 },
  ],
  version: 1,
}

const FIXED_ASSET_ROWS = [
  { asset_id: "FA-001", description: "Dell Server Rack", category: "Computer Equipment", acquisition_date: "2024-03-15", acquisition_cost: 45000.00, useful_life_years: 5, accumulated_depreciation: 15000.00, net_book_value: 30000.00, location: "Data Center", _status: "ACTIVE", _rowId: randomUUID() },
  { asset_id: "FA-002", description: "Office Furniture Set - Floor 2", category: "Furniture", acquisition_date: "2023-06-01", acquisition_cost: 28000.00, useful_life_years: 7, accumulated_depreciation: 8000.00, net_book_value: 20000.00, location: "HQ - Floor 2", _status: "ACTIVE", _rowId: randomUUID() },
  { asset_id: "FA-003", description: "Delivery Van - Ford Transit", category: "Vehicles", acquisition_date: "2024-01-10", acquisition_cost: 42000.00, useful_life_years: 5, accumulated_depreciation: 8400.00, net_book_value: 33600.00, location: "Warehouse", _status: "ACTIVE", _rowId: randomUUID() },
  { asset_id: "FA-004", description: "Conference Room AV System", category: "Computer Equipment", acquisition_date: "2024-09-01", acquisition_cost: 18500.00, useful_life_years: 5, accumulated_depreciation: 1850.00, net_book_value: 16650.00, location: "HQ - Floor 1", _status: "ACTIVE", _rowId: randomUUID() },
  { asset_id: "FA-005", description: "Salesforce CRM License", category: "Software", acquisition_date: "2025-01-01", acquisition_cost: 75000.00, useful_life_years: 3, accumulated_depreciation: 6250.00, net_book_value: 68750.00, location: "Cloud", _status: "ACTIVE", _rowId: randomUUID() },
]

// Form definitions
const VENDOR_INFO_FORM_FIELDS = [
  { key: "vendor_name", label: "Company/Vendor Name", type: "text", required: true, order: 0, helpText: "Legal business name" },
  { key: "contact_name", label: "Primary Contact Name", type: "text", required: true, order: 1 },
  { key: "email", label: "Contact Email", type: "email", required: true, order: 2 },
  { key: "phone", label: "Phone Number", type: "text", required: false, order: 3 },
  { key: "payment_terms", label: "Preferred Payment Terms", type: "dropdown", required: true, order: 4, options: ["Net 30", "Net 45", "Net 60", "Due on Receipt"] },
  { key: "bank_name", label: "Bank Name (for ACH)", type: "text", required: false, order: 5 },
  { key: "w9_upload", label: "W-9 Form", type: "file", required: true, order: 6, helpText: "Please upload a completed W-9 form" },
]

const EXPENSE_FORM_FIELDS = [
  { key: "employee_name", label: "Employee Name", type: "text", required: true, order: 0 },
  { key: "department", label: "Department", type: "dropdown", required: true, order: 1, options: ["Engineering", "Sales", "Marketing", "Finance", "Operations", "HR"] },
  { key: "expense_date", label: "Expense Date", type: "date", required: true, order: 2 },
  { key: "expense_type", label: "Expense Category", type: "dropdown", required: true, order: 3, options: ["Travel", "Meals & Entertainment", "Office Supplies", "Software", "Professional Development", "Other"] },
  { key: "amount", label: "Amount", type: "currency", required: true, order: 4 },
  { key: "description", label: "Description/Purpose", type: "textarea", required: true, order: 5, helpText: "Describe the business purpose" },
  { key: "receipt", label: "Receipt/Documentation", type: "file", required: true, order: 6 },
]

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

async function main() {
  const email = process.argv[2]

  if (!email) {
    console.error("Usage: npx ts-node scripts/seed-investor-demo.ts <email>")
    console.error("Example: npx ts-node scripts/seed-investor-demo.ts rich@tryvergo.com")
    process.exit(1)
  }

  console.log(`\n🎯 Investor Demo Seed Script`)
  console.log(`${"=".repeat(50)}\n`)
  console.log(`🔍 Looking up user: ${email}`)

  // Find the user and their organization
  const user = await prisma.user.findUnique({
    where: { email },
    include: { organization: true },
  })

  if (!user) {
    console.error(`❌ User not found: ${email}`)
    process.exit(1)
  }

  const organizationId = user.organizationId
  const userId = user.id
  console.log(`✅ Found user: ${user.name || user.email}`)
  console.log(`   Organization: ${user.organization.name} (${organizationId})\n`)

  // -------------------------------------------------------------------------
  // 1. CREATE CONTACTS (STAKEHOLDERS)
  // -------------------------------------------------------------------------
  console.log(`📇 Creating contacts...`)

  const createdVendors = []
  const createdClients = []
  const createdAuditors = []

  for (const vendor of VENDORS) {
    const existing = await prisma.entity.findFirst({
      where: { email: vendor.email, organizationId },
    })
    if (!existing) {
      const entity = await prisma.entity.create({
        data: { ...vendor, organizationId, isInternal: false },
      })
      createdVendors.push(entity)
    } else {
      createdVendors.push(existing)
    }
  }
  console.log(`   ✓ ${createdVendors.length} vendors`)

  for (const client of CLIENTS) {
    const existing = await prisma.entity.findFirst({
      where: { email: client.email, organizationId },
    })
    if (!existing) {
      const entity = await prisma.entity.create({
        data: { ...client, organizationId, isInternal: false },
      })
      createdClients.push(entity)
    } else {
      createdClients.push(existing)
    }
  }
  console.log(`   ✓ ${createdClients.length} clients`)

  for (const auditor of AUDITORS) {
    const existing = await prisma.entity.findFirst({
      where: { email: auditor.email, organizationId },
    })
    if (!existing) {
      const entity = await prisma.entity.create({
        data: { ...auditor, organizationId, isInternal: false },
      })
      createdAuditors.push(entity)
    } else {
      createdAuditors.push(existing)
    }
  }
  console.log(`   ✓ ${createdAuditors.length} auditors\n`)

  // -------------------------------------------------------------------------
  // 2. CREATE DATABASES
  // -------------------------------------------------------------------------
  console.log(`🗄️  Creating databases...`)

  // Vendor Master Database
  let vendorDatabase = await prisma.database.findFirst({
    where: { name: "Vendor Master List", organizationId },
  })
  if (!vendorDatabase) {
    vendorDatabase = await prisma.database.create({
      data: {
        name: "Vendor Master List",
        description: "Centralized vendor information and W-9 tracking",
        organizationId,
        createdById: userId,
        schema: VENDOR_MASTER_SCHEMA,
        identifierKeys: ["vendor_name"],
        rows: VENDOR_MASTER_ROWS,
        rowCount: VENDOR_MASTER_ROWS.length,
      },
    })
    console.log(`   ✓ Created: Vendor Master List (${VENDOR_MASTER_ROWS.length} rows)`)
  } else {
    console.log(`   ⊛ Exists: Vendor Master List`)
  }

  // Fixed Asset Database
  let fixedAssetDatabase = await prisma.database.findFirst({
    where: { name: "Fixed Asset Register", organizationId },
  })
  if (!fixedAssetDatabase) {
    fixedAssetDatabase = await prisma.database.create({
      data: {
        name: "Fixed Asset Register",
        description: "Property, plant and equipment tracking with depreciation",
        organizationId,
        createdById: userId,
        schema: FIXED_ASSET_SCHEMA,
        identifierKeys: ["asset_id"],
        rows: FIXED_ASSET_ROWS,
        rowCount: FIXED_ASSET_ROWS.length,
      },
    })
    console.log(`   ✓ Created: Fixed Asset Register (${FIXED_ASSET_ROWS.length} rows)`)
  } else {
    console.log(`   ⊛ Exists: Fixed Asset Register`)
  }
  console.log()

  // -------------------------------------------------------------------------
  // 3. CREATE FORM DEFINITIONS
  // -------------------------------------------------------------------------
  console.log(`📝 Creating form definitions...`)

  // Vendor Information Form
  let vendorForm = await prisma.formDefinition.findFirst({
    where: { name: "Vendor Information Collection", organizationId },
  })
  if (!vendorForm) {
    vendorForm = await prisma.formDefinition.create({
      data: {
        name: "Vendor Information Collection",
        description: "Collect vendor details and W-9 for onboarding",
        organizationId,
        createdById: userId,
        fields: VENDOR_INFO_FORM_FIELDS,
        settings: { allowEdit: true, enforceDeadline: false },
        databaseId: vendorDatabase.id,
        columnMapping: {
          vendor_name: "vendor_name",
          contact_name: "contact_name",
          email: "email",
          phone: "phone",
          payment_terms: "payment_terms",
        },
      },
    })
    console.log(`   ✓ Created: Vendor Information Collection`)
  } else {
    console.log(`   ⊛ Exists: Vendor Information Collection`)
  }

  // Expense Reimbursement Form
  let expenseForm = await prisma.formDefinition.findFirst({
    where: { name: "Expense Reimbursement Request", organizationId },
  })
  if (!expenseForm) {
    expenseForm = await prisma.formDefinition.create({
      data: {
        name: "Expense Reimbursement Request",
        description: "Employee expense submission with receipt upload",
        organizationId,
        createdById: userId,
        fields: EXPENSE_FORM_FIELDS,
        settings: { allowEdit: false, enforceDeadline: true },
      },
    })
    console.log(`   ✓ Created: Expense Reimbursement Request`)
  } else {
    console.log(`   ⊛ Exists: Expense Reimbursement Request`)
  }
  console.log()

  // -------------------------------------------------------------------------
  // 4. CREATE BOARDS (Monthly Book Close Periods)
  // -------------------------------------------------------------------------
  console.log(`📊 Creating boards (monthly periods)...`)

  const boards = []
  const months = [
    { month: 0, name: "January 2026 Book Close", status: "COMPLETE" },
    { month: 1, name: "February 2026 Book Close", status: "IN_PROGRESS" },
    { month: 2, name: "March 2026 Book Close", status: "NOT_STARTED" },
  ]

  for (const m of months) {
    const periodStart = new Date(2026, m.month, 1)
    const periodEnd = new Date(2026, m.month + 1, 0) // Last day of month

    let board = await prisma.board.findFirst({
      where: { name: m.name, organizationId },
    })
    if (!board) {
      board = await prisma.board.create({
        data: {
          name: m.name,
          description: `Monthly accounting close for ${periodStart.toLocaleString("default", { month: "long" })} 2026`,
          organizationId,
          ownerId: userId,
          createdById: userId,
          status: m.status as any,
          cadence: "MONTHLY" as BoardCadence,
          periodStart,
          periodEnd,
        },
      })
      console.log(`   ✓ Created: ${m.name}`)
    } else {
      console.log(`   ⊛ Exists: ${m.name}`)
    }
    boards.push(board)
  }
  console.log()

  // -------------------------------------------------------------------------
  // 5. CREATE TASKS WITHIN BOARDS
  // -------------------------------------------------------------------------
  console.log(`📋 Creating tasks within boards...`)

  for (let i = 0; i < boards.length; i++) {
    const board = boards[i]
    const monthStatus = months[i].status

    let taskCount = 0
    for (let j = 0; j < BOOK_CLOSE_TASKS.length; j++) {
      const taskDef = BOOK_CLOSE_TASKS[j]
      const taskName = taskDef.name

      // Check if task already exists
      const existingTask = await prisma.taskInstance.findFirst({
        where: { name: taskName, boardId: board.id, organizationId },
      })
      if (existingTask) continue

      // Determine status based on board status
      let status: JobStatus = "NOT_STARTED"
      if (monthStatus === "COMPLETE") {
        status = "COMPLETE"
      } else if (monthStatus === "IN_PROGRESS") {
        status = taskDef.status
      }

      // Calculate due date
      const dueDate = new Date(board.periodEnd!)
      dueDate.setDate(dueDate.getDate() + taskDef.dueDayOffset)

      // Create the task
      const task = await prisma.taskInstance.create({
        data: {
          name: taskName,
          description: taskDef.description,
          organizationId,
          ownerId: userId,
          boardId: board.id,
          status,
          dueDate,
          sortOrder: j,
        },
      })

      // Create subtasks if defined
      const subtaskTitles = SUBTASKS_BY_TASK[taskName]
      if (subtaskTitles) {
        for (let k = 0; k < subtaskTitles.length; k++) {
          const subtaskStatus = status === "COMPLETE" 
            ? "DONE" 
            : (status === "IN_PROGRESS" && k < 2) 
              ? "DONE" 
              : "NOT_STARTED"
          
          await prisma.subtask.create({
            data: {
              title: subtaskTitles[k],
              organizationId,
              taskInstanceId: task.id,
              status: subtaskStatus as SubtaskStatus,
              sortOrder: k,
              completedAt: subtaskStatus === "DONE" ? new Date() : null,
            },
          })
        }
      }

      taskCount++
    }
    console.log(`   ✓ ${board.name}: ${taskCount} tasks created`)
  }
  console.log()

  // -------------------------------------------------------------------------
  // 6. CREATE SOME REQUESTS (to show request tracking)
  // -------------------------------------------------------------------------
  console.log(`📨 Creating sample requests...`)

  // Get the February board for requests
  const febBoard = boards[1]
  const febTask = await prisma.taskInstance.findFirst({
    where: { name: "Accounts Payable Review", boardId: febBoard.id, organizationId },
  })

  if (febTask) {
    // Create W-9 collection requests to some vendors
    for (let i = 0; i < 3; i++) {
      const vendor = createdVendors[i]
      if (!vendor?.email) continue

      const existingRequest = await prisma.request.findFirst({
        where: {
          taskInstanceId: febTask.id,
          entityId: vendor.id,
          organizationId,
        },
      })
      if (existingRequest) continue

      const threadId = `w9-${vendor.id}-${Date.now()}`
      const status = i === 0 ? "COMPLETE" : i === 1 ? "REPLIED" : "NO_REPLY"

      await prisma.request.create({
        data: {
          organizationId,
          taskInstanceId: febTask.id,
          entityId: vendor.id,
          campaignName: "W-9 Collection - February 2026",
          campaignType: "W9",
          requestType: "standard",
          status: status as TaskStatus,
          threadId,
          replyToEmail: `ap@${user.organization.slug}.vergo.io`,
          hasAttachments: status === "COMPLETE",
          readStatus: status === "COMPLETE" ? "read" : "unread",
        },
      })
    }
    console.log(`   ✓ Created W-9 collection requests`)
  }
  console.log()

  // -------------------------------------------------------------------------
  // 7. CREATE FORM REQUESTS (to show form feature)
  // -------------------------------------------------------------------------
  console.log(`📝 Creating form requests...`)

  // Get a task to attach form requests to
  const vendorInfoTask = await prisma.taskInstance.findFirst({
    where: { name: "Accounts Payable Review", boardId: boards[1].id, organizationId },
  })

  if (vendorInfoTask && vendorForm) {
    // Create form requests to a couple vendors
    for (let i = 3; i < 5; i++) {
      const vendor = createdVendors[i]
      if (!vendor?.email) continue

      const existingFormRequest = await prisma.formRequest.findFirst({
        where: {
          taskInstanceId: vendorInfoTask.id,
          recipientEntityId: vendor.id,
          organizationId,
        },
      })
      if (existingFormRequest) continue

      const status = i === 3 ? "SUBMITTED" : "PENDING"
      const accessToken = randomUUID()

      await prisma.formRequest.create({
        data: {
          organizationId,
          taskInstanceId: vendorInfoTask.id,
          formDefinitionId: vendorForm.id,
          recipientEntityId: vendor.id,
          accessToken,
          status,
          submittedAt: status === "SUBMITTED" ? new Date() : null,
          responseData: status === "SUBMITTED"
            ? {
                vendor_name: vendor.companyName,
                contact_name: `${vendor.firstName} ${vendor.lastName}`,
                email: vendor.email,
                payment_terms: "Net 30",
              }
            : null,
          deadlineDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
          remindersEnabled: true,
          remindersMaxCount: 3,
        },
      })
    }
    console.log(`   ✓ Created vendor information form requests`)
  }
  console.log()

  // -------------------------------------------------------------------------
  // 8. CREATE REPORT DEFINITION (to show reports feature)
  // -------------------------------------------------------------------------
  console.log(`📈 Creating report definitions...`)

  let vendorSpendReport = await prisma.reportDefinition.findFirst({
    where: { name: "Vendor Spend Analysis", organizationId },
  })
  if (!vendorSpendReport && vendorDatabase) {
    vendorSpendReport = await prisma.reportDefinition.create({
      data: {
        name: "Vendor Spend Analysis",
        description: "Monthly vendor spend by payment terms and category",
        organizationId,
        databaseId: vendorDatabase.id,
        createdById: userId,
        cadence: "monthly",
        dateColumnKey: "last_payment_date",
        layout: "standard",
        columns: [
          { key: "vendor_name", label: "Vendor Name", type: "source", sourceColumnKey: "vendor_name", dataType: "text", order: 0 },
          { key: "payment_terms", label: "Payment Terms", type: "source", sourceColumnKey: "payment_terms", dataType: "text", order: 1 },
          { key: "annual_spend", label: "Annual Spend", type: "source", sourceColumnKey: "annual_spend", dataType: "currency", order: 2 },
        ],
        formulaRows: [
          { key: "total", label: "Total", columnFormulas: { annual_spend: "SUM" }, order: 0 },
        ],
        filterColumnKeys: ["payment_terms", "w9_status"],
      },
    })
    console.log(`   ✓ Created: Vendor Spend Analysis`)
  } else {
    console.log(`   ⊛ Exists: Vendor Spend Analysis`)
  }
  console.log()

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log(`${"=".repeat(50)}`)
  console.log(`✅ INVESTOR DEMO DATA CREATED SUCCESSFULLY!\n`)
  console.log(`📊 Summary:`)
  console.log(`   • ${createdVendors.length + createdClients.length + createdAuditors.length} stakeholder contacts`)
  console.log(`   • ${boards.length} monthly book close boards`)
  console.log(`   • ${BOOK_CLOSE_TASKS.length} tasks per board`)
  console.log(`   • 2 databases with sample data`)
  console.log(`   • 2 form definitions`)
  console.log(`   • Sample requests and form requests`)
  console.log(`   • 1 report definition\n`)
  console.log(`🎯 Ready for your investor demo!\n`)
}

main()
  .catch((e) => {
    console.error("❌ Error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

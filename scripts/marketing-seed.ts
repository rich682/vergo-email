/**
 * Marketing Video Seed Script
 * 
 * Adds demo data to EXISTING organization:
 * - 15+ contacts with companies (clients, vendors, employees)
 * - 3 boards (January Close, February Close, Q1 Audit Prep)
 * - 20+ tasks with varied statuses
 * 
 * Usage: npx tsx scripts/marketing-seed.ts
 */

import { PrismaClient, JobStatus, ContactType } from '@prisma/client'

const prisma = new PrismaClient()

// Your organization email domain - we'll find your org by looking up a user
const ADMIN_EMAIL = 'rich@getvergo.com'

async function main() {
  console.log('🎬 Adding marketing demo data to your account...\n')

  // Find the organization by admin email
  const adminUser = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    include: { organization: true }
  })

  if (!adminUser || !adminUser.organization) {
    throw new Error(`Could not find organization for ${ADMIN_EMAIL}`)
  }

  const org = adminUser.organization
  const orgId = org.id
  console.log(`✓ Found organization: ${org.name} (${orgId})`)

  // Get all users in the org for task assignment
  const users = await prisma.user.findMany({
    where: { organizationId: orgId }
  })
  console.log(`✓ Found ${users.length} team members`)

  // ============ CONTACT GROUPS ============
  // Check if groups already exist
  let clientsGroup = await prisma.group.findFirst({ where: { name: 'Clients', organizationId: orgId } })
  let vendorsGroup = await prisma.group.findFirst({ where: { name: 'Vendors', organizationId: orgId } })
  let employeesGroup = await prisma.group.findFirst({ where: { name: 'Employees', organizationId: orgId } })

  if (!clientsGroup) {
    clientsGroup = await prisma.group.create({ data: { name: 'Clients', color: '#3B82F6', organizationId: orgId } })
  }
  if (!vendorsGroup) {
    vendorsGroup = await prisma.group.create({ data: { name: 'Vendors', color: '#10B981', organizationId: orgId } })
  }
  if (!employeesGroup) {
    employeesGroup = await prisma.group.create({ data: { name: 'Employees', color: '#F59E0B', organizationId: orgId } })
  }
  console.log(`✓ Contact groups ready`)

  // ============ CONTACTS (with companies) ============
  const contactsData = [
    // Clients
    { firstName: 'Michael', lastName: 'Thompson', email: 'mthompson@acmecorp.com', companyName: 'ACME Corporation', contactType: ContactType.CLIENT, groupId: clientsGroup.id },
    { firstName: 'Jennifer', lastName: 'Walsh', email: 'jwalsh@techstartup.io', companyName: 'TechStartup Inc', contactType: ContactType.CLIENT, groupId: clientsGroup.id },
    { firstName: 'David', lastName: 'Kim', email: 'dkim@blueocean.com', companyName: 'Blue Ocean Ventures', contactType: ContactType.CLIENT, groupId: clientsGroup.id },
    { firstName: 'Amanda', lastName: 'Foster', email: 'afoster@retailplus.com', companyName: 'RetailPlus LLC', contactType: ContactType.CLIENT, groupId: clientsGroup.id },
    { firstName: 'Chris', lastName: 'Anderson', email: 'canderson@sunrisemfg.com', companyName: 'Sunrise Manufacturing', contactType: ContactType.CLIENT, groupId: clientsGroup.id },
    // Vendors
    { firstName: 'Robert', lastName: 'Martinez', email: 'rmartinez@officesupply.com', companyName: 'Office Supply Co', contactType: ContactType.VENDOR, groupId: vendorsGroup.id },
    { firstName: 'Lisa', lastName: 'Chang', email: 'lchang@cloudservices.net', companyName: 'CloudServices Inc', contactType: ContactType.VENDOR, groupId: vendorsGroup.id },
    { firstName: 'James', lastName: 'Wilson', email: 'jwilson@legalpartners.com', companyName: 'Legal Partners LLP', contactType: ContactType.VENDOR, groupId: vendorsGroup.id },
    { firstName: 'Maria', lastName: 'Garcia', email: 'mgarcia@cleanpro.com', companyName: 'CleanPro Services', contactType: ContactType.VENDOR, groupId: vendorsGroup.id },
    { firstName: 'Tom', lastName: 'Baker', email: 'tbaker@securityfirst.com', companyName: 'SecurityFirst Inc', contactType: ContactType.VENDOR, groupId: vendorsGroup.id },
    // Employees (for W-2, benefits, expense reports)
    { firstName: 'Kevin', lastName: 'Brown', email: 'kbrown@company.demo', companyName: 'Greenfield Accounting', contactType: ContactType.EMPLOYEE, groupId: employeesGroup.id },
    { firstName: 'Rachel', lastName: 'Green', email: 'rgreen@company.demo', companyName: 'Greenfield Accounting', contactType: ContactType.EMPLOYEE, groupId: employeesGroup.id },
    { firstName: 'Steve', lastName: 'Miller', email: 'smiller@company.demo', companyName: 'Greenfield Accounting', contactType: ContactType.EMPLOYEE, groupId: employeesGroup.id },
    { firstName: 'Nancy', lastName: 'Taylor', email: 'ntaylor@company.demo', companyName: 'Greenfield Accounting', contactType: ContactType.EMPLOYEE, groupId: employeesGroup.id },
  ]

  let contactsCreated = 0
  for (const c of contactsData) {
    const existing = await prisma.entity.findFirst({ where: { email: c.email, organizationId: orgId } })
    if (!existing) {
      await prisma.entity.create({
        data: {
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          companyName: c.companyName,
          contactType: c.contactType,
          organizationId: orgId,
          groups: { create: { groupId: c.groupId } }
        }
      })
      contactsCreated++
    }
  }
  console.log(`✓ Created ${contactsCreated} new contacts with companies`)

  // ============ BOARDS ============
  let janBoard = await prisma.board.findFirst({ where: { name: 'January 2026 Close', organizationId: orgId } })
  let febBoard = await prisma.board.findFirst({ where: { name: 'February 2026 Close', organizationId: orgId } })
  let auditBoard = await prisma.board.findFirst({ where: { name: 'Q1 2026 Audit Prep', organizationId: orgId } })

  if (!janBoard) {
    janBoard = await prisma.board.create({ 
      data: { 
        name: 'January 2026 Close', 
        status: 'OPEN',
        organization: { connect: { id: orgId } },
        createdBy: { connect: { id: adminUser.id } }
      } 
    })
  }
  if (!febBoard) {
    febBoard = await prisma.board.create({ 
      data: { 
        name: 'February 2026 Close', 
        status: 'OPEN',
        organization: { connect: { id: orgId } },
        createdBy: { connect: { id: adminUser.id } }
      } 
    })
  }
  if (!auditBoard) {
    auditBoard = await prisma.board.create({ 
      data: { 
        name: 'Q1 2026 Audit Prep', 
        status: 'OPEN',
        organization: { connect: { id: orgId } },
        createdBy: { connect: { id: adminUser.id } }
      } 
    })
  }
  console.log(`✓ Boards ready`)

  // ============ TASKS WITH VARIED STATUSES ============
  const now = new Date()
  
  // Rotate through available users for task ownership
  const getOwner = (index: number) => users[index % users.length].id

  const tasksData = [
    // January Close - Mix of statuses (mostly complete, some active)
    { name: 'Bank Reconciliation', desc: 'Reconcile all bank accounts for January', status: JobStatus.COMPLETE, days: -5, boardId: janBoard.id },
    { name: 'AP Aging Review', desc: 'Review accounts payable aging report', status: JobStatus.COMPLETE, days: -3, boardId: janBoard.id },
    { name: 'AR Collections Follow-up', desc: 'Follow up on outstanding receivables', status: JobStatus.COMPLETE, days: -2, boardId: janBoard.id },
    { name: 'Payroll Reconciliation', desc: 'Reconcile January payroll entries', status: JobStatus.COMPLETE, days: -1, boardId: janBoard.id },
    { name: 'Collect W-9 Forms', desc: 'Request W-9 from all new vendors', status: JobStatus.ACTIVE, days: 2, boardId: janBoard.id },
    { name: 'Revenue Recognition', desc: 'Complete revenue recognition entries', status: JobStatus.ACTIVE, days: 3, boardId: janBoard.id },
    { name: 'Prepaid Expense Review', desc: 'Review and adjust prepaid expenses', status: JobStatus.ACTIVE, days: 4, boardId: janBoard.id },

    // February Close - Mostly not started
    { name: 'Expense Report Collection', desc: 'Collect expense reports from all employees', status: JobStatus.NOT_STARTED, days: 14, boardId: febBoard.id },
    { name: 'Credit Card Reconciliation', desc: 'Reconcile corporate credit cards', status: JobStatus.NOT_STARTED, days: 18, boardId: febBoard.id },
    { name: 'Intercompany Eliminations', desc: 'Process intercompany eliminations', status: JobStatus.NOT_STARTED, days: 20, boardId: febBoard.id },
    { name: 'Fixed Asset Additions', desc: 'Record new fixed asset purchases', status: JobStatus.NOT_STARTED, days: 22, boardId: febBoard.id },
    { name: 'Accrued Liabilities', desc: 'Review and adjust accrued liabilities', status: JobStatus.NOT_STARTED, days: 24, boardId: febBoard.id },
    { name: 'Inventory Count Verification', desc: 'Verify month-end inventory counts', status: JobStatus.NOT_STARTED, days: 25, boardId: febBoard.id },

    // Q1 Audit Prep - Mix
    { name: 'COI Collection', desc: 'Collect certificates of insurance from all vendors', status: JobStatus.ACTIVE, days: 30, boardId: auditBoard.id },
    { name: 'Contract Review', desc: 'Review all active contracts for audit', status: JobStatus.NOT_STARTED, days: 35, boardId: auditBoard.id },
    { name: 'Fixed Asset Schedule', desc: 'Prepare fixed asset schedule with depreciation', status: JobStatus.NOT_STARTED, days: 40, boardId: auditBoard.id },
    { name: 'Lease Documentation', desc: 'Compile all lease agreements and calculations', status: JobStatus.NOT_STARTED, days: 42, boardId: auditBoard.id },
    { name: 'Bank Confirmation Letters', desc: 'Prepare and send bank confirmation requests', status: JobStatus.NOT_STARTED, days: 45, boardId: auditBoard.id },
    { name: 'Legal Confirmations', desc: 'Request legal confirmation letters', status: JobStatus.NOT_STARTED, days: 45, boardId: auditBoard.id },
  ]

  let tasksCreated = 0
  for (let i = 0; i < tasksData.length; i++) {
    const t = tasksData[i]
    const existing = await prisma.taskInstance.findFirst({ where: { name: t.name, boardId: t.boardId, organizationId: orgId } })
    if (!existing) {
      const dueDate = new Date(now.getTime() + t.days * 24 * 60 * 60 * 1000)
      await prisma.taskInstance.create({
        data: {
          name: t.name,
          description: t.desc,
          status: t.status,
          dueDate,
          ownerId: getOwner(i),
          boardId: t.boardId,
          organizationId: orgId,
        }
      })
      tasksCreated++
    }
  }
  console.log(`✓ Created ${tasksCreated} new tasks across boards`)

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('🎬 MARKETING DEMO DATA ADDED!')
  console.log('='.repeat(50))
  console.log('\n📊 Data Added:')
  console.log(`   • ${contactsCreated} contacts with companies`)
  console.log(`   • 3 boards (Jan Close, Feb Close, Q1 Audit)`)
  console.log(`   • ${tasksCreated} tasks with varied statuses`)
  console.log('\n💡 Next Steps:')
  console.log('   1. Update your company name to "Greenfield Accounting" in Settings')
  console.log('   2. Send a real request from one of the tasks')
  console.log('   3. Reply via email with an attachment to demo the flow!')
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

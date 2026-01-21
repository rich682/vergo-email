import { PrismaClient } from '@prisma/client'
import { OrganizationService } from '../lib/services/organization.service'
import { UserService } from '../lib/services/user.service'
import { EntityService } from '../lib/services/entity.service'
import { GroupService } from '../lib/services/group.service'
import { RequestCreationService } from '../lib/services/request-creation.service'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...')

  // Create test organization
  console.log('Creating test organization...')
  const organization = await OrganizationService.create({
    name: 'Test Accounting Firm',
    slug: 'test-accounting'
  })
  console.log(`✅ Created organization: ${organization.name}`)

  // Create test users
  console.log('Creating test users...')
  const adminUser = await UserService.create({
    email: 'admin@test.com',
    password: 'test123',
    name: 'Admin User',
    role: 'ADMIN',
    organizationId: organization.id
  })
  console.log(`✅ Created admin user: ${adminUser.email}`)

  const memberUser = await UserService.create({
    email: 'member@test.com',
    password: 'test123',
    name: 'Member User',
    role: 'MEMBER',
    organizationId: organization.id
  })
  console.log(`✅ Created member user: ${memberUser.email}`)

  const viewerUser = await UserService.create({
    email: 'viewer@test.com',
    password: 'test123',
    name: 'Viewer User',
    role: 'VIEWER',
    organizationId: organization.id
  })
  console.log(`✅ Created viewer user: ${viewerUser.email}`)

  // Create entity groups
  console.log('Creating entity groups...')
  const employeesGroup = await GroupService.create({
    name: 'Employees',
    description: 'Company employees',
    color: '#3B82F6',
    organizationId: organization.id
  })
  console.log(`✅ Created group: ${employeesGroup.name}`)

  const vendorsGroup = await GroupService.create({
    name: 'Vendors',
    description: 'External vendors and suppliers',
    color: '#10B981',
    organizationId: organization.id
  })
  console.log(`✅ Created group: ${vendorsGroup.name}`)

  const clientsGroup = await GroupService.create({
    name: 'Clients',
    description: 'Client companies',
    color: '#8B5CF6',
    organizationId: organization.id
  })
  console.log(`✅ Created group: ${clientsGroup.name}`)

  // Create sample entities
  console.log('Creating sample entities...')
  const employee1 = await EntityService.create({
    firstName: 'John',
    email: 'john.doe@example.com',
    phone: '+1-555-0101',
    organizationId: organization.id,
    groupIds: [employeesGroup.id]
  })
  console.log(`✅ Created entity: ${employee1.firstName}`)

  const employee2 = await EntityService.create({
    firstName: 'Jane',
    email: 'jane.smith@example.com',
    phone: '+1-555-0102',
    organizationId: organization.id,
    groupIds: [employeesGroup.id]
  })
  console.log(`✅ Created entity: ${employee2.firstName}`)

  const vendor1 = await EntityService.create({
    firstName: 'Acme Supplies',
    email: 'contact@acmesupplies.com',
    phone: '+1-555-0201',
    organizationId: organization.id,
    groupIds: [vendorsGroup.id]
  })
  console.log(`✅ Created entity: ${vendor1.firstName}`)

  const vendor2 = await EntityService.create({
    firstName: 'Tech Solutions',
    email: 'info@techsolutions.com',
    phone: '+1-555-0202',
    organizationId: organization.id,
    groupIds: [vendorsGroup.id]
  })
  console.log(`✅ Created entity: ${vendor2.firstName}`)

  const client1 = await EntityService.create({
    firstName: 'ABC Corporation',
    email: 'accounting@abccorp.com',
    phone: '+1-555-0301',
    organizationId: organization.id,
    groupIds: [clientsGroup.id]
  })
  console.log(`✅ Created entity: ${client1.firstName}`)

  const client2 = await EntityService.create({
    firstName: 'XYZ Industries',
    email: 'finance@xyzindustries.com',
    phone: '+1-555-0302',
    organizationId: organization.id,
    groupIds: [clientsGroup.id]
  })
  console.log(`✅ Created entity: ${client2.firstName}`)

  // Create sample requests with campaign info
  console.log('Creating sample requests...')
  
  // Create a sample request for W-9 collection
  const w9Task = await RequestCreationService.createRequestFromEmail({
    organizationId: organization.id,
    entityEmail: vendor1.email!,
    entityName: vendor1.firstName,
    campaignName: 'W-9 Collection',
    campaignType: 'W9',
    threadId: `w9-${vendor1.id}`,
    replyToEmail: `verify+w9-${vendor1.id}@example.com`,
    subject: 'W-9 Form Request'
  })
  console.log(`✅ Created request: ${w9Task.id}`)

  // Create a sample request for Expense Reports
  const expenseTask = await RequestCreationService.createRequestFromEmail({
    organizationId: organization.id,
    entityEmail: employee1.email!,
    entityName: employee1.firstName,
    campaignName: 'Expense Reports',
    campaignType: 'EXPENSE',
    threadId: `expense-${employee1.id}`,
    replyToEmail: `verify+expense-${employee1.id}@example.com`,
    subject: 'Monthly Expense Report Request'
  })
  console.log(`✅ Created request: ${expenseTask.id}`)

  // Create a sample request for COI
  const coiTask = await RequestCreationService.createRequestFromEmail({
    organizationId: organization.id,
    entityEmail: vendor2.email!,
    entityName: vendor2.firstName,
    campaignName: 'Certificate of Insurance',
    campaignType: 'COI',
    threadId: `coi-${vendor2.id}`,
    replyToEmail: `verify+coi-${vendor2.id}@example.com`,
    subject: 'Certificate of Insurance Request'
  })
  console.log(`✅ Created request: ${coiTask.id}`)

  console.log('\n🎉 Database seed completed successfully!')
  console.log('\n📋 Test User Credentials:')
  console.log('  Admin:  admin@test.com / test123')
  console.log('  Member: member@test.com / test123')
  console.log('  Viewer: viewer@test.com / test123')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })


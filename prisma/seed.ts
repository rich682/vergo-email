import { PrismaClient } from '@prisma/client'
import { OrganizationService } from '../lib/services/organization.service'
import { UserService } from '../lib/services/user.service'
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

  // Create sample requests with campaign info
  console.log('Creating sample requests...')

  const w9Task = await RequestCreationService.createRequestFromEmail({
    organizationId: organization.id,
    entityEmail: 'contact@acmesupplies.com',
    entityName: 'Acme Supplies',
    campaignName: 'W-9 Collection',
    campaignType: 'W9',
    threadId: 'w9-seed',
    replyToEmail: 'verify+w9-seed@example.com',
    subject: 'W-9 Form Request'
  })
  console.log(`✅ Created request: ${w9Task.id}`)

  const expenseTask = await RequestCreationService.createRequestFromEmail({
    organizationId: organization.id,
    entityEmail: 'john.doe@example.com',
    entityName: 'John',
    campaignName: 'Expense Reports',
    campaignType: 'EXPENSE',
    threadId: 'expense-seed',
    replyToEmail: 'verify+expense-seed@example.com',
    subject: 'Monthly Expense Report Request'
  })
  console.log(`✅ Created request: ${expenseTask.id}`)

  const coiTask = await RequestCreationService.createRequestFromEmail({
    organizationId: organization.id,
    entityEmail: 'insurance@globallogistics.com',
    entityName: 'Global Logistics',
    campaignName: 'Certificate of Insurance',
    campaignType: 'COI',
    threadId: 'coi-seed',
    replyToEmail: 'verify+coi-seed@example.com',
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

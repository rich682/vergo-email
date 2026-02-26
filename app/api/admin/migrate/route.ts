import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { OrganizationService } from "@/lib/services/organization.service"
import { UserService } from "@/lib/services/user.service"
import { EntityService } from "@/lib/services/entity.service"
import { GroupService } from "@/lib/services/group.service"
import { RequestCreationService } from "@/lib/services/request-creation.service"

// This endpoint should be secured with a secret token
// Set MIGRATION_SECRET in your environment variables
export const dynamic = 'force-dynamic'

async function runSeed() {
  console.log('🌱 Starting database seed...')

  // Check if organization already exists
  const existingOrg = await OrganizationService.findBySlug('test-accounting')
  if (existingOrg) {
    console.log('Organization already exists, skipping seed')
    return { skipped: true, message: "Seed data already exists" }
  }

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
  return { 
    success: true,
    message: "Database seeded successfully",
    credentials: {
      admin: "admin@test.com / test123",
      member: "member@test.com / test123",
      viewer: "viewer@test.com / test123"
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify secret token — MIGRATION_SECRET must be explicitly set
    const expectedSecret = process.env.MIGRATION_SECRET
    if (!expectedSecret) {
      console.error("[Migrate] MIGRATION_SECRET env var is not set — denying access")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const authHeader = request.headers.get("authorization")
    if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { action } = await request.json().catch(() => ({}))
    
    if (action === "migrate" || action === "add-personalization-fields") {
      // Apply personalization fields migration
      console.log("Applying personalization fields migration...")
      
      try {
        // Add columns to EmailDraft table
        await prisma.$executeRaw`
          ALTER TABLE "EmailDraft" 
          ADD COLUMN IF NOT EXISTS "subjectTemplate" TEXT,
          ADD COLUMN IF NOT EXISTS "bodyTemplate" TEXT,
          ADD COLUMN IF NOT EXISTS "htmlBodyTemplate" TEXT,
          ADD COLUMN IF NOT EXISTS "availableTags" JSONB,
          ADD COLUMN IF NOT EXISTS "personalizationMode" TEXT,
          ADD COLUMN IF NOT EXISTS "blockOnMissingValues" BOOLEAN NOT NULL DEFAULT true;
        `
        console.log("✅ Added personalization columns to EmailDraft")

        // Create PersonalizationData table if it doesn't exist
        await prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS "PersonalizationData" (
            "id" TEXT NOT NULL,
            "emailDraftId" TEXT NOT NULL,
            "recipientEmail" TEXT NOT NULL,
            "contactId" TEXT,
            "dataJson" JSONB NOT NULL,
            "renderSubject" TEXT,
            "renderBody" TEXT,
            "renderHtmlBody" TEXT,
            "renderStatus" TEXT,
            "renderErrors" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL,
            CONSTRAINT "PersonalizationData_pkey" PRIMARY KEY ("id")
          );
        `
        console.log("✅ Created PersonalizationData table")

        // Create indexes
        await prisma.$executeRaw`
          CREATE UNIQUE INDEX IF NOT EXISTS "PersonalizationData_emailDraftId_recipientEmail_key" 
          ON "PersonalizationData"("emailDraftId", "recipientEmail");
        `
        await prisma.$executeRaw`
          CREATE INDEX IF NOT EXISTS "PersonalizationData_emailDraftId_idx" 
          ON "PersonalizationData"("emailDraftId");
        `
        await prisma.$executeRaw`
          CREATE INDEX IF NOT EXISTS "PersonalizationData_recipientEmail_idx" 
          ON "PersonalizationData"("recipientEmail");
        `
        console.log("✅ Created indexes for PersonalizationData")

        // Add foreign key constraint if it doesn't exist
        const fkExists = await prisma.$queryRaw<Array<{exists: boolean}>>`
          SELECT EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'PersonalizationData_emailDraftId_fkey'
          ) as exists;
        `
        
        if (!fkExists[0]?.exists) {
          await prisma.$executeRaw`
            ALTER TABLE "PersonalizationData" 
            ADD CONSTRAINT "PersonalizationData_emailDraftId_fkey" 
            FOREIGN KEY ("emailDraftId") REFERENCES "EmailDraft"("id") 
            ON DELETE CASCADE ON UPDATE CASCADE;
          `
          console.log("✅ Added foreign key constraint")
        } else {
          console.log("✅ Foreign key constraint already exists")
        }
        
        return NextResponse.json({
          success: true,
          message: "Personalization fields migration applied successfully"
        })
      } catch (error: any) {
        console.error("Migration error:", error)
        return NextResponse.json(
          { 
            error: "Migration failed",
            details: error.message,
            stack: process.env.NODE_ENV === "development" ? error.stack : undefined
          },
          { status: 500 }
        )
      }
    }
    
    if (action === "seed") {
      const result = await runSeed()
      return NextResponse.json(result)
    }
    
    if (action === "migrate-and-seed") {
      // Verify connection first
      await prisma.$connect()
      await prisma.$disconnect()
      
      // Then seed
      const result = await runSeed()
      return NextResponse.json({
        ...result,
        success: true,
        message: result.message || "Database connection verified and seeded successfully"
      })
    }
    
    return NextResponse.json(
      { error: "Invalid action. Use 'migrate', 'add-personalization-fields', 'seed', or 'migrate-and-seed'" },
      { status: 400 }
    )
  } catch (error: any) {
    console.error("Migration/seed error:", error)
    return NextResponse.json(
      { 
        error: "Migration/seed failed",
        details: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { OrganizationService } from "@/lib/services/organization.service"
import { UserService } from "@/lib/services/user.service"
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

  // Create sample requests with campaign info
  console.log('Creating sample requests...')

  // Create a sample request for W-9 collection
  const w9Task = await RequestCreationService.createRequestFromEmail({
    organizationId: organization.id,
    entityEmail: 'contact@acmesupplies.com',
    entityName: 'Acme Supplies',
    campaignName: 'W-9 Collection',
    campaignType: 'W9',
    threadId: `w9-seed`,
    replyToEmail: `verify+w9-seed@example.com`,
    subject: 'W-9 Form Request'
  })
  console.log(`✅ Created request: ${w9Task.id}`)

  // Create a sample request for Expense Reports
  const expenseTask = await RequestCreationService.createRequestFromEmail({
    organizationId: organization.id,
    entityEmail: 'john.doe@example.com',
    entityName: 'John',
    campaignName: 'Expense Reports',
    campaignType: 'EXPENSE',
    threadId: `expense-seed`,
    replyToEmail: `verify+expense-seed@example.com`,
    subject: 'Monthly Expense Report Request'
  })
  console.log(`✅ Created request: ${expenseTask.id}`)

  // Create a sample request for COI
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


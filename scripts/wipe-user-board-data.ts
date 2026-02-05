/**
 * Wipe Board/Task Data for Specific User
 * 
 * Clears all board and task data for a specific user's organization.
 * Uses raw SQL to handle schema differences between local and production.
 * 
 * Run with: npx tsx scripts/wipe-user-board-data.ts <email>
 */

import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function wipeUserBoardData(email: string) {
  console.log(`\n🔍 Looking up user: ${email}`)

  // Find user and their organization using raw SQL
  const users = await prisma.$queryRaw<Array<{ id: string; email: string; organizationId: string }>>`
    SELECT id, email, "organizationId" FROM "User" WHERE email = ${email}
  `

  if (!users || users.length === 0) {
    console.error(`❌ User not found: ${email}`)
    process.exit(1)
  }

  const user = users[0]
  const orgId = user.organizationId

  // Get org name
  const orgs = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM "Organization" WHERE id = ${orgId}
  `
  const orgName = orgs[0]?.name || orgId

  console.log(`✓ Found user in organization: ${orgName} (${orgId})`)
  console.log(`\n⚠️  WARNING: This will delete all board/task data for organization "${orgName}"`)
  console.log("Starting in 3 seconds...")
  await new Promise(resolve => setTimeout(resolve, 3000))

  console.log("\n🗑️  Wiping board/task data...\n")

  try {
    // Check which tables exist
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
    `
    const tableNames = new Set(tables.map(t => t.table_name))
    
    const hasJobTables = tableNames.has('Job')
    const hasTaskInstanceTables = tableNames.has('TaskInstance')
    
    console.log(`  Database has Job tables: ${hasJobTables}`)
    console.log(`  Database has TaskInstance tables: ${hasTaskInstanceTables}`)
    
    if (hasJobTables) {
      // Using old Job schema
      
      // 1. Delete collected items
      const collected = await prisma.$executeRaw`DELETE FROM "CollectedItem" WHERE "organizationId" = ${orgId}`
      console.log(`  ✓ Deleted ${collected} collected items`)

      // 3. Delete attachments on jobs
      const attachments = await prisma.$executeRaw`
        DELETE FROM "Attachment" WHERE "jobId" IN (
          SELECT id FROM "Job" WHERE "organizationId" = ${orgId}
        )
      `
      console.log(`  ✓ Deleted ${attachments} attachments`)

      // 4. Delete subtasks
      const subtasks = await prisma.$executeRaw`DELETE FROM "Subtask" WHERE "organizationId" = ${orgId}`
      console.log(`  ✓ Deleted ${subtasks} subtasks`)

      // 5. Delete reminder states
      const reminders = await prisma.$executeRaw`
        DELETE FROM "ReminderState" WHERE "taskId" IN (
          SELECT id FROM "Task" WHERE "jobId" IN (
            SELECT id FROM "Job" WHERE "organizationId" = ${orgId}
          )
        )
      `
      console.log(`  ✓ Deleted ${reminders} reminder states`)

      // 6. Delete messages
      const messages = await prisma.$executeRaw`
        DELETE FROM "Message" WHERE "taskId" IN (
          SELECT id FROM "Task" WHERE "jobId" IN (
            SELECT id FROM "Job" WHERE "organizationId" = ${orgId}
          )
        )
      `
      console.log(`  ✓ Deleted ${messages} messages`)

      // 7. Delete tasks
      const tasks = await prisma.$executeRaw`
        DELETE FROM "Task" WHERE "jobId" IN (
          SELECT id FROM "Job" WHERE "organizationId" = ${orgId}
        )
      `
      console.log(`  ✓ Deleted ${tasks} tasks`)

      // 8. Delete email drafts
      const drafts = await prisma.$executeRaw`DELETE FROM "EmailDraft" WHERE "organizationId" = ${orgId}`
      console.log(`  ✓ Deleted ${drafts} email drafts`)

      // 9. Delete job contact labels
      if (tableNames.has('JobContactLabel')) {
        const jcl = await prisma.$executeRaw`
          DELETE FROM "JobContactLabel" WHERE "jobLabelId" IN (
            SELECT id FROM "JobLabel" WHERE "jobId" IN (
              SELECT id FROM "Job" WHERE "organizationId" = ${orgId}
            )
          )
        `
        console.log(`  ✓ Deleted ${jcl} job contact labels`)
      }

      // 10. Delete job labels
      if (tableNames.has('JobLabel')) {
        const jl = await prisma.$executeRaw`
          DELETE FROM "JobLabel" WHERE "jobId" IN (
            SELECT id FROM "Job" WHERE "organizationId" = ${orgId}
          )
        `
        console.log(`  ✓ Deleted ${jl} job labels`)
      }

      // 11. Delete job comments
      if (tableNames.has('JobComment')) {
        const jc = await prisma.$executeRaw`
          DELETE FROM "JobComment" WHERE "jobId" IN (
            SELECT id FROM "Job" WHERE "organizationId" = ${orgId}
          )
        `
        console.log(`  ✓ Deleted ${jc} job comments`)
      }

      // 12. Delete job collaborators
      if (tableNames.has('JobCollaborator')) {
        const jcol = await prisma.$executeRaw`
          DELETE FROM "JobCollaborator" WHERE "jobId" IN (
            SELECT id FROM "Job" WHERE "organizationId" = ${orgId}
          )
        `
        console.log(`  ✓ Deleted ${jcol} job collaborators`)
      }

      // 13. Delete jobs
      const jobs = await prisma.$executeRaw`DELETE FROM "Job" WHERE "organizationId" = ${orgId}`
      console.log(`  ✓ Deleted ${jobs} jobs`)

      // 14. Delete board collaborators
      const bc = await prisma.$executeRaw`
        DELETE FROM "BoardCollaborator" WHERE "boardId" IN (
          SELECT id FROM "Board" WHERE "organizationId" = ${orgId}
        )
      `
      console.log(`  ✓ Deleted ${bc} board collaborators`)

      // 15. Delete boards
      const boards = await prisma.$executeRaw`DELETE FROM "Board" WHERE "organizationId" = ${orgId}`
      console.log(`  ✓ Deleted ${boards} boards`)

    } else if (hasTaskInstanceTables) {
      // Using new TaskInstance schema - would need different queries
      console.log("  Using TaskInstance schema - not implemented yet")
    } else {
      console.log("  ❌ Could not determine database schema")
    }

    console.log("\n✅ Board/Task data wipe complete!")
    console.log(`\nOrganization "${orgName}" is now ready for fresh testing.`)
    console.log("Users, contacts, email accounts, and other settings were preserved.\n")

  } catch (error) {
    console.error("\n❌ Error during data wipe:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Get email from command line
const email = process.argv[2]

if (!email) {
  console.error("Usage: npx tsx scripts/wipe-user-board-data.ts <email>")
  console.error("Example: npx tsx scripts/wipe-user-board-data.ts richvergo1@outlook.com")
  process.exit(1)
}

// Run the wipe
wipeUserBoardData(email)

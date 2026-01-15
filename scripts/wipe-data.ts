/**
 * Data Wipe Script
 * 
 * Clears all application data for a fresh start on UX testing.
 * Run with: npx tsx scripts/wipe-data.ts
 * 
 * WARNING: This will permanently delete all data!
 */

import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function wipeData() {
  console.log("⚠️  WARNING: This will delete ALL application data!")
  console.log("Starting data wipe in 3 seconds...")
  await new Promise(resolve => setTimeout(resolve, 3000))

  console.log("\n🗑️  Wiping data...\n")

  try {
    // Delete in order of dependencies (child tables first)

    // 1. Delete collected items (evidence/attachments from emails)
    const collectedItems = await prisma.collectedItem.deleteMany({})
    console.log(`  ✓ Deleted ${collectedItems.count} collected items`)

    // 2. Delete attachments (direct uploads on jobs/subtasks)
    const attachments = await prisma.attachment.deleteMany({})
    console.log(`  ✓ Deleted ${attachments.count} attachments`)

    // 3. Delete subtasks
    const subtasks = await prisma.subtask.deleteMany({})
    console.log(`  ✓ Deleted ${subtasks.count} subtasks`)

    // 4. Delete reminder states
    const reminderStates = await prisma.reminderState.deleteMany({})
    console.log(`  ✓ Deleted ${reminderStates.count} reminder states`)

    // 5. Delete messages
    const messages = await prisma.message.deleteMany({})
    console.log(`  ✓ Deleted ${messages.count} messages`)

    // 6. Delete tasks (email requests)
    const tasks = await prisma.task.deleteMany({})
    console.log(`  ✓ Deleted ${tasks.count} tasks`)

    // 7. Delete email drafts
    const emailDrafts = await prisma.emailDraft.deleteMany({})
    console.log(`  ✓ Deleted ${emailDrafts.count} email drafts`)

    // 8. Delete job contact labels
    const jobContactLabels = await prisma.jobContactLabel.deleteMany({})
    console.log(`  ✓ Deleted ${jobContactLabels.count} job contact labels`)

    // 9. Delete job labels
    const jobLabels = await prisma.jobLabel.deleteMany({})
    console.log(`  ✓ Deleted ${jobLabels.count} job labels`)

    // 10. Delete job comments
    const jobComments = await prisma.jobComment.deleteMany({})
    console.log(`  ✓ Deleted ${jobComments.count} job comments`)

    // 11. Delete job collaborators
    const jobCollaborators = await prisma.jobCollaborator.deleteMany({})
    console.log(`  ✓ Deleted ${jobCollaborators.count} job collaborators`)

    // 12. Delete jobs
    const jobs = await prisma.job.deleteMany({})
    console.log(`  ✓ Deleted ${jobs.count} jobs`)

    // 13. Delete boards
    const boards = await prisma.board.deleteMany({})
    console.log(`  ✓ Deleted ${boards.count} boards`)

    // 14. Delete entity-group associations
    const entityGroups = await prisma.entityGroup.deleteMany({})
    console.log(`  ✓ Deleted ${entityGroups.count} entity-group associations`)

    // 15. Delete groups
    const groups = await prisma.group.deleteMany({})
    console.log(`  ✓ Deleted ${groups.count} groups`)

    // 16. Delete entities (contacts)
    const entities = await prisma.entity.deleteMany({})
    console.log(`  ✓ Deleted ${entities.count} contacts`)

    // 17. Delete connected email accounts
    const connectedAccounts = await prisma.connectedEmailAccount.deleteMany({})
    console.log(`  ✓ Deleted ${connectedAccounts.count} connected email accounts`)

    // 18. Delete automation rules
    const automationRules = await prisma.automationRule.deleteMany({})
    console.log(`  ✓ Deleted ${automationRules.count} automation rules`)

    // 19. Delete agent schedules
    const agentSchedules = await prisma.agentSchedule.deleteMany({})
    console.log(`  ✓ Deleted ${agentSchedules.count} agent schedules`)

    console.log("\n✅ Data wipe complete!")
    console.log("\nNote: Users and Organizations were preserved.")
    console.log("You can now start fresh with UX testing.\n")

  } catch (error) {
    console.error("\n❌ Error during data wipe:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the wipe
wipeData()

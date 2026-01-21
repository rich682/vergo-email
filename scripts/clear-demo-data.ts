/**
 * Clear all data for a user's organization EXCEPT team members and contacts
 * 
 * Usage: npx ts-node scripts/clear-demo-data.ts <email>
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const email = process.argv[2]
  
  if (!email) {
    console.error("Usage: npx ts-node scripts/clear-demo-data.ts <email>")
    process.exit(1)
  }

  console.log(`\n🔍 Looking up user: ${email}`)

  // Find the user and their organization
  const user = await prisma.user.findUnique({
    where: { email },
    include: { organization: true }
  })

  if (!user) {
    console.error(`❌ User not found: ${email}`)
    process.exit(1)
  }

  const organizationId = user.organizationId
  console.log(`✅ Found user in organization: ${user.organization.name} (${organizationId})`)

  // Get counts before deletion
  const boardCount = await prisma.board.count({ where: { organizationId } })
  const jobCount = await prisma.taskInstance.count({ where: { organizationId } })
  const taskCount = await prisma.task.count({ where: { organizationId } })
  const reconciliationCount = await prisma.reconciliation.count({ where: { organizationId } })
  const collectedItemCount = await prisma.collectedItem.count({ where: { organizationId } })
  const attachmentCount = await prisma.attachment.count({ where: { organizationId } })
  const emailDraftCount = await prisma.emailDraft.count({ where: { organizationId } })

  console.log(`\n📊 Current data counts:`)
  console.log(`   - Boards: ${boardCount}`)
  console.log(`   - Jobs (Tasks): ${jobCount}`)
  console.log(`   - Requests (Tasks): ${taskCount}`)
  console.log(`   - Reconciliations: ${reconciliationCount}`)
  console.log(`   - Collected Items: ${collectedItemCount}`)
  console.log(`   - Attachments: ${attachmentCount}`)
  console.log(`   - Email Drafts: ${emailDraftCount}`)

  // Preserved data
  const teamCount = await prisma.user.count({ where: { organizationId } })
  const contactCount = await prisma.entity.count({ where: { organizationId } })
  const groupCount = await prisma.group.count({ where: { organizationId } })
  
  console.log(`\n✅ Data to PRESERVE:`)
  console.log(`   - Team members: ${teamCount}`)
  console.log(`   - Contacts: ${contactCount}`)
  console.log(`   - Groups: ${groupCount}`)

  console.log(`\n🗑️  Starting deletion...`)

  // Delete in order to respect foreign keys
  // 1. Delete reconciliations
  const deletedReconciliations = await prisma.reconciliation.deleteMany({
    where: { organizationId }
  })
  console.log(`   ✓ Deleted ${deletedReconciliations.count} reconciliations`)

  // 2. Delete collected items
  const deletedCollectedItems = await prisma.collectedItem.deleteMany({
    where: { organizationId }
  })
  console.log(`   ✓ Deleted ${deletedCollectedItems.count} collected items`)

  // 3. Delete attachments
  const deletedAttachments = await prisma.attachment.deleteMany({
    where: { organizationId }
  })
  console.log(`   ✓ Deleted ${deletedAttachments.count} attachments`)

  // 4. Delete AI recommendations (linked to messages/tasks)
  const deletedAIRecs = await prisma.aIRecommendation.deleteMany({
    where: { organizationId }
  })
  console.log(`   ✓ Deleted ${deletedAIRecs.count} AI recommendations`)

  // 5. Delete messages (linked to tasks)
  const deletedMessages = await prisma.message.deleteMany({
    where: { task: { organizationId } }
  })
  console.log(`   ✓ Deleted ${deletedMessages.count} messages`)

  // 6. Delete reminder states
  const deletedReminderStates = await prisma.reminderState.deleteMany({
    where: { task: { organizationId } }
  })
  console.log(`   ✓ Deleted ${deletedReminderStates.count} reminder states`)

  // 7. Delete tasks (requests)
  const deletedTasks = await prisma.task.deleteMany({
    where: { organizationId }
  })
  console.log(`   ✓ Deleted ${deletedTasks.count} tasks/requests`)

  // 8. Delete email drafts
  const deletedEmailDrafts = await prisma.emailDraft.deleteMany({
    where: { organizationId }
  })
  console.log(`   ✓ Deleted ${deletedEmailDrafts.count} email drafts`)

  // 9. Delete job labels
  const deletedJobLabels = await prisma.taskInstanceLabel.deleteMany({
    where: { organizationId }
  })
  console.log(`   ✓ Deleted ${deletedJobLabels.count} job labels`)

  // 10. Delete job comments
  const deletedJobComments = await prisma.taskInstanceComment.deleteMany({
    where: { job: { organizationId } }
  })
  console.log(`   ✓ Deleted ${deletedJobComments.count} job comments`)

  // 11. Delete job collaborators
  const deletedJobCollaborators = await prisma.taskInstanceCollaborator.deleteMany({
    where: { job: { organizationId } }
  })
  console.log(`   ✓ Deleted ${deletedJobCollaborators.count} job collaborators`)

  // 12. Delete subtasks
  const deletedSubtasks = await prisma.subtask.deleteMany({
    where: { organizationId }
  })
  console.log(`   ✓ Deleted ${deletedSubtasks.count} subtasks`)

  // 13. Delete jobs
  const deletedJobs = await prisma.taskInstance.deleteMany({
    where: { organizationId }
  })
  console.log(`   ✓ Deleted ${deletedJobs.count} jobs`)

  // 14. Delete board collaborators
  const deletedBoardCollaborators = await prisma.boardCollaborator.deleteMany({
    where: { board: { organizationId } }
  })
  console.log(`   ✓ Deleted ${deletedBoardCollaborators.count} board collaborators`)

  // 15. Delete boards
  const deletedBoards = await prisma.board.deleteMany({
    where: { organizationId }
  })
  console.log(`   ✓ Deleted ${deletedBoards.count} boards`)

  // 16. Delete email send audits
  const deletedEmailAudits = await prisma.emailSendAudit.deleteMany({
    where: { organizationId }
  })
  console.log(`   ✓ Deleted ${deletedEmailAudits.count} email send audits`)

  // 17. Delete job column config (reset to defaults)
  const deletedColumnConfigs = await prisma.taskInstanceColumnConfig.deleteMany({
    where: { organizationId }
  })
  console.log(`   ✓ Deleted ${deletedColumnConfigs.count} column configs`)

  console.log(`\n✅ Done! All data cleared except team members and contacts.`)
  console.log(`   You can now create new boards and tasks for your demo.`)
}

main()
  .catch((e) => {
    console.error("Error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

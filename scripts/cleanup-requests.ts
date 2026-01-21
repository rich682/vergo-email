/**
 * Script to cleanup all previous requests/tasks for a clean start
 * This will delete all Tasks and EmailDrafts (Messages and PersonalizationData will cascade delete)
 * 
 * Usage: 
 *   DATABASE_URL="your-db-url" npm run cleanup:requests
 *   OR
 *   DATABASE_URL="your-db-url" tsx scripts/cleanup-requests.ts
 */

import { prisma } from "../lib/prisma"

async function cleanupRequests() {
  try {
    console.log("[Cleanup] Starting cleanup of all requests...")
    
    // Delete all requests (Messages will cascade delete automatically)
    const deletedTasks = await prisma.request.deleteMany({})
    console.log(`[Cleanup] Deleted ${deletedTasks.count} requests (and their associated messages)`)

    // Delete all email drafts (PersonalizationData will cascade delete automatically)
    const deletedDrafts = await prisma.emailDraft.deleteMany({})
    console.log(`[Cleanup] Deleted ${deletedDrafts.count} email drafts (and their associated personalization data)`)

    console.log(`[Cleanup] Cleanup completed successfully!`)
    console.log(`[Cleanup] Summary: ${deletedTasks.count} tasks, ${deletedDrafts.count} email drafts deleted`)

    return {
      success: true,
      deleted: {
        tasks: deletedTasks.count,
        emailDrafts: deletedDrafts.count
      }
    }
  } catch (error: any) {
    console.error("[Cleanup] Error cleaning up requests:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the cleanup
if (require.main === module) {
  cleanupRequests()
    .then((result) => {
      console.log("[Cleanup] Success:", result)
      process.exit(0)
    })
    .catch((error) => {
      console.error("[Cleanup] Failed:", error)
      process.exit(1)
    })
}

export { cleanupRequests }



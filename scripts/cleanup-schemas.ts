/**
 * Schema Cleanup Script
 * 
 * Clears all DatasetTemplate and DatasetSnapshot data for fresh testing.
 * Run with: npx tsx scripts/cleanup-schemas.ts
 */

import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function cleanupSchemas() {
  console.log("🧹 Cleaning up schema data for fresh testing...\n")

  try {
    // 1. Delete all DatasetSnapshots first (has FK to DatasetTemplate)
    const snapshots = await prisma.datasetSnapshot.deleteMany({})
    console.log(`  ✓ Deleted ${snapshots.count} dataset snapshots`)

    // 2. Clear datasetTemplateId from TaskLineage (before deleting templates)
    const lineages = await prisma.taskLineage.updateMany({
      where: { datasetTemplateId: { not: null } },
      data: { datasetTemplateId: null },
    })
    console.log(`  ✓ Cleared datasetTemplateId from ${lineages.count} task lineages`)

    // 3. Delete all DatasetTemplates
    const templates = await prisma.datasetTemplate.deleteMany({})
    console.log(`  ✓ Deleted ${templates.count} dataset templates`)

    // 4. Optionally clear TABLE schema configs
    const tableConfigs = await prisma.taskLineage.updateMany({
      where: { config: { not: null } },
      data: { config: null },
    })
    console.log(`  ✓ Cleared config from ${tableConfigs.count} task lineages (TABLE schemas)`)

    console.log("\n✅ Schema cleanup complete! Ready for fresh testing.\n")

  } catch (error) {
    console.error("\n❌ Error during cleanup:", error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

cleanupSchemas()

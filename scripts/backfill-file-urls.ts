/**
 * Backfill missing fileUrls for CollectedItems
 * 
 * This script finds all CollectedItems that have a fileKey but no fileUrl,
 * looks up the URL from Vercel Blob storage, and updates the record.
 * 
 * Usage:
 *   npx ts-node scripts/backfill-file-urls.ts
 * 
 * Or via API endpoint (safer for production):
 *   GET /api/admin/backfill-file-urls?secret=YOUR_ADMIN_SECRET
 */

import { prisma } from "../lib/prisma"
import { list } from "@vercel/blob"

async function getUrlFromBlobStorage(fileKey: string): Promise<string | null> {
  try {
    const { blobs } = await list({
      prefix: fileKey,
      limit: 1,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    
    if (blobs.length > 0) {
      return blobs[0].url
    }
    return null
  } catch (error) {
    console.error(`Failed to get URL for key ${fileKey}:`, error)
    return null
  }
}

async function backfillFileUrls() {
  console.log("Starting fileUrl backfill for CollectedItems...")
  
  // Find all CollectedItems with fileKey but no fileUrl
  const itemsToFix = await prisma.collectedItem.findMany({
    where: {
      fileKey: { not: "" },
      OR: [
        { fileUrl: null },
        { fileUrl: "" }
      ]
    },
    select: {
      id: true,
      fileKey: true,
      filename: true,
      organizationId: true
    }
  })
  
  console.log(`Found ${itemsToFix.length} CollectedItems with missing fileUrl`)
  
  if (itemsToFix.length === 0) {
    console.log("No items need fixing. Exiting.")
    return { fixed: 0, failed: 0, total: 0 }
  }
  
  let fixed = 0
  let failed = 0
  
  for (const item of itemsToFix) {
    console.log(`Processing: ${item.filename} (${item.id})`)
    
    const url = await getUrlFromBlobStorage(item.fileKey)
    
    if (url) {
      await prisma.collectedItem.update({
        where: { id: item.id },
        data: { fileUrl: url }
      })
      console.log(`  ✓ Updated fileUrl: ${url.substring(0, 60)}...`)
      fixed++
    } else {
      console.log(`  ✗ Could not find URL for fileKey: ${item.fileKey}`)
      failed++
    }
  }
  
  console.log("\n=== Backfill Complete ===")
  console.log(`Fixed: ${fixed}`)
  console.log(`Failed: ${failed}`)
  console.log(`Total: ${itemsToFix.length}`)
  
  return { fixed, failed, total: itemsToFix.length }
}

// Run if executed directly
if (require.main === module) {
  backfillFileUrls()
    .then((results) => {
      console.log("\nResults:", results)
      process.exit(0)
    })
    .catch((error) => {
      console.error("Backfill failed:", error)
      process.exit(1)
    })
}

export { backfillFileUrls }

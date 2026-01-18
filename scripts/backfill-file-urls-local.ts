/**
 * Local script to backfill missing fileUrls for CollectedItems
 * 
 * Run with: npx ts-node scripts/backfill-file-urls-local.ts
 * 
 * Requires:
 *   - DATABASE_URL env var set to production database
 *   - BLOB_READ_WRITE_TOKEN env var set
 */

import { PrismaClient } from "@prisma/client"
import { list } from "@vercel/blob"

const prisma = new PrismaClient()

// Cache all blobs to avoid repeated API calls
let allBlobs: Array<{ pathname: string; url: string }> = []

async function loadAllBlobs() {
  console.log("📥 Loading all blobs from storage...")
  let cursor: string | undefined
  let hasMore = true
  
  while (hasMore) {
    const result = await list({
      cursor,
      limit: 1000,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    
    allBlobs.push(...result.blobs.map(b => ({ pathname: b.pathname, url: b.url })))
    cursor = result.cursor
    hasMore = result.hasMore
    console.log(`   Loaded ${allBlobs.length} blobs...`)
  }
  
  console.log(`✅ Total blobs: ${allBlobs.length}`)
}

function findBlobUrl(fileKey: string): string | null {
  // Try exact match first
  const exact = allBlobs.find(b => b.pathname === fileKey)
  if (exact) return exact.url
  
  // Try matching by task ID + timestamp (the unique part before filename)
  // fileKey format: tasks/{taskId}/{timestamp}-{filename}
  const parts = fileKey.split("/")
  if (parts.length >= 3) {
    const taskId = parts[1]
    const timestampPart = parts[2].split("-")[0] // Get timestamp before first dash
    
    // Look for blob that starts with tasks/{taskId}/{timestamp}
    const prefix = `tasks/${taskId}/${timestampPart}`
    const match = allBlobs.find(b => b.pathname.startsWith(prefix))
    if (match) return match.url
  }
  
  return null
}

async function main() {
  // Load all blobs first
  await loadAllBlobs()
  
  console.log("\n🔍 Finding CollectedItems with missing fileUrls...")
  
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
      createdAt: true
    },
    orderBy: { createdAt: "desc" }
  })
  
  console.log(`📋 Found ${itemsToFix.length} items to fix\n`)
  
  if (itemsToFix.length === 0) {
    console.log("✅ No items need fixing!")
    return
  }
  
  // Process each item
  let fixed = 0
  let failed = 0
  
  for (const item of itemsToFix) {
    try {
      const url = findBlobUrl(item.fileKey)
      
      if (url) {
        await prisma.collectedItem.update({
          where: { id: item.id },
          data: { fileUrl: url }
        })
        
        fixed++
        console.log(`✅ Fixed: ${item.filename}`)
        console.log(`   URL: ${url.substring(0, 80)}...`)
      } else {
        console.log(`⚠️  Not found in blob storage:`)
        console.log(`   fileKey: ${item.fileKey}`)
        failed++
      }
    } catch (error: any) {
      failed++
      console.log(`❌ Error fixing ${item.filename}: ${error.message}`)
    }
  }
  
  console.log(`\n📊 Results:`)
  console.log(`   Fixed: ${fixed}`)
  console.log(`   Failed: ${failed}`)
  console.log(`   Total: ${itemsToFix.length}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

/**
 * One-time script: Rename TMG Construction Management's "February Book Close" → "February 2026"
 *
 * Usage: npx tsx scripts/rename-tmg-board.ts
 */

import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Find TMG org
  const org = await prisma.organization.findFirst({
    where: { name: { contains: "TMG Construction" } },
    select: { id: true, name: true },
  })

  if (!org) {
    console.log("❌ TMG Construction Management organization not found")
    return
  }

  console.log(`Found org: ${org.name} (${org.id})`)

  // Find the board
  const board = await prisma.board.findFirst({
    where: {
      organizationId: org.id,
      name: "February Book Close",
    },
    select: { id: true, name: true },
  })

  if (!board) {
    console.log("❌ Board 'February Book Close' not found — may already be renamed")
    return
  }

  console.log(`Found board: "${board.name}" (${board.id})`)

  // Rename it
  await prisma.board.update({
    where: { id: board.id },
    data: { name: "February 2026" },
  })

  console.log(`✅ Renamed "${board.name}" → "February 2026"`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

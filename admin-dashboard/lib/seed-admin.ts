import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

export async function seedFirstAdmin() {
  const existing = await prisma.adminUser.findFirst()
  if (existing) return // Already seeded

  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) {
    console.warn("[seed-admin] ADMIN_EMAIL and ADMIN_PASSWORD must be set to create the first admin")
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.adminUser.create({
    data: {
      email,
      name: "Admin",
      passwordHash,
      emailVerified: true,
    },
  })
  console.log(`[seed-admin] Created first admin user: ${email}`)
}

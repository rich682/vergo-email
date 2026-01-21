import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function checkTables() {
  try {
    // Query to list all tables
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `
    console.log("Tables in database:")
    console.log(tables)
  } catch (error) {
    console.error("Error:", error)
  } finally {
    await prisma.$disconnect()
  }
}

checkTables()

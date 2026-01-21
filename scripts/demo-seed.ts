/**
 * Demo Seed Script
 * 
 * Creates minimal demo data for client presentations:
 * - One organization
 * - One admin user
 * - One member user
 * - Sample contacts
 * - One checklist item with stakeholders
 * 
 * Usage: npm run demo:seed
 */

import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

const DEMO_ORG_NAME = 'Demo Company'
const DEMO_ORG_SLUG = 'demo-company'
const DEMO_ADMIN_EMAIL = 'admin@demo.vergo.io'
const DEMO_MEMBER_EMAIL = 'member@demo.vergo.io'
const DEMO_PASSWORD = 'demo123!' // For demo purposes only

async function main() {
  console.log('🌱 Creating demo seed data...\n')

  // Check if demo org already exists
  const existingOrg = await prisma.organization.findFirst({
    where: { name: DEMO_ORG_NAME }
  })

  if (existingOrg) {
    console.log('⚠️  Demo organization already exists. Skipping seed.')
    console.log(`   Organization ID: ${existingOrg.id}`)
    return
  }

  // Create organization
  const org = await prisma.organization.create({
    data: {
      name: DEMO_ORG_NAME,
      slug: DEMO_ORG_SLUG,
    }
  })
  console.log(`✓ Created organization: ${org.name} (${org.id})`)

  // Create admin user
  const hashedPassword = await hash(DEMO_PASSWORD, 10)
  const adminUser = await prisma.user.create({
    data: {
      email: DEMO_ADMIN_EMAIL,
      name: 'Demo Admin',
      passwordHash: hashedPassword,
      role: 'ADMIN',
      organizationId: org.id,
    }
  })
  console.log(`✓ Created admin user: ${adminUser.email}`)

  // Create member user
  const memberUser = await prisma.user.create({
    data: {
      email: DEMO_MEMBER_EMAIL,
      name: 'Demo Member',
      passwordHash: hashedPassword,
      role: 'MEMBER',
      organizationId: org.id,
    }
  })
  console.log(`✓ Created member user: ${memberUser.email}`)

  // Create sample contacts
  const contacts = await Promise.all([
    prisma.entity.create({
      data: {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@example.com',
        contactType: 'CLIENT',
        organizationId: org.id,
      }
    }),
    prisma.entity.create({
      data: {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@example.com',
        contactType: 'CLIENT',
        organizationId: org.id,
      }
    }),
    prisma.entity.create({
      data: {
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob.johnson@example.com',
        contactType: 'VENDOR',
        organizationId: org.id,
      }
    }),
  ])
  console.log(`✓ Created ${contacts.length} sample contacts`)

  // Create a checklist item with stakeholders
  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 7) // Due in 7 days

  const job = await prisma.taskInstance.create({
    data: {
      name: 'Q1 Tax Documents Collection',
      description: 'Collect all required tax documents from clients for Q1 filing',
      status: 'NOT_STARTED',
      dueDate,
      ownerId: adminUser.id,
      organizationId: org.id,
      labels: {
        tags: ['Tax', 'Q1'],
        stakeholders: [
          {
            entityId: contacts[0].id,
            email: contacts[0].email,
            firstName: contacts[0].firstName,
            lastName: contacts[0].lastName,
          },
          {
            entityId: contacts[1].id,
            email: contacts[1].email,
            firstName: contacts[1].firstName,
            lastName: contacts[1].lastName,
          },
        ],
      },
    }
  })
  console.log(`✓ Created checklist item: ${job.name}`)

  console.log('\n✅ Demo seed complete!\n')
  console.log('Login credentials:')
  console.log(`  Admin: ${DEMO_ADMIN_EMAIL} / ${DEMO_PASSWORD}`)
  console.log(`  Member: ${DEMO_MEMBER_EMAIL} / ${DEMO_PASSWORD}`)
  console.log()
}

main()
  .catch((e) => {
    console.error('❌ Demo seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

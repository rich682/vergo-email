/**
 * One-time migration script: Update existing org permission overrides
 * from old view keys to new granular view keys.
 *
 * Old key → New keys (preserving existing access):
 *   forms:view             → forms:view_templates + forms:view_submissions
 *   reports:view           → reports:view_definitions + reports:view_generated
 *   databases:view         → databases:view_databases + databases:view_data
 *   reconciliations:view   → reconciliations:view_configs + reconciliations:view_runs
 *
 * Usage: npx ts-node scripts/migrate-permission-keys.ts
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const KEY_MIGRATION_MAP: Record<string, string[]> = {
  "forms:view": ["forms:view_templates", "forms:view_all_templates", "forms:view_submissions"],
  "reports:view": ["reports:view_definitions", "reports:view_all_definitions", "reports:view_generated"],
  "databases:view": ["databases:view_databases", "databases:view_all_databases", "databases:view_data"],
  "reconciliations:view": ["reconciliations:view_configs", "reconciliations:view_all_configs", "reconciliations:view_runs"],
}

async function migratePermissionKeys() {
  console.log("Starting permission key migration...")

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, features: true },
  })

  let migratedCount = 0

  for (const org of orgs) {
    const features = org.features as Record<string, any> | null
    if (!features?.roleActionPermissions) continue

    const rolePerms = features.roleActionPermissions as Record<string, Record<string, boolean>>
    let changed = false

    for (const role of Object.keys(rolePerms)) {
      const perms = rolePerms[role]
      if (!perms) continue

      for (const [oldKey, newKeys] of Object.entries(KEY_MIGRATION_MAP)) {
        if (oldKey in perms) {
          const oldValue = perms[oldKey]
          // Map old key value to all new keys
          for (const newKey of newKeys) {
            if (!(newKey in perms)) {
              perms[newKey] = oldValue
            }
          }
          // Remove old key
          delete perms[oldKey]
          changed = true
        }
      }
    }

    if (changed) {
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          features: {
            ...features,
            roleActionPermissions: rolePerms,
          },
        },
      })
      migratedCount++
      console.log(`  Migrated: ${org.name} (${org.id})`)
    }
  }

  console.log(`\nDone. Migrated ${migratedCount} of ${orgs.length} organizations.`)
}

migratePermissionKeys()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

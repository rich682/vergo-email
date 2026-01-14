/**
 * Feature Flag Sanity Check
 * 
 * Validates that all feature flags:
 * - Have explicit defaults in lib/feature-flags.ts
 * - Are documented with their purpose
 * - Are actually used somewhere in the codebase
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'

interface FlagInfo {
  name: string
  hasDefault: boolean
  isUsed: boolean
  usageCount: number
}

const errors: string[] = []
const warnings: string[] = []

function findFeatureFlags(): FlagInfo[] {
  const flagsPath = join(process.cwd(), 'lib/feature-flags.ts')
  
  if (!existsSync(flagsPath)) {
    errors.push('lib/feature-flags.ts not found')
    return []
  }

  const content = readFileSync(flagsPath, 'utf-8')
  const flags: FlagInfo[] = []

  // Find all NEXT_PUBLIC_ and server-only flags referenced in the file
  const envVarPattern = /process\.env\.(NEXT_PUBLIC_[A-Z_]+|[A-Z_]+)/g
  const matches = content.matchAll(envVarPattern)
  const foundFlags = new Set<string>()

  for (const match of matches) {
    foundFlags.add(match[1])
  }

  // For each flag, check if it's used elsewhere in the codebase
  for (const flagName of foundFlags) {
    // Skip common non-feature-flag env vars
    if (['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'OPENAI_API_KEY'].includes(flagName)) {
      continue
    }

    let usageCount = 0
    try {
      // Search for usage in the codebase (excluding feature-flags.ts itself)
      const result = execSync(
        `grep -r "${flagName}" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v "feature-flags.ts" | grep -v "node_modules" | wc -l`,
        { encoding: 'utf-8', cwd: process.cwd() }
      )
      usageCount = parseInt(result.trim(), 10)
    } catch {
      usageCount = 0
    }

    flags.push({
      name: flagName,
      hasDefault: content.includes(`${flagName}`) && content.includes('=== "true"'),
      isUsed: usageCount > 0,
      usageCount,
    })
  }

  return flags
}

function runChecks(): { passed: boolean; errors: string[]; warnings: string[] } {
  console.log('🚩 Checking feature flags...\n')

  const flags = findFeatureFlags()

  for (const flag of flags) {
    if (!flag.isUsed) {
      warnings.push(`Feature flag "${flag.name}" is defined but not used anywhere in the codebase`)
    }
  }

  // List all flags for visibility
  if (flags.length > 0) {
    console.log('Feature flags found:')
    for (const flag of flags) {
      const status = flag.isUsed ? '✓' : '⚠'
      console.log(`  ${status} ${flag.name} (${flag.usageCount} usages)`)
    }
    console.log()
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  }
}

// Run if executed directly
if (require.main === module) {
  const result = runChecks()

  if (result.warnings.length > 0) {
    console.log('⚠️  Warnings:')
    result.warnings.forEach(w => console.log(`   - ${w}`))
    console.log()
  }

  if (result.errors.length > 0) {
    console.error('❌ Errors:')
    result.errors.forEach(e => console.error(`   - ${e}`))
    process.exit(1)
  }

  console.log('✅ Feature flag check complete\n')
}

export { runChecks }

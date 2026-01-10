/**
 * Repository Hygiene Check Script
 * 
 * Validates repository structure to prevent:
 * - Duplicate config files (tailwind.config 2.ts, next-env.d 2.ts, etc.)
 * - Dead scripts in package.json
 * - Empty directories
 * - Unused files with "_2", " 2", " copy", ".bak" suffixes
 */

import { readFileSync, existsSync, readdirSync, statSync, lstatSync } from 'fs'
import { join, extname, basename } from 'path'

interface CheckResult {
  passed: boolean
  errors: string[]
  warnings: string[]
}

const errors: string[] = []
const warnings: string[] = []

// Patterns to detect duplicate/problematic files
const duplicatePatterns = [
  /\s2\./i,           // " 2.ts", " 2.json"
  /_2\./i,            // "_2.ts", "_2.json"
  /\scopy/i,          // " copy.ts", "file copy.json"
  /\.bak$/i,          // ".bak"
  /\.orig$/i,         // ".orig"
  /\.tmp$/i,          // ".tmp"
]

// Directories to check for empty subdirectories
const checkEmptyDirs = ['app', 'components', 'inngest', 'lib', 'scripts']

// Files that should only exist once
const singleInstanceFiles = [
  { pattern: /^tailwind\.config\./i, name: 'Tailwind config' },
  { pattern: /^package-lock\.json$/i, name: 'package-lock.json' },
  { pattern: /^next-env\.d\.ts$/i, name: 'next-env.d.ts' },
]

/**
 * Recursively find all files in a directory
 * Excludes common build/cache directories and git-ignored files
 */
function findFiles(dir: string, fileList: string[] = [], baseDir: string = process.cwd()): string[] {
  if (!existsSync(dir)) {
    return fileList
  }

  try {
    const files = readdirSync(dir)
    for (const file of files) {
      const filePath = join(dir, file)
      const relativePath = filePath.replace(baseDir + '/', '')
      
      try {
        const stat = lstatSync(filePath)
        if (stat.isDirectory()) {
          // Skip common build/cache directories and hidden dirs (except .)
          if (
            !file.startsWith('.') && 
            file !== 'node_modules' &&
            file !== '.next' &&
            file !== 'out' &&
            file !== 'dist' &&
            file !== '.git'
          ) {
            findFiles(filePath, fileList, baseDir)
          }
        } else if (stat.isFile()) {
          // Include file in check (even if git-ignored, we want to catch duplicates)
          fileList.push(filePath)
        }
      } catch (err) {
        // Skip files we can't access
      }
    }
  } catch (err) {
    // Skip directories we can't read
  }
  return fileList
}

/**
 * Check for empty directories
 */
function checkEmptyDirectories(): void {
  for (const dir of checkEmptyDirs) {
    if (!existsSync(dir)) continue

    function checkDir(currentDir: string, depth: number = 0): void {
      if (depth > 5) return // Limit depth to avoid infinite recursion

      try {
        const entries = readdirSync(currentDir)
        if (entries.length === 0) {
          errors.push(`Empty directory found: ${currentDir}`)
          return
        }

        for (const entry of entries) {
          const entryPath = join(currentDir, entry)
          try {
            const stat = statSync(entryPath)
            if (stat.isDirectory()) {
              checkDir(entryPath, depth + 1)
            }
          } catch {
            // Skip entries we can't access
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }

    checkDir(dir)
  }
}

/**
 * Check for duplicate/problematic file patterns
 */
function checkDuplicatePatterns(): void {
  const rootDir = process.cwd()
  const allFiles = findFiles(rootDir)
  const rootFiles = readdirSync(rootDir)
    .filter(f => {
      const filePath = join(rootDir, f)
      try {
        return statSync(filePath).isFile()
      } catch {
        return false
      }
    })
    .map(f => join(rootDir, f))

  // Check root-level files for duplicate patterns
  for (const file of rootFiles) {
    const fileName = basename(file)
    for (const pattern of duplicatePatterns) {
      if (pattern.test(fileName)) {
        errors.push(`Duplicate/problematic file detected: ${file}`)
      }
    }
  }

  // Check for single-instance files (must exist exactly once at root)
  for (const { pattern, name } of singleInstanceFiles) {
    const rootMatches = rootFiles.filter(f => pattern.test(basename(f)))
    if (rootMatches.length > 1) {
      errors.push(`Multiple ${name} files found at root: ${rootMatches.join(', ')}`)
    }
    
    // Also check subdirectories (should not exist)
    const subMatches = allFiles.filter(f => {
      const relativePath = f.replace(process.cwd() + '/', '')
      // Only flag if not at root and matches pattern
      return relativePath.includes('/') && pattern.test(basename(f))
    })
    if (subMatches.length > 0) {
      errors.push(`Found ${name} files in subdirectories (should only exist at root): ${subMatches.join(', ')}`)
    }
  }
}

/**
 * Check package.json scripts reference existing files
 */
function checkPackageJsonScripts(): void {
  const packageJsonPath = join(process.cwd(), 'package.json')
  if (!existsSync(packageJsonPath)) {
    errors.push('package.json not found')
    return
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    const scripts = packageJson.scripts || {}

    for (const [scriptName, scriptCommand] of Object.entries(scripts)) {
      const command = scriptCommand as string

      // Check if script references a local file
      const scriptFileMatch = command.match(/scripts\/([^\s]+)/)
      if (scriptFileMatch) {
        const scriptFile = scriptFileMatch[1]
        // Remove any arguments/flags after the filename
        const cleanScriptFile = scriptFile.split(/[\s&|;]/)[0].trim()
        const scriptPath = join(process.cwd(), 'scripts', cleanScriptFile)

        // Allow for .ts or .js extensions, or no extension
        const possiblePaths = [
          scriptPath,
          scriptPath + '.ts',
          scriptPath + '.js',
          scriptPath + '.sh',
        ]

        const exists = possiblePaths.some(p => existsSync(p))

        if (!exists) {
          // Special case: some scripts might use tsx/node directly with a path
          // Check if the path exists as-is or with common extensions
          const directPath = join(process.cwd(), cleanScriptFile)
          const directExists = [directPath, directPath + '.ts', directPath + '.js'].some(p => existsSync(p))

          if (!directExists) {
            warnings.push(`Script "${scriptName}" references non-existent file: scripts/${cleanScriptFile}`)
          }
        }
      }

      // Check for references to non-existent shell scripts
      const shellScriptMatch = command.match(/\.\/([^\s]+\.sh)/)
      if (shellScriptMatch) {
        const shellScript = shellScriptMatch[1]
        const shellPath = join(process.cwd(), shellScript)
        if (!existsSync(shellPath)) {
          errors.push(`Script "${scriptName}" references non-existent shell script: ${shellScript}`)
        }
      }
    }
  } catch (err: any) {
    errors.push(`Failed to parse package.json: ${err.message}`)
  }
}

/**
 * Main check function
 */
function runChecks(): CheckResult {
  console.log('🔍 Running repository hygiene checks...\n')

  checkDuplicatePatterns()
  checkEmptyDirectories()
  checkPackageJsonScripts()

  const passed = errors.length === 0

  return {
    passed,
    errors,
    warnings,
  }
}

// Run checks if executed directly
if (require.main === module) {
  const result = runChecks()

  if (result.warnings.length > 0) {
    console.log('⚠️  Warnings:')
    result.warnings.forEach(w => console.log(`   - ${w}`))
    console.log()
  }

  if (result.errors.length > 0) {
    console.error('❌ Errors found:')
    result.errors.forEach(e => console.error(`   - ${e}`))
    console.error('\n💡 Fix these issues before committing.')
    process.exit(1)
  }

  if (result.warnings.length === 0) {
    console.log('✅ All repository hygiene checks passed!\n')
  } else {
    console.log('✅ No critical errors found (see warnings above)\n')
  }
}

export { runChecks }


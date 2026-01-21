/**
 * API Mapping Generator
 * 
 * Generates a comprehensive mapping of:
 * - Frontend pages/components → API routes they call
 * - API routes → Prisma models they use
 * - Identifies orphan routes (not called from frontend)
 * 
 * Run: npx tsx scripts/generate-api-map.ts
 * Output: api-mapping.json, api-mapping.csv
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

interface FrontendCaller {
  file: string
  line: number
  context: string
}

interface APIMapping {
  route: string
  file: string
  httpMethods: string[]
  frontendCallers: FrontendCaller[]
  prismaModels: string[]
  services: string[]
  status: 'USED' | 'ORPHAN' | 'EXTERNAL_ONLY' | 'ADMIN_ONLY'
}

// Routes that are called externally (webhooks, OAuth redirects, etc.)
const EXTERNAL_ONLY_PREFIXES = [
  '/api/webhooks',
  '/api/tracking',
  '/api/inngest',
  '/api/oauth',
  '/api/auth/[...nextauth]'
]

// Admin routes - intentionally not called from regular frontend
const ADMIN_PREFIXES = [
  '/api/admin'
]

function getApiRoutes(): string[] {
  const result = execSync('find app/api -name "route.ts"', { encoding: 'utf-8' })
  return result.trim().split('\n').filter(Boolean)
}

function extractHttpMethods(content: string): string[] {
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  return methods.filter(m => 
    content.includes(`export async function ${m}`) || 
    content.includes(`export function ${m}`) ||
    content.includes(`export const ${m}`)
  )
}

function extractPrismaModels(content: string): string[] {
  const matches = content.match(/prisma\.(\w+)\./g) || []
  const models = matches.map(m => m.replace('prisma.', '').replace('.', ''))
  return [...new Set(models)]
}

function extractServices(content: string): string[] {
  const matches = content.match(/from ["']@\/lib\/services\/([^"']+)["']/g) || []
  return matches.map(m => {
    const match = m.match(/\/([^\/]+)\.service/)
    return match ? match[1] : ''
  }).filter(Boolean)
}

// Cache of all frontend fetch calls - populated once
let frontendFetchCache: Map<string, FrontendCaller[]> | null = null

function buildFrontendFetchCache(): Map<string, FrontendCaller[]> {
  if (frontendFetchCache) return frontendFetchCache
  
  frontendFetchCache = new Map()
  
  // Find all tsx/ts files in app and components (excluding route.ts)
  const findFiles = (dir: string): string[] => {
    const files: string[] = []
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...findFiles(fullPath))
        } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) && !entry.name.includes('route.ts')) {
          files.push(fullPath)
        }
      }
    } catch {}
    return files
  }
  
  const frontendFiles = [...findFiles('app'), ...findFiles('components')]
  
  // Regex to match fetch calls with /api/ paths
  const fetchRegex = /fetch\s*\(\s*[`'"](\/api\/[^`'"]*)[`'"]/g
  const fetchTemplateRegex = /fetch\s*\(\s*`([^`]*\/api\/[^`]*)`/g
  
  for (const file of frontendFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!line.includes('fetch(') && !line.includes('fetch`')) continue
        if (!line.includes('/api/')) continue
        
        // Extract the API path from the fetch call
        const matches = [...line.matchAll(/fetch\s*\(\s*[`'"]([^`'"]*\/api\/[^`'"]*)[`'"]/g)]
        for (const match of matches) {
          let apiPath = match[1]
          // Normalize: remove template literal expressions and query params
          apiPath = apiPath.replace(/\$\{[^}]+\}/g, '[id]')  // ${jobId} -> [id]
          apiPath = apiPath.split('?')[0]  // Remove query params
          
          if (!frontendFetchCache.has(apiPath)) {
            frontendFetchCache.set(apiPath, [])
          }
          frontendFetchCache.get(apiPath)!.push({
            file,
            line: i + 1,
            context: line.trim().substring(0, 100)
          })
        }
        
        // Also check template literal fetch calls
        const templateMatches = [...line.matchAll(/fetch\s*\(\s*`([^`]*)`/g)]
        for (const match of templateMatches) {
          let apiPath = match[1]
          if (!apiPath.includes('/api/')) continue
          apiPath = apiPath.replace(/\$\{[^}]+\}/g, '[id]')
          apiPath = apiPath.split('?')[0]
          
          if (!frontendFetchCache.has(apiPath)) {
            frontendFetchCache.set(apiPath, [])
          }
          const existing = frontendFetchCache.get(apiPath)!
          if (!existing.some(c => c.file === file && c.line === i + 1)) {
            existing.push({
              file,
              line: i + 1,
              context: line.trim().substring(0, 100)
            })
          }
        }
      }
    } catch {}
  }
  
  return frontendFetchCache
}

function findFrontendCallers(apiPath: string): FrontendCaller[] {
  const cache = buildFrontendFetchCache()
  const callers: FrontendCaller[] = []
  
  // Normalize the API route path for matching
  // /api/task-instances/[id]/comments -> pattern to match
  const routePattern = apiPath.replace(/\[\w+\]/g, '[id]')
  
  // Direct match
  if (cache.has(routePattern)) {
    callers.push(...cache.get(routePattern)!)
  }
  
  // Also check for partial matches (frontend might call /api/task-instances/${id})
  for (const [cachedPath, cachedCallers] of cache.entries()) {
    if (cachedPath === routePattern) continue // Already added
    
    // Check if paths match when normalized
    const normalizedCached = cachedPath.replace(/\[id\]/g, '*')
    const normalizedRoute = routePattern.replace(/\[id\]/g, '*')
    
    if (normalizedCached === normalizedRoute) {
      for (const caller of cachedCallers) {
        if (!callers.some(c => c.file === caller.file && c.line === caller.line)) {
          callers.push(caller)
        }
      }
    }
  }
  
  return callers
}

function determineStatus(apiPath: string, callers: FrontendCaller[]): APIMapping['status'] {
  if (EXTERNAL_ONLY_PREFIXES.some(p => apiPath.startsWith(p) || apiPath.includes(p.replace('/api', '')))) {
    return 'EXTERNAL_ONLY'
  }
  if (ADMIN_PREFIXES.some(p => apiPath.startsWith(p))) {
    return 'ADMIN_ONLY'
  }
  return callers.length > 0 ? 'USED' : 'ORPHAN'
}

function routeFileToApiPath(routeFile: string): string {
  return routeFile
    .replace('app/api', '/api')
    .replace('/route.ts', '')
}

async function generateMapping() {
  console.log('🔍 Scanning API routes...\n')
  
  const apiRoutes = getApiRoutes()
  const mappings: APIMapping[] = []
  
  let processed = 0
  for (const routeFile of apiRoutes) {
    processed++
    const apiPath = routeFileToApiPath(routeFile)
    process.stdout.write(`\r  Processing ${processed}/${apiRoutes.length}: ${apiPath.padEnd(60)}`)
    
    const content = fs.readFileSync(routeFile, 'utf-8')
    
    const httpMethods = extractHttpMethods(content)
    const prismaModels = extractPrismaModels(content)
    const services = extractServices(content)
    const frontendCallers = findFrontendCallers(apiPath)
    const status = determineStatus(apiPath, frontendCallers)
    
    mappings.push({
      route: apiPath,
      file: routeFile,
      httpMethods,
      frontendCallers,
      prismaModels,
      services,
      status
    })
  }
  
  console.log('\n\n✅ Scan complete!\n')
  
  // Sort by status then route
  mappings.sort((a, b) => {
    const statusOrder = { ORPHAN: 0, ADMIN_ONLY: 1, EXTERNAL_ONLY: 2, USED: 3 }
    const statusDiff = statusOrder[a.status] - statusOrder[b.status]
    if (statusDiff !== 0) return statusDiff
    return a.route.localeCompare(b.route)
  })
  
  // Write JSON output
  fs.writeFileSync('api-mapping.json', JSON.stringify(mappings, null, 2))
  console.log('📄 Written: api-mapping.json')
  
  // Write CSV output
  const csvRows = [
    'Status,Route,Methods,Prisma Models,Services,Frontend Callers,Caller Files'
  ]
  for (const m of mappings) {
    const callerFiles = m.frontendCallers.map(c => `${c.file}:${c.line}`).join('; ')
    csvRows.push([
      m.status,
      `"${m.route}"`,
      `"${m.httpMethods.join('|')}"`,
      `"${m.prismaModels.join('|')}"`,
      `"${m.services.join('|')}"`,
      m.frontendCallers.length,
      `"${callerFiles}"`
    ].join(','))
  }
  fs.writeFileSync('api-mapping.csv', csvRows.join('\n'))
  console.log('📄 Written: api-mapping.csv\n')
  
  // Print summary
  const byStatus = {
    USED: mappings.filter(m => m.status === 'USED'),
    ORPHAN: mappings.filter(m => m.status === 'ORPHAN'),
    ADMIN_ONLY: mappings.filter(m => m.status === 'ADMIN_ONLY'),
    EXTERNAL_ONLY: mappings.filter(m => m.status === 'EXTERNAL_ONLY')
  }
  
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('                      API MAPPING SUMMARY                       ')
  console.log('═══════════════════════════════════════════════════════════════\n')
  
  console.log(`  Total API routes:     ${mappings.length}`)
  console.log(`  ✅ Used by frontend:  ${byStatus.USED.length}`)
  console.log(`  🔧 Admin only:        ${byStatus.ADMIN_ONLY.length}`)
  console.log(`  🌐 External only:     ${byStatus.EXTERNAL_ONLY.length}`)
  console.log(`  ⚠️  Potentially orphan: ${byStatus.ORPHAN.length}`)
  
  if (byStatus.ORPHAN.length > 0) {
    console.log('\n───────────────────────────────────────────────────────────────')
    console.log('                    POTENTIALLY ORPHAN ROUTES                   ')
    console.log('───────────────────────────────────────────────────────────────\n')
    console.log('  These routes have no detected frontend fetch calls:\n')
    
    for (const m of byStatus.ORPHAN) {
      const models = m.prismaModels.length > 0 ? ` → [${m.prismaModels.join(', ')}]` : ''
      console.log(`  ${m.route}${models}`)
    }
  }
  
  // Prisma model coverage
  console.log('\n───────────────────────────────────────────────────────────────')
  console.log('                    PRISMA MODEL COVERAGE                       ')
  console.log('───────────────────────────────────────────────────────────────\n')
  
  const allModels = new Map<string, string[]>()
  for (const m of mappings) {
    for (const model of m.prismaModels) {
      if (!allModels.has(model)) {
        allModels.set(model, [])
      }
      allModels.get(model)!.push(m.route)
    }
  }
  
  const sortedModels = [...allModels.entries()].sort((a, b) => b[1].length - a[1].length)
  console.log('  Model usage frequency:\n')
  for (const [model, routes] of sortedModels.slice(0, 15)) {
    console.log(`  ${model.padEnd(25)} ${routes.length} routes`)
  }
  if (sortedModels.length > 15) {
    console.log(`  ... and ${sortedModels.length - 15} more models`)
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════\n')
}

generateMapping().catch(console.error)

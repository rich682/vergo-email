/**
 * API Auth Check
 * 
 * Scans all API routes to ensure they have proper authentication:
 * - getServerSession() call
 * - organizationId check
 * 
 * Flags routes that might be missing auth checks.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, relative } from 'path'

interface RouteCheck {
  path: string
  hasSessionCheck: boolean
  hasOrgCheck: boolean
  isPublic: boolean
}

const errors: string[] = []
const warnings: string[] = []

// Routes that are intentionally public (no auth required)
const PUBLIC_ROUTES = [
  '/api/auth',           // NextAuth routes
  '/api/webhooks',       // Webhook endpoints
  '/api/tracking',       // Email tracking pixel
  '/api/oauth',          // OAuth callbacks
  '/api/templates',      // Public templates
]

function findApiRoutes(dir: string, routes: string[] = []): string[] {
  if (!existsSync(dir)) return routes

  const entries = readdirSync(dir)
  
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    
    if (stat.isDirectory()) {
      findApiRoutes(fullPath, routes)
    } else if (entry === 'route.ts' || entry === 'route.js') {
      routes.push(fullPath)
    }
  }
  
  return routes
}

function checkRoute(routePath: string): RouteCheck {
  const content = readFileSync(routePath, 'utf-8')
  const relativePath = relative(process.cwd(), routePath)
  const apiPath = '/' + relativePath
    .replace(/^app/, '')
    .replace(/\/route\.ts$/, '')
    .replace(/\/route\.js$/, '')

  // Check if this is a known public route
  const isPublic = PUBLIC_ROUTES.some(pub => apiPath.startsWith(pub))

  // Check for session/auth patterns
  const hasSessionCheck = 
    content.includes('getServerSession') ||
    content.includes('getSession') ||
    content.includes('auth(') ||
    content.includes('withAuth')

  // Check for organization scoping
  const hasOrgCheck = 
    content.includes('organizationId') ||
    content.includes('orgId') ||
    isPublic

  return {
    path: apiPath,
    hasSessionCheck,
    hasOrgCheck,
    isPublic,
  }
}

function runChecks(): { passed: boolean; errors: string[]; warnings: string[] } {
  console.log('🔐 Checking API route authentication...\n')

  const apiDir = join(process.cwd(), 'app/api')
  const routes = findApiRoutes(apiDir)
  const results: RouteCheck[] = []

  for (const route of routes) {
    results.push(checkRoute(route))
  }

  // Report findings
  const unprotected = results.filter(r => !r.isPublic && !r.hasSessionCheck)
  const noOrgScope = results.filter(r => !r.isPublic && r.hasSessionCheck && !r.hasOrgCheck)

  if (unprotected.length > 0) {
    console.log('⚠️  Routes without session check (may be intentional):')
    for (const route of unprotected) {
      warnings.push(`${route.path} - no getServerSession() found`)
      console.log(`   - ${route.path}`)
    }
    console.log()
  }

  if (noOrgScope.length > 0) {
    console.log('⚠️  Routes without organization scoping:')
    for (const route of noOrgScope) {
      warnings.push(`${route.path} - no organizationId check found`)
      console.log(`   - ${route.path}`)
    }
    console.log()
  }

  // Summary
  const protectedCount = results.filter(r => r.hasSessionCheck).length
  const publicCount = results.filter(r => r.isPublic).length
  console.log(`Summary: ${protectedCount} protected, ${publicCount} public, ${unprotected.length} unchecked`)
  console.log()

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  }
}

// Run if executed directly
if (require.main === module) {
  const result = runChecks()

  if (result.errors.length > 0) {
    console.error('❌ Errors:')
    result.errors.forEach(e => console.error(`   - ${e}`))
    process.exit(1)
  }

  console.log('✅ API auth check complete\n')
}

export { runChecks }

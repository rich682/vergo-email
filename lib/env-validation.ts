/**
 * Environment Variable Validation
 * 
 * Validates required environment variables at startup.
 * Uses Zod for schema validation.
 * 
 * Usage:
 * - Import and call validateEnv() early in app initialization
 * - Server-side: validates all required vars
 * - Client-side: validates only NEXT_PUBLIC_ vars
 */

import { z } from 'zod'

// Server-side required environment variables
const serverEnvSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Auth
  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET is required'),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
  
  // AI
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  
  // Encryption
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters'),
  
  // Optional: Gmail OAuth
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REDIRECT_URI: z.string().url().optional(),
  
  // Optional: Microsoft OAuth
  MS_CLIENT_ID: z.string().optional(),
  MS_CLIENT_SECRET: z.string().optional(),
  MS_TENANT_ID: z.string().optional(),
  MS_REDIRECT_URI: z.string().url().optional(),
  
  // Optional: Storage
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  
  // Optional: Inngest
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

  // Optional: Merge.dev Accounting Integration
  MERGE_API_KEY: z.string().optional(),
})

// Client-side environment variables (NEXT_PUBLIC_ prefix)
const clientEnvSchema = z.object({
  NEXT_PUBLIC_QUEST_UI: z.enum(['true', 'false']).optional(),
  NEXT_PUBLIC_JOBS_UI: z.enum(['true', 'false']).optional(),
  NEXT_PUBLIC_ACCOUNTING_INTEGRATION: z.enum(['true', 'false']).optional(),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>
export type ClientEnv = z.infer<typeof clientEnvSchema>

/**
 * Validate server-side environment variables
 * Call this in API routes or server components
 */
export function validateServerEnv(): ServerEnv {
  const result = serverEnvSchema.safeParse(process.env)
  
  if (!result.success) {
    const errors = result.error.issues.map(issue => 
      `  - ${issue.path.join('.')}: ${issue.message}`
    ).join('\n')
    
    throw new Error(`❌ Invalid server environment variables:\n${errors}`)
  }
  
  return result.data
}

/**
 * Validate client-side environment variables
 * Safe to call in client components
 */
export function validateClientEnv(): ClientEnv {
  const clientEnv = {
    NEXT_PUBLIC_QUEST_UI: process.env.NEXT_PUBLIC_QUEST_UI,
    NEXT_PUBLIC_JOBS_UI: process.env.NEXT_PUBLIC_JOBS_UI,
    NEXT_PUBLIC_ACCOUNTING_INTEGRATION: process.env.NEXT_PUBLIC_ACCOUNTING_INTEGRATION,
  }
  
  const result = clientEnvSchema.safeParse(clientEnv)
  
  if (!result.success) {
    console.warn('⚠️ Invalid client environment variables:', result.error.issues)
  }
  
  return result.data as ClientEnv
}

/**
 * Check if all required env vars are present (non-throwing)
 * Returns list of missing variables
 */
export function checkRequiredEnvVars(): string[] {
  const required = [
    'DATABASE_URL',
    'NEXTAUTH_SECRET', 
    'NEXTAUTH_URL',
    'OPENAI_API_KEY',
    'ENCRYPTION_KEY',
  ]
  
  const missing: string[] = []
  
  for (const varName of required) {
    if (!process.env[varName]) {
      missing.push(varName)
    }
  }
  
  return missing
}

/**
 * Log environment status (for debugging)
 * Does not expose actual values
 */
export function logEnvStatus(): void {
  const serverVars = [
    'DATABASE_URL',
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL', 
    'OPENAI_API_KEY',
    'ENCRYPTION_KEY',
    'GMAIL_CLIENT_ID',
    'MS_CLIENT_ID',
    'BLOB_READ_WRITE_TOKEN',
    'INNGEST_EVENT_KEY',
    'MERGE_API_KEY',
  ]
  
  console.log('Environment variable status:')
  for (const varName of serverVars) {
    const status = process.env[varName] ? '✓' : '✗'
    console.log(`  ${status} ${varName}`)
  }
}

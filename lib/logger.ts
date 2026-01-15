/**
 * Production logging utility with context support
 * Outputs structured JSON logs compatible with Vercel, Cloud Run, and other platforms
 * 
 * Usage:
 *   import { logger } from "@/lib/logger"
 *   
 *   // Basic logging
 *   logger.info("User signed in", { userId: "123" })
 *   logger.error("Failed to send email", error, { draftId: "456" })
 *   
 *   // With context (for tracing)
 *   const log = logger.child({ 
 *     service: "EmailSendingService",
 *     requestId: "req_abc123",
 *     organizationId: "org_xyz"
 *   })
 *   log.info("Sending email", { recipientCount: 5 })
 */

type LogLevel = "info" | "warn" | "error" | "debug"

export interface LogContext {
  requestId?: string
  userId?: string
  organizationId?: string
  service?: string
  operation?: string
  duration?: number
  [key: string]: any
}

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  requestId?: string
  userId?: string
  organizationId?: string
  service?: string
  operation?: string
  duration?: number
  data?: any
  error?: {
    name: string
    message: string
    stack?: string
  }
}

function formatLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  data?: any,
  error?: Error
): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  }

  // Add context fields
  if (context) {
    if (context.requestId) entry.requestId = context.requestId
    if (context.userId) entry.userId = context.userId
    if (context.organizationId) entry.organizationId = context.organizationId
    if (context.service) entry.service = context.service
    if (context.operation) entry.operation = context.operation
    if (context.duration !== undefined) entry.duration = context.duration
  }

  // Add data payload
  if (data) {
    entry.data = data
  }

  // Add error details
  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return entry
}

function createLogger(baseContext?: LogContext) {
  return {
    /**
     * Log an info message
     */
    info(message: string, data?: any, context?: LogContext) {
      const mergedContext = { ...baseContext, ...context }
      const entry = formatLogEntry("info", message, mergedContext, data)
      console.log(JSON.stringify(entry))
    },

    /**
     * Log a warning message
     */
    warn(message: string, data?: any, context?: LogContext) {
      const mergedContext = { ...baseContext, ...context }
      const entry = formatLogEntry("warn", message, mergedContext, data)
      console.warn(JSON.stringify(entry))
    },

    /**
     * Log an error message with optional Error object
     */
    error(message: string, error?: Error | any, data?: any, context?: LogContext) {
      const mergedContext = { ...baseContext, ...context }
      const err = error instanceof Error ? error : error ? new Error(String(error)) : undefined
      const entry = formatLogEntry("error", message, mergedContext, data, err)
      console.error(JSON.stringify(entry))
    },

    /**
     * Log a debug message (only in development)
     */
    debug(message: string, data?: any, context?: LogContext) {
      if (process.env.NODE_ENV === "development") {
        const mergedContext = { ...baseContext, ...context }
        const entry = formatLogEntry("debug", message, mergedContext, data)
        console.log(JSON.stringify(entry))
      }
    },

    /**
     * Create a child logger with preset context
     * Useful for adding service/operation context to all logs in a function
     */
    child(childContext: LogContext) {
      return createLogger({ ...baseContext, ...childContext })
    },

    /**
     * Time an async operation and log its duration
     */
    async time<T>(
      operation: string,
      fn: () => Promise<T>,
      context?: LogContext
    ): Promise<T> {
      const start = Date.now()
      const mergedContext = { ...baseContext, ...context, operation }
      
      try {
        const result = await fn()
        const duration = Date.now() - start
        const entry = formatLogEntry("info", `${operation} completed`, { ...mergedContext, duration })
        console.log(JSON.stringify(entry))
        return result
      } catch (error: any) {
        const duration = Date.now() - start
        const err = error instanceof Error ? error : new Error(String(error))
        const entry = formatLogEntry("error", `${operation} failed`, { ...mergedContext, duration }, undefined, err)
        console.error(JSON.stringify(entry))
        throw error
      }
    }
  }
}

// Export the default logger instance
export const logger = createLogger()

// Export the factory for creating child loggers
export { createLogger }

// Helper to generate request IDs
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `req_${timestamp}${random}`
}

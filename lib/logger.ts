/**
 * Production logging utility
 * In Cloud Run, console.log automatically goes to Cloud Logging
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  data?: any
  error?: {
    name: string
    message: string
    stack?: string
  }
}

function formatLogEntry(level: LogLevel, message: string, data?: any, error?: Error): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  }

  if (data) {
    entry.data = data
  }

  if (error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return entry
}

export const logger = {
  info(message: string, data?: any) {
    const entry = formatLogEntry('info', message, data)
    console.log(JSON.stringify(entry))
  },

  warn(message: string, data?: any) {
    const entry = formatLogEntry('warn', message, data)
    console.warn(JSON.stringify(entry))
  },

  error(message: string, error?: Error | any, data?: any) {
    const err = error instanceof Error ? error : error ? new Error(String(error)) : undefined
    const entry = formatLogEntry('error', message, data, err)
    console.error(JSON.stringify(entry))
  },

  // Only log debug in development
  debug(message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      const entry = formatLogEntry('debug', message, data)
      console.log(JSON.stringify(entry))
    }
  },
}





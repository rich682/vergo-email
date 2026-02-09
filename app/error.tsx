'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Safely convert any value to a displayable string (prevents React error #438)
function safeMessage(error: unknown): string {
  if (!error) return 'An unexpected error occurred'
  
  // Handle standard Error objects
  if (error instanceof Error) {
    const msg = (error as any).message
    if (typeof msg === 'string') return msg
    if (msg && typeof msg === 'object') {
      try { return JSON.stringify(msg) } catch { return 'An error occurred' }
    }
    return String(msg || 'An unexpected error occurred')
  }
  
  // Handle plain objects with message property
  if (typeof error === 'object' && error !== null) {
    const msg = (error as Record<string, unknown>).message
    if (typeof msg === 'string') return msg
    if (msg && typeof msg === 'object') {
      try { return JSON.stringify(msg) } catch { return 'An error occurred' }
    }
    // Try to stringify the whole error
    try { return JSON.stringify(error) } catch { return 'An error occurred' }
  }
  
  // Handle strings and other primitives
  if (typeof error === 'string') return error
  return String(error)
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const errorMessage = safeMessage(error)
  
  useEffect(() => {
    // Log error to console (will show in Cloud Run logs)
    console.error('[ERROR PAGE]', {
      message: errorMessage,
      stack: error?.stack,
      digest: error?.digest,
    })

    // Report error to admin dashboard
    try {
      fetch('/api/errors/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorMessage,
          errorStack: typeof error?.stack === 'string' ? error.stack : null,
          componentName: 'ErrorBoundary',
          pageUrl: typeof window !== 'undefined' ? window.location.href : null,
          severity: 'error',
          metadata: { digest: error?.digest },
        }),
      }).catch(() => {}) // Silently ignore report failures
    } catch {}
  }, [error, errorMessage])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Error</h1>
        <p className="text-gray-600 mb-4">{errorMessage}</p>
        {process.env.NODE_ENV === 'development' && error?.stack && (
          <pre className="text-xs text-gray-500 mb-4 p-4 bg-gray-100 rounded overflow-auto max-w-2xl">
            {typeof error.stack === 'string' ? error.stack : JSON.stringify(error.stack, null, 2)}
          </pre>
        )}
        <div className="space-x-4">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            Go home
          </Button>
        </div>
      </div>
    </div>
  )
}












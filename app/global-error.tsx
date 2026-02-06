'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Log error to console (will show in Cloud Run logs)
  console.error('[GLOBAL ERROR]', {
    message: error.message,
    stack: error.stack,
    digest: error.digest,
  })

  // Report error to admin dashboard
  try {
    fetch('/api/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorMessage: error.message || 'Unknown global error',
        errorStack: typeof error.stack === 'string' ? error.stack : null,
        componentName: 'GlobalErrorBoundary',
        pageUrl: typeof window !== 'undefined' ? window.location.href : null,
        severity: 'fatal',
        metadata: { digest: error.digest },
      }),
    }).catch(() => {})
  } catch {}

  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Error</h1>
            <p className="text-gray-600 mb-4">{error.message || 'An unexpected error occurred'}</p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}












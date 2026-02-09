/**
 * Dashboard-level loading skeleton.
 * Shown by Next.js while any dashboard page's client component JS bundle loads.
 * Covers all 27 sub-routes via the file convention.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Page header area */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 rounded-md bg-gray-200" />
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded-md bg-gray-200" />
          <div className="h-9 w-32 rounded-md bg-gray-200" />
        </div>
      </div>

      {/* Filter/toolbar area */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-64 rounded-md bg-gray-100" />
        <div className="h-9 w-20 rounded-md bg-gray-100" />
        <div className="h-9 w-20 rounded-md bg-gray-100" />
      </div>

      {/* Content rows */}
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-lg border border-gray-100 bg-white p-4"
          >
            {/* Avatar / icon */}
            <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" />
            {/* Main text */}
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-100" />
            </div>
            {/* Right metadata */}
            <div className="flex flex-col items-end gap-1">
              <div className="h-3 w-16 rounded bg-gray-100" />
              <div className="h-5 w-12 rounded-full bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

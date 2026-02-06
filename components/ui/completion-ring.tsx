"use client"

interface CompletionRingProps {
  percentage: number // 0-100
  size?: number // diameter in pixels
  strokeWidth?: number
  showLabel?: boolean
  className?: string
}

function getColor(pct: number): string {
  if (pct >= 80) return "#22c55e" // green-500
  if (pct >= 40) return "#eab308" // yellow-500
  if (pct > 0) return "#ef4444" // red-500
  return "#d1d5db" // gray-300
}

function getTrackColor(pct: number): string {
  if (pct >= 80) return "#dcfce7" // green-100
  if (pct >= 40) return "#fef9c3" // yellow-100
  if (pct > 0) return "#fee2e2" // red-100
  return "#f3f4f6" // gray-100
}

export function CompletionRing({
  percentage,
  size = 36,
  strokeWidth = 3,
  showLabel = true,
  className = "",
}: CompletionRingProps) {
  const pct = Math.max(0, Math.min(100, percentage || 0))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  const center = size / 2

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={getTrackColor(pct)}
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={getColor(pct)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      {showLabel && (
        <span
          className="absolute text-[9px] font-semibold"
          style={{ color: getColor(pct) }}
        >
          {pct}
        </span>
      )}
    </div>
  )
}

/**
 * Inline mini completion badge (no ring, just colored text)
 */
export function CompletionBadge({ percentage, className = "" }: { percentage: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, percentage || 0))
  const colorClass =
    pct >= 80
      ? "bg-green-100 text-green-700"
      : pct >= 40
      ? "bg-yellow-100 text-yellow-700"
      : pct > 0
      ? "bg-red-100 text-red-700"
      : "bg-gray-100 text-gray-500"

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${colorClass} ${className}`}>
      {pct}%
    </span>
  )
}

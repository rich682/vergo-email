interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: { value: number; label: string }
  color?: "default" | "orange" | "green" | "red" | "blue"
}

const colorClasses = {
  default: "border-gray-800",
  orange: "border-orange-900/50",
  green: "border-green-900/50",
  red: "border-red-900/50",
  blue: "border-blue-900/50",
}

const trendColorClasses = {
  default: "text-gray-400",
  orange: "text-orange-400",
  green: "text-green-400",
  red: "text-red-400",
  blue: "text-blue-400",
}

export function StatCard({ title, value, subtitle, trend, color = "default" }: StatCardProps) {
  return (
    <div className={`bg-gray-900 rounded-xl border ${colorClasses[color]} p-5`}>
      <p className="text-sm text-gray-400 mb-1">{title}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      {trend && (
        <p className={`text-xs mt-2 ${trendColorClasses[color]}`}>
          {trend.value >= 0 ? "+" : ""}{trend.value} {trend.label}
        </p>
      )}
    </div>
  )
}

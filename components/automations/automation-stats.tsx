"use client"

import { Zap, Activity, CheckCircle2, ShieldAlert } from "lucide-react"

interface AutomationStatsProps {
  activeCount: number
  runsThisMonth: number
  successRate: number
  pendingApprovals: number
}

export function AutomationStats({
  activeCount,
  runsThisMonth,
  successRate,
  pendingApprovals,
}: AutomationStatsProps) {
  const stats = [
    {
      label: "Active Automations",
      value: activeCount,
      icon: Zap,
      iconColor: "text-blue-600",
      iconBg: "bg-blue-50",
    },
    {
      label: "Runs This Month",
      value: runsThisMonth,
      icon: Activity,
      iconColor: "text-purple-600",
      iconBg: "bg-purple-50",
    },
    {
      label: "Success Rate",
      value: successRate >= 0 ? `${successRate}%` : "—",
      icon: CheckCircle2,
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-50",
    },
    {
      label: "Pending Approvals",
      value: pendingApprovals,
      icon: ShieldAlert,
      iconColor: pendingApprovals > 0 ? "text-orange-600" : "text-gray-400",
      iconBg: pendingApprovals > 0 ? "bg-orange-50" : "bg-gray-50",
      highlight: pendingApprovals > 0,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`rounded-lg border p-3 ${stat.highlight ? "border-orange-200 bg-orange-50/30" : "border-gray-200 bg-white"}`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <div className={`w-6 h-6 rounded-md ${stat.iconBg} flex items-center justify-center`}>
              <stat.icon className={`w-3.5 h-3.5 ${stat.iconColor}`} />
            </div>
            <span className="text-xs text-gray-500">{stat.label}</span>
          </div>
          <div className={`text-lg font-semibold ${stat.highlight ? "text-orange-700" : "text-gray-900"}`}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  )
}

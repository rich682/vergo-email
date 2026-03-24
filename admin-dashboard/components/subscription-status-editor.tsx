"use client"

import { useState } from "react"

const STATUS_OPTIONS = [
  { value: "FREE_TRIAL", label: "Free Trial", color: "bg-blue-900/30 text-blue-400" },
  { value: "TRIAL_ENDED", label: "Trial Ended", color: "bg-red-900/30 text-red-400" },
  { value: "PAYING_CUSTOMER", label: "Paying Customer", color: "bg-green-900/30 text-green-400" },
] as const

interface Props {
  orgId: string
  initialStatus: string
  trialStartedAt: string | null
}

export function SubscriptionStatusEditor({ orgId, initialStatus, trialStartedAt }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [updating, setUpdating] = useState(false)

  const currentOption = STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0]

  const handleChange = async (newStatus: string) => {
    if (newStatus === status) return
    const prev = status
    setStatus(newStatus)
    setUpdating(true)

    try {
      const res = await fetch(`/api/companies/${orgId}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) setStatus(prev)
    } catch {
      setStatus(prev)
    } finally {
      setUpdating(false)
    }
  }

  const trialInfo = trialStartedAt
    ? `Trial started ${new Date(trialStartedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : null

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-8">
      <h2 className="text-sm font-semibold text-white mb-1">Subscription Status</h2>
      {trialInfo && <p className="text-xs text-gray-500 mb-3">{trialInfo}</p>}
      <div className="flex items-center gap-4">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${currentOption.color}`}
        >
          {currentOption.label}
        </span>
        <select
          value={status}
          onChange={(e) => handleChange(e.target.value)}
          disabled={updating}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

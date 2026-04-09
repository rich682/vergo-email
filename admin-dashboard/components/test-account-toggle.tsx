"use client"

import { useState } from "react"

export function TestAccountToggle({
  orgId,
  initialValue,
}: {
  orgId: string
  initialValue: boolean
}) {
  const [isTest, setIsTest] = useState(initialValue)
  const [saving, setSaving] = useState(false)

  const handleToggle = async () => {
    const newValue = !isTest
    setIsTest(newValue)
    setSaving(true)

    try {
      const res = await fetch(`/api/companies/${orgId}/test-account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isTestAccount: newValue }),
      })
      if (!res.ok) {
        setIsTest(!newValue) // rollback
      }
    } catch {
      setIsTest(!newValue) // rollback
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={saving}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        isTest
          ? "bg-purple-900/40 text-purple-400 hover:bg-purple-900/60"
          : "bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300"
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${isTest ? "bg-purple-400" : "bg-gray-600"}`} />
      {isTest ? "Test Account" : "Mark as Test"}
    </button>
  )
}

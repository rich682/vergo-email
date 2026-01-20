"use client"

import { useState, useEffect } from "react"
import { CalendarDays, Save, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
]

export default function AccountingCalendarPage() {
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState<number>(1)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/org/accounting-calendar")
      if (response.ok) {
        const data = await response.json()
        setFiscalYearStartMonth(data.fiscalYearStartMonth || 1)
      }
    } catch (error) {
      console.error("Error fetching accounting calendar settings:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setMessage(null)
      
      const response = await fetch("/api/org/accounting-calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fiscalYearStartMonth })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to save settings")
      }

      setMessage({ type: "success", text: "Accounting calendar settings saved successfully!" })
      setTimeout(() => setMessage(null), 5000)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to save settings" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-4">
        {/* Back link */}
        <Link 
          href="/dashboard/settings" 
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to Settings</span>
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Accounting Calendar</h1>
            <p className="text-sm text-gray-500">Configure your fiscal year and accounting periods</p>
          </div>
        </div>

        {/* Success/Error Messages */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg max-w-xl ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        {/* Settings Card */}
        <div className="max-w-xl">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-medium text-gray-900">Fiscal Year Configuration</h2>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="py-8 text-center text-gray-500">Loading settings...</div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="fiscal-year-start" className="text-sm font-medium text-gray-700 mb-2 block">
                      Fiscal Year Start Month
                    </Label>
                    <Select
                      value={fiscalYearStartMonth.toString()}
                      onValueChange={(v) => setFiscalYearStartMonth(parseInt(v))}
                    >
                      <SelectTrigger className="w-full max-w-xs">
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((month) => (
                          <SelectItem key={month.value} value={month.value.toString()}>
                            {month.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-2">
                      The first month of your fiscal year. Most companies use January, but some use their 
                      incorporation month or a different month for tax purposes.
                    </p>
                  </div>

                  {/* Preview */}
                  <div className="bg-gray-50 rounded-lg p-4 mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Fiscal Year Preview</p>
                    <p className="text-sm text-gray-600">
                      Your fiscal year runs from{" "}
                      <span className="font-medium">
                        {MONTHS.find(m => m.value === fiscalYearStartMonth)?.label} 1
                      </span>{" "}
                      to{" "}
                      <span className="font-medium">
                        {MONTHS.find(m => m.value === (fiscalYearStartMonth === 1 ? 12 : fiscalYearStartMonth - 1))?.label} {fiscalYearStartMonth === 1 ? "31" : "last day"}
                      </span>
                    </p>
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {[0, 1, 2, 3].map((qIndex) => {
                        const startMonth = ((fiscalYearStartMonth - 1 + qIndex * 3) % 12) + 1
                        const monthName = MONTHS.find(m => m.value === startMonth)?.label.substring(0, 3)
                        return (
                          <span key={qIndex} className="px-2 py-1 bg-white border rounded text-xs text-gray-600">
                            Q{qIndex + 1}: {monthName}
                          </span>
                        )
                      })}
                    </div>
                  </div>

                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="mt-4"
                  >
                    {saving ? (
                      <>Saving...</>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 mb-1">About Accounting Calendar</h3>
            <p className="text-sm text-blue-700">
              Your fiscal year configuration is used for board automation and reporting. 
              When you create boards with "Monthly" or "Quarterly" cadence, the system uses 
              this setting to determine the correct periods.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

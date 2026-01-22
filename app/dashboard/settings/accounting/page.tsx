"use client"

import { useState, useEffect, useMemo } from "react"
import { CalendarDays, Save, ArrowLeft, Clock } from "lucide-react"
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

// Common IANA timezones grouped by region
const TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)", region: "Universal" },
  // Americas
  { value: "America/New_York", label: "Eastern Time (New York)", region: "Americas" },
  { value: "America/Chicago", label: "Central Time (Chicago)", region: "Americas" },
  { value: "America/Denver", label: "Mountain Time (Denver)", region: "Americas" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)", region: "Americas" },
  { value: "America/Anchorage", label: "Alaska Time (Anchorage)", region: "Americas" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (Honolulu)", region: "Americas" },
  { value: "America/Phoenix", label: "Arizona Time (Phoenix)", region: "Americas" },
  { value: "America/Toronto", label: "Eastern Time (Toronto)", region: "Americas" },
  { value: "America/Vancouver", label: "Pacific Time (Vancouver)", region: "Americas" },
  { value: "America/Mexico_City", label: "Central Time (Mexico City)", region: "Americas" },
  { value: "America/Sao_Paulo", label: "Brasilia Time (Sao Paulo)", region: "Americas" },
  { value: "America/Buenos_Aires", label: "Argentina Time (Buenos Aires)", region: "Americas" },
  // Europe
  { value: "Europe/London", label: "GMT/BST (London)", region: "Europe" },
  { value: "Europe/Paris", label: "CET/CEST (Paris)", region: "Europe" },
  { value: "Europe/Berlin", label: "CET/CEST (Berlin)", region: "Europe" },
  { value: "Europe/Amsterdam", label: "CET/CEST (Amsterdam)", region: "Europe" },
  { value: "Europe/Zurich", label: "CET/CEST (Zurich)", region: "Europe" },
  { value: "Europe/Dublin", label: "GMT/IST (Dublin)", region: "Europe" },
  { value: "Europe/Madrid", label: "CET/CEST (Madrid)", region: "Europe" },
  { value: "Europe/Rome", label: "CET/CEST (Rome)", region: "Europe" },
  { value: "Europe/Stockholm", label: "CET/CEST (Stockholm)", region: "Europe" },
  // Asia
  { value: "Asia/Tokyo", label: "Japan Standard Time (Tokyo)", region: "Asia" },
  { value: "Asia/Shanghai", label: "China Standard Time (Shanghai)", region: "Asia" },
  { value: "Asia/Hong_Kong", label: "Hong Kong Time", region: "Asia" },
  { value: "Asia/Singapore", label: "Singapore Time", region: "Asia" },
  { value: "Asia/Seoul", label: "Korea Standard Time (Seoul)", region: "Asia" },
  { value: "Asia/Mumbai", label: "India Standard Time (Mumbai)", region: "Asia" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (Dubai)", region: "Asia" },
  { value: "Asia/Bangkok", label: "Indochina Time (Bangkok)", region: "Asia" },
  { value: "Asia/Jakarta", label: "Western Indonesia Time (Jakarta)", region: "Asia" },
  // Australia & Pacific
  { value: "Australia/Sydney", label: "Australian Eastern Time (Sydney)", region: "Australia & Pacific" },
  { value: "Australia/Melbourne", label: "Australian Eastern Time (Melbourne)", region: "Australia & Pacific" },
  { value: "Australia/Brisbane", label: "Australian Eastern Time (Brisbane)", region: "Australia & Pacific" },
  { value: "Australia/Perth", label: "Australian Western Time (Perth)", region: "Australia & Pacific" },
  { value: "Pacific/Auckland", label: "New Zealand Time (Auckland)", region: "Australia & Pacific" },
  // Africa
  { value: "Africa/Johannesburg", label: "South Africa Time (Johannesburg)", region: "Africa" },
  { value: "Africa/Cairo", label: "Eastern European Time (Cairo)", region: "Africa" },
  { value: "Africa/Lagos", label: "West Africa Time (Lagos)", region: "Africa" },
]

export default function AccountingCalendarPage() {
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState<number>(1)
  const [timezone, setTimezone] = useState<string>("UTC")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [currentTime, setCurrentTime] = useState<string>("")

  useEffect(() => {
    fetchSettings()
  }, [])

  // Update current time preview every second
  useEffect(() => {
    const updateTime = () => {
      try {
        const now = new Date()
        const formatted = now.toLocaleString("en-US", {
          timeZone: timezone,
          weekday: "short",
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
        setCurrentTime(formatted)
      } catch {
        setCurrentTime("Invalid timezone")
      }
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [timezone])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/org/accounting-calendar")
      if (response.ok) {
        const data = await response.json()
        setFiscalYearStartMonth(data.fiscalYearStartMonth || 1)
        setTimezone(data.timezone || "UTC")
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
        body: JSON.stringify({ fiscalYearStartMonth, timezone })
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

  // Group timezones by region for the dropdown
  const timezonesByRegion = useMemo(() => {
    const grouped: Record<string, typeof TIMEZONES> = {}
    TIMEZONES.forEach(tz => {
      if (!grouped[tz.region]) grouped[tz.region] = []
      grouped[tz.region].push(tz)
    })
    return grouped
  }, [])

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
                </div>
              )}
            </div>
          </div>

          {/* Timezone Settings Card */}
          <div className="border border-gray-200 rounded-lg overflow-hidden mt-6">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-medium text-gray-900">Timezone Settings</h2>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="py-8 text-center text-gray-500">Loading settings...</div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="timezone" className="text-sm font-medium text-gray-700 mb-2 block">
                      Organization Timezone
                    </Label>
                    <Select
                      value={timezone}
                      onValueChange={setTimezone}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent className="max-h-80">
                        {Object.entries(timezonesByRegion).map(([region, tzList]) => (
                          <div key={region}>
                            <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50">
                              {region}
                            </div>
                            {tzList.map((tz) => (
                              <SelectItem key={tz.value} value={tz.value}>
                                {tz.label}
                              </SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-2">
                      The timezone used for displaying dates on boards and determining period boundaries.
                      All team members will see dates in this timezone.
                    </p>
                  </div>

                  {/* Time Preview */}
                  <div className="bg-gray-50 rounded-lg p-4 mt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <p className="text-sm font-medium text-gray-700">Current Time Preview</p>
                    </div>
                    <p className="text-sm text-gray-600 font-mono">
                      {currentTime}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      This is the current date and time in your selected timezone.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="mt-6">
            <Button
              onClick={handleSave}
              disabled={saving || loading}
              className="w-full sm:w-auto"
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

          {/* Info Box */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-lg">
            <h3 className="text-sm font-medium text-blue-900 mb-1">About Accounting Calendar</h3>
            <p className="text-sm text-blue-700">
              Your fiscal year and timezone configuration are used for board automation and reporting. 
              When you create boards with "Daily", "Monthly", or "Quarterly" cadence, the system uses 
              these settings to determine the correct periods and display dates appropriately.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

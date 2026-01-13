"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { 
  QuestInterpretationResult, 
  QuestRecipientSelection,
  QuestScheduleIntent,
  QuestReminderIntent,
  StandingQuestSchedule
} from "@/lib/types/quest"

interface ConfirmationCardProps {
  interpretation: QuestInterpretationResult
  availableContactTypes: string[]
  availableGroups: Array<{ id: string; name: string }>
  availableTags?: Array<{ stateKey: string; count: number }>
  recipients?: Array<{ email: string; name?: string; contactType?: string }>
  onConfirm: (
    selection: QuestRecipientSelection,
    schedule: QuestScheduleIntent,
    reminders: QuestReminderIntent,
    standingSchedule?: StandingQuestSchedule
  ) => void
  onCancel: () => void
  loading?: boolean
  standingQuestsEnabled?: boolean
}

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" }
]

const REMINDER_FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" }
]

const STOP_CONDITIONS = [
  { value: "reply", label: "Until reply" },
  { value: "deadline", label: "Until deadline" },
  { value: "reply_or_deadline", label: "Until deadline or reply" }
]

export function ConfirmationCard({
  interpretation,
  availableContactTypes,
  availableGroups,
  availableTags = [],
  recipients = [],
  onConfirm,
  onCancel,
  loading = false,
  standingQuestsEnabled = false
}: ConfirmationCardProps) {
  // Editable state initialized from interpretation
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    interpretation.recipientSelection.contactTypes || []
  )
  const [selectedGroups, setSelectedGroups] = useState<string[]>(
    interpretation.recipientSelection.groupNames || []
  )
  const [selectedTag, setSelectedTag] = useState<string>(
    interpretation.recipientSelection.stateFilter?.stateKeys?.[0] || "none"
  )
  const [tagMode, setTagMode] = useState<"has" | "missing">(
    interpretation.recipientSelection.stateFilter?.mode || "has"
  )
  const [showRecipients, setShowRecipients] = useState(false)
  const [sendTiming, setSendTiming] = useState<"immediate" | "scheduled" | "recurring">(
    interpretation.scheduleIntent.sendTiming
  )
  const [deadline, setDeadline] = useState<string>(
    interpretation.scheduleIntent.deadline || ""
  )
  const [remindersEnabled, setRemindersEnabled] = useState(
    interpretation.reminderIntent.enabled
  )
  const [reminderFrequency, setReminderFrequency] = useState<string>(
    interpretation.reminderIntent.frequency || "weekly"
  )
  const [reminderDayOfWeek, setReminderDayOfWeek] = useState<string>(
    String(interpretation.reminderIntent.dayOfWeek ?? 3)
  )
  const [stopCondition, setStopCondition] = useState<string>(
    interpretation.reminderIntent.stopCondition
  )
  
  // Scheduled send date
  const [scheduledDate, setScheduledDate] = useState<string>(
    interpretation.scheduleIntent.scheduledDate || ""
  )
  
  // Request type (one-off vs recurring) - initialized from LLM interpretation
  const [requestType, setRequestType] = useState<"one-off" | "recurring">(
    interpretation.requestType || "one-off"
  )
  
  // Standing quest (recurring) options
  const [recurringFrequency, setRecurringFrequency] = useState<"daily" | "weekly" | "monthly">("weekly")
  const [recurringDayOfWeek, setRecurringDayOfWeek] = useState<string>("3") // Wednesday
  const [recurringDayOfMonth, setRecurringDayOfMonth] = useState<string>("1")
  const [recurringTime, setRecurringTime] = useState<string>("09:00")

  // Live recipient count (would be fetched from API in real implementation)
  const [recipientCount, setRecipientCount] = useState(
    interpretation.resolvedCounts.matchingRecipients
  )
  const [excludedCount, setExcludedCount] = useState(
    interpretation.resolvedCounts.excludedCount
  )

  // Update counts when selection changes (simplified - in production would call API)
  useEffect(() => {
    // This would call an API to get updated counts based on selection
    // For now, just use the initial counts
  }, [selectedTypes, selectedGroups])

  const handleConfirm = () => {
    const selection: QuestRecipientSelection = {
      contactTypes: selectedTypes.length > 0 ? selectedTypes : undefined,
      groupNames: selectedGroups.length > 0 ? selectedGroups : undefined,
      stateFilter: selectedTag !== "none" ? {
        stateKeys: [selectedTag],
        mode: tagMode
      } : undefined
    }

    const schedule: QuestScheduleIntent = {
      sendTiming: requestType === "recurring" ? "scheduled" : sendTiming,
      scheduledDate: sendTiming === "scheduled" && scheduledDate ? scheduledDate : undefined,
      deadline: deadline || undefined
    }

    const reminders: QuestReminderIntent = {
      enabled: requestType === "one-off" ? remindersEnabled : false, // Recurring requests don't use reminders
      frequency: remindersEnabled && requestType === "one-off" ? (reminderFrequency as "daily" | "weekly" | "biweekly") : undefined,
      dayOfWeek: remindersEnabled && requestType === "one-off" && reminderFrequency === "weekly" ? parseInt(reminderDayOfWeek) : undefined,
      stopCondition: stopCondition as "reply" | "deadline" | "reply_or_deadline"
    }

    // Build standing schedule if recurring is selected
    let standingSchedule: StandingQuestSchedule | undefined
    if (requestType === "recurring" && standingQuestsEnabled) {
      standingSchedule = {
        frequency: recurringFrequency,
        dayOfWeek: recurringFrequency === "weekly" ? parseInt(recurringDayOfWeek) : undefined,
        dayOfMonth: recurringFrequency === "monthly" ? parseInt(recurringDayOfMonth) : undefined,
        timeOfDay: recurringTime,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        stopOnReply: false // Recurring emails continue regardless of replies
      }
    }

    onConfirm(selection, schedule, reminders, standingSchedule)
  }

  const getConfidenceBadge = () => {
    const config = {
      high: { color: "bg-green-100 text-green-800 border-green-200", label: "High confidence" },
      medium: { color: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "Medium confidence" },
      low: { color: "bg-red-100 text-red-800 border-red-200", label: "Low confidence" }
    }
    const c = config[interpretation.confidence]
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${c.color}`}>
        {c.label}
      </span>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium text-gray-900">I understood your request as:</span>
          </div>
          {getConfidenceBadge()}
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-5">
        {/* Audience Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <Label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Audience</Label>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Type</Label>
              <Select
                value={selectedTypes[0] || "all"}
                onValueChange={(value) => setSelectedTypes(value === "all" ? [] : [value])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {availableContactTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Group</Label>
              <Select
                value={selectedGroups[0] || "all"}
                onValueChange={(value) => setSelectedGroups(value === "all" ? [] : [value])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  {availableGroups.map((group) => (
                    <SelectItem key={group.id} value={group.name}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

        </div>

        {/* Data Personalization Section */}
        {availableTags.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <Label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Data Personalization</Label>
            </div>
            <p className="text-xs text-gray-500">
              Include contact-specific data in your email (e.g., invoice number, due date, amount)
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Include Data Tag</Label>
                <Select
                  value={selectedTag}
                  onValueChange={setSelectedTag}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No personalization" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No personalization</SelectItem>
                    {availableTags.map((tag) => (
                      <SelectItem key={tag.stateKey} value={tag.stateKey}>
                        {tag.stateKey} ({tag.count} contacts)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTag !== "none" && (
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Filter Recipients</Label>
                  <Select
                    value={tagMode}
                    onValueChange={(value) => setTagMode(value as "has" | "missing")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="has">Only contacts with this data</SelectItem>
                      <SelectItem value="missing">Only contacts missing this data</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            
            {selectedTag !== "none" && (
              <p className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded">
                💡 The email will include {"{{" + selectedTag + "}}"} placeholder that gets replaced with each contact&apos;s actual value
              </p>
            )}
          </div>
        )}

        {/* Request Type Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <Label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Request Type</Label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRequestType("one-off")}
              className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                requestType === "one-off"
                  ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                One-off
              </div>
              <p className="text-xs text-gray-500 mt-1">Send once with optional reminders</p>
            </button>
            <button
              type="button"
              onClick={() => setRequestType("recurring")}
              disabled={!standingQuestsEnabled}
              className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                requestType === "recurring"
                  ? "bg-purple-50 border-purple-300 text-purple-700"
                  : standingQuestsEnabled
                    ? "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                    : "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Recurring
              </div>
              <p className="text-xs text-gray-500 mt-1">{standingQuestsEnabled ? "Send on a schedule forever" : "Coming soon"}</p>
            </button>
          </div>
        </div>

        {/* Schedule Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <Label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Schedule</Label>
          </div>

          {requestType === "one-off" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Send</Label>
                  <Select
                    value={sendTiming}
                    onValueChange={(value) => setSendTiming(value as "immediate" | "scheduled")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="immediate">Immediately</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {sendTiming === "scheduled" && (
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Send Date</Label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              <div className={sendTiming === "scheduled" ? "" : "grid grid-cols-2 gap-3"}>
                <div className={sendTiming === "scheduled" ? "mt-3" : ""}>
                  <Label className="text-xs text-gray-500 mb-1 block">Deadline (optional)</Label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="No deadline"
                  />
                </div>
              </div>
            </>
          ) : (
            /* Recurring Schedule Options */
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Frequency</Label>
                  <Select
                    value={recurringFrequency}
                    onValueChange={(value) => setRecurringFrequency(value as "daily" | "weekly" | "monthly")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {recurringFrequency === "weekly" && (
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Day of Week</Label>
                    <Select
                      value={recurringDayOfWeek}
                      onValueChange={setRecurringDayOfWeek}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map((day) => (
                          <SelectItem key={day.value} value={day.value}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {recurringFrequency === "monthly" && (
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Day of Month</Label>
                    <Select
                      value={recurringDayOfMonth}
                      onValueChange={setRecurringDayOfMonth}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                          <SelectItem key={day} value={String(day)}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Time</Label>
                  <input
                    type="time"
                    value={recurringTime}
                    onChange={(e) => setRecurringTime(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              <p className="text-xs text-purple-600 bg-purple-50 px-3 py-2 rounded mt-2">
                📧 Emails will be sent on schedule regardless of replies. Use one-off requests with reminders if you want to stop on reply.
              </p>
            </div>
          )}

        </div>

        {/* Reminders Section - Only show for one-off requests */}
        {requestType === "one-off" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <Label className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Reminders</Label>
              </div>
              <button
                type="button"
                onClick={() => setRemindersEnabled(!remindersEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  remindersEnabled ? "bg-indigo-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    remindersEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {remindersEnabled && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-500 mb-1 block">Frequency</Label>
                  <Select
                    value={reminderFrequency}
                    onValueChange={setReminderFrequency}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REMINDER_FREQUENCIES.map((freq) => (
                        <SelectItem key={freq.value} value={freq.value}>
                          {freq.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {reminderFrequency === "weekly" && (
                  <div>
                    <Label className="text-xs text-gray-500 mb-1 block">Day</Label>
                    <Select
                      value={reminderDayOfWeek}
                      onValueChange={setReminderDayOfWeek}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map((day) => (
                          <SelectItem key={day.value} value={day.value}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className={reminderFrequency === "weekly" ? "col-span-2" : ""}>
                  <Label className="text-xs text-gray-500 mb-1 block">Until</Label>
                  <Select
                    value={stopCondition}
                    onValueChange={setStopCondition}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STOP_CONDITIONS.map((cond) => (
                        <SelectItem key={cond.value} value={cond.value}>
                          {cond.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary with expandable recipient list */}
        <div className="pt-3 border-t border-gray-100 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => setShowRecipients(!showRecipients)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <span className="font-semibold text-gray-900">{recipientCount}</span> recipients
              <svg 
                className={`w-4 h-4 transition-transform ${showRecipients ? "rotate-180" : ""}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div className="flex items-center gap-4">
              {excludedCount > 0 && (
                <span className="text-yellow-600 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {excludedCount} excluded
                </span>
              )}
              {remindersEnabled && interpretation.resolvedCounts.estimatedReminders && (
                <span className="text-gray-500">
                  Up to {interpretation.resolvedCounts.estimatedReminders} reminders per person
                </span>
              )}
            </div>
          </div>

          {/* Expandable recipient list */}
          {showRecipients && recipients.length > 0 && (
            <div className="mt-2 p-3 bg-gray-50 rounded-lg max-h-48 overflow-auto">
              <div className="space-y-1">
                {recipients.map((recipient, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-medium text-indigo-600">
                        {(recipient.name || recipient.email).charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-gray-900">{recipient.name || recipient.email}</span>
                        {recipient.name && (
                          <span className="text-gray-500 ml-1 text-xs">{recipient.email}</span>
                        )}
                      </div>
                    </div>
                    {recipient.contactType && (
                      <span className="text-xs px-2 py-0.5 bg-gray-200 rounded-full text-gray-600">
                        {recipient.contactType}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {showRecipients && recipients.length === 0 && (
            <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-500 text-center">
              Recipient list will be shown after confirmation
            </div>
          )}
        </div>

        {/* Warnings */}
        {interpretation.warnings.length > 0 && (
          <div className="space-y-2">
            {interpretation.warnings.map((warning, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm"
              >
                <svg className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-yellow-800">{warning.message}</p>
                  {warning.suggestion && (
                    <p className="text-yellow-600 text-xs mt-0.5">{warning.suggestion}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Assumptions */}
        {interpretation.interpretationSummary.assumptions.length > 0 && (
          <div className="text-xs text-gray-500">
            <span className="font-medium">Assumptions: </span>
            {interpretation.interpretationSummary.assumptions.join("; ")}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex gap-3">
        <Button
          onClick={handleConfirm}
          disabled={loading || recipientCount === 0}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Processing...
            </span>
          ) : (
            "Confirm & Generate Email"
          )}
        </Button>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

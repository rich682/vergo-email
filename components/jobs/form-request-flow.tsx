"use client"

/**
 * Form Request Flow
 * 
 * Multi-step flow for sending form requests:
 * 1. Select a form template
 * 2. Select recipients (stakeholders)
 * 3. Configure deadline and reminders
 * 4. Send
 */

import { useState, useEffect, useCallback } from "react"
import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Users,
  Check,
  Loader2,
  Search,
  Calendar,
  CalendarClock,
  Bell,
  Send,
  AlertCircle,
  CheckCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { FormField } from "@/lib/types/form"

interface FormDefinitionOption {
  id: string
  name: string
  description: string | null
  fields: FormField[]
  database: {
    id: string
    name: string
  } | null
}

// Stakeholder contact type (same as SendRequestModal)
interface StakeholderContact {
  id: string
  email: string | null
  firstName: string
  lastName: string | null
  contactType?: string
}

type FlowStep = "select_form" | "select_recipients" | "configure" | "sending" | "success" | "error"

interface FormRequestFlowProps {
  jobId: string
  jobName: string
  boardPeriod: string | null
  deadlineDate: string | null
  stakeholderContacts: StakeholderContact[] // Stakeholders assigned to this task
  onSuccess: () => void
  onCancel: () => void
}

export function FormRequestFlow({
  jobId,
  jobName,
  boardPeriod,
  deadlineDate,
  stakeholderContacts,
  onSuccess,
  onCancel,
}: FormRequestFlowProps) {
  const [step, setStep] = useState<FlowStep>("select_form")
  const [error, setError] = useState<string | null>(null)

  // Form selection
  const [forms, setForms] = useState<FormDefinitionOption[]>([])
  const [loadingForms, setLoadingForms] = useState(true)
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
  const [formSearchQuery, setFormSearchQuery] = useState("")

  // Recipient selection - use stakeholder contacts with valid emails
  const stakeholders = stakeholderContacts.filter(s => s.email)
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set())
  const [stakeholderSearchQuery, setStakeholderSearchQuery] = useState("")

  // Configuration
  const [deadline, setDeadline] = useState<string>(deadlineDate || "")
  const [remindersEnabled, setRemindersEnabled] = useState(true)
  const [reminderDays, setReminderDays] = useState(3)
  const [maxReminders, setMaxReminders] = useState(3)
  
  // Scheduling
  const [sendTiming, setSendTiming] = useState<"immediate" | "scheduled">("immediate")
  const [scheduleOffsetDays, setScheduleOffsetDays] = useState(5)

  // Load forms on mount
  useEffect(() => {
    fetchForms()
  }, [])

  const fetchForms = async () => {
    try {
      setLoadingForms(true)
      const response = await fetch("/api/forms", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setForms(data.forms || [])
      }
    } catch (err) {
      console.error("Error fetching forms:", err)
    } finally {
      setLoadingForms(false)
    }
  }

  const handleSend = async () => {
    if (!selectedFormId || selectedEntityIds.size === 0) {
      setError("Please select a form and at least one recipient")
      return
    }

    setStep("sending")
    setError(null)

    try {
      const response = await fetch(`/api/task-instances/${jobId}/form-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          formDefinitionId: selectedFormId,
          recipientEntityIds: Array.from(selectedEntityIds),
          deadlineDate: deadline || undefined,
          sendTiming,
          scheduleOffsetDays: sendTiming === "scheduled" ? scheduleOffsetDays : undefined,
          reminderConfig: sendTiming === "immediate" ? {
            enabled: remindersEnabled,
            frequencyHours: reminderDays * 24,
            maxCount: maxReminders,
          } : { enabled: false },
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to send form requests")
      }

      setStep("success")
      setTimeout(() => {
        onSuccess()
      }, 1500)
    } catch (err: any) {
      console.error("Error sending form requests:", err)
      setError(err.message || "Failed to send form requests")
      setStep("error")
    }
  }

  const selectedForm = forms.find((f) => f.id === selectedFormId)

  const filteredForms = forms.filter((f) => {
    if (!formSearchQuery) return true
    const query = formSearchQuery.toLowerCase()
    return (
      f.name.toLowerCase().includes(query) ||
      (f.description?.toLowerCase().includes(query) ?? false)
    )
  })

  const filteredStakeholders = stakeholders.filter((s) => {
    if (!stakeholderSearchQuery) return true
    const query = stakeholderSearchQuery.toLowerCase()
    const fullName = s.firstName + (s.lastName ? ` ${s.lastName}` : "")
    return (
      fullName.toLowerCase().includes(query) ||
      (s.email?.toLowerCase().includes(query) ?? false)
    )
  })

  const toggleStakeholder = (entityId: string) => {
    const newSet = new Set(selectedEntityIds)
    if (newSet.has(entityId)) {
      newSet.delete(entityId)
    } else {
      newSet.add(entityId)
    }
    setSelectedEntityIds(newSet)
  }

  const toggleAllStakeholders = () => {
    if (selectedEntityIds.size === filteredStakeholders.length) {
      setSelectedEntityIds(new Set())
    } else {
      setSelectedEntityIds(new Set(filteredStakeholders.map((s) => s.id)))
    }
  }

  // Sending state
  if (step === "sending") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
            {sendTiming === "scheduled" ? (
              <CalendarClock className="w-8 h-8 text-orange-500" />
            ) : (
              <Send className="w-8 h-8 text-orange-500" />
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-orange-400 rounded-full animate-ping" />
        </div>
        <h3 className="mt-4 font-medium text-gray-900">
          {sendTiming === "scheduled" ? "Scheduling form requests..." : "Sending form requests..."}
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          {sendTiming === "scheduled" 
            ? `Scheduling for ${selectedEntityIds.size} recipient${selectedEntityIds.size !== 1 ? "s" : ""}`
            : `Sending to ${selectedEntityIds.size} recipient${selectedEntityIds.size !== 1 ? "s" : ""}`
          }
        </p>
      </div>
    )
  }

  // Success state
  if (step === "success") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
          sendTiming === "scheduled" ? "bg-blue-100" : "bg-green-100"
        }`}>
          {sendTiming === "scheduled" ? (
            <CalendarClock className="w-8 h-8 text-blue-500" />
          ) : (
            <CheckCircle className="w-8 h-8 text-green-500" />
          )}
        </div>
        <h3 className="mt-4 font-medium text-gray-900">
          {sendTiming === "scheduled" ? "Form requests scheduled!" : "Form requests sent!"}
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          {sendTiming === "scheduled" 
            ? `Scheduled to send ${scheduleOffsetDays} days before period end`
            : "Recipients will receive an email with a link to complete the form"
          }
        </p>
      </div>
    )
  }

  // Error state
  if (step === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="mt-4 font-medium text-gray-900">Failed to send</h3>
        <p className="text-sm text-red-500 mt-1">{error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => setStep("configure")}
        >
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Progress steps */}
      <div className="flex items-center justify-center gap-2">
        {["select_form", "select_recipients", "configure"].map((s, i) => {
          const stepLabels = ["Select Form", "Recipients", "Configure"]
          const stepNums = [1, 2, 3]
          const currentIndex = ["select_form", "select_recipients", "configure"].indexOf(step)
          const isActive = s === step
          const isComplete = i < currentIndex

          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-gray-300" />}
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                  isActive
                    ? "bg-orange-100 text-orange-700"
                    : isComplete
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs font-medium">
                  {isComplete ? <Check className="w-3 h-3" /> : stepNums[i]}
                </span>
                <span className="hidden sm:inline">{stepLabels[i]}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Step 1: Select Form */}
      {step === "select_form" && (
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="font-medium text-gray-900">Select a Form</h3>
            <p className="text-sm text-gray-500">Choose which form to send to recipients</p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search forms..."
              value={formSearchQuery}
              onChange={(e) => setFormSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Forms list */}
          {loadingForms ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : filteredForms.length === 0 ? (
            <div className="text-center py-8">
              <ClipboardList className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {forms.length === 0
                  ? "No forms created yet. Create a form first."
                  : "No forms match your search."}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredForms.map((form) => (
                <button
                  key={form.id}
                  onClick={() => setSelectedFormId(form.id)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                    selectedFormId === form.id
                      ? "border-orange-500 bg-orange-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-gray-100 rounded">
                      <ClipboardList className="w-4 h-4 text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{form.name}</p>
                      {form.description && (
                        <p className="text-sm text-gray-500 line-clamp-1">
                          {form.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {form.fields?.length || 0} fields
                        {form.database && ` • Linked to ${form.database.name}`}
                      </p>
                    </div>
                    {selectedFormId === form.id && (
                      <Check className="w-5 h-5 text-orange-500" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Select Recipients */}
      {step === "select_recipients" && (
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="font-medium text-gray-900">Select Recipients</h3>
            <p className="text-sm text-gray-500">
              Choose stakeholders to send "{selectedForm?.name}" to
            </p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search stakeholders..."
              value={stakeholderSearchQuery}
              onChange={(e) => setStakeholderSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Select all */}
          <div className="flex items-center justify-between px-1">
            <button
              onClick={toggleAllStakeholders}
              className="text-sm text-orange-600 hover:underline"
            >
              {selectedEntityIds.size === filteredStakeholders.length
                ? "Deselect all"
                : "Select all"}
            </button>
            <span className="text-sm text-gray-500">
              {selectedEntityIds.size} selected
            </span>
          </div>

          {/* Stakeholders list */}
          {filteredStakeholders.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {stakeholders.length === 0
                  ? "No stakeholders with email addresses assigned to this task"
                  : "No stakeholders match your search"}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredStakeholders.map((stakeholder) => {
                const isSelected = selectedEntityIds.has(stakeholder.id)
                const fullName = stakeholder.firstName + (stakeholder.lastName ? ` ${stakeholder.lastName}` : "")
                return (
                  <button
                    key={stakeholder.id}
                    onClick={() => toggleStakeholder(stakeholder.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 ${
                      isSelected
                        ? "border-orange-500 bg-orange-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected
                          ? "border-orange-500 bg-orange-500"
                          : "border-gray-300"
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">
                        {fullName || stakeholder.email}
                      </p>
                      {fullName && (
                        <p className="text-sm text-gray-500">{stakeholder.email}</p>
                      )}
                    </div>
                    {stakeholder.contactType && (
                      <span className="text-xs text-gray-400 capitalize">
                        {stakeholder.contactType.toLowerCase()}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Configure */}
      {step === "configure" && (
        <div className="space-y-6">
          <div className="text-center">
            <h3 className="font-medium text-gray-900">Configure Request</h3>
            <p className="text-sm text-gray-500">
              Set deadline and reminder options
            </p>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <ClipboardList className="w-4 h-4 text-gray-500" />
              <span className="font-medium">{selectedForm?.name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Users className="w-4 h-4 text-gray-500" />
              <span>{selectedEntityIds.size} recipients</span>
            </div>
            {boardPeriod && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span>Period: {boardPeriod}</span>
              </div>
            )}
          </div>

          {/* Deadline */}
          <div>
            <Label>Deadline (optional)</Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {/* When to Send */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <Label>When to send</Label>
            </div>
            
            <div className="space-y-2">
              {/* Send Now */}
              <label 
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  sendTiming === "immediate" 
                    ? "border-orange-500 bg-orange-50" 
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="sendTiming"
                  value="immediate"
                  checked={sendTiming === "immediate"}
                  onChange={() => setSendTiming("immediate")}
                  className="w-4 h-4 text-orange-500 focus:ring-orange-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-gray-600" />
                    <span className="font-medium text-gray-900">Send now</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Emails go out immediately</p>
                </div>
              </label>

              {/* Schedule */}
              <label 
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  sendTiming === "scheduled" 
                    ? "border-orange-500 bg-orange-50" 
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="sendTiming"
                  value="scheduled"
                  checked={sendTiming === "scheduled"}
                  onChange={() => setSendTiming("scheduled")}
                  className="w-4 h-4 text-orange-500 focus:ring-orange-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-gray-600" />
                    <span className="font-medium text-gray-900">Schedule for later</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Send at a specific time relative to the period
                  </p>
                </div>
              </label>
            </div>

            {/* Schedule Options */}
            {sendTiming === "scheduled" && (
              <div className="ml-6 space-y-3">
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    When should this be sent?
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={scheduleOffsetDays}
                      onChange={(e) => setScheduleOffsetDays(Number(e.target.value))}
                      className="block w-24 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={5}>5</option>
                      <option value={7}>7</option>
                      <option value={10}>10</option>
                      <option value={14}>14</option>
                      <option value={21}>21</option>
                      <option value={30}>30</option>
                    </select>
                    <span className="text-sm text-gray-700">business days before period end</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Reminders */}
          <div className={`space-y-4 ${sendTiming === "scheduled" ? "opacity-50" : ""}`}>
            <div className="flex items-center justify-between">
              <div>
                <Label>Enable Reminders</Label>
                <p className="text-xs text-gray-500">
                  {sendTiming === "scheduled" 
                    ? "Coming soon for scheduled requests"
                    : "Send automatic reminders for incomplete forms"
                  }
                </p>
              </div>
              <Switch
                checked={remindersEnabled && sendTiming !== "scheduled"}
                onCheckedChange={setRemindersEnabled}
                disabled={sendTiming === "scheduled"}
              />
            </div>

            {remindersEnabled && sendTiming !== "scheduled" && (
              <div className="pl-4 border-l-2 border-orange-200 space-y-4">
                <div>
                  <Label>Remind every</Label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={14}
                      value={reminderDays}
                      onChange={(e) => setReminderDays(Number(e.target.value))}
                      className="w-20"
                    />
                    <span className="text-sm text-gray-500">days</span>
                  </div>
                </div>
                <div>
                  <Label>Maximum reminders</Label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={maxReminders}
                      onChange={(e) => setMaxReminders(Number(e.target.value))}
                      className="w-20"
                    />
                    <span className="text-sm text-gray-500">reminders</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button
          variant="outline"
          onClick={() => {
            if (step === "select_form") {
              onCancel()
            } else if (step === "select_recipients") {
              setStep("select_form")
            } else if (step === "configure") {
              setStep("select_recipients")
            }
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {step === "select_form" ? "Cancel" : "Back"}
        </Button>

        {step === "select_form" && (
          <Button
            onClick={() => setStep("select_recipients")}
            disabled={!selectedFormId}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}

        {step === "select_recipients" && (
          <Button
            onClick={() => setStep("configure")}
            disabled={selectedEntityIds.size === 0}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}

        {step === "configure" && (
          <Button
            onClick={handleSend}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {sendTiming === "scheduled" ? (
              <>
                <CalendarClock className="w-4 h-4 mr-2" />
                Schedule for {selectedEntityIds.size} Recipient{selectedEntityIds.size !== 1 ? "s" : ""}
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send to {selectedEntityIds.size} Recipient{selectedEntityIds.size !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

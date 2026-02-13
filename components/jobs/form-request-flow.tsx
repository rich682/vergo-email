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
import { usePermissions } from "@/components/permissions-context"
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

// Internal user type
interface UserOption {
  id: string
  name: string | null
  email: string
  role: string
}

// External stakeholder/entity type
interface EntityOption {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
  contactType?: string
}

// Combined recipient type for display
interface RecipientOption {
  id: string
  name: string
  email: string
  type: "user" | "entity"
  subLabel?: string // role for users, contactType for entities
}

type FlowStep = "select_form" | "select_recipients" | "configure" | "sending" | "success" | "error"

interface FormRequestFlowProps {
  jobId: string
  jobName: string
  boardPeriod: string | null
  deadlineDate: string | null
  onSuccess: () => void
  onCancel: () => void
}

export function FormRequestFlow({
  jobId,
  jobName,
  boardPeriod,
  deadlineDate,
  onSuccess,
  onCancel,
}: FormRequestFlowProps) {
  const { can } = usePermissions()
  const canSendForms = can("forms:send")
  const [step, setStep] = useState<FlowStep>("select_form")
  const [error, setError] = useState<string | null>(null)

  // Form selection
  const [forms, setForms] = useState<FormDefinitionOption[]>([])
  const [loadingForms, setLoadingForms] = useState(true)
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
  const [formSearchQuery, setFormSearchQuery] = useState("")

  // Recipient selection - all users and entities
  const [recipients, setRecipients] = useState<RecipientOption[]>([])
  const [loadingRecipients, setLoadingRecipients] = useState(false)
  const [selectedRecipients, setSelectedRecipients] = useState<Map<string, "user" | "entity">>(new Map())
  const [recipientSearchQuery, setRecipientSearchQuery] = useState("")
  const [recipientFilter, setRecipientFilter] = useState<"all" | "users" | "entities">("all")

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

  // Load recipients when moving to recipient step
  useEffect(() => {
    if (step === "select_recipients" && recipients.length === 0) {
      fetchRecipients()
    }
  }, [step])

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

  const fetchRecipients = async () => {
    try {
      setLoadingRecipients(true)
      const allRecipients: RecipientOption[] = []

      // Fetch internal users
      const usersResponse = await fetch("/api/users", { credentials: "include" })
      if (usersResponse.ok) {
        const usersData = await usersResponse.json()
        const users: UserOption[] = usersData.users || []
        for (const user of users) {
          if (user.email) {
            allRecipients.push({
              id: user.id,
              name: user.name || user.email,
              email: user.email,
              type: "user",
              subLabel: user.role?.toLowerCase(),
            })
          }
        }
      }

      // Fetch all entities/contacts (API returns array directly)
      const entitiesResponse = await fetch("/api/entities", { credentials: "include" })
      if (entitiesResponse.ok) {
        const entities: EntityOption[] = await entitiesResponse.json()
        for (const entity of entities) {
          if (entity.email) {
            const fullName = entity.firstName + (entity.lastName ? ` ${entity.lastName}` : "")
            allRecipients.push({
              id: entity.id,
              name: fullName || entity.email,
              email: entity.email,
              type: "entity",
              subLabel: entity.contactType?.toLowerCase(),
            })
          }
        }
      }

      setRecipients(allRecipients)
    } catch (err) {
      console.error("Error fetching recipients:", err)
    } finally {
      setLoadingRecipients(false)
    }
  }

  const handleSend = async () => {
    if (!selectedFormId || selectedRecipients.size === 0) {
      setError("Please select a form and at least one recipient")
      return
    }

    setStep("sending")
    setError(null)

    try {
      // Separate user IDs and entity IDs
      const recipientUserIds: string[] = []
      const recipientEntityIds: string[] = []
      
      for (const [id, type] of selectedRecipients.entries()) {
        if (type === "user") {
          recipientUserIds.push(id)
        } else {
          recipientEntityIds.push(id)
        }
      }

      const response = await fetch(`/api/task-instances/${jobId}/form-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          formDefinitionId: selectedFormId,
          recipientUserIds: recipientUserIds.length > 0 ? recipientUserIds : undefined,
          recipientEntityIds: recipientEntityIds.length > 0 ? recipientEntityIds : undefined,
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

  // Filter recipients by search query and type filter
  const filteredRecipients = recipients.filter((r) => {
    // Filter by type
    if (recipientFilter === "users" && r.type !== "user") return false
    if (recipientFilter === "entities" && r.type !== "entity") return false
    
    // Filter by search query
    if (!recipientSearchQuery) return true
    const query = recipientSearchQuery.toLowerCase()
    return (
      r.name.toLowerCase().includes(query) ||
      r.email.toLowerCase().includes(query)
    )
  })

  const toggleRecipient = (id: string, type: "user" | "entity") => {
    const newMap = new Map(selectedRecipients)
    if (newMap.has(id)) {
      newMap.delete(id)
    } else {
      newMap.set(id, type)
    }
    setSelectedRecipients(newMap)
  }

  const toggleAllRecipients = () => {
    if (selectedRecipients.size === filteredRecipients.length) {
      setSelectedRecipients(new Map())
    } else {
      const newMap = new Map<string, "user" | "entity">()
      for (const r of filteredRecipients) {
        newMap.set(r.id, r.type)
      }
      setSelectedRecipients(newMap)
    }
  }
  
  // Count recipients by type
  const userCount = recipients.filter(r => r.type === "user").length
  const entityCount = recipients.filter(r => r.type === "entity").length

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
            ? `Scheduling for ${selectedRecipients.size} recipient${selectedRecipients.size !== 1 ? "s" : ""}`
            : `Sending to ${selectedRecipients.size} recipient${selectedRecipients.size !== 1 ? "s" : ""}`
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

  if (!canSendForms) {
    return (
      <div className="p-6 text-center text-gray-500">
        <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm">You do not have permission to send form requests.</p>
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
              Choose who to send "{selectedForm?.name}" to
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            <button
              onClick={() => setRecipientFilter("all")}
              className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
                recipientFilter === "all"
                  ? "bg-white shadow text-gray-900 font-medium"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All ({recipients.length})
            </button>
            <button
              onClick={() => setRecipientFilter("users")}
              className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
                recipientFilter === "users"
                  ? "bg-white shadow text-gray-900 font-medium"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Team ({userCount})
            </button>
            <button
              onClick={() => setRecipientFilter("entities")}
              className={`flex-1 px-3 py-1.5 text-sm rounded-md transition-colors ${
                recipientFilter === "entities"
                  ? "bg-white shadow text-gray-900 font-medium"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Contacts ({entityCount})
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by name or email..."
              value={recipientSearchQuery}
              onChange={(e) => setRecipientSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Select all */}
          <div className="flex items-center justify-between px-1">
            <button
              onClick={toggleAllRecipients}
              className="text-sm text-orange-600 hover:underline"
            >
              {selectedRecipients.size === filteredRecipients.length && filteredRecipients.length > 0
                ? "Deselect all"
                : "Select all"}
            </button>
            <span className="text-sm text-gray-500">
              {selectedRecipients.size} selected
            </span>
          </div>

          {/* Recipients list */}
          {loadingRecipients ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : filteredRecipients.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {recipients.length === 0
                  ? "No recipients found"
                  : "No recipients match your search"}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {filteredRecipients.map((recipient) => {
                const isSelected = selectedRecipients.has(recipient.id)
                return (
                  <button
                    key={`${recipient.type}-${recipient.id}`}
                    onClick={() => toggleRecipient(recipient.id, recipient.type)}
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
                      <p className="font-medium text-gray-900">{recipient.name || 'Unknown'}</p>
                      <p className="text-sm text-gray-500">{recipient.email || ''}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        recipient.type === "user" 
                          ? "bg-blue-100 text-blue-700" 
                          : "bg-purple-100 text-purple-700"
                      }`}>
                        {recipient.type === "user" ? "Team" : "Contact"}
                      </span>
                      {recipient.subLabel && (
                        <span className="text-xs text-gray-400 capitalize">
                          {recipient.subLabel}
                        </span>
                      )}
                    </div>
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
              <span>{selectedRecipients.size} recipients</span>
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
            disabled={selectedRecipients.size === 0}
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
                Schedule for {selectedRecipients.size} Recipient{selectedRecipients.size !== 1 ? "s" : ""}
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send to {selectedRecipients.size} Recipient{selectedRecipients.size !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

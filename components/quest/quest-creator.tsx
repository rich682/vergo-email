"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmationCard } from "./confirmation-card"
import { renderTemplate } from "@/lib/utils/template-renderer"
import type { 
  QuestInterpretationResult,
  QuestRecipientSelection,
  QuestScheduleIntent,
  QuestReminderIntent,
  StandingQuestSchedule
} from "@/lib/types/quest"

type ChatMessage = {
  id: string
  type: "user" | "assistant" | "thinking" | "confirmation" | "preview" | "generating"
  content: string
  interpretation?: QuestInterpretationResult
  quest?: any
}

type ThinkingStage = "understanding" | "reviewing" | "ready"
type GeneratingStage = "creating" | "personalizing" | "applying_tags" | "finalizing"

const EXAMPLE_PROMPTS = [
  "Email all employees about timesheets due by Friday",
  "Request W-9s from vendors who haven't submitted",
  "Send invoice reminders to clients every Wednesday"
]

export function QuestCreator() {
  const router = useRouter()
  const [prompt, setPrompt] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [thinkingStage, setThinkingStage] = useState<ThinkingStage | null>(null)
  const [availableContactTypes, setAvailableContactTypes] = useState<string[]>([])
  const [availableGroups, setAvailableGroups] = useState<Array<{ id: string; name: string }>>([])
  const [availableTags, setAvailableTags] = useState<Array<{ stateKey: string; count: number }>>([])
  const [currentQuest, setCurrentQuest] = useState<any>(null)
  const [resolvedRecipients, setResolvedRecipients] = useState<Array<{ email: string; name?: string; contactType?: string }>>([])
  const [editedSubject, setEditedSubject] = useState("")
  const [editedBody, setEditedBody] = useState("")
  const [previewRecipientIdx, setPreviewRecipientIdx] = useState(-1)
  const [generatingStage, setGeneratingStage] = useState<GeneratingStage | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Fetch organization context on mount
  useEffect(() => {
    const fetchContext = async () => {
      try {
        const res = await fetch("/api/quests/context")
        if (res.ok) {
          const data = await res.json()
          setAvailableContactTypes(data.contactTypes || [])
          setAvailableGroups(data.groups || [])
          setAvailableTags(data.stateKeys || [])
        }
      } catch (error) {
        console.error("Failed to fetch context:", error)
        // Use defaults
        setAvailableContactTypes(["EMPLOYEE", "VENDOR", "CLIENT", "CONTRACTOR", "MANAGEMENT"])
        setAvailableGroups([])
        setAvailableTags([])
        setStandingQuestsEnabled(false)
      }
    }
    fetchContext()
  }, [])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!prompt.trim() || isProcessing) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: prompt
    }

    setMessages(prev => [...prev, userMessage])
    setPrompt("")
    setIsProcessing(true)

    // Add thinking message
    const thinkingId = (Date.now() + 1).toString()
    setMessages(prev => [...prev, {
      id: thinkingId,
      type: "thinking",
      content: "Understanding your request..."
    }])

    // Animate through thinking stages
    setThinkingStage("understanding")
    await new Promise(r => setTimeout(r, 800))
    
    setThinkingStage("reviewing")
    setMessages(prev => prev.map(m => 
      m.id === thinkingId ? { ...m, content: "Reviewing recipients..." } : m
    ))
    
    try {
      // Call interpret API
      const res = await fetch("/api/quests/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMessage.content })
      })

      if (!res.ok) {
        throw new Error("Failed to interpret request")
      }

      const data = await res.json()
      const interpretation = data.interpretation as QuestInterpretationResult
      const recipients = data.recipients || []

      // Store resolved recipients for display
      setResolvedRecipients(recipients)

      setThinkingStage("ready")
      await new Promise(r => setTimeout(r, 400))

      // Remove thinking message and add confirmation card
      setMessages(prev => [
        ...prev.filter(m => m.id !== thinkingId),
        {
          id: (Date.now() + 2).toString(),
          type: "confirmation",
          content: "",
          interpretation
        }
      ])

    } catch (error: any) {
      console.error("Interpretation error:", error)
      // Remove thinking and add error message
      setMessages(prev => [
        ...prev.filter(m => m.id !== thinkingId),
        {
          id: (Date.now() + 2).toString(),
          type: "assistant",
          content: `Sorry, I couldn't understand that request. ${error.message || "Please try again."}`
        }
      ])
    } finally {
      setIsProcessing(false)
      setThinkingStage(null)
    }
  }

  const handleConfirm = async (
    selection: QuestRecipientSelection,
    schedule: QuestScheduleIntent,
    reminders: QuestReminderIntent,
    standingSchedule?: StandingQuestSchedule
  ) => {
    // Find the confirmation message to get the interpretation
    const confirmationMsg = messages.find(m => m.type === "confirmation")
    if (!confirmationMsg?.interpretation) {
      console.error("handleConfirm: No confirmation message or interpretation found")
      return
    }

    console.log("handleConfirm: Starting with selection:", selection)
    console.log("handleConfirm: Schedule:", schedule)
    console.log("handleConfirm: Reminders:", reminders)
    
    setIsProcessing(true)
    
    // Show generating animation - replace confirmation with generating message
    setMessages(prev => [
      ...prev.filter(m => m.type !== "confirmation"),
      {
        id: "generating",
        type: "generating" as const,
        content: ""
      }
    ])
    setGeneratingStage("creating")

    try {
      // Step 1: Create quest (standing or one-time)
      console.log("handleConfirm: Step 1 - Creating quest...")
      const createRes = await fetch(standingSchedule ? "/api/quests/standing" : "/api/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalPrompt: messages.find(m => m.type === "user")?.content || "",
          interpretation: confirmationMsg.interpretation,
          userModifications: selection,
          confirmedSchedule: schedule,
          standingSchedule,
          confirmedReminders: reminders
        })
      })

      if (!createRes.ok) {
        const errorData = await createRes.json().catch(() => ({}))
        console.error("handleConfirm: Quest create failed:", createRes.status, errorData)
        throw new Error(errorData.message || errorData.error || `Failed to create quest (${createRes.status})`)
      }

      const createData = await createRes.json()
      const quest = createData.quest
      console.log("handleConfirm: Step 1 complete - Quest created:", quest.id, "status:", quest.status)

      // Step 2: Generate email - update animation stage
      setGeneratingStage("personalizing")
      
      // Brief delay to show the stage transition
      await new Promise(resolve => setTimeout(resolve, 500))
      
      console.log("handleConfirm: Step 2 - Generating email for quest:", quest.id)
      
      // Show "applying tags" stage if tags are selected
      const hasTags = selection.stateFilter?.stateKeys && selection.stateFilter.stateKeys.length > 0
      if (hasTags) {
        setGeneratingStage("applying_tags")
        await new Promise(resolve => setTimeout(resolve, 800))
      }
      
      const generateRes = await fetch(`/api/quests/${quest.id}/generate`, {
        method: "POST"
      })

      if (!generateRes.ok) {
        const errorData = await generateRes.json().catch(() => ({}))
        console.error("handleConfirm: Quest generate failed:", generateRes.status, errorData)
        throw new Error(errorData.message || errorData.error || `Failed to generate email (${generateRes.status})`)
      }

      setGeneratingStage("finalizing")
      
      const generateData = await generateRes.json()
      console.log("handleConfirm: Step 2 complete - Generate response:", {
        questId: generateData.quest?.id,
        status: generateData.quest?.status,
        hasSubject: !!generateData.quest?.subject,
        hasBody: !!generateData.quest?.body,
        subject: generateData.quest?.subject?.substring(0, 50)
      })

      // Verify we got complete data
      if (!generateData.quest?.subject || !generateData.quest?.body) {
        console.error("handleConfirm: Email generation incomplete - missing subject or body", generateData.quest)
        throw new Error("Email generation incomplete - missing subject or body")
      }

      // Brief pause before showing preview
      await new Promise(resolve => setTimeout(resolve, 300))

      // Step 3: Update state to show preview
      console.log("handleConfirm: Step 3 - Updating state to show preview")
      setCurrentQuest(generateData.quest)
      setEditedSubject(generateData.quest.subject || "")
      setEditedBody(generateData.quest.body || "")
      setPreviewRecipientIdx(-1)

      // Update messages to show preview
      setMessages(prev => {
        const newMessages = [
          ...prev.filter(m => m.type !== "generating"),
          {
            id: Date.now().toString(),
            type: "preview" as const,
            content: "",
            quest: generateData.quest
          }
        ]
        console.log("handleConfirm: Step 3 complete - Messages updated, preview should now be visible")
        return newMessages
      })

    } catch (error: any) {
      console.error("handleConfirm: Error occurred:", error.message, error.stack)
      setMessages(prev => [
        ...prev.filter(m => m.type !== "generating"),
        {
          id: Date.now().toString(),
          type: "assistant",
          content: `Sorry, something went wrong. ${error.message || "Please try again."}`
        }
      ])
    } finally {
      setIsProcessing(false)
      setGeneratingStage(null)
      console.log("handleConfirm: Finished, isProcessing set to false")
    }
  }

  const handleCancel = () => {
    // Remove confirmation card and allow new prompt
    setMessages(prev => prev.filter(m => m.type !== "confirmation"))
  }

  const handleSend = async () => {
    if (!currentQuest) return

    setIsProcessing(true)

    try {
      const res = await fetch(`/api/quests/${currentQuest.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: editedSubject,
          body: editedBody
        })
      })

      if (!res.ok) {
        throw new Error("Failed to send emails")
      }

      const data = await res.json()

      // Show success and redirect
      setMessages(prev => [
        ...prev.filter(m => m.type !== "preview"),
        {
          id: Date.now().toString(),
          type: "assistant",
          content: `✅ Successfully sent ${data.emailsSent} emails! Redirecting to requests...`
        }
      ])

      setTimeout(() => {
        router.push("/dashboard/requests")
      }, 2000)

    } catch (error: any) {
      console.error("Send error:", error)
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          type: "assistant",
          content: `Sorry, failed to send emails. ${error.message || "Please try again."}`
        }
      ])
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExampleClick = (example: string) => {
    setPrompt(example)
    inputRef.current?.focus()
  }

  const renderThinkingAnimation = () => {
    const stages = [
      { key: "understanding", label: "Understanding your request", icon: "🧠" },
      { key: "reviewing", label: "Reviewing recipients", icon: "👥" },
      { key: "ready", label: "Ready for confirmation", icon: "✅" }
    ]

    return (
      <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl">
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {stages.map((stage, idx) => (
              <div
                key={stage.key}
                className={`flex items-center gap-1 text-sm ${
                  thinkingStage === stage.key
                    ? "text-indigo-700 font-medium"
                    : stages.findIndex(s => s.key === thinkingStage) > idx
                    ? "text-green-600"
                    : "text-gray-400"
                }`}
              >
                <span>{stage.icon}</span>
                <span>{stage.label}</span>
                {idx < stages.length - 1 && (
                  <svg className="w-4 h-4 mx-1 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const renderGeneratingAnimation = () => {
    const stages = [
      { key: "creating", label: "Creating request", icon: "📝" },
      { key: "personalizing", label: "Personalizing content", icon: "✨" },
      { key: "applying_tags", label: "Applying data tags", icon: "🏷️" },
      { key: "finalizing", label: "Finalizing draft", icon: "✅" }
    ]

    const currentIdx = stages.findIndex(s => s.key === generatingStage)

    return (
      <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 rounded-xl p-6 border border-green-200 shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full animate-ping" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">AI is generating your email</h3>
            <p className="text-sm text-gray-500">This may take a few moments...</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="space-y-3">
          {stages.map((stage, idx) => {
            const isActive = stage.key === generatingStage
            const isComplete = currentIdx > idx
            const isPending = currentIdx < idx

            return (
              <div
                key={stage.key}
                className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-300 ${
                  isActive 
                    ? "bg-white shadow-md border border-green-200" 
                    : isComplete 
                    ? "bg-green-100/50" 
                    : "opacity-50"
                }`}
              >
                {/* Status Icon */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isComplete 
                    ? "bg-green-500 text-white" 
                    : isActive 
                    ? "bg-green-100 text-green-600" 
                    : "bg-gray-200 text-gray-400"
                }`}>
                  {isComplete ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isActive ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <span className="text-sm">{idx + 1}</span>
                  )}
                </div>

                {/* Label */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{stage.icon}</span>
                    <span className={`font-medium ${
                      isActive ? "text-green-700" : isComplete ? "text-green-600" : "text-gray-500"
                    }`}>
                      {stage.label}
                    </span>
                  </div>
                  {isActive && (
                    <div className="mt-1 h-1 bg-green-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full animate-progress" style={{ width: "60%" }} />
                    </div>
                  )}
                </div>

                {/* Status Badge */}
                {isComplete && (
                  <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">
                    Done
                  </span>
                )}
                {isActive && (
                  <span className="text-xs font-medium text-green-700 bg-green-200 px-2 py-1 rounded-full animate-pulse">
                    In progress
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Fun fact / tip */}
        <div className="mt-4 p-3 bg-white/50 rounded-lg border border-green-100">
          <p className="text-xs text-gray-600 flex items-center gap-2">
            <span className="text-green-500">💡</span>
            <span>Each recipient will receive a personalized email with their specific data filled in.</span>
          </p>
        </div>
      </div>
    )
  }

  const renderPreview = (quest: any) => {
    // Get audience summary from quest
    const audienceSummary = []
    if (quest.confirmedSelection?.contactTypes?.length > 0) {
      audienceSummary.push(`Type: ${quest.confirmedSelection.contactTypes.join(", ")}`)
    }
    if (quest.confirmedSelection?.groupIds?.length > 0) {
      audienceSummary.push(`Groups: ${quest.confirmedSelection.groupIds.length}`)
    }
    if (quest.confirmedSelection?.stateFilter?.stateKeys?.length > 0) {
      const mode = quest.confirmedSelection.stateFilter.mode === "missing" ? "Missing" : "Has"
      audienceSummary.push(`${mode}: ${quest.confirmedSelection.stateFilter.stateKeys.join(", ")}`)
    }

    // Check if reminders are enabled
    const hasReminders = quest.scheduleConfig?.reminders?.enabled
    const reminderCount = quest.scheduleConfig?.reminders?.maxCount || 0

    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2 text-green-800">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Email Ready to Send
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Audience Summary */}
          <div className="p-3 bg-blue-50 rounded-md border border-blue-100">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-800 mb-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Sending to {resolvedRecipients.length} recipient{resolvedRecipients.length !== 1 ? "s" : ""}
            </div>
            {audienceSummary.length > 0 && (
              <div className="text-xs text-blue-600 space-x-2">
                {audienceSummary.map((item, idx) => (
                  <span key={idx} className="inline-block px-2 py-0.5 bg-blue-100 rounded">
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Reminder Sequence */}
          {hasReminders && reminderCount > 0 && (
            <div className="p-3 bg-amber-50 rounded-md border border-amber-100">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-800 mb-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Reminder Sequence
              </div>
              <div className="flex items-center gap-2 text-xs text-amber-700">
                <span className="px-2 py-1 bg-amber-100 rounded font-medium">Initial</span>
                {Array.from({ length: reminderCount }).map((_, idx) => (
                  <span key={idx} className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="px-2 py-1 bg-amber-100 rounded">Reminder {idx + 1}</span>
                  </span>
                ))}
              </div>
              <p className="text-xs text-amber-600 mt-2">
                Reminders sent only to recipients who haven&apos;t replied
              </p>
            </div>
          )}

          {/* Per-recipient preview selector */}
          {resolvedRecipients.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700">Preview as:</label>
              <select
                value={previewRecipientIdx}
                onChange={(e) => setPreviewRecipientIdx(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value={-1}>Draft (edit mode)</option>
                {resolvedRecipients.slice(0, 10).map((r, idx) => (
                  <option key={idx} value={idx}>
                    {r.name || r.email} {r.contactType ? `(${r.contactType})` : ""}
                  </option>
                ))}
                {resolvedRecipients.length > 10 && (
                  <option disabled>... and {resolvedRecipients.length - 10} more</option>
                )}
              </select>
              {previewRecipientIdx >= 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Previewing how email will look for {resolvedRecipients[previewRecipientIdx]?.name || resolvedRecipients[previewRecipientIdx]?.email}. Edits below will apply to all recipients.
                </p>
              )}
            </div>
          )}

          {/* Subject - always editable */}
          <div>
            <label className="text-sm font-medium text-gray-700">Subject:</label>
            <input
              type="text"
              value={editedSubject}
              onChange={(e) => setEditedSubject(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {previewRecipientIdx >= 0 && (
              <p className="text-xs text-blue-600 mt-1 bg-blue-50 px-2 py-1 rounded">
                Preview: {(() => {
                  const recipient = resolvedRecipients[previewRecipientIdx]
                  const data = {
                    "First Name": recipient?.name?.split(" ")[0] || "",
                    "Email": recipient?.email || ""
                  }
                  return renderTemplate(editedSubject, data).rendered
                })()}
              </p>
            )}
          </div>

          {/* Body - always editable */}
          <div>
            <label className="text-sm font-medium text-gray-700">Body:</label>
            <textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              rows={8}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
            {previewRecipientIdx >= 0 && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-md">
                <p className="text-xs text-blue-700 font-medium mb-1">Preview for {resolvedRecipients[previewRecipientIdx]?.name || resolvedRecipients[previewRecipientIdx]?.email}:</p>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {(() => {
                    const recipient = resolvedRecipients[previewRecipientIdx]
                    const data = {
                      "First Name": recipient?.name?.split(" ")[0] || "",
                      "Email": recipient?.email || ""
                    }
                    return renderTemplate(editedBody, data).rendered
                  })()}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleSend}
              disabled={isProcessing || !editedSubject.trim() || !editedBody.trim()}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {isProcessing ? "Sending..." : `Send to ${resolvedRecipients.length} recipient${resolvedRecipients.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Create a Request
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Describe what you want to send in natural language
          </p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 ? (
            // Empty state with example prompts
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                What would you like to send?
              </h3>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Describe your email request in plain English. I'll help you identify the right recipients and craft the message.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLE_PROMPTS.map((example, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleExampleClick(example)}
                    className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Chat messages
            messages.map((message) => (
              <div key={message.id} className="animate-fadeIn">
                {message.type === "user" && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] px-4 py-3 bg-indigo-600 text-white rounded-2xl rounded-br-md">
                      {message.content}
                    </div>
                  </div>
                )}
                {message.type === "assistant" && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] px-4 py-3 bg-white border border-gray-200 rounded-2xl rounded-bl-md shadow-sm">
                      {message.content}
                    </div>
                  </div>
                )}
                {message.type === "thinking" && renderThinkingAnimation()}
                {message.type === "generating" && renderGeneratingAnimation()}
                {message.type === "confirmation" && message.interpretation && (
                  <ConfirmationCard
                    interpretation={message.interpretation}
                    availableContactTypes={availableContactTypes}
                    availableGroups={availableGroups}
                    availableTags={availableTags}
                    recipients={resolvedRecipients}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                    loading={isProcessing}
                  />
                )}
                {message.type === "preview" && message.quest && renderPreview(message.quest)}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 bg-white">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="relative">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder="Describe what you want to send..."
              rows={1}
              disabled={isProcessing || messages.some(m => m.type === "confirmation" || m.type === "preview" || m.type === "generating")}
              className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 resize-none disabled:bg-gray-50 disabled:text-gray-500"
              style={{ minHeight: "48px", maxHeight: "120px" }}
            />
            <button
              type="submit"
              disabled={!prompt.trim() || isProcessing || messages.some(m => m.type === "confirmation" || m.type === "preview" || m.type === "generating")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2 text-center">
            Press Enter to send • Shift+Enter for new line
          </p>
        </form>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
        @keyframes progress {
          0% { width: 0%; }
          50% { width: 70%; }
          100% { width: 100%; }
        }
        .animate-progress {
          animation: progress 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

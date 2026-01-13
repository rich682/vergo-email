"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmationCard } from "./confirmation-card"
import type { 
  QuestInterpretationResult,
  QuestRecipientSelection,
  QuestScheduleIntent,
  QuestReminderIntent,
  StandingQuestSchedule
} from "@/lib/types/quest"

type ChatMessage = {
  id: string
  type: "user" | "assistant" | "thinking" | "confirmation" | "preview"
  content: string
  interpretation?: QuestInterpretationResult
  quest?: any
}

type ThinkingStage = "understanding" | "reviewing" | "ready"

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
  const [currentQuest, setCurrentQuest] = useState<any>(null)
  const [standingQuestsEnabled, setStandingQuestsEnabled] = useState(false)
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
          setStandingQuestsEnabled(data.standingQuestsEnabled || false)
        }
      } catch (error) {
        console.error("Failed to fetch context:", error)
        // Use defaults
        setAvailableContactTypes(["EMPLOYEE", "VENDOR", "CLIENT", "CONTRACTOR", "MANAGEMENT"])
        setAvailableGroups([])
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
    if (!confirmationMsg?.interpretation) return

    setIsProcessing(true)

    try {
      // Create quest (standing or one-time)
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
        throw new Error("Failed to create quest")
      }

      const createData = await createRes.json()
      const quest = createData.quest

      // Generate email
      const generateRes = await fetch(`/api/quests/${quest.id}/generate`, {
        method: "POST"
      })

      if (!generateRes.ok) {
        throw new Error("Failed to generate email")
      }

      const generateData = await generateRes.json()
      setCurrentQuest(generateData.quest)

      // Update messages to show preview
      setMessages(prev => [
        ...prev.filter(m => m.type !== "confirmation"),
        {
          id: Date.now().toString(),
          type: "preview",
          content: "",
          quest: generateData.quest
        }
      ])

    } catch (error: any) {
      console.error("Quest creation error:", error)
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          type: "assistant",
          content: `Sorry, something went wrong. ${error.message || "Please try again."}`
        }
      ])
    } finally {
      setIsProcessing(false)
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
        method: "POST"
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

  const renderPreview = (quest: any) => {
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
          <div>
            <label className="text-sm font-medium text-gray-700">Subject:</label>
            <div className="mt-1 p-3 bg-white rounded-md border border-gray-200 text-sm">
              {quest.subject}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Body:</label>
            <div className="mt-1 p-3 bg-white rounded-md border border-gray-200 text-sm whitespace-pre-wrap max-h-48 overflow-auto">
              {quest.body}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleSend}
              disabled={isProcessing}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {isProcessing ? "Sending..." : "Send Emails"}
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/dashboard/quest/${quest.id}`)}
            >
              Edit
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
            Create a Quest
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
                {message.type === "confirmation" && message.interpretation && (
                  <ConfirmationCard
                    interpretation={message.interpretation}
                    availableContactTypes={availableContactTypes}
                    availableGroups={availableGroups}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                    loading={isProcessing}
                    standingQuestsEnabled={standingQuestsEnabled}
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
              disabled={isProcessing || messages.some(m => m.type === "confirmation" || m.type === "preview")}
              className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 resize-none disabled:bg-gray-50 disabled:text-gray-500"
              style={{ minHeight: "48px", maxHeight: "120px" }}
            />
            <button
              type="submit"
              disabled={!prompt.trim() || isProcessing || messages.some(m => m.type === "confirmation" || m.type === "preview")}
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
      `}</style>
    </div>
  )
}

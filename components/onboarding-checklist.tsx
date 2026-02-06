"use client"

import { useState, useEffect } from "react"
import { 
  CheckCircle2, Circle, X, Sparkles, Mail, Users, 
  Layout, ListTodo, Send, ChevronRight, Loader2 
} from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface OnboardingProgress {
  accountCreated: boolean
  emailConnected: boolean
  contactAdded: boolean
  boardCreated: boolean
  taskCreated: boolean
  requestSent: boolean
}

interface OnboardingStep {
  key: keyof OnboardingProgress
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  href: string | null
  actionLabel?: string
}

const STEPS: OnboardingStep[] = [
  { 
    key: "accountCreated", 
    label: "Create your account", 
    description: "You're in!",
    icon: Sparkles,
    href: null
  },
  { 
    key: "emailConnected", 
    label: "Connect an email account", 
    description: "Link Gmail or Outlook to send requests",
    icon: Mail,
    href: "/dashboard/settings",
    actionLabel: "Connect"
  },
  { 
    key: "contactAdded", 
    label: "Add your first contact", 
    description: "Import or create contacts to send requests to",
    icon: Users,
    href: "/dashboard/contacts",
    actionLabel: "Add contact"
  },
  { 
    key: "boardCreated", 
    label: "Create a board", 
    description: "Organize tasks by project or time period",
    icon: Layout,
    href: "/dashboard/boards",
    actionLabel: "Create board"
  },
  { 
    key: "taskCreated", 
    label: "Create a task", 
    description: "Tasks represent items you need to collect",
    icon: ListTodo,
    href: "/dashboard/boards",
    actionLabel: "Create task"
  },
  { 
    key: "requestSent", 
    label: "Send your first request", 
    description: "Email stakeholders to collect documents",
    icon: Send,
    href: null,
    actionLabel: "Open a task to send"
  },
]

export function OnboardingChecklist() {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    fetchProgress()
  }, [])

  const fetchProgress = async () => {
    try {
      const response = await fetch("/api/user/onboarding", {
        credentials: "include"
      })
      if (response.ok) {
        const data = await response.json()
        setProgress(data.progress)
        setDismissed(data.dismissed)
      }
    } catch (error) {
      console.error("Error fetching onboarding progress:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = async () => {
    setDismissing(true)
    try {
      await fetch("/api/user/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "dismiss" })
      })
      setDismissed(true)
    } catch (error) {
      console.error("Error dismissing onboarding:", error)
    } finally {
      setDismissing(false)
    }
  }

  // Don't render while loading
  if (loading) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-6 mb-6 animate-pulse">
        <div className="h-6 bg-blue-100 rounded w-48 mb-2"></div>
        <div className="h-4 bg-blue-100 rounded w-64"></div>
      </div>
    )
  }

  // Don't render if dismissed or no progress data
  if (dismissed || !progress) return null

  const completedCount = Object.values(progress).filter(Boolean).length
  const totalSteps = STEPS.length
  const allComplete = completedCount === totalSteps
  const progressPercent = (completedCount / totalSteps) * 100

  // Auto-hide when all complete (with a small delay for celebration)
  if (allComplete) return null

  // Find the first incomplete step for highlighting
  const nextStep = STEPS.find(step => !progress[step.key])

  return (
    <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-200/50 rounded-2xl p-6 mb-6 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Get Started with Vergo
            </h3>
            <p className="text-sm text-gray-500">
              Complete these steps to start collecting documents
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-white/50 rounded-lg transition-colors"
          title="Dismiss"
        >
          {dismissing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <X className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-600 font-medium">
            {completedCount} of {totalSteps} complete
          </span>
          <span className="text-blue-600 font-semibold">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <div className="h-2.5 bg-white/80 rounded-full overflow-hidden shadow-inner">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {STEPS.map((step, index) => {
          const isComplete = progress[step.key]
          const isNext = step === nextStep
          const Icon = step.icon
          
          return (
            <div 
              key={step.key}
              className={`
                flex items-center gap-3 p-3 rounded-xl transition-all duration-200
                ${isComplete 
                  ? "bg-green-50/80" 
                  : isNext 
                    ? "bg-white shadow-sm border border-blue-200" 
                    : "bg-white/50"
                }
              `}
            >
              {/* Status icon */}
              <div className={`
                w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                ${isComplete 
                  ? "bg-green-100" 
                  : isNext 
                    ? "bg-blue-100" 
                    : "bg-gray-100"
                }
              `}>
                {isComplete ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <span className={`text-sm font-semibold ${isNext ? "text-blue-600" : "text-gray-400"}`}>
                    {index + 1}
                  </span>
                )}
              </div>

              {/* Step icon */}
              <Icon className={`w-4 h-4 flex-shrink-0 ${
                isComplete ? "text-green-600" : isNext ? "text-blue-600" : "text-gray-400"
              }`} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <span className={`text-sm font-medium ${
                  isComplete ? "text-green-700" : "text-gray-800"
                }`}>
                  {step.label}
                </span>
                {isNext && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {step.description}
                  </p>
                )}
              </div>

              {/* Action button */}
              {!isComplete && step.href && (
                <Link href={step.href}>
                  <Button 
                    size="sm" 
                    variant={isNext ? "default" : "outline"}
                    className={`
                      text-xs h-8 gap-1
                      ${isNext 
                        ? "bg-blue-600 hover:bg-blue-700 shadow-sm" 
                        : "text-gray-600"
                      }
                    `}
                  >
                    {step.actionLabel || "Do this"}
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </Link>
              )}

              {/* Completed checkmark */}
              {isComplete && (
                <span className="text-xs text-green-600 font-medium">Done</span>
              )}
            </div>
          )
        })}
      </div>

      {/* Skip option */}
      <div className="mt-5 pt-4 border-t border-blue-200/50 flex items-center justify-between">
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Skip setup — I'll explore on my own
        </button>
        <span className="text-xs text-gray-400">
          You can always find help in Settings
        </span>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { Plus, X, Loader2, FileText, BarChart3, GitCompareArrows, Circle, ArrowRight, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type TaskType = "reconciliation" | "report" | "analysis"

interface WizardTask {
  id: string
  name: string
  taskType: TaskType
}

const TASK_TYPE_OPTIONS: { value: TaskType; label: string }[] = [
  { value: "reconciliation", label: "Reconciliation" },
  { value: "report", label: "Report" },
  { value: "analysis", label: "Analysis" },
]

const TASK_TYPE_COLORS: Record<TaskType, { bg: string; text: string }> = {
  reconciliation: { bg: "bg-blue-100", text: "text-blue-700" },
  report: { bg: "bg-purple-100", text: "text-purple-700" },
  analysis: { bg: "bg-emerald-100", text: "text-emerald-700" },
}

const TASK_TYPE_ICONS: Record<TaskType, React.ReactNode> = {
  reconciliation: <GitCompareArrows className="w-3.5 h-3.5" />,
  report: <FileText className="w-3.5 h-3.5" />,
  analysis: <BarChart3 className="w-3.5 h-3.5" />,
}

let idCounter = 0
function generateId() {
  return `wizard-task-${++idCounter}`
}

const CURRENT_MONTH = new Date().toLocaleString("default", { month: "long", year: "numeric" })

// Replace with your actual Loom video ID
const LOOM_VIDEO_ID = "PLACEHOLDER_VIDEO_ID"

interface ActivationWizardProps {
  userName: string
}

export function ActivationWizard({ userName }: ActivationWizardProps) {
  const [step, setStep] = useState<"checklist" | "video">("checklist")
  const [tasks, setTasks] = useState<WizardTask[]>([
    { id: generateId(), name: "", taskType: "reconciliation" },
  ])
  const [submitting, setSubmitting] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addTask = () => {
    if (tasks.length >= 5) return
    setTasks((prev) => [...prev, { id: generateId(), name: "", taskType: "reconciliation" }])
  }

  const removeTask = (id: string) => {
    if (tasks.length <= 1) return
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }

  const updateTask = (id: string, field: "name" | "taskType", value: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    )
  }

  const handleSubmit = async () => {
    setError(null)

    const validTasks = tasks.filter((t) => t.name.trim().length > 0)
    if (validTasks.length === 0) {
      setError("Add at least one task with a name to get started.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/onboarding/setup-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: validTasks.map((t) => ({ name: t.name.trim(), taskType: t.taskType })),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to create tasks")
      }

      // Move to video step
      setStep("video")
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.")
      setSubmitting(false)
    }
  }

  const handleSkip = async () => {
    setSkipping(true)
    try {
      await fetch("/api/user/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      })
      // Move to video step
      setStep("video")
    } catch {
      setSkipping(false)
    }
  }

  const handleGoToBoard = () => {
    // Hard navigation to refresh the JWT with onboardingCompleted = true
    window.location.href = "/dashboard/boards"
  }

  const filledTasks = tasks.filter((t) => t.name.trim().length > 0)

  // ── Step 2: Founder Video ──────────────────────────────────────────
  if (step === "video") {
    return (
      <div className="min-h-screen flex">
        {/* Left Panel - Video */}
        <div className="w-full lg:w-[55%] flex flex-col px-8 md:px-16 lg:px-20 py-10">
          {/* Header */}
          <div className="flex items-center justify-between mb-16">
            <img src="/logo.svg" alt="Vergo" className="h-6 w-auto" />
            <button
              onClick={handleGoToBoard}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col max-w-xl">
            <h1 className="text-2xl font-semibold text-gray-900">
              A quick word from our founder
            </h1>
            <p className="text-gray-500 mt-2 text-sm">
              See how teams use Vergo to close faster.
            </p>

            {/* Loom Embed */}
            <div className="mt-8 rounded-xl overflow-hidden shadow-lg border border-gray-200/60 bg-gray-900 aspect-video">
              <iframe
                src={`https://www.loom.com/embed/${LOOM_VIDEO_ID}?autoplay=1&hide_owner=true&hide_share=true&hide_title=true`}
                frameBorder="0"
                allowFullScreen
                allow="autoplay; fullscreen"
                className="w-full h-full"
              />
            </div>

            {/* CTA */}
            <Button
              onClick={handleGoToBoard}
              className="mt-8 h-11 w-full"
              variant="brand"
            >
              Go to my board
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Right Panel - Training nudge */}
        <div className="hidden lg:flex w-[45%] bg-gradient-to-br from-orange-50 to-amber-50 items-center justify-center p-12">
          <div className="text-center max-w-xs">
            <div className="w-14 h-14 bg-white rounded-2xl shadow-md flex items-center justify-center mx-auto mb-6">
              <Calendar className="w-7 h-7 text-orange-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Need help getting set up?
            </h3>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              Book a free training session anytime using the widget in the bottom-right corner.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 1: Checklist ──────────────────────────────────────────────
  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Form */}
      <div className="w-full lg:w-[55%] flex flex-col px-8 md:px-16 lg:px-20 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-16">
          <img src="/logo.svg" alt="Vergo" className="h-6 w-auto" />
          <button
            onClick={handleSkip}
            disabled={skipping}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            {skipping ? "Skipping..." : "Skip for now"}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col max-w-lg">
          <h1 className="text-2xl font-semibold text-gray-900">
            Let's start your checklist
          </h1>
          <p className="text-gray-500 mt-3 text-sm">
            Add a few tasks your team does each month for month end.
            You can always add more later.
          </p>

          {/* Task List */}
          <div className="mt-8 space-y-3">
            {tasks.map((task, index) => (
              <div key={task.id} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-5 text-right shrink-0">
                  {index + 1}.
                </span>
                <Input
                  placeholder="Task name, e.g. Bank Reconciliation"
                  value={task.name}
                  onChange={(e) => updateTask(task.id, "name", e.target.value)}
                  className="flex-1 h-10"
                  autoFocus={index === 0}
                />
                <Select
                  value={task.taskType}
                  onValueChange={(v) => updateTask(task.id, "taskType", v)}
                >
                  <SelectTrigger className="w-[150px] h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  onClick={() => removeTask(task.id)}
                  className={`p-1.5 rounded-md hover:bg-gray-100 transition-colors ${
                    tasks.length <= 1 ? "invisible" : ""
                  }`}
                  tabIndex={-1}
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            ))}
          </div>

          {/* Add Task Button */}
          {tasks.length < 5 && (
            <button
              onClick={addTask}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mt-3 ml-7 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add another task
              <span className="text-gray-400 text-xs">({tasks.length}/5)</span>
            </button>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || skipping}
            className="mt-8 h-11 w-full"
            variant="brand"
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create my checklist
          </Button>
        </div>
      </div>

      {/* Right Panel - Preview */}
      <div className="hidden lg:flex w-[45%] bg-gradient-to-br from-orange-50 to-amber-50 items-center justify-center p-12">
        <div className="w-full max-w-md">
          {/* Preview Card */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200/60 overflow-hidden">
            {/* Board Header */}
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 bg-orange-500 rounded-full" />
                <span className="font-semibold text-gray-900 text-sm">{CURRENT_MONTH}</span>
              </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-[1fr_110px_100px] px-5 py-2.5 text-xs text-gray-400 font-medium border-b border-gray-50 uppercase tracking-wider">
              <span>Task</span>
              <span>Type</span>
              <span>Status</span>
            </div>

            {/* Task Rows */}
            <div className="divide-y divide-gray-50 min-h-[200px]">
              {filledTasks.length > 0 ? (
                filledTasks.map((task) => {
                  const colors = TASK_TYPE_COLORS[task.taskType]
                  const icon = TASK_TYPE_ICONS[task.taskType]
                  const label = TASK_TYPE_OPTIONS.find((o) => o.value === task.taskType)?.label
                  return (
                    <div
                      key={task.id}
                      className="grid grid-cols-[1fr_110px_100px] px-5 py-3 items-center animate-in fade-in slide-in-from-left-2 duration-200"
                    >
                      <span className="text-sm text-gray-900 truncate pr-2">{task.name}</span>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full w-fit ${colors.bg} ${colors.text}`}>
                        {icon}
                        {label}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Circle className="w-3 h-3" />
                        Not started
                      </span>
                    </div>
                  )
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-gray-300">
                  <FileText className="w-8 h-8 mb-2" />
                  <span className="text-xs">Your tasks will appear here</span>
                </div>
              )}

              {/* Placeholder rows */}
              {filledTasks.length > 0 && filledTasks.length < 3 &&
                Array.from({ length: 3 - filledTasks.length }).map((_, i) => (
                  <div
                    key={`placeholder-${i}`}
                    className="grid grid-cols-[1fr_110px_100px] px-5 py-3 items-center"
                  >
                    <div className="h-3 bg-gray-100 rounded w-24" />
                    <div className="h-3 bg-gray-100 rounded w-16" />
                    <div className="h-3 bg-gray-100 rounded w-14" />
                  </div>
                ))
              }
            </div>
          </div>

          {/* Subtle hint text */}
          <p className="text-xs text-gray-400 text-center mt-4">
            Tasks will be created on your {CURRENT_MONTH} board
          </p>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Lightbulb,
  Trash2,
  Plus,
  Save,
  Loader2,
  ArrowRight,
  Hash,
  Scale,
  Type,
  BarChart3,
  X,
} from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────

interface LearnedPattern {
  id: string
  type: "value_mapping" | "column_weight" | "description_alias" | "sign_convention" | "custom_rule"
  description: string
  details: Record<string, any>
  source: "auto" | "user"
  confidence: number
  createdFromRunId?: string
  createdAt: string
}

interface MatchingStats {
  totalRuns: number
  avgMatchRate: number
  avgManualMatchRate: number
  commonExceptionCategories: { category: string; count: number }[]
  lastRunAt: string
}

interface LearnedContext {
  patterns: LearnedPattern[]
  stats: MatchingStats
  lastLearnedFromRunId?: string
}

interface MatchingGuidelines {
  guidelines: string
  updatedAt: string
  updatedBy: string
}

interface ReconciliationLearningPanelProps {
  configId: string
  matchingGuidelines: MatchingGuidelines | null
  learnedContext: LearnedContext | null
  canEdit: boolean
  onUpdate: () => void
}

// ── Pattern type icons and labels ──────────────────────────────────────

const PATTERN_TYPE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  value_mapping: { icon: <ArrowRight className="w-3 h-3" />, label: "Value Mapping", color: "bg-blue-50 text-blue-700" },
  column_weight: { icon: <Scale className="w-3 h-3" />, label: "Column Weight", color: "bg-amber-50 text-amber-700" },
  description_alias: { icon: <Type className="w-3 h-3" />, label: "Alias", color: "bg-green-50 text-green-700" },
  sign_convention: { icon: <Hash className="w-3 h-3" />, label: "Sign Convention", color: "bg-purple-50 text-purple-700" },
  custom_rule: { icon: <Lightbulb className="w-3 h-3" />, label: "Custom Rule", color: "bg-orange-50 text-orange-700" },
}

// ── Component ──────────────────────────────────────────────────────────

export function ReconciliationLearningPanel({
  configId,
  matchingGuidelines,
  learnedContext,
  canEdit,
  onUpdate,
}: ReconciliationLearningPanelProps) {
  const [guidelines, setGuidelines] = useState(matchingGuidelines?.guidelines || "")
  const [saving, setSaving] = useState(false)
  const [addingRule, setAddingRule] = useState(false)
  const [newRuleText, setNewRuleText] = useState("")

  const patterns = learnedContext?.patterns || []
  const stats = learnedContext?.stats

  const guidelinesChanged = guidelines.trim() !== (matchingGuidelines?.guidelines || "").trim()

  // ── Save guidelines ──────────────────────────────────────────────────

  const handleSaveGuidelines = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/reconciliations/${configId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchingGuidelines: guidelines.trim()
            ? { guidelines: guidelines.trim(), updatedAt: new Date().toISOString(), updatedBy: "" }
            : null,
        }),
      })
      if (res.ok) onUpdate()
    } catch (err) {
      console.error("Failed to save guidelines:", err)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete a pattern ─────────────────────────────────────────────────

  const handleDeletePattern = async (patternId: string) => {
    const updatedPatterns = patterns.filter((p) => p.id !== patternId)
    const updatedContext: LearnedContext = {
      patterns: updatedPatterns,
      stats: stats || { totalRuns: 0, avgMatchRate: 0, avgManualMatchRate: 0, commonExceptionCategories: [], lastRunAt: "" },
      lastLearnedFromRunId: learnedContext?.lastLearnedFromRunId,
    }

    try {
      await fetch(`/api/reconciliations/${configId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learnedContext: updatedContext }),
      })
      onUpdate()
    } catch (err) {
      console.error("Failed to delete pattern:", err)
    }
  }

  // ── Add custom rule ──────────────────────────────────────────────────

  const handleAddCustomRule = async () => {
    if (!newRuleText.trim()) return

    const newPattern: LearnedPattern = {
      id: crypto.randomUUID(),
      type: "custom_rule",
      description: newRuleText.trim(),
      details: { rule: newRuleText.trim() },
      source: "user",
      confidence: 100,
      createdAt: new Date().toISOString(),
    }

    const updatedContext: LearnedContext = {
      patterns: [...patterns, newPattern],
      stats: stats || { totalRuns: 0, avgMatchRate: 0, avgManualMatchRate: 0, commonExceptionCategories: [], lastRunAt: "" },
      lastLearnedFromRunId: learnedContext?.lastLearnedFromRunId,
    }

    try {
      await fetch(`/api/reconciliations/${configId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learnedContext: updatedContext }),
      })
      setNewRuleText("")
      setAddingRule(false)
      onUpdate()
    } catch (err) {
      console.error("Failed to add custom rule:", err)
    }
  }

  return (
    <div className="space-y-4">
      {/* Guidelines */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">
            AI Matching Instructions
          </label>
          {guidelines.length > 0 && (
            <span className="text-xs text-gray-400">{guidelines.length}/2000</span>
          )}
        </div>
        <textarea
          value={guidelines}
          onChange={(e) => setGuidelines(e.target.value.slice(0, 2000))}
          disabled={!canEdit}
          placeholder="Guide the AI on how to match these sources (e.g., 'Match on cardholder, amount, and date')"
          className="w-full h-20 text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 placeholder:text-gray-300 disabled:bg-gray-50"
        />
        {canEdit && guidelinesChanged && (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSaveGuidelines}
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 text-white text-xs h-7"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
              Save
            </Button>
          </div>
        )}
      </div>

      {/* Learned Patterns */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">
            Learned Patterns
            {patterns.length > 0 && (
              <span className="text-gray-400 font-normal ml-1">({patterns.length})</span>
            )}
          </label>
          {canEdit && !addingRule && (
            <button
              onClick={() => setAddingRule(true)}
              className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add rule
            </button>
          )}
        </div>

        {patterns.length === 0 && !addingRule && (
          <p className="text-xs text-gray-400 py-2">
            No patterns yet. Patterns are auto-learned when you manually match items and complete a run.
          </p>
        )}

        {/* Pattern list */}
        <div className="space-y-1.5">
          {patterns.map((pattern) => {
            const meta = PATTERN_TYPE_META[pattern.type] || PATTERN_TYPE_META.custom_rule
            return (
              <div
                key={pattern.id}
                className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg group"
              >
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 mt-0.5 ${meta.color}`}>
                  {meta.icon}
                  {meta.label}
                </span>
                <p className="text-xs text-gray-700 flex-1 leading-relaxed">
                  {pattern.description}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-gray-400">
                    {pattern.source === "user" ? "manual" : `${pattern.confidence}%`}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => handleDeletePattern(pattern.id)}
                      className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Add custom rule form */}
        {addingRule && (
          <div className="flex items-start gap-2 p-2 border border-orange-200 rounded-lg bg-orange-50/50">
            <input
              autoFocus
              value={newRuleText}
              onChange={(e) => setNewRuleText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newRuleText.trim()) handleAddCustomRule()
                if (e.key === "Escape") { setAddingRule(false); setNewRuleText("") }
              }}
              placeholder='e.g., "JC" in invoice ref = cardholder John Collins'
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
            />
            <button
              onClick={handleAddCustomRule}
              disabled={!newRuleText.trim()}
              className="text-xs text-orange-600 hover:text-orange-700 font-medium px-2 py-1.5 disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={() => { setAddingRule(false); setNewRuleText("") }}
              className="text-gray-400 hover:text-gray-600 py-1.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      {stats && stats.totalRuns > 0 && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wider">
            Run Statistics
          </label>
          <div className="flex items-center gap-4 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <span className="flex items-center gap-1">
              <BarChart3 className="w-3 h-3" />
              {stats.totalRuns} run{stats.totalRuns !== 1 ? "s" : ""}
            </span>
            <span>
              Auto-match: <span className="font-medium text-gray-700">{Math.round(stats.avgMatchRate)}%</span>
            </span>
            <span>
              Manual: <span className="font-medium text-gray-700">{Math.round(stats.avgManualMatchRate)}%</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

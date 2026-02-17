"use client"

import {
  Send, ClipboardList, Scale, FileBarChart, Wrench, Workflow,
} from "lucide-react"
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates"
import type { AutomationTemplate } from "@/lib/automations/types"

const ICON_MAP: Record<string, typeof Send> = {
  Send, ClipboardList, Scale, FileBarChart, Wrench, Workflow,
}

// ── Component ─────────────────────────────────────────────────────────

interface TemplateSelectionStepProps {
  selectedId: string | null
  onSelect: (template: AutomationTemplate) => void
}

export function TemplateSelectionStep({ selectedId, onSelect }: TemplateSelectionStepProps) {
  // Separate "custom" from the rest — it always goes at the bottom
  const templates = AUTOMATION_TEMPLATES.filter((t) => t.id !== "custom")
  const customTemplate = AUTOMATION_TEMPLATES.find((t) => t.id === "custom")

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-1">What should this agent do?</h2>
      <p className="text-sm text-gray-500 mb-6">
        Pick a starting point. You can add approvals, extra steps, and configure triggers in the next steps.
      </p>

      <div className="grid grid-cols-1 gap-2">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            isSelected={selectedId === template.id}
            onSelect={onSelect}
          />
        ))}
      </div>

      {/* Separator */}
      <div className="my-4 border-t border-gray-100" />

      {/* Custom — always at the bottom */}
      {customTemplate && (
        <TemplateCard
          template={customTemplate}
          isSelected={selectedId === "custom"}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}

// ── Template card ─────────────────────────────────────────────────────

function TemplateCard({
  template,
  isSelected,
  onSelect,
}: {
  template: AutomationTemplate
  isSelected: boolean
  onSelect: (template: AutomationTemplate) => void
}) {
  const Icon = ICON_MAP[template.icon] || Wrench

  return (
    <button
      type="button"
      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
        isSelected
          ? "border-orange-500 bg-orange-50/50"
          : "border-gray-200 hover:border-gray-300 bg-white"
      }`}
      onClick={() => onSelect(template)}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isSelected ? "bg-orange-100" : "bg-gray-100"
        }`}>
          <Icon className={`w-5 h-5 ${isSelected ? "text-orange-600" : "text-gray-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900">{template.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
          {template.defaultSteps.length > 0 && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {template.defaultSteps.map((step, i) => (
                <span key={i} className="text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">
                  {step.label || step.actionType || step.type}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

"use client"

import {
  Send, ClipboardList, Scale, FileBarChart, Database, Wrench,
} from "lucide-react"
import { AUTOMATION_TEMPLATES } from "@/lib/automations/templates"
import type { AutomationTemplate } from "@/lib/automations/types"

const ICON_MAP: Record<string, typeof Send> = {
  Send, ClipboardList, Scale, FileBarChart, Database, Wrench,
}

// ── Component ─────────────────────────────────────────────────────────

interface TemplateSelectionStepProps {
  selectedId: string | null
  onSelect: (template: AutomationTemplate) => void
}

export function TemplateSelectionStep({ selectedId, onSelect }: TemplateSelectionStepProps) {
  const collectionTemplates = AUTOMATION_TEMPLATES.filter(
    (t) => t.category === "requests" || t.category === "forms"
  )
  const processingTemplates = AUTOMATION_TEMPLATES.filter(
    (t) => t.category === "reconciliation" || t.category === "reports"
  )

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-1">What should this agent do?</h2>
      <p className="text-sm text-gray-500 mb-6">
        Pick a starting point. You can configure triggers and settings in the next steps.
      </p>

      {/* Data Collection */}
      <div className="mb-5">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
          Data Collection
        </h3>
        <div className="grid grid-cols-1 gap-2">
          {collectionTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isSelected={selectedId === template.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>

      {/* Processing */}
      <div>
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
          Processing
        </h3>
        <div className="grid grid-cols-1 gap-2">
          {processingTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isSelected={selectedId === template.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
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
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-900">{template.name}</h3>
            {template.requiresDatabase && (
              <span className="text-[10px] text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5">
                Uses database
              </span>
            )}
          </div>
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

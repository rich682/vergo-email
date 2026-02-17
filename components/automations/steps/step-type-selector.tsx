"use client"

import { Plus } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { STEP_TYPE_CONFIGS, getStepConfigKey } from "../shared/step-type-icon"

interface StepTypeSelectorProps {
  onSelect: (type: string, actionType?: string) => void
}

const STEP_OPTIONS = [
  { type: "action", actionType: "send_request", key: "send_request" },
  { type: "action", actionType: "send_form", key: "send_form" },
  { type: "action", actionType: "complete_reconciliation", key: "complete_reconciliation" },
  { type: "action", actionType: "complete_report", key: "complete_report" },
  { type: "agent_run", key: "agent_run" },
  { type: "human_approval", key: "human_approval" },
  { type: "condition", key: "condition" },
]

export function StepTypeSelector({ onSelect }: StepTypeSelectorProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="w-full py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-orange-400 hover:text-orange-600 transition-colors flex items-center justify-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Add step
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="center">
        {STEP_OPTIONS.map((option) => {
          const config = STEP_TYPE_CONFIGS[option.key]
          if (!config) return null
          const Icon = config.icon
          return (
            <button
              key={option.key}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
              onClick={() => onSelect(option.type, option.actionType)}
            >
              <div className={`w-7 h-7 rounded-md ${config.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-3.5 h-3.5 ${config.color}`} />
              </div>
              <span>{config.label}</span>
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

"use client"

import { Info } from "lucide-react"

interface ActionCompleteReconConfigProps {
  params: Record<string, unknown>
  onChange: (params: Record<string, unknown>) => void
}

export function ActionCompleteReconConfig({ params, onChange }: ActionCompleteReconConfigProps) {
  return (
    <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-md p-3">
      <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-400" />
      <div>
        <p>This step will complete the reconciliation run from the trigger context.</p>
        <p className="mt-1">
          For best results, use this after an AI Agent step and an Approval step to ensure results are reviewed before completing.
        </p>
      </div>
    </div>
  )
}

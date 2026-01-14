"use client"

import { useState } from "react"
import { UploadStep } from "./data-personalization/upload-step"
import { ComposeSendStep } from "./data-personalization/compose-send-step"
import type { DatasetColumn, DatasetRow, DatasetValidation } from "@/lib/utils/dataset-parser"

interface DataPersonalizationFlowProps {
  jobId: string
  jobName: string
  onSuccess: () => void
  onCancel: () => void
}

type FlowStep = "upload" | "compose"

interface FlowState {
  draftId: string | null
  columns: DatasetColumn[]
  rows: DatasetRow[]
  emailColumn: string
  validation: DatasetValidation | null
}

export function DataPersonalizationFlow({
  jobId,
  jobName,
  onSuccess,
  onCancel,
}: DataPersonalizationFlowProps) {
  const [step, setStep] = useState<FlowStep>("upload")
  const [state, setState] = useState<FlowState>({
    draftId: null,
    columns: [],
    rows: [],
    emailColumn: "",
    validation: null,
  })

  // Handle upload complete
  const handleUploadComplete = (data: {
    draftId: string
    columns: DatasetColumn[]
    rows: DatasetRow[]
    emailColumn: string
    validation: DatasetValidation
  }) => {
    setState(prev => ({
      ...prev,
      draftId: data.draftId,
      columns: data.columns,
      rows: data.rows,
      emailColumn: data.emailColumn,
      validation: data.validation,
    }))
    setStep("compose")
  }

  // Handle columns change (from compose step)
  const handleColumnsChange = (columns: DatasetColumn[]) => {
    setState(prev => ({ ...prev, columns }))
  }

  // Handle back from compose
  const handleBackFromCompose = () => {
    setStep("upload")
  }

  // Step indicator
  const steps = [
    { key: "upload", label: "Upload Data" },
    { key: "compose", label: "Compose & Send" },
  ]

  const currentStepIndex = steps.findIndex(s => s.key === step)

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center justify-center">
        {steps.map((s, index) => (
          <div key={s.key} className="flex items-center">
            <div className="flex items-center">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${index <= currentStepIndex
                    ? "bg-orange-500 text-white"
                    : "bg-gray-200 text-gray-500"
                  }
                `}
              >
                {index + 1}
              </div>
              <span
                className={`
                  ml-2 text-sm
                  ${index <= currentStepIndex ? "text-gray-900 font-medium" : "text-gray-500"}
                `}
              >
                {s.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`
                  w-16 h-0.5 mx-4
                  ${index < currentStepIndex ? "bg-orange-500" : "bg-gray-200"}
                `}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {step === "upload" && (
        <UploadStep
          jobId={jobId}
          onUploadComplete={handleUploadComplete}
          onCancel={onCancel}
        />
      )}

      {step === "compose" && state.draftId && state.validation && (
        <ComposeSendStep
          jobId={jobId}
          draftId={state.draftId}
          columns={state.columns}
          rows={state.rows}
          validation={state.validation}
          onColumnsChange={handleColumnsChange}
          onBack={handleBackFromCompose}
          onSuccess={onSuccess}
        />
      )}
    </div>
  )
}

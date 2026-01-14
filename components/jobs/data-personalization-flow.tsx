"use client"

import { useState } from "react"
import { UploadStep } from "./data-personalization/upload-step"
import { DraftStep } from "./data-personalization/draft-step"
import { PreviewSendStep } from "./data-personalization/preview-send-step"
import type { DatasetColumn, DatasetRow, DatasetValidation } from "@/lib/utils/dataset-parser"

interface DataPersonalizationFlowProps {
  jobId: string
  jobName: string
  onSuccess: () => void
  onCancel: () => void
}

type FlowStep = "upload" | "draft" | "preview"

interface FlowState {
  draftId: string | null
  columns: DatasetColumn[]
  rows: DatasetRow[]
  emailColumn: string
  validation: DatasetValidation | null
  subject: string
  body: string
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
    subject: "",
    body: "",
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
    setStep("draft")
  }

  // Handle columns change (from draft step)
  const handleColumnsChange = (columns: DatasetColumn[]) => {
    setState(prev => ({ ...prev, columns }))
  }

  // Handle draft continue
  const handleDraftContinue = (data: { subject: string; body: string }) => {
    setState(prev => ({
      ...prev,
      subject: data.subject,
      body: data.body,
    }))
    setStep("preview")
  }

  // Handle back from draft
  const handleBackFromDraft = () => {
    setStep("upload")
  }

  // Handle back from preview
  const handleBackFromPreview = () => {
    setStep("draft")
  }

  // Step indicator
  const steps = [
    { key: "upload", label: "Upload Data" },
    { key: "draft", label: "Compose Email" },
    { key: "preview", label: "Preview & Send" },
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
                  w-12 h-0.5 mx-3
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

      {step === "draft" && state.draftId && state.validation && (
        <DraftStep
          jobId={jobId}
          draftId={state.draftId}
          columns={state.columns}
          rows={state.rows}
          validation={state.validation}
          onColumnsChange={handleColumnsChange}
          onContinue={handleDraftContinue}
          onBack={handleBackFromDraft}
        />
      )}

      {step === "preview" && state.draftId && state.validation && (
        <PreviewSendStep
          jobId={jobId}
          draftId={state.draftId}
          subject={state.subject}
          body={state.body}
          columns={state.columns}
          rows={state.rows}
          validation={state.validation}
          onBack={handleBackFromPreview}
          onSuccess={onSuccess}
        />
      )}
    </div>
  )
}

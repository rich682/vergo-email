"use client"

import { useState } from "react"
import { DatabaseSelectionStep } from "./data-personalization/database-selection-step"
import { ComposeSendStep } from "./data-personalization/compose-send-step"
import type { DatasetColumn, DatasetRow, DatasetValidation } from "@/lib/utils/dataset-parser"

// Database types
interface DatabaseSchemaColumn {
  key: string
  label: string
  dataType: "text" | "number" | "date" | "boolean" | "currency"
  required: boolean
  order: number
}

interface DatabaseSchema {
  columns: DatabaseSchemaColumn[]
  version: number
}

interface DatabaseRow {
  [key: string]: string | number | boolean | null
}

interface DataPersonalizationFlowProps {
  jobId: string
  jobName: string
  boardPeriod?: string | null // Period for filtering (e.g., "Q1 2026")
  onSuccess: () => void
  onCancel: () => void
}

type FlowStep = "select_database" | "compose"

interface FlowState {
  databaseId: string | null
  databaseName: string | null
  schema: DatabaseSchema | null
  rows: DatabaseRow[]
  emailColumnKey: string
  firstNameColumnKey: string
}

// Convert database schema column to dataset column format for compose step
function schemaToDatasetColumns(schema: DatabaseSchema): DatasetColumn[] {
  return schema.columns.map(col => ({
    key: col.key,
    label: col.label,
    type: col.dataType as DatasetColumn["type"],
  }))
}

// Convert database rows to dataset rows format for compose step
function dbRowsToDatasetRows(
  rows: DatabaseRow[],
  emailColumnKey: string
): DatasetRow[] {
  return rows.map(row => {
    const email = row[emailColumnKey]
    const values: Record<string, string> = {}
    
    for (const [key, value] of Object.entries(row)) {
      values[key] = value != null ? String(value) : ""
    }
    
    return {
      email: email ? String(email) : "",
      values,
      valid: !!email,
    }
  })
}

export function DataPersonalizationFlow({
  jobId,
  jobName,
  boardPeriod,
  onSuccess,
  onCancel,
}: DataPersonalizationFlowProps) {
  const [step, setStep] = useState<FlowStep>("select_database")
  const [state, setState] = useState<FlowState>({
    databaseId: null,
    databaseName: null,
    schema: null,
    rows: [],
    emailColumnKey: "",
    firstNameColumnKey: "",
  })

  // Derived data for compose step
  const columns: DatasetColumn[] = state.schema ? schemaToDatasetColumns(state.schema) : []
  const datasetRows: DatasetRow[] = state.rows.length > 0 
    ? dbRowsToDatasetRows(state.rows, state.emailColumnKey)
    : []
  const validation: DatasetValidation = {
    totalRows: state.rows.length,
    validEmails: datasetRows.filter(r => r.valid).length,
    invalidEmails: [],
    duplicates: [],
  }

  // Handle database selection complete
  const handleDatabaseSelected = (data: {
    databaseId: string
    databaseName: string
    schema: DatabaseSchema
    rows: DatabaseRow[]
    emailColumnKey: string
    firstNameColumnKey: string
    recipientCount: number
  }) => {
    setState({
      databaseId: data.databaseId,
      databaseName: data.databaseName,
      schema: data.schema,
      rows: data.rows,
      emailColumnKey: data.emailColumnKey,
      firstNameColumnKey: data.firstNameColumnKey,
    })
    setStep("compose")
  }

  // Handle columns change (from compose step)
  const handleColumnsChange = (newColumns: DatasetColumn[]) => {
    // For database mode, we don't allow adding columns
    // This handler exists for compatibility with the compose step interface
  }

  // Handle back from compose
  const handleBackFromCompose = () => {
    setStep("select_database")
  }

  // Step indicator
  const steps = [
    { key: "select_database", label: "Select Database" },
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
      {step === "select_database" && (
        <DatabaseSelectionStep
          jobId={jobId}
          boardPeriod={boardPeriod}
          onDatabaseSelected={handleDatabaseSelected}
          onCancel={onCancel}
        />
      )}

      {step === "compose" && state.schema && (
        <ComposeSendStep
          jobId={jobId}
          draftId="" // Not using draft API for database mode
          columns={columns}
          rows={datasetRows}
          validation={validation}
          onColumnsChange={handleColumnsChange}
          onBack={handleBackFromCompose}
          onSuccess={onSuccess}
          // Database-specific props
          databaseMode={{
            databaseId: state.databaseId!,
            databaseName: state.databaseName!,
            emailColumnKey: state.emailColumnKey,
            firstNameColumnKey: state.firstNameColumnKey,
            boardPeriod: boardPeriod || undefined,
          }}
        />
      )}
    </div>
  )
}

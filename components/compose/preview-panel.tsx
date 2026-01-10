"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SelectedRecipient } from "./recipient-selector"
import { X } from "lucide-react"

interface PreviewPanelProps {
  draftId: string
  recipients: SelectedRecipient[]
  subject: string
  body: string
  aiSubject?: string
  aiBody?: string
  aiStatus: "processing" | "complete" | "failed" | "timeout" | null
  subjectUserEdited: boolean
  bodyUserEdited: boolean
  onSubjectChange: (value: string) => void
  onBodyChange: (value: string) => void
  onResetSubject: () => void
  onResetBody: () => void
  onSubmit: () => void
  onSavePending?: () => void
  submitting?: boolean
}

export function PreviewPanel({
  draftId,
  recipients,
  subject,
  body,
  aiSubject,
  aiBody,
  aiStatus,
  subjectUserEdited,
  bodyUserEdited,
  onSubjectChange,
  onBodyChange,
  onResetSubject,
  onResetBody,
  onSubmit,
  onSavePending,
  submitting = false
}: PreviewPanelProps) {
  const getAiStatusBadge = () => {
    if (!aiStatus) return null
    
    const statusConfig = {
      processing: { text: "Adding AI suggestions…", color: "bg-blue-50 text-blue-700 border-blue-200" },
      complete: { text: "AI complete", color: "bg-green-50 text-green-700 border-green-200" },
      failed: { text: "AI suggestions delayed", color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
      timeout: { text: "AI suggestions delayed", color: "bg-yellow-50 text-yellow-700 border-yellow-200" }
    }
    
    const config = statusConfig[aiStatus] || statusConfig.failed
    
    return (
      <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${config.color}`}>
        {config.text}
      </div>
    )
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Preview</CardTitle>
          {getAiStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col space-y-4 overflow-auto">
        <div>
          <Label className="text-sm font-medium text-gray-700">To:</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {recipients.map((r) => (
              <span
                key={`${r.type}-${r.id}`}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm"
              >
                {r.name}
                {r.type === "group" && r.entityCount !== undefined && (
                  <span className="text-xs text-gray-500">({r.entityCount})</span>
                )}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-sm font-medium text-gray-700">Subject:</Label>
            {subjectUserEdited && aiSubject && (
              <button
                type="button"
                onClick={onResetSubject}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Reset to AI
              </button>
            )}
          </div>
          <Input
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder="Email subject..."
            className="w-full"
          />
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-1">
            <Label className="text-sm font-medium text-gray-700">Body:</Label>
            {bodyUserEdited && aiBody && (
              <button
                type="button"
                onClick={onResetBody}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Reset to AI
              </button>
            )}
          </div>
          <Textarea
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            placeholder="Email body..."
            className="flex-1 min-h-[200px]"
          />
        </div>

        <div className="flex flex-col gap-2 pt-4 border-t">
          <Button
            onClick={onSubmit}
            disabled={submitting || !subject.trim() || !body.trim()}
            className="w-full"
          >
            {submitting ? "Submitting..." : "Submit Request"}
          </Button>
          {onSavePending && (
            <Button
              onClick={onSavePending}
              disabled={submitting}
              variant="outline"
              className="w-full"
            >
              Save as Pending
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}



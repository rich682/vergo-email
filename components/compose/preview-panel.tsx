"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SelectedRecipient } from "./recipient-selector"
import { TagInput } from "./tag-input"
import { renderTemplate } from "@/lib/utils/template-renderer"
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
  // Personalization props
  availableTags?: string[]
  personalizationMode?: "none" | "contact" | "csv"
  onTagInsert?: (tag: string, field: "subject" | "body") => void
}

interface PreviewRecipient {
  email: string
  data: Record<string, string>
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
  submitting = false,
  availableTags = [],
  personalizationMode = "none",
  onTagInsert
}: PreviewPanelProps) {
  const [previewRecipients, setPreviewRecipients] = useState<PreviewRecipient[]>([])
  const [selectedPreviewRecipient, setSelectedPreviewRecipient] = useState<string | null>(null)
  const [previewSubject, setPreviewSubject] = useState<string>(subject)
  const [previewBody, setPreviewBody] = useState<string>(body)
  const [loadingRecipients, setLoadingRecipients] = useState(false)

  // Build contact fields data for contact mode (pure function, no dependencies)
  const buildContactData = (recipient: SelectedRecipient): Record<string, string> => {
    // Extract first name from full name
    const firstName = recipient.name?.split(' ')[0] || recipient.name || ""
    return {
      "First Name": firstName,
      "Email": recipient.email || ""
    }
  }

  const fetchPreviewRecipients = async () => {
    setLoadingRecipients(true)
    try {
      const response = await fetch(`/api/email-drafts/${draftId}/personalization-data`, {
        cache: 'no-store'
      })
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.sample && data.sample.length > 0) {
          // In CSV mode, show all CSV recipients (no filtering by selected contacts)
          // In contact mode, filter to only show selected recipients
          let filteredRecipients: PreviewRecipient[] = []
          
          if (personalizationMode === "csv") {
            // CSV mode: show all CSV recipients (no filtering needed)
            filteredRecipients = data.sample
          } else {
            // Contact mode: filter to only include recipients that are actually selected
            const selectedEmails = new Set(
              recipients
                .filter(r => r.type === "entity" && r.email)
                .map(r => r.email?.toLowerCase().trim())
                .filter((email): email is string => Boolean(email))
            )
            
            // Only include personalization data for selected recipients
            filteredRecipients = data.sample.filter((r: PreviewRecipient) => 
              selectedEmails.has(r.email.toLowerCase().trim())
            )
          }
          
          setPreviewRecipients(filteredRecipients)
          
          // Automatically select and render preview for the first recipient
          if (filteredRecipients.length > 0) {
            const firstRecipient = filteredRecipients[0]
            setSelectedPreviewRecipient(firstRecipient.email)
            
            // Immediately render the preview for the first recipient
            if (personalizationMode === "csv" && firstRecipient.data) {
              const subjectResult = renderTemplate(subject, firstRecipient.data)
              const bodyResult = renderTemplate(body, firstRecipient.data)
              setPreviewSubject(subjectResult.rendered)
              setPreviewBody(bodyResult.rendered)
            }
          } else {
            // No recipients found, show template
            setSelectedPreviewRecipient(null)
            setPreviewSubject(subject)
            setPreviewBody(body)
          }
        } else {
          setPreviewRecipients([])
          setSelectedPreviewRecipient(null)
          setPreviewSubject(subject)
          setPreviewBody(body)
        }
      }
    } catch (error) {
      console.error("Error fetching preview recipients:", error)
      setPreviewRecipients([])
      setSelectedPreviewRecipient(null)
      setPreviewSubject(subject)
      setPreviewBody(body)
    } finally {
      setLoadingRecipients(false)
    }
  }

  // Fetch personalization data when draftId changes and personalization is enabled
  // Also re-fetch when recipients change (to filter by selected recipients)
  useEffect(() => {
    if (personalizationMode !== "none" && draftId) {
      fetchPreviewRecipients()
    } else {
      setPreviewRecipients([])
      setSelectedPreviewRecipient(null)
      setPreviewSubject(subject)
      setPreviewBody(body)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, personalizationMode, recipients])

  // Auto-select first recipient when recipients are available and none is selected (fallback for contact mode)
  useEffect(() => {
    if (personalizationMode === "contact" && recipients.length > 0 && !selectedPreviewRecipient) {
      const firstEntityRecipient = recipients.find(r => r.type === "entity" && r.email)
      if (firstEntityRecipient) {
        setSelectedPreviewRecipient(`${firstEntityRecipient.type}-${firstEntityRecipient.id}`)
        // Render preview immediately
        const data = buildContactData(firstEntityRecipient)
        const subjectResult = renderTemplate(subject, data)
        const bodyResult = renderTemplate(body, data)
        setPreviewSubject(subjectResult.rendered)
        setPreviewBody(bodyResult.rendered)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipients, personalizationMode])

  // Update preview when template or selected recipient changes
  useEffect(() => {
    if (!selectedPreviewRecipient) {
      setPreviewSubject(subject)
      setPreviewBody(body)
      return
    }

    // Re-render preview if recipient is selected
    if (personalizationMode === "csv") {
      const recipient = previewRecipients.find(r => r.email === selectedPreviewRecipient)
      if (recipient) {
        const subjectResult = renderTemplate(subject, recipient.data)
        const bodyResult = renderTemplate(body, recipient.data)
        setPreviewSubject(subjectResult.rendered)
        setPreviewBody(bodyResult.rendered)
      }
    } else if (personalizationMode === "contact") {
      const recipient = recipients.find(r => `${r.type}-${r.id}` === selectedPreviewRecipient && r.type === "entity" && r.email)
      if (recipient) {
        const data = buildContactData(recipient)
        const subjectResult = renderTemplate(subject, data)
        const bodyResult = renderTemplate(body, data)
        setPreviewSubject(subjectResult.rendered)
        setPreviewBody(bodyResult.rendered)
      }
    }
  }, [subject, body, selectedPreviewRecipient, personalizationMode, previewRecipients, recipients])

  const handlePreviewRecipientChange = (email: string | "none") => {
    if (email === "none") {
      setSelectedPreviewRecipient(null)
      setPreviewSubject(subject)
      setPreviewBody(body)
      return
    }

    const recipient = previewRecipients.find(r => r.email === email)
    if (!recipient) return

    setSelectedPreviewRecipient(email)

    // Render templates with recipient data
    const subjectResult = renderTemplate(subject, recipient.data)
    const bodyResult = renderTemplate(body, recipient.data)

    setPreviewSubject(subjectResult.rendered)
    setPreviewBody(bodyResult.rendered)
  }

  // Handle contact mode preview
  const handleContactPreviewChange = (recipientId: string | "none") => {
    if (recipientId === "none") {
      setSelectedPreviewRecipient(null)
      setPreviewSubject(subject)
      setPreviewBody(body)
      return
    }

    const recipient = recipients.find(r => `${r.type}-${r.id}` === recipientId)
    if (!recipient) return

    setSelectedPreviewRecipient(recipientId)
    const data = buildContactData(recipient)

    const subjectResult = renderTemplate(subject, data)
    const bodyResult = renderTemplate(body, data)

    setPreviewSubject(subjectResult.rendered)
    setPreviewBody(bodyResult.rendered)
  }

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

  // Use preview values if a recipient is selected, otherwise use template values
  const displaySubject = selectedPreviewRecipient ? previewSubject : subject
  const displayBody = selectedPreviewRecipient ? previewBody : body

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle>Preview</CardTitle>
          {getAiStatusBadge()}
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 space-y-4 overflow-hidden">
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
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

          {/* Preview as recipient dropdown */}
          {personalizationMode !== "none" && (
            <div>
              <Label className="text-sm font-medium text-gray-700">Preview as recipient:</Label>
              <Select
                value={selectedPreviewRecipient || "none"}
                onValueChange={(value) => {
                  if (personalizationMode === "csv") {
                    handlePreviewRecipientChange(value)
                  } else if (personalizationMode === "contact") {
                    handleContactPreviewChange(value)
                  }
                }}
              >
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Select a recipient to preview" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Template (no preview)</SelectItem>
                  {personalizationMode === "csv" && (
                    <>
                      {loadingRecipients ? (
                        <SelectItem value="loading" disabled>Loading recipients...</SelectItem>
                      ) : (
                        previewRecipients.map((r) => (
                          <SelectItem key={r.email} value={r.email}>
                            {r.email}
                          </SelectItem>
                        ))
                      )}
                    </>
                  )}
                  {personalizationMode === "contact" && (
                    <>
                      {recipients
                        .filter((r) => r.type === "entity" && r.email)
                        .map((r) => (
                          <SelectItem key={`${r.type}-${r.id}`} value={`${r.type}-${r.id}`}>
                            {r.name} ({r.email})
                          </SelectItem>
                        ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {selectedPreviewRecipient && (
                <p className="text-xs text-gray-500 mt-1">
                  Showing rendered preview. Missing tags are marked as [MISSING: Tag].
                </p>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-sm font-medium text-gray-700">Subject:</Label>
              {!selectedPreviewRecipient && subjectUserEdited && aiSubject && (
                <button
                  type="button"
                  onClick={onResetSubject}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Reset to AI
                </button>
              )}
            </div>
            {selectedPreviewRecipient ? (
              // Preview mode: show rendered content as read-only
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm whitespace-pre-wrap">
                {displaySubject}
              </div>
            ) : personalizationMode !== "none" && availableTags && availableTags.length > 0 ? (
              <TagInput
                value={subject}
                onChange={onSubjectChange}
                availableTags={availableTags}
                placeholder="Email subject..."
                className="w-full"
              />
            ) : (
              <Input
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
                placeholder="Email subject..."
                className="w-full"
              />
            )}
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-sm font-medium text-gray-700">Body:</Label>
              {!selectedPreviewRecipient && bodyUserEdited && aiBody && (
                <button
                  type="button"
                  onClick={onResetBody}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Reset to AI
                </button>
              )}
            </div>
            {selectedPreviewRecipient ? (
              // Preview mode: show rendered content as read-only
              <div className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm whitespace-pre-wrap overflow-auto min-h-[200px]">
                {displayBody}
              </div>
            ) : personalizationMode !== "none" && availableTags && availableTags.length > 0 ? (
              <TagInput
                value={body}
                onChange={onBodyChange}
                availableTags={availableTags}
                placeholder="Email body..."
                multiline
                rows={8}
                className="flex-1 min-h-[200px] resize-none"
              />
            ) : (
              <Textarea
                value={body}
                onChange={(e) => onBodyChange(e.target.value)}
                placeholder="Email body..."
                className="flex-1 min-h-[200px] resize-none"
                rows={8}
              />
            )}
          </div>
        </div>

        <div className="flex-shrink-0 flex flex-col gap-2 pt-4 border-t bg-white">
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



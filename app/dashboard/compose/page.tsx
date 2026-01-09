"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RecipientSelector, SelectedRecipient } from "@/components/compose/recipient-selector"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getRequestGrouping } from "@/lib/requestGrouping"

function ComposePageContent() {
  const searchParams = useSearchParams()
  const isRequestMode = searchParams.get('mode') === 'request'
  const [prompt, setPrompt] = useState("")
  const [selectedRecipients, setSelectedRecipients] = useState<SelectedRecipient[]>([])
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<any>(null)
  const [warning, setWarning] = useState<{ externalCount: number; internalCount: number } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false)
  const [scheduleDateTime, setScheduleDateTime] = useState("")
  const [selectedGroupId, setSelectedGroupId] = useState<string>("")
  const [scheduleName, setScheduleName] = useState("")
  const [availableGroups, setAvailableGroups] = useState<Array<{ id: string; name: string }>>([])
  const [scheduling, setScheduling] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [emailAccounts, setEmailAccounts] = useState<Array<{ id: string; email: string; provider: string }>>([])
  const [selectedEmailAccountId, setSelectedEmailAccountId] = useState<string | undefined>(undefined)
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [requestNameError, setRequestNameError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) return

    setLoading(true)
    try {
      // Convert selected recipients to API format
      const recipientsData = selectedRecipients.length > 0 ? {
        entityIds: selectedRecipients.filter(r => r.type === "entity").map(r => r.id),
        groupIds: selectedRecipients.filter(r => r.type === "group").map(r => r.id)
      } : undefined

      const response = await fetch("/api/email-drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt,
          selectedRecipients: recipientsData
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate draft")
      }

      const data = await response.json()
      
      // If draft is already completed (synchronous generation), use it directly
      if (data.status === "completed" && data.draft) {
        setDraft({
          id: data.id,
          ...data.draft,
          campaignName: data.draft.suggestedCampaignName || undefined
        })
        setLoading(false)
        return
      }
      
      // Otherwise poll for draft completion (async generation)
      const pollDraft = async () => {
        const draftResponse = await fetch(`/api/email-drafts/${data.id}`)
        const draftData = await draftResponse.json()
        
        if (draftData.generatedSubject) {
          setDraft({
            ...draftData,
            campaignName: draftData.suggestedCampaignName || undefined
          })
          setLoading(false)
        } else {
          setTimeout(pollDraft, 1000)
        }
      }
      
      pollDraft()
    } catch (error: any) {
      console.error("Error generating draft:", error)
      alert(error.message || "Failed to generate draft")
      setLoading(false)
    }
  }

  const checkWarning = async () => {
    if (!draft?.suggestedRecipients) return null

    // Note: Campaign warnings API was removed. This functionality can be re-implemented
    // if needed by checking entity domains directly
    return null
  }

  const handleSend = async () => {
    if (!draft || sending) return

    // Validate Request Name in request mode
    if (isRequestMode) {
      const requestName = (draft.campaignName || "").trim()
      if (!requestName) {
        setRequestNameError("Request name is required")
        return
      }
      setRequestNameError(null)
    }

    // Check for external recipients if not already confirmed
    if (!confirmed) {
      const warningData = await checkWarning()
      if (warningData) {
        setWarning(warningData)
        return
      }
    }

    setSending(true)
    setSendError(null)

    try {
      const response = await fetch(`/api/email-drafts/${draft.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: draft.suggestedRecipients,
          campaignName: draft.campaignName || undefined,
          emailAccountId: selectedEmailAccountId
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to send email" }))
        throw new Error(errorData.error || `Failed to send email: ${response.statusText}`)
      }

      const result = await response.json()
      
      // In request mode, redirect to request detail page
      if (isRequestMode && draft.campaignName) {
        const requestName = draft.campaignName.trim()
        const grouping = getRequestGrouping({
          campaignName: requestName,
          campaignType: null,
          id: '',
          latestOutboundSubject: draft.generatedSubject || null
        })
        const encodedKey = encodeURIComponent(grouping.groupKey)
        
        // Get recipient count from draft
        const entityCount = draft.suggestedRecipients?.entityIds?.length || 0
        const groupCount = draft.suggestedRecipients?.groupIds?.length || 0
        // Note: We can't get exact count without fetching groups, so use entity count as estimate
        const estimatedRecipientCount = entityCount + (groupCount > 0 ? 1 : 0) // Rough estimate
        
        // Show toast notification (simple alert for now, can be enhanced)
        const toastMessage = `Request created\n"${requestName}" • 0/${estimatedRecipientCount || entityCount} complete`
        alert(toastMessage)
        
        // Redirect to request detail page
        window.location.href = `/dashboard/requests/${encodedKey}`
      } else if (isRequestMode) {
        // Fallback: redirect to requests list if no request name
        window.location.href = "/dashboard/requests"
      } else {
        // Non-request mode: redirect to inbox
        window.location.href = "/dashboard/inbox"
      }
    } catch (error: any) {
      console.error("Error sending email:", error)
      setSendError(error.message || "Failed to send email. Please try again.")
      setSending(false)
    }
  }

  const handleProceed = () => {
    setConfirmed(true)
    setWarning(null)
    handleSend()
  }

  const handleCancel = () => {
    setWarning(null)
    setConfirmed(false)
  }

  // Fetch groups when draft is available
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        setAccountsLoading(true)
        const res = await fetch("/api/email-accounts")
        if (res.ok) {
          const data = await res.json()
          setEmailAccounts(data)
          if (data.length > 0) {
            setSelectedEmailAccountId(data[0].id)
          }
        }
      } catch (e) {
        console.error("Error loading email accounts", e)
      } finally {
        setAccountsLoading(false)
      }
    }
    loadAccounts()
  }, [])

  useEffect(() => {
    if (draft?.suggestedRecipients) {
      const fetchGroups = async () => {
        try {
          const response = await fetch("/api/groups")
          if (response.ok) {
            const groups = await response.json()
            // Filter to only groups that are in the draft recipients
            const recipientGroupIds = draft.suggestedRecipients.groupIds || []
            const filteredGroups = groups.filter((g: any) => recipientGroupIds.includes(g.id))
            setAvailableGroups(filteredGroups)
            
            // Auto-select if only one group
            if (filteredGroups.length === 1) {
              setSelectedGroupId(filteredGroups[0].id)
            }
          }
        } catch (error) {
          console.error("Error fetching groups:", error)
        }
      }
      fetchGroups()
    }
  }, [draft])

  const handleScheduleClick = () => {
    if (!draft) return
    
    // Set default schedule name
    const defaultName = draft.campaignName || draft.generatedSubject || "Scheduled Email"
    setScheduleName(defaultName)
    
    // Set default date/time to 1 hour from now
    const defaultDate = new Date()
    defaultDate.setHours(defaultDate.getHours() + 1)
    defaultDate.setMinutes(0)
    setScheduleDateTime(defaultDate.toISOString().slice(0, 16))
    
    setScheduleError(null)
    setScheduleDialogOpen(true)
  }

  const handleSchedule = async () => {
    if (!draft || !scheduleDateTime || !selectedGroupId || !scheduleName.trim()) {
      setScheduleError("Please fill in all required fields")
      return
    }

    const scheduleDate = new Date(scheduleDateTime)
    if (scheduleDate <= new Date()) {
      setScheduleError("Schedule date/time must be in the future")
      return
    }

    setScheduling(true)
    setScheduleError(null)

    try {
      const response = await fetch(`/api/email-drafts/${draft.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleDateTime: scheduleDate.toISOString(),
          groupId: selectedGroupId,
          scheduleName: scheduleName.trim()
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to schedule email" }))
        throw new Error(errorData.error || `Failed to schedule email: ${response.statusText}`)
      }

      // Success - close dialog and redirect
      setScheduleDialogOpen(false)
      if (isRequestMode) {
        window.location.href = "/dashboard/requests"
      } else {
        window.location.href = "/dashboard/inbox"
      }
    } catch (error: any) {
      console.error("Error scheduling email:", error)
      setScheduleError(error.message || "Failed to schedule email. Please try again.")
      setScheduling(false)
    }
  }

  return (
    <div className="w-full h-full flex flex-col border-l border-r border-gray-200">
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h2 className="text-2xl font-bold">{isRequestMode ? "Create Request" : "Compose Email"}</h2>
          <p className="text-sm text-gray-600">
            {isRequestMode ? "Send a request and track completion" : "Describe what you want to send in natural language"}
          </p>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-gray-50 border-t border-gray-200">
        <div className="p-6 space-y-6">

      <Card>
        <CardHeader>
          <CardTitle>Natural Language Input</CardTitle>
          <CardDescription>
            Example: "send email to my employees asking for expense reports"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>{isRequestMode ? "Who needs to respond?" : "To (Optional - type / to search)"}</Label>
            <RecipientSelector
              selectedRecipients={selectedRecipients}
              onRecipientsChange={setSelectedRecipients}
            />
          </div>
          <div>
            <Label>{isRequestMode ? "What are you requesting?" : "Message"}</Label>
            <Textarea
              placeholder={isRequestMode ? "Please submit your W-9 form for tax year 2023..." : "Describe the email you want to send..."}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
            />
          </div>
          <Button onClick={handleGenerate} disabled={loading || !prompt.trim()}>
            {loading ? "Generating..." : "Generate Draft"}
          </Button>
        </CardContent>
      </Card>

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle>Review Draft</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {warning && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm font-medium text-yellow-800">
                  Warning: This email will be sent to {warning.externalCount} external contact(s) and {warning.internalCount} internal contact(s).
                </p>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" onClick={handleProceed}>
                    Proceed
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            <div>
              <Label>From</Label>
              {accountsLoading ? (
                <div className="text-sm text-gray-500">Loading inboxes...</div>
              ) : emailAccounts.length <= 1 ? (
                <div className="text-sm text-gray-700">
                  {emailAccounts[0]?.email || "No connected inbox"}
                </div>
              ) : (
                <Select
                  value={selectedEmailAccountId}
                  onValueChange={(val) => setSelectedEmailAccountId(val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select inbox" />
                  </SelectTrigger>
                  <SelectContent>
                    {emailAccounts.map((acct) => (
                      <SelectItem key={acct.id} value={acct.id}>
                        {acct.email} ({acct.provider})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>{isRequestMode ? "Email Subject" : "Subject"}</Label>
              <Input
                value={draft.generatedSubject || ""}
                onChange={(e) => setDraft({ ...draft, generatedSubject: e.target.value })}
              />
              {isRequestMode && (
                <p className="text-xs text-gray-500 mt-1">This is the subject line of the email sent to recipients</p>
              )}
            </div>
            <div>
              <Label>{isRequestMode ? "What are you requesting?" : "Body"}</Label>
              <Textarea
                value={draft.generatedBody || ""}
                onChange={(e) => setDraft({ ...draft, generatedBody: e.target.value })}
                rows={10}
              />
            </div>
            <div>
              <Label>
                {isRequestMode ? "Request Name" : "Campaign Name (Optional)"}
                {isRequestMode && <span className="text-red-500 ml-1">*</span>}
              </Label>
              <Input
                placeholder={isRequestMode ? "e.g., W-9 Collection, Expense Reports Q4" : "e.g., W-9 Collection, Expense Reports"}
                value={draft.campaignName || ""}
                onChange={(e) => {
                  setDraft({ ...draft, campaignName: e.target.value || undefined })
                  if (requestNameError) setRequestNameError(null)
                }}
              />
              {isRequestMode && (
                <p className="text-xs text-gray-500 mt-1">This groups all recipients for this request</p>
              )}
              {requestNameError && (
                <p className="text-xs text-red-600 mt-1">{requestNameError}</p>
              )}
            </div>
            {sendError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm font-medium text-red-800">{sendError}</p>
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleSend} disabled={!!warning || sending}>
                {sending ? (isRequestMode ? "Sending Request..." : "Sending...") : (isRequestMode ? "Send Request" : "Approve & Send")}
              </Button>
              <Button variant="outline" disabled={sending} onClick={handleScheduleClick}>
                {isRequestMode ? "Schedule Request" : "Approve & Schedule"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRequestMode ? "Schedule Request" : "Schedule Email"}</DialogTitle>
            <DialogDescription>
              Choose when to send this {isRequestMode ? "request" : "email"}. The {isRequestMode ? "request" : "email"} will be sent to all members of the selected group.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="scheduleName">Schedule Name</Label>
              <Input
                id="scheduleName"
                value={scheduleName}
                onChange={(e) => setScheduleName(e.target.value)}
                placeholder="e.g., Monthly Expense Report"
              />
            </div>
            <div>
              <Label htmlFor="scheduleGroup">Group</Label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger id="scheduleGroup">
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  {availableGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableGroups.length === 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  No groups found in recipients. Please select a group when composing.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="scheduleDateTime">Date & Time</Label>
              <Input
                id="scheduleDateTime"
                type="datetime-local"
                value={scheduleDateTime}
                onChange={(e) => setScheduleDateTime(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
            {scheduleError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm font-medium text-red-800">{scheduleError}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleDialogOpen(false)} disabled={scheduling}>
              Cancel
            </Button>
            <Button onClick={handleSchedule} disabled={scheduling || !scheduleDateTime || !selectedGroupId || !scheduleName.trim()}>
              {scheduling ? "Scheduling..." : "Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </div>
  )
}

export default function ComposePage() {
  return (
    <Suspense fallback={
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    }>
      <ComposePageContent />
    </Suspense>
  )
}


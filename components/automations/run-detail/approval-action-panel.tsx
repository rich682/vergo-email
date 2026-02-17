"use client"

import { useState } from "react"
import { ShieldCheck, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ApprovalActionPanelProps {
  runId: string
  stepId: string
  approvalMessage?: string
  onApproved: () => void
}

export function ApprovalActionPanel({
  runId,
  stepId,
  approvalMessage,
  onApproved,
}: ApprovalActionPanelProps) {
  const [submitting, setSubmitting] = useState(false)
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null)

  const handleDecision = async (d: "approved" | "rejected") => {
    setSubmitting(true)
    setDecision(d)
    try {
      const res = await fetch(`/api/workflow-runs/${runId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId, decision: d }),
      })
      if (res.ok) {
        onApproved()
      }
    } catch {
      // Handle error
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="border-2 border-orange-300 bg-orange-50 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-5 h-5 text-orange-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-orange-800">Approval Required</h3>
          <p className="text-sm text-orange-700 mt-1">
            {approvalMessage || "This workflow requires your approval to continue."}
          </p>
          <div className="flex items-center gap-3 mt-3">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => handleDecision("approved")}
              disabled={submitting}
            >
              {submitting && decision === "approved" && (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => handleDecision("rejected")}
              disabled={submitting}
            >
              {submitting && decision === "rejected" && (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              )}
              Reject
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

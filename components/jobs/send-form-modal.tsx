"use client"

/**
 * Send Form Modal
 *
 * A simplified modal that wraps FormRequestFlow for sending forms
 * directly from the Forms tab. Skips the mode selection step entirely.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { FormRequestFlow } from "./form-request-flow"
import { formatPeriodDisplay } from "@/lib/utils/timezone"

interface SendFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobId: string
  jobName: string
  dueDate: string | null
  board?: {
    id: string
    name: string
    cadence: string | null
    periodStart: string | null
    periodEnd: string | null
  } | null
  onSuccess: () => void
}

export function SendFormModal({
  open,
  onOpenChange,
  jobId,
  jobName,
  dueDate,
  board,
  onSuccess,
}: SendFormModalProps) {
  const boardPeriod =
    board?.periodStart && board?.cadence
      ? formatPeriodDisplay(
          board.periodStart,
          board.periodEnd,
          board.cadence as any,
          "UTC"
        )
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Form</DialogTitle>
          <DialogDescription>
            Select a form template, choose recipients, and configure delivery options.
          </DialogDescription>
        </DialogHeader>
        <FormRequestFlow
          jobId={jobId}
          jobName={jobName}
          boardPeriod={boardPeriod}
          deadlineDate={dueDate}
          onSuccess={() => {
            onOpenChange(false)
            onSuccess()
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

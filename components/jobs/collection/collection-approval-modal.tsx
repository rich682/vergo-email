"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { CheckCircle, XCircle, FileText, Loader2 } from "lucide-react"

interface CollectedItem {
  id: string
  filename: string
  submittedBy: string | null
  submittedByName: string | null
  receivedAt: string
}

interface CollectionApprovalModalProps {
  item: CollectedItem
  action: "approve" | "reject"
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason?: string) => void
}

export function CollectionApprovalModal({
  item,
  action,
  isOpen,
  onClose,
  onConfirm
}: CollectionApprovalModalProps) {
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm(action === "reject" ? reason : undefined)
    } finally {
      setLoading(false)
      setReason("")
    }
  }

  const handleClose = () => {
    if (loading) return
    setReason("")
    onClose()
  }

  const isApprove = action === "approve"

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isApprove ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-600" />
                Approve Item
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-red-600" />
                Reject Item
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isApprove
              ? "Confirm that this item meets the requirements."
              : "Provide a reason for rejecting this item."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Item Info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
              <FileText className="w-5 h-5 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{item.filename}</p>
              <p className="text-sm text-gray-500">
                From: {item.submittedByName || item.submittedBy || "Unknown"}
              </p>
            </div>
          </div>

          {/* Rejection Reason */}
          {!isApprove && (
            <div className="space-y-2">
              <Label htmlFor="reason">Rejection Reason</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this item is being rejected..."
                rows={3}
              />
              <p className="text-xs text-gray-500">
                This reason will be visible to team members reviewing this item.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || (!isApprove && !reason.trim())}
            className={isApprove ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isApprove ? "Approving..." : "Rejecting..."}
              </>
            ) : (
              <>
                {isApprove ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </>
                )}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

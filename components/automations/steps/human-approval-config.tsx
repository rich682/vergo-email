"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"

interface HumanApprovalConfigProps {
  approvalMessage?: string
  notifyUserIds?: string[]
  timeoutHours?: number
  onMessageChange: (message: string) => void
  onUserIdsChange: (ids: string[]) => void
  onTimeoutChange: (hours: number) => void
}

interface TeamMember {
  id: string
  name: string | null
  email: string | null
}

export function HumanApprovalConfig({
  approvalMessage = "",
  notifyUserIds = [],
  timeoutHours = 48,
  onMessageChange,
  onUserIdsChange,
  onTimeoutChange,
}: HumanApprovalConfigProps) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/org/members")
      .then((r) => r.ok ? r.json() : { members: [] })
      .then((data) => setMembers(data.members || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const toggleUser = (userId: string) => {
    if (notifyUserIds.includes(userId)) {
      onUserIdsChange(notifyUserIds.filter((id) => id !== userId))
    } else {
      onUserIdsChange([...notifyUserIds, userId])
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-gray-500">Approval Message</Label>
        <Textarea
          value={approvalMessage}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder="Please review the results before proceeding..."
          className="mt-1 text-sm"
          rows={2}
        />
        <p className="text-[11px] text-gray-400 mt-1">
          This message will be shown to approvers when they review this step.
        </p>
      </div>

      <div>
        <Label className="text-xs text-gray-500">Approvers</Label>
        <div className="mt-1 border border-gray-200 rounded-md max-h-40 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2 text-xs text-gray-400">Loading team members...</div>
          ) : members.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">No team members found</div>
          ) : (
            members.map((member) => (
              <label
                key={member.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={notifyUserIds.includes(member.id)}
                  onChange={() => toggleUser(member.id)}
                  className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-700">{member.name || member.email}</span>
              </label>
            ))
          )}
        </div>
        {notifyUserIds.length === 0 && (
          <p className="text-[11px] text-orange-600 mt-1">At least one approver is required.</p>
        )}
      </div>

      <div>
        <Label className="text-xs text-gray-500">Timeout</Label>
        <div className="flex items-center gap-2 mt-1">
          <Input
            type="number"
            value={timeoutHours}
            onChange={(e) => onTimeoutChange(parseInt(e.target.value) || 48)}
            className="w-20 text-sm"
            min={1}
            max={720}
          />
          <span className="text-sm text-gray-500">hours</span>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          The workflow will be cancelled if not approved within this time.
        </p>
      </div>
    </div>
  )
}

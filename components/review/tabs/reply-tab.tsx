"use client"

interface ReplyTabProps {
  data: any
  onRefresh?: () => void
}

export function ReplyTab({ data, onRefresh }: ReplyTabProps) {
  return (
    <div className="p-4">
      <p className="text-gray-500">Reply content coming soon</p>
    </div>
  )
}

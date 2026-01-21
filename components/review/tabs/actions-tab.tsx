"use client"

interface ActionsTabProps {
  data: any
  onRefresh?: () => void
}

export function ActionsTab({ data, onRefresh }: ActionsTabProps) {
  return (
    <div className="p-4">
      <p className="text-gray-500">Actions content coming soon</p>
    </div>
  )
}

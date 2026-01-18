"use client"

import { 
  FileText, 
  FileImage, 
  FileSpreadsheet, 
  File, 
  Archive,
  Check,
  X,
  Clock
} from "lucide-react"

interface Attachment {
  id: string
  filename: string
  fileKey: string
  fileUrl: string | null
  fileSize: number | null
  mimeType: string | null
  source: string
  status: string
  receivedAt: string
}

interface AttachmentRailProps {
  attachments: Attachment[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File
  if (mimeType.startsWith("image/")) return FileImage
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return FileSpreadsheet
  if (mimeType.includes("pdf")) return FileText
  if (mimeType.includes("zip") || mimeType.includes("archive")) return Archive
  return File
}

function getIconColor(mimeType: string | null) {
  if (!mimeType) return "text-gray-400"
  if (mimeType.startsWith("image/")) return "text-blue-500"
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "text-green-500"
  if (mimeType.includes("pdf")) return "text-red-500"
  if (mimeType.includes("zip") || mimeType.includes("archive")) return "text-yellow-500"
  return "text-gray-400"
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "APPROVED":
      return <Check className="w-3 h-3 text-green-500" />
    case "REJECTED":
      return <X className="w-3 h-3 text-red-500" />
    default:
      return <Clock className="w-3 h-3 text-amber-500" />
  }
}

export function AttachmentRail({ attachments, selectedId, onSelect }: AttachmentRailProps) {
  if (attachments.length === 0) return null

  return (
    <div className="border-t border-b border-gray-200 bg-gray-50">
      <div className="px-4 py-2 border-b border-gray-200">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Attachments ({attachments.length})
        </span>
      </div>
      <div className="p-2 flex gap-2 overflow-x-auto">
        {attachments.map((attachment) => {
          const Icon = getFileIcon(attachment.mimeType)
          const iconColor = getIconColor(attachment.mimeType)
          const isSelected = attachment.id === selectedId

          return (
            <button
              key={attachment.id}
              onClick={() => onSelect(attachment.id)}
              className={`flex-shrink-0 w-32 p-2 rounded-lg border-2 transition-all text-left ${
                isSelected
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-5 h-5 ${iconColor}`} />
                <StatusIcon status={attachment.status} />
              </div>
              <p className="text-xs font-medium text-gray-900 truncate" title={attachment.filename}>
                {attachment.filename}
              </p>
              {attachment.fileSize && (
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {formatFileSize(attachment.fileSize)}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

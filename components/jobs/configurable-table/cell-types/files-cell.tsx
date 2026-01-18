"use client"

import { Paperclip, Upload, ExternalLink } from "lucide-react"
import Link from "next/link"

interface FilesCellProps {
  jobId: string
  fileCount: number
  className?: string
}

export function FilesCell({ jobId, fileCount, className = "" }: FilesCellProps) {
  return (
    <Link
      href={`/dashboard/jobs/${jobId}?tab=collection`}
      className={`flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-50 transition-colors ${className}`}
    >
      <Paperclip className="w-4 h-4 text-gray-400" />
      {fileCount > 0 ? (
        <span className="text-sm text-gray-700">{fileCount} file{fileCount !== 1 ? "s" : ""}</span>
      ) : (
        <span className="text-sm text-gray-400">No files</span>
      )}
      {fileCount > 0 && (
        <ExternalLink className="w-3 h-3 text-gray-400 ml-1" />
      )}
    </Link>
  )
}

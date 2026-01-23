"use client"

import { Database, FileSpreadsheet, Minus } from "lucide-react"

interface DataStatusCellProps {
  value?: "none" | "schema_only" | "has_data"
}

export function DataStatusCell({ value }: DataStatusCellProps) {
  switch (value) {
    case "has_data":
      return (
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 text-green-700">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Data</span>
          </div>
        </div>
      )
    
    case "schema_only":
      return (
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
            <Database className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Schema</span>
          </div>
        </div>
      )
    
    case "none":
    default:
      return (
        <div className="flex items-center justify-center text-gray-300">
          <Minus className="w-4 h-4" />
        </div>
      )
  }
}

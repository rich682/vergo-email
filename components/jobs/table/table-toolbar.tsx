"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Upload,
  Search,
  Settings,
  RefreshCw,
  Download,
  Filter,
  Clock,
  User,
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Shield,
} from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import { RowDeltaType } from "./table-row"

interface ImportMetadata {
  lastImportedAt?: string
  lastImportedBy?: string
  importSource?: string
  rowsAdded?: number
  rowsUpdated?: number
  rowsRemoved?: number
}

interface VerificationProgress {
  totalRows: number
  verifiedRows: number
  percentComplete: number
  statusColumn?: string
}

interface DatasetSignoff {
  signedOffAt: string
  signedOffByEmail: string
  signedOffByName?: string
}

interface TableToolbarProps {
  // Search
  searchQuery: string
  onSearchChange: (query: string) => void

  // Filter
  filterDeltaType: RowDeltaType | "all"
  onFilterChange: (filter: RowDeltaType | "all") => void
  showDeltaFilter?: boolean

  // Actions
  onImportClick: () => void
  onSchemaClick: () => void
  onRefresh: () => void
  onExport?: () => void
  onSignOff?: () => void

  // Import metadata
  importMetadata?: ImportMetadata

  // Verification & Sign-off
  verificationProgress?: VerificationProgress
  datasetSignoff?: DatasetSignoff
  completionRule?: "NO_REQUIREMENT" | "DATASET_SIGNOFF" | "ALL_ROWS_VERIFIED"

  // Ad-hoc mode
  isAdHoc?: boolean
  onConvertToRecurring?: () => void

  // Row counts
  totalRows: number
  filteredRows: number

  // Disabled states
  isSnapshot?: boolean
}

export function TableToolbar({
  searchQuery,
  onSearchChange,
  filterDeltaType,
  onFilterChange,
  showDeltaFilter = false,
  onImportClick,
  onSchemaClick,
  onRefresh,
  onExport,
  onSignOff,
  importMetadata,
  verificationProgress,
  datasetSignoff,
  completionRule = "NO_REQUIREMENT",
  isAdHoc,
  onConvertToRecurring,
  totalRows,
  filteredRows,
  isSnapshot,
}: TableToolbarProps) {
  const showSignOffSection = completionRule !== "NO_REQUIREMENT" && !isSnapshot

  return (
    <div className="space-y-3">
      {/* Verification Progress & Sign-off Banner */}
      {showSignOffSection && (
        <div className={`flex items-center justify-between gap-4 px-4 py-3 rounded-lg border ${
          datasetSignoff 
            ? "bg-green-50 border-green-200" 
            : "bg-purple-50 border-purple-200"
        }`}>
          <div className="flex items-center gap-4">
            {/* Sign-off status */}
            {datasetSignoff ? (
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="w-5 h-5" />
                <div>
                  <span className="font-medium">Dataset Signed Off</span>
                  <span className="text-xs ml-2">
                    by {datasetSignoff.signedOffByName || datasetSignoff.signedOffByEmail},{" "}
                    {formatDistanceToNow(new Date(datasetSignoff.signedOffAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-purple-700">
                <Shield className="w-5 h-5" />
                <span className="font-medium">
                  {completionRule === "DATASET_SIGNOFF" 
                    ? "Dataset sign-off required" 
                    : "Row verification required"}
                </span>
              </div>
            )}

            {/* Verification progress (when applicable) */}
            {verificationProgress && (
              <div className="flex items-center gap-2 text-sm">
                <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${
                      verificationProgress.percentComplete === 100 
                        ? "bg-green-500" 
                        : "bg-purple-500"
                    }`}
                    style={{ width: `${verificationProgress.percentComplete}%` }}
                  />
                </div>
                <span className={datasetSignoff ? "text-green-600" : "text-purple-600"}>
                  {verificationProgress.verifiedRows} of {verificationProgress.totalRows} verified ({verificationProgress.percentComplete}%)
                </span>
              </div>
            )}
          </div>

          {/* Sign-off button */}
          {!datasetSignoff && onSignOff && completionRule === "DATASET_SIGNOFF" && (
            <Button
              size="sm"
              onClick={onSignOff}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              Sign Off on Dataset
            </Button>
          )}
        </div>
      )}

      {/* Ad-hoc limitation banner */}
      {isAdHoc && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 text-blue-700">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">
              This is a one-time task. Convert to recurring to unlock period-over-period comparisons.
            </span>
          </div>
          {onConvertToRecurring && (
            <Button
              variant="outline"
              size="sm"
              className="text-blue-600 border-blue-300 hover:bg-blue-100"
              onClick={onConvertToRecurring}
            >
              Convert to Recurring
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      )}

      {/* Main toolbar row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search rows..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 w-64"
            />
          </div>

          {/* Delta type filter (for compare view) */}
          {showDeltaFilter && (
            <Select
              value={filterDeltaType}
              onValueChange={(v) => onFilterChange(v as RowDeltaType | "all")}
            >
              <SelectTrigger className="w-[140px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rows</SelectItem>
                <SelectItem value="CHANGED">Changed</SelectItem>
                <SelectItem value="ADDED">Added</SelectItem>
                <SelectItem value="REMOVED">Removed</SelectItem>
                <SelectItem value="UNCHANGED">Unchanged</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Row count */}
          <span className="text-sm text-gray-500">
            {filteredRows === totalRows
              ? `${totalRows} rows`
              : `${filteredRows} of ${totalRows} rows`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Import metadata display */}
          {importMetadata?.lastImportedAt && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg text-xs text-gray-600">
              <Clock className="w-3 h-3" />
              <span>
                Last import:{" "}
                {formatDistanceToNow(new Date(importMetadata.lastImportedAt), {
                  addSuffix: true,
                })}
              </span>
              {importMetadata.importSource && (
                <span className="text-gray-400">
                  from {importMetadata.importSource}
                </span>
              )}
            </div>
          )}

          {/* Refresh button */}
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw className="w-4 h-4" />
          </Button>

          {/* Export button */}
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
          )}

          {/* Schema settings button */}
          <Button variant="outline" size="sm" onClick={onSchemaClick}>
            <Settings className="w-4 h-4 mr-1" />
            Schema
          </Button>

          {/* Import button */}
          <Button
            onClick={onImportClick}
            disabled={isSnapshot}
            title={isSnapshot ? "Cannot import to a historical snapshot" : undefined}
          >
            <Upload className="w-4 h-4 mr-1" />
            Import Data
          </Button>
        </div>
      </div>

      {/* Snapshot warning */}
      {isSnapshot && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>
            This is a historical snapshot and cannot be modified. Changes must be made in the current period.
          </span>
        </div>
      )}
    </div>
  )
}

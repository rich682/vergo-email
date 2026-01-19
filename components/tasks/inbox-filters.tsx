"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { CampaignType, TaskStatus } from "@prisma/client"

interface InboxFiltersProps {
  tasks: any[]
  onFilterChange: (filters: {
    campaignName: string | null
    campaignType: CampaignType | null
    status: TaskStatus | null
    search: string
  }) => void
}

const CAMPAIGN_TYPES: CampaignType[] = ["W9", "COI", "EXPENSE", "TIMESHEET", "INVOICE", "RECEIPT", "CUSTOM"]
const TASK_STATUSES: TaskStatus[] = [
  "AWAITING_RESPONSE",
  "REPLIED",
  "HAS_ATTACHMENTS",
  "VERIFYING",
  "FULFILLED",
  "REJECTED",
  "FLAGGED",
  "MANUAL_REVIEW"
]

export function InboxFilters({ tasks, onFilterChange }: InboxFiltersProps) {
  const [campaignName, setCampaignName] = useState<string | null>(null)
  const [campaignType, setCampaignType] = useState<CampaignType | null>(null)
  const [status, setStatus] = useState<TaskStatus | null>(null)
  const [search, setSearch] = useState("")
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Get unique campaign names from inbox items
  const uniqueCampaignNames = Array.from(
    new Set((tasks || []).map(t => t?.campaignName).filter(Boolean))
  ).sort() as string[]


  // Only call onFilterChange when filters actually change, not on initial mount
  const isInitialMount = useRef(true)
  
  useEffect(() => {
    // Skip the initial mount to prevent infinite loop
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    if (typeof onFilterChange === 'function') {
      onFilterChange({
        campaignName,
        campaignType,
        status,
        search
      })
    }
  }, [campaignName, campaignType, status, search]) // Removed onFilterChange from deps - it's stable via useCallback

  const handleClear = () => {
    setCampaignName(null)
    setCampaignType(null)
    setStatus(null)
    setSearch("")
  }

  const hasActiveFilters = campaignName || campaignType || status || search

  return (
    <div className="space-y-3">
      {/* Search - always visible */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Search
        </label>
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {/* Collapse button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 w-full"
      >
        {isCollapsed ? (
          <>
            <ChevronDown className="w-3 h-3" />
            <span>Show filters</span>
          </>
        ) : (
          <>
            <ChevronUp className="w-3 h-3" />
            <span>Hide filters</span>
          </>
        )}
      </button>

      {/* Advanced filters - collapsible */}
      {!isCollapsed && (
        <div className="space-y-3 pt-2 border-t border-gray-200">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Campaign Name
            </label>
            <Select
              value={campaignName || undefined}
              onValueChange={(value) => setCampaignName(value || null)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="All campaigns" />
              </SelectTrigger>
              <SelectContent>
                {uniqueCampaignNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Campaign Type
            </label>
            <Select
              value={campaignType || undefined}
              onValueChange={(value) => setCampaignType(value as CampaignType || null)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                {CAMPAIGN_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Status
            </label>
            <Select
              value={status || undefined}
              onValueChange={(value) => setStatus(value as TaskStatus || null)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {hasActiveFilters && (
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="h-7 text-xs w-full"
              >
                Clear Filters
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}














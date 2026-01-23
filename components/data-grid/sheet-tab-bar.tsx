"use client"

/**
 * Sheet Tab Bar Component
 *
 * Excel-like tab bar at the bottom of the data grid for switching between periods/sheets.
 * Features:
 * - Horizontal scrollable tabs
 * - Active tab highlight
 * - "Latest" badge on most recent
 * - Click to switch sheets
 */

import { useRef, useEffect, useCallback } from "react"
import type { SheetMetadata, SheetContext } from "@/lib/data-grid/types"
import { format } from "date-fns"
import { ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SheetTabBarProps {
  /** Available sheets */
  sheets: SheetMetadata[]
  /** Currently selected sheet */
  currentSheet: SheetContext
  /** Callback when sheet changes */
  onSheetChange: (sheet: SheetContext) => void
  /** Callback to add a new sheet (upload new period) */
  onAddSheet?: () => void
  /** Whether adding sheets is allowed */
  canAddSheet?: boolean
}

export function SheetTabBar({
  sheets,
  currentSheet,
  onSheetChange,
  onAddSheet,
  canAddSheet = false,
}: SheetTabBarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLButtonElement>(null)

  // Get current sheet ID
  const currentSheetId = currentSheet.kind === "snapshot" ? currentSheet.snapshotId : ""

  // Scroll active tab into view on mount and when it changes
  useEffect(() => {
    if (activeTabRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const tab = activeTabRef.current
      const containerRect = container.getBoundingClientRect()
      const tabRect = tab.getBoundingClientRect()

      // Check if tab is out of view
      if (tabRect.left < containerRect.left || tabRect.right > containerRect.right) {
        tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
      }
    }
  }, [currentSheetId])

  // Handle tab click
  const handleTabClick = useCallback(
    (sheetId: string) => {
      onSheetChange({ kind: "snapshot", snapshotId: sheetId })
    },
    [onSheetChange]
  )

  // Scroll left
  const scrollLeft = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -200, behavior: "smooth" })
    }
  }, [])

  // Scroll right
  const scrollRight = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: "smooth" })
    }
  }, [])

  // Sort sheets by date (oldest first, like Excel)
  const sortedSheets = [...sheets].sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })

  // Don't render if only one sheet (or none)
  if (sheets.length <= 1 && !canAddSheet) {
    return null
  }

  return (
    <div className="flex items-center bg-gray-100 border-t border-gray-300 h-9 min-h-[36px]">
      {/* Scroll left button */}
      {sheets.length > 4 && (
        <button
          onClick={scrollLeft}
          className="flex-shrink-0 p-1.5 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Scroll tabs left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      {/* Tabs container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-end overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {sortedSheets.map((sheet) => {
          const isActive = sheet.id === currentSheetId
          const label = sheet.periodLabel || format(new Date(sheet.createdAt), "MMM d, yyyy")

          return (
            <button
              key={sheet.id}
              ref={isActive ? activeTabRef : null}
              onClick={() => handleTabClick(sheet.id)}
              className={cn(
                "relative flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                "border-t border-x border-gray-300 rounded-t-md -mb-px",
                isActive
                  ? "bg-white text-gray-900 border-b-white z-10"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800 border-b-transparent"
              )}
              style={{ marginLeft: "-1px" }}
            >
              <span className="truncate max-w-[150px]">{label}</span>
              {sheet.isLatest && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-green-100 text-green-700">
                  Latest
                </span>
              )}
            </button>
          )
        })}

        {/* Add sheet button */}
        {canAddSheet && (
          <button
            onClick={onAddSheet}
            className={cn(
              "flex items-center justify-center w-8 h-8 ml-1",
              "text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
            )}
            aria-label="Add new period"
            title="Upload new period"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Scroll right button */}
      {sheets.length > 4 && (
        <button
          onClick={scrollRight}
          className="flex-shrink-0 p-1.5 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Scroll tabs right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

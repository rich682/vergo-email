"use client"

import { useMemo, useRef, useEffect } from "react"
import { format } from "date-fns"
import type { SheetContext, SheetMetadata, SnapshotMetadataAPI, UsePeriodContextReturn } from "../types"

interface UsePeriodContextParams {
  boardPeriodStart: string | null | undefined
  boardPeriodEnd: string | null | undefined
  boardName: string | null | undefined
  snapshots: SnapshotMetadataAPI[] | undefined
  currentSheet: SheetContext | null
}

/**
 * usePeriodContext
 * 
 * Centralizes all period-related logic for the data tab.
 * 
 * Key feature: periodLabelRef is a ref that holds the current period label.
 * This allows callbacks to read the current value without including it
 * in their dependency arrays, avoiding circular dependencies.
 */
export function usePeriodContext({
  boardPeriodStart,
  boardPeriodEnd,
  boardName,
  snapshots,
  currentSheet,
}: UsePeriodContextParams): UsePeriodContextReturn {
  // Ref to hold current period label - read by other hooks without deps
  const periodLabelRef = useRef<string | null>(null)

  // Compute current board period label
  const currentPeriodLabel = useMemo(() => {
    if (!boardPeriodStart) return null
    try {
      const date = new Date(boardPeriodStart)
      return format(date, "MMM d, yyyy")
    } catch {
      return boardName || null
    }
  }, [boardPeriodStart, boardName])

  // Keep the ref in sync with the computed value
  useEffect(() => {
    periodLabelRef.current = currentPeriodLabel
  }, [currentPeriodLabel])

  // Check if a snapshot exists for the current period
  const currentPeriodSnapshot = useMemo(() => {
    if (!boardPeriodStart || !snapshots) return null
    const boardStart = new Date(boardPeriodStart).toISOString().split("T")[0]
    return snapshots.find(s => {
      if (!s.periodStart) return false
      const snapshotStart = new Date(s.periodStart).toISOString().split("T")[0]
      return snapshotStart === boardStart
    }) || null
  }, [boardPeriodStart, snapshots])

  // Convert API snapshots to SheetMetadata with period awareness
  const sheets: SheetMetadata[] = useMemo(() => {
    const result: SheetMetadata[] = []
    
    // Add current period tab first (may be empty)
    if (currentPeriodLabel && boardPeriodStart) {
      if (currentPeriodSnapshot) {
        // Current period has data
        result.push({
          id: currentPeriodSnapshot.id,
          periodLabel: currentPeriodLabel,
          createdAt: currentPeriodSnapshot.createdAt,
          rowCount: currentPeriodSnapshot.rowCount,
          isLatest: true,
          isCurrentPeriod: true,
        })
      } else {
        // Current period is empty - create placeholder
        result.push({
          id: "current-period",
          periodLabel: currentPeriodLabel,
          createdAt: new Date().toISOString(),
          rowCount: 0,
          isLatest: false,
          isCurrentPeriod: true,
        })
      }
    }
    
    // Add previous period snapshots (exclude current period if it exists)
    if (snapshots) {
      const previousSnapshots = snapshots.filter(s => {
        if (currentPeriodSnapshot && s.id === currentPeriodSnapshot.id) return false
        return true
      })
      
      for (const s of previousSnapshots) {
        result.push({
          id: s.id,
          periodLabel: s.periodLabel,
          createdAt: s.createdAt,
          rowCount: s.rowCount,
          isLatest: s.isLatest && !currentPeriodSnapshot,
          isCurrentPeriod: false,
        })
      }
    }
    
    return result
  }, [snapshots, currentPeriodLabel, boardPeriodStart, currentPeriodSnapshot])

  // Check if currently viewing the current period (for upload button visibility)
  const isViewingCurrentPeriod = useMemo(() => {
    if (!currentSheet) return true // Default to current period
    if (currentSheet.kind === "snapshot") {
      const sheet = sheets.find(s => s.id === currentSheet.snapshotId)
      return sheet?.isCurrentPeriod ?? false
    }
    return false
  }, [currentSheet, sheets])

  // Get the period label for the currently selected sheet (for soft-delete filtering)
  const selectedSheetPeriodLabel = useMemo(() => {
    if (!currentSheet) return currentPeriodLabel
    if (currentSheet.kind === "snapshot") {
      const sheet = sheets.find(s => s.id === currentSheet.snapshotId)
      return sheet?.periodLabel || currentPeriodLabel
    }
    return currentPeriodLabel
  }, [currentSheet, sheets, currentPeriodLabel])

  return {
    currentPeriodLabel,
    periodLabelRef,
    currentPeriodSnapshot,
    sheets,
    isViewingCurrentPeriod,
    selectedSheetPeriodLabel,
  }
}

"use client"

import { useState, useCallback, useEffect } from "react"
import type { SheetContext } from "../types"

interface UseSheetDataParams {
  datasetTemplateId: string | null | undefined
  currentSheet: SheetContext | null
}

interface UseSheetDataReturn {
  snapshotRows: Record<string, unknown>[]
  loadingSnapshot: boolean
  snapshotError: string | null
  fetchSnapshotRows: (snapshotId: string) => Promise<void>
  setSnapshotRows: (rows: Record<string, unknown>[]) => void
}

/**
 * useSheetData
 * 
 * Manages the loading of snapshot data (rows) for the currently selected sheet.
 */
export function useSheetData({
  datasetTemplateId,
  currentSheet,
}: UseSheetDataParams): UseSheetDataReturn {
  const [snapshotRows, setSnapshotRows] = useState<Record<string, unknown>[]>([])
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)
  const [snapshotError, setSnapshotError] = useState<string | null>(null)

  // Fetch snapshot rows
  const fetchSnapshotRows = useCallback(async (snapshotId: string) => {
    console.log("[useSheetData] fetchSnapshotRows called", { snapshotId, templateId: datasetTemplateId })
    
    if (!datasetTemplateId) {
      console.log("[useSheetData] No template ID, aborting fetch")
      return
    }

    // Handle empty current period placeholder
    if (snapshotId === "current-period") {
      console.log("[useSheetData] Current period placeholder, clearing rows")
      setSnapshotRows([])
      setSnapshotError(null)
      setLoadingSnapshot(false)
      return
    }

    setLoadingSnapshot(true)
    setSnapshotError(null)

    try {
      const url = `/api/datasets/${datasetTemplateId}/snapshots/${snapshotId}`
      console.log("[useSheetData] Fetching from:", url)
      
      const response = await fetch(url, { credentials: "include" })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to load snapshot data")
      }

      const data = await response.json()
      console.log("[useSheetData] API response:", { snapshot: data.snapshot, rowCount: data.snapshot?.rows?.length })
      const rows = data.snapshot?.rows || []
      setSnapshotRows(Array.isArray(rows) ? rows : [])
      console.log("[useSheetData] Rows set:", rows.length)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load snapshot data"
      console.error("[useSheetData] Error fetching rows:", message)
      setSnapshotError(message)
      setSnapshotRows([])
    } finally {
      setLoadingSnapshot(false)
    }
  }, [datasetTemplateId])

  // Fetch rows when sheet changes
  useEffect(() => {
    console.log("[useSheetData] Sheet change effect", { currentSheet })
    if (currentSheet?.kind === "snapshot" && currentSheet.snapshotId) {
      console.log("[useSheetData] Fetching rows for snapshot:", currentSheet.snapshotId)
      fetchSnapshotRows(currentSheet.snapshotId)
    }
  }, [currentSheet, fetchSnapshotRows])

  return {
    snapshotRows,
    loadingSnapshot,
    snapshotError,
    fetchSnapshotRows,
    setSnapshotRows,
  }
}

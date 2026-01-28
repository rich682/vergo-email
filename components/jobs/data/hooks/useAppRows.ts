"use client"

import { useState, useCallback, useEffect, type RefObject } from "react"
import type { AppRowDef, UseAppRowsReturn } from "../types"

interface UseAppRowsParams {
  lineageId: string | null
  periodLabelRef: RefObject<string | null>
}

/**
 * useAppRows
 * 
 * Manages app rows (custom rows at the bottom of the grid) for a task lineage.
 * 
 * Key feature: Uses periodLabelRef instead of periodLabel value to avoid
 * circular dependencies. The ref is read at call time, not captured in closure.
 */
export function useAppRows({
  lineageId,
  periodLabelRef,
}: UseAppRowsParams): UseAppRowsReturn {
  const [appRows, setAppRows] = useState<AppRowDef[]>([])
  const [loadingAppRows, setLoadingAppRows] = useState(false)

  // Fetch app rows
  // Reads periodLabelRef.current at call time for soft-delete filtering
  const fetchAppRows = useCallback(async () => {
    if (!lineageId) return

    setLoadingAppRows(true)
    try {
      const url = new URL(`/api/task-lineages/${lineageId}/app-rows`, window.location.origin)
      if (periodLabelRef.current) {
        url.searchParams.set("periodLabel", periodLabelRef.current)
      }
      
      const response = await fetch(url.toString(), { credentials: "include" })

      if (!response.ok) {
        console.error("Failed to fetch app rows")
        return
      }

      const data = await response.json()
      setAppRows(data.rows || [])
    } catch (err) {
      console.error("Error fetching app rows:", err)
    } finally {
      setLoadingAppRows(false)
    }
  }, [lineageId, periodLabelRef])

  // Add a new app row
  const handleAddRow = useCallback(async (type: string, label: string) => {
    if (!lineageId) throw new Error("No lineage ID")

    const response = await fetch(
      `/api/task-lineages/${lineageId}/app-rows`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label, rowType: type }),
      }
    )

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to add row")
    }

    // Refresh app rows
    await fetchAppRows()
  }, [lineageId, fetchAppRows])

  // Rename an app row
  const handleRenameRow = useCallback(async (rowId: string, newLabel: string) => {
    if (!lineageId) throw new Error("No lineage ID")
    
    const response = await fetch(
      `/api/task-lineages/${lineageId}/app-rows/${rowId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label: newLabel }),
      }
    )
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to rename row")
    }
    
    // Refresh app rows
    await fetchAppRows()
  }, [lineageId, fetchAppRows])

  // Delete an app row (soft-delete with period tracking)
  const handleDeleteAppRow = useCallback(async (rowId: string) => {
    if (!lineageId) throw new Error("No lineage ID")
    
    const response = await fetch(
      `/api/task-lineages/${lineageId}/app-rows/${rowId}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPeriod: periodLabelRef.current }),
      }
    )

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to delete row")
    }

    // Refresh app rows
    await fetchAppRows()
  }, [lineageId, periodLabelRef, fetchAppRows])

  // Update a row cell value
  const handleRowCellValueUpdate = useCallback(async (
    rowId: string,
    columnKey: string,
    value: string | null
  ) => {
    if (!lineageId) throw new Error("No lineage ID")

    const response = await fetch(
      `/api/task-lineages/${lineageId}/app-rows/${rowId}/values`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ values: [{ columnKey, value }] }),
      }
    )

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to update row value")
    }

    // Refresh app rows to get updated values
    await fetchAppRows()
  }, [lineageId, fetchAppRows])

  // Fetch rows when lineageId becomes available
  useEffect(() => {
    if (lineageId) {
      fetchAppRows()
    }
  }, [lineageId, fetchAppRows])

  return {
    appRows,
    loadingAppRows,
    fetchAppRows,
    handleAddRow,
    handleRenameRow,
    handleDeleteAppRow,
    handleRowCellValueUpdate,
  }
}

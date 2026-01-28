"use client"

import { useState, useCallback, useEffect, type RefObject } from "react"
import type { AppColumnDef, AppColumnValueData, UseAppColumnsReturn } from "../types"

interface UseAppColumnsParams {
  lineageId: string | null
  periodLabelRef: RefObject<string | null>
}

/**
 * useAppColumns
 * 
 * Manages app columns (custom columns added by users) for a task lineage.
 * 
 * Key feature: Uses periodLabelRef instead of periodLabel value to avoid
 * circular dependencies. The ref is read at call time, not captured in closure.
 */
export function useAppColumns({
  lineageId,
  periodLabelRef,
}: UseAppColumnsParams): UseAppColumnsReturn {
  const [appColumns, setAppColumns] = useState<AppColumnDef[]>([])
  const [appColumnValues, setAppColumnValues] = useState<Map<string, AppColumnValueData>>(new Map())
  const [loadingAppColumns, setLoadingAppColumns] = useState(false)

  // Fetch app columns
  // Reads periodLabelRef.current at call time for soft-delete filtering
  const fetchAppColumns = useCallback(async () => {
    if (!lineageId) return

    setLoadingAppColumns(true)
    try {
      const url = new URL(`/api/task-lineages/${lineageId}/app-columns`, window.location.origin)
      if (periodLabelRef.current) {
        url.searchParams.set("periodLabel", periodLabelRef.current)
      }
      
      const response = await fetch(url.toString(), { credentials: "include" })

      if (!response.ok) {
        console.error("Failed to fetch app columns")
        return
      }

      const data = await response.json()
      setAppColumns(data.columns || [])
    } catch (err) {
      console.error("Error fetching app columns:", err)
    } finally {
      setLoadingAppColumns(false)
    }
  }, [lineageId, periodLabelRef])

  // Fetch app column values for specific rows
  const fetchAppColumnValues = useCallback(async (rowIdentities: string[]) => {
    if (!lineageId || appColumns.length === 0 || rowIdentities.length === 0) return

    try {
      const identitiesParam = rowIdentities.join(",")
      const valueMap = new Map<string, AppColumnValueData>()

      // Fetch values for each column
      await Promise.all(
        appColumns.map(async (col) => {
          const response = await fetch(
            `/api/task-lineages/${lineageId}/app-columns/${col.id}/values?identities=${encodeURIComponent(identitiesParam)}`,
            { credentials: "include" }
          )

          if (response.ok) {
            const data = await response.json()
            valueMap.set(col.id, data.values || {})
          }
        })
      )

      setAppColumnValues(valueMap)
    } catch (err) {
      console.error("Error fetching app column values:", err)
    }
  }, [lineageId, appColumns])

  // Add a new app column
  const handleAddColumn = useCallback(async (type: string, label: string) => {
    if (!lineageId) throw new Error("No lineage ID")

    const response = await fetch(
      `/api/task-lineages/${lineageId}/app-columns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label, dataType: type }),
      }
    )

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to add column")
    }

    // Refresh app columns
    await fetchAppColumns()
  }, [lineageId, fetchAppColumns])

  // Rename an app column
  const handleRenameColumn = useCallback(async (columnId: string, newLabel: string) => {
    if (!lineageId) throw new Error("No lineage ID")
    
    // Extract actual column ID (remove "app_" prefix if present)
    const actualColumnId = columnId.replace("app_", "")
    
    const response = await fetch(
      `/api/task-lineages/${lineageId}/app-columns/${actualColumnId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label: newLabel }),
      }
    )
    
    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to rename column")
    }
    
    // Refresh app columns
    await fetchAppColumns()
  }, [lineageId, fetchAppColumns])

  // Delete an app column (soft-delete with period tracking)
  const handleDeleteAppColumn = useCallback(async (columnId: string) => {
    if (!lineageId) throw new Error("No lineage ID")
    
    // Extract actual column ID (remove "app_" prefix)
    const actualColumnId = columnId.replace("app_", "")
    
    const response = await fetch(
      `/api/task-lineages/${lineageId}/app-columns/${actualColumnId}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPeriod: periodLabelRef.current }),
      }
    )

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to delete column")
    }

    // Refresh app columns
    await fetchAppColumns()
  }, [lineageId, periodLabelRef, fetchAppColumns])

  // Update a cell value
  const handleCellValueUpdate = useCallback(async (
    columnId: string,
    rowIdentity: string,
    value: unknown
  ) => {
    if (!lineageId) throw new Error("No lineage ID")

    const response = await fetch(
      `/api/task-lineages/${lineageId}/app-columns/${columnId}/values/${encodeURIComponent(rowIdentity)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value }),
      }
    )

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to update value")
    }

    // Update local state optimistically
    setAppColumnValues(prev => {
      const newMap = new Map(prev)
      const columnValues = newMap.get(columnId) || {}
      newMap.set(columnId, {
        ...columnValues,
        [rowIdentity]: {
          value,
          updatedAt: new Date().toISOString(),
        },
      })
      return newMap
    })
  }, [lineageId])

  // Fetch columns when lineageId becomes available
  useEffect(() => {
    if (lineageId) {
      fetchAppColumns()
    }
  }, [lineageId, fetchAppColumns])

  return {
    appColumns,
    appColumnValues,
    loadingAppColumns,
    fetchAppColumns,
    fetchAppColumnValues,
    handleAddColumn,
    handleRenameColumn,
    handleDeleteAppColumn,
    handleCellValueUpdate,
  }
}

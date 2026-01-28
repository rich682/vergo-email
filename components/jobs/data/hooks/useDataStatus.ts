"use client"

import { useState, useCallback, useEffect } from "react"
import type { DataStatus, UseDataStatusReturn } from "../types"

/**
 * useDataStatus
 * 
 * Manages the data status for a task instance, including:
 * - Whether data is enabled
 * - Whether schema is configured
 * - Dataset template with snapshots
 */
export function useDataStatus(taskInstanceId: string): UseDataStatusReturn {
  const [dataStatus, setDataStatus] = useState<DataStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDataStatus = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/task-instances/${taskInstanceId}/data`,
        { credentials: "include" }
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to load data status")
      }

      const data: DataStatus = await response.json()
      setDataStatus(data)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load data status"
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [taskInstanceId])

  // Fetch on mount and when taskInstanceId changes
  useEffect(() => {
    fetchDataStatus()
  }, [fetchDataStatus])

  return {
    dataStatus,
    loading,
    error,
    fetchDataStatus,
  }
}

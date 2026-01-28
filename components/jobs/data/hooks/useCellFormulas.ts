"use client"

import { useState, useCallback, useEffect } from "react"
import type { CellFormulaData } from "@/components/data-grid"
import type { UseCellFormulasReturn } from "../types"

interface UseCellFormulasParams {
  lineageId: string | null
}

/**
 * useCellFormulas
 * 
 * Manages Excel-style cell formulas for individual cells in the data grid.
 */
export function useCellFormulas({
  lineageId,
}: UseCellFormulasParams): UseCellFormulasReturn {
  const [cellFormulas, setCellFormulas] = useState<Map<string, CellFormulaData>>(new Map())
  const [loadingCellFormulas, setLoadingCellFormulas] = useState(false)

  // Fetch cell formulas
  const fetchCellFormulas = useCallback(async () => {
    if (!lineageId) return

    setLoadingCellFormulas(true)
    try {
      const response = await fetch(
        `/api/task-lineages/${lineageId}/cell-formulas`,
        { credentials: "include" }
      )

      if (!response.ok) {
        return
      }

      const data = await response.json()
      const formulasMap = new Map<string, CellFormulaData>()
      for (const f of data.formulas || []) {
        formulasMap.set(f.cellRef, {
          cellRef: f.cellRef,
          formula: f.formula,
        })
      }
      setCellFormulas(formulasMap)
    } catch (err) {
      console.error("Error fetching cell formulas:", err)
    } finally {
      setLoadingCellFormulas(false)
    }
  }, [lineageId])

  // Save or delete a cell formula
  const handleCellFormulaChange = useCallback(async (cellRef: string, formula: string | null) => {
    if (!lineageId) return

    try {
      if (formula) {
        // Save formula
        const response = await fetch(
          `/api/task-lineages/${lineageId}/cell-formulas`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ cellRef, formula }),
          }
        )

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to save formula")
        }
      } else {
        // Delete formula
        const response = await fetch(
          `/api/task-lineages/${lineageId}/cell-formulas?cellRef=${encodeURIComponent(cellRef)}`,
          {
            method: "DELETE",
            credentials: "include",
          }
        )

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to delete formula")
        }
      }

      // Refresh cell formulas
      await fetchCellFormulas()
    } catch (err) {
      console.error("Error saving cell formula:", err)
      throw err
    }
  }, [lineageId, fetchCellFormulas])

  // Fetch formulas when lineageId becomes available
  useEffect(() => {
    if (lineageId) {
      fetchCellFormulas()
    }
  }, [lineageId, fetchCellFormulas])

  return {
    cellFormulas,
    loadingCellFormulas,
    fetchCellFormulas,
    handleCellFormulaChange,
  }
}

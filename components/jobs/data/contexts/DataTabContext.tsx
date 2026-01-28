"use client"

import { createContext, useContext, useRef, useState, useEffect, useCallback, type ReactNode } from "react"
import type { TeamMember } from "@/components/data-grid"
import type { DataTabContextValue } from "../types"

const DataTabContext = createContext<DataTabContextValue | null>(null)

interface DataTabProviderProps {
  children: ReactNode
  taskInstanceId: string
  lineageId: string | null
}

/**
 * DataTabProvider
 * 
 * Provides shared context for all data tab hooks.
 * Key feature: periodLabelRef is a ref that can be read by callbacks
 * without being in their dependency arrays, avoiding circular dependencies.
 */
export function DataTabProvider({ 
  children, 
  taskInstanceId, 
  lineageId 
}: DataTabProviderProps) {
  // Ref for period label - updated by usePeriodContext, read by other hooks
  const periodLabelRef = useRef<string | null>(null)
  
  // Team members - fetched once and shared
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  // Fetch team members
  const fetchTeamMembers = useCallback(async () => {
    try {
      const response = await fetch("/api/team", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setTeamMembers(data.members || [])
      }
    } catch (err) {
      console.error("Error fetching team members:", err)
    }
  }, [])

  useEffect(() => {
    fetchTeamMembers()
  }, [fetchTeamMembers])

  const value: DataTabContextValue = {
    taskInstanceId,
    lineageId,
    periodLabelRef,
    teamMembers,
  }

  return (
    <DataTabContext.Provider value={value}>
      {children}
    </DataTabContext.Provider>
  )
}

/**
 * Hook to access the DataTab context
 * Throws if used outside of DataTabProvider
 */
export function useDataTabContext(): DataTabContextValue {
  const context = useContext(DataTabContext)
  if (!context) {
    throw new Error("useDataTabContext must be used within a DataTabProvider")
  }
  return context
}

/**
 * Hook to update the period label ref
 * Called by usePeriodContext to keep the ref in sync
 */
export function useUpdatePeriodLabel(label: string | null) {
  const context = useContext(DataTabContext)
  if (context) {
    context.periodLabelRef.current = label
  }
}

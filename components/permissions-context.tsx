"use client"

import { createContext, useContext, useCallback } from "react"
import { canPerformAction, type ActionKey, type OrgActionPermissions } from "@/lib/permissions"

interface PermissionsContextValue {
  role: string | undefined
  orgActionPermissions: OrgActionPermissions
  /** Shorthand: checks canPerformAction(role, actionKey, orgActionPermissions) */
  can: (actionKey: ActionKey) => boolean
}

const PermissionsContext = createContext<PermissionsContextValue>({
  role: undefined,
  orgActionPermissions: null,
  can: () => false,
})

interface PermissionsProviderProps {
  children: React.ReactNode
  role: string | undefined
  orgActionPermissions: OrgActionPermissions
}

export function PermissionsProvider({
  children,
  role,
  orgActionPermissions,
}: PermissionsProviderProps) {
  const can = useCallback(
    (actionKey: ActionKey) => canPerformAction(role, actionKey, orgActionPermissions),
    [role, orgActionPermissions]
  )

  return (
    <PermissionsContext.Provider value={{ role, orgActionPermissions, can }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionsContext)
}

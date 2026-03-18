"use client"

import { createContext, useContext, useCallback } from "react"
import { canPerformAction, type ActionKey, type OrgActionPermissions } from "@/lib/permissions"

interface PermissionsContextValue {
  role: string | undefined
  orgActionPermissions: OrgActionPermissions
  /** Shorthand: checks canPerformAction(role, actionKey, orgActionPermissions) */
  can: (actionKey: ActionKey) => boolean
  /** True only when the current user has the ADMIN role */
  isAdmin: boolean
}

const PermissionsContext = createContext<PermissionsContextValue>({
  role: undefined,
  orgActionPermissions: null,
  can: () => false,
  isAdmin: false,
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

  const isAdmin = role?.toUpperCase() === "ADMIN"

  return (
    <PermissionsContext.Provider value={{ role, orgActionPermissions, can, isAdmin }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionsContext)
}

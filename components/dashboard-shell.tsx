"use client"

import { useState, useEffect, useCallback } from "react"
import { Sidebar } from "./sidebar"
import { UserMenu } from "./user-menu"
import { NotificationBell } from "./notification-bell"
import { PageTitle } from "./page-title"
import type { ModuleAccess, OrgRoleDefaults } from "@/lib/permissions"

interface DashboardShellProps {
  children: React.ReactNode
  userEmail: string
  userName?: string
  userRole?: string
  moduleAccess?: ModuleAccess | null
  orgRoleDefaults?: OrgRoleDefaults
  orgName?: string
  orgFeatures?: Record<string, boolean>
}

const SIDEBAR_PINNED_KEY = "vergo-sidebar-pinned"

export function DashboardShell({
  children,
  userEmail,
  userName,
  userRole,
  moduleAccess,
  orgRoleDefaults,
  orgName,
  orgFeatures = {},
}: DashboardShellProps) {
  const [pinned, setPinned] = useState(true)
  const [hovered, setHovered] = useState(false)

  // Load persisted pin state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_PINNED_KEY)
    if (stored !== null) {
      setPinned(stored === "true")
    }
  }, [])

  const togglePinned = useCallback(() => {
    setPinned((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_PINNED_KEY, String(next))
      if (next) setHovered(false) // Clear hover when pinning open
      return next
    })
  }, [])

  const expanded = pinned || hovered

  return (
    <div className="min-h-screen bg-white">
      <Sidebar
        userRole={userRole}
        moduleAccess={moduleAccess}
        orgRoleDefaults={orgRoleDefaults}
        orgFeatures={orgFeatures}
        collapsed={!expanded}
        pinned={pinned}
        onTogglePin={togglePinned}
        onMouseEnter={() => { if (!pinned) setHovered(true) }}
        onMouseLeave={() => { if (!pinned) setHovered(false) }}
      />

      {/* Main content area - padding adjusts based on pinned state only */}
      <div
        className="transition-[padding-left] duration-200 ease-in-out"
        style={{ paddingLeft: pinned ? 208 : 52 }}
      >
        {/* Top header bar */}
        <header className="h-16 border-b border-gray-100 flex items-center justify-between px-8 sticky top-0 bg-white z-30">
          <PageTitle />
          <div className="flex items-center gap-4">
            <NotificationBell />
            <UserMenu
              userEmail={userEmail}
              userName={userName}
              userRole={userRole}
              orgName={orgName}
            />
          </div>
        </header>

        {/* Page content */}
        <main className="min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  )
}

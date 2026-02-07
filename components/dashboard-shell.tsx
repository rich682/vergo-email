"use client"

import { useState, useEffect, useCallback } from "react"
import { Sidebar } from "./sidebar"
import { UserMenu } from "./user-menu"
import { PageTitle } from "./page-title"

interface DashboardShellProps {
  children: React.ReactNode
  userEmail: string
  userName?: string
  userRole?: string
  orgName?: string
  orgFeatures?: Record<string, boolean>
}

const SIDEBAR_PINNED_KEY = "vergo-sidebar-pinned"

export function DashboardShell({
  children,
  userEmail,
  userName,
  userRole,
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
            <button className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
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

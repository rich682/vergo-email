"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { HelpCircle, LogOut, Settings } from "lucide-react"

interface UserMenuProps {
  userEmail: string
  userName?: string
  userRole?: string
  orgName?: string
}

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0][0]?.toUpperCase() || "?"
  }
  if (email) {
    return email[0]?.toUpperCase() || "?"
  }
  return "?"
}

export function UserMenu({ userEmail, userName, userRole, orgName }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const initials = getInitials(userName, userEmail)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open])

  // Close dropdown on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener("keydown", handleEscape)
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
    }
  }, [open])

  const router = useRouter()

  const handleProfileSettings = () => {
    setOpen(false)
    router.push("/dashboard/profile")
  }

  const handleHelp = () => {
    setOpen(false)
    // Open help in new tab or show help modal
    window.open("https://help.getvergo.com", "_blank")
  }

  const handleLogout = async () => {
    setOpen(false)
    await signOut({ callbackUrl: "/auth/signin" })
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Avatar button - gray background, larger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-medium hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 transition-colors"
        aria-haspopup="true"
        aria-expanded={open}
        title={userEmail || "Account menu"}
      >
        {initials}
      </button>

      {open && (
        <div 
          className="absolute right-0 mt-2 w-64 rounded-lg border border-gray-200 bg-white shadow-lg z-50"
          role="menu"
          aria-orientation="vertical"
        >
          {/* User info header - matching Vergo style */}
          <div className="px-4 py-4 border-b border-gray-100">
            {orgName && (
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                {orgName}
              </p>
            )}
            {userName && (
              <p className="text-base font-medium text-gray-900">{userName}</p>
            )}
            {userRole && (
              <p className="text-sm text-gray-500">{userRole === "ADMIN" ? "Admin" : userRole === "MANAGER" ? "Manager" : "Employee"}</p>
            )}
          </div>

          {/* Menu items */}
          <div className="py-2">
            <button
              onClick={handleProfileSettings}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
              role="menuitem"
            >
              <Settings className="w-5 h-5 text-gray-400" />
              Profile Settings
            </button>
            <button
              onClick={handleHelp}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
              role="menuitem"
            >
              <HelpCircle className="w-5 h-5 text-gray-400" />
              Help
            </button>
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
              role="menuitem"
            >
              <LogOut className="w-5 h-5 text-gray-400" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

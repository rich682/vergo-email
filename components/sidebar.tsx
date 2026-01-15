"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { UI_LABELS } from "@/lib/ui-labels"

interface SidebarProps {
  className?: string
}

// Feature flag check for Jobs UI
function isJobsUIEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JOBS_UI === "true"
}

// Custom icons matching Vergo style (outline, thin strokes)
function TasksIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function CollectionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  )
}

function ContactsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function TeamIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  featureFlag?: () => boolean
}

const navItems: NavItem[] = [
  { 
    href: "/dashboard/jobs", 
    label: UI_LABELS.jobsNavLabel, 
    icon: TasksIcon,
    featureFlag: isJobsUIEnabled 
  },
  {
    href: "/dashboard/collection",
    label: "Collection",
    icon: CollectionIcon
  },
  { 
    href: "/dashboard/contacts", 
    label: "Contacts", 
    icon: ContactsIcon 
  },
  { 
    href: "/dashboard/settings/team", 
    label: "Team", 
    icon: TeamIcon 
  },
  { 
    href: "/dashboard/settings", 
    label: "Settings", 
    icon: SettingsIcon 
  },
]

export function Sidebar({ className = "" }: SidebarProps) {
  const [expanded, setExpanded] = useState(false)
  const pathname = usePathname()

  // Filter nav items based on feature flags
  const visibleNavItems = navItems.filter((item) => {
    if (item.featureFlag && !item.featureFlag()) {
      return false
    }
    return true
  })

  return (
    <div
      className={`
        fixed left-0 top-0 h-full bg-white border-r border-gray-100 z-40
        flex flex-col
        transition-all duration-200 ease-in-out
        ${expanded ? "w-60" : "w-20"}
        ${className}
      `}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Logo */}
      <div className={`
        h-20 flex items-center
        ${expanded ? "px-5" : "justify-center"}
      `}>
        <Link href="/dashboard/jobs" className="flex items-center">
          {expanded ? (
            /* Full logo with text when expanded */
            <img 
              src="/logo.svg" 
              alt="Vergo" 
              className="h-8 w-auto"
            />
          ) : (
            /* Icon only when collapsed */
            <img 
              src="/icon.png" 
              alt="Vergo" 
              width={32} 
              height={32}
              className="flex-shrink-0"
            />
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 pt-4">
        <ul className="space-y-1">
          {visibleNavItems.map((item) => {
            // Check if active - special handling for settings to not highlight when on team page
            let isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            // Don't highlight Settings when on Team page
            if (item.href === "/dashboard/settings" && pathname.startsWith("/dashboard/settings/team")) {
              isActive = false
            }
            const Icon = item.icon
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-4 mx-3 px-3 py-3 rounded-xl
                    transition-all duration-150
                    ${isActive 
                      ? "bg-gray-100 text-gray-900" 
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    }
                    ${expanded ? "" : "justify-center"}
                  `}
                  title={!expanded ? item.label : undefined}
                >
                  <Icon className="w-6 h-6 flex-shrink-0" />
                  {expanded && (
                    <span className="text-base font-normal whitespace-nowrap">
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

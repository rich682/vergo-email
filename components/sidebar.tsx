"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { UI_LABELS } from "@/lib/ui-labels"
import { ChevronDown, ChevronRight, Calendar } from "lucide-react"

interface SidebarProps {
  className?: string
  userRole?: string  // User's role for showing/hiding admin items
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

function RequestsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
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

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10,9 9,9 8,9" />
    </svg>
  )
}

function DatabasesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  )
}

function ReportsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14,2 14,8 20,8" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
      <path d="M10 9h4" />
    </svg>
  )
}

function FormsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
      <circle cx="7" cy="12" r="0.5" fill="currentColor" />
      <circle cx="7" cy="16" r="0.5" fill="currentColor" />
    </svg>
  )
}


function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  )
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

// Nav items before Collection (admin-only)
const preCollectionNavItems: NavItem[] = [
  {
    href: "/dashboard/requests",
    label: "Requests",
    icon: RequestsIcon
  },
]

// Nav items after Collection
const postCollectionNavItems: NavItem[] = [
  {
    href: "/dashboard/reports",
    label: "Reports",
    icon: ReportsIcon
  },
  {
    href: "/dashboard/forms",
    label: "Forms",
    icon: FormsIcon
  },
  {
    href: "/dashboard/databases",
    label: "Databases",
    icon: DatabasesIcon
  },
]

// Settings/management nav items (shown at bottom)
const settingsNavItems: NavItem[] = [
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

export function Sidebar({ className = "", userRole }: SidebarProps) {
  const [collectionExpanded, setCollectionExpanded] = useState(false)
  const [inboxUnread, setInboxUnread] = useState(0)
  
  // Check if user is admin
  const isAdmin = userRole?.toUpperCase() === "ADMIN"
  const pathname = usePathname()

  // Fetch inbox unread count
  useEffect(() => {
    const fetchInboxCount = async () => {
      try {
        const res = await fetch("/api/inbox/count")
        if (res.ok) {
          const data = await res.json()
          setInboxUnread(data.unread || 0)
        }
      } catch {}
    }
    fetchInboxCount()
    // Poll every 60 seconds
    const interval = setInterval(fetchInboxCount, 60000)
    return () => clearInterval(interval)
  }, [])

  // Check if we're on the tasks/boards page
  const isOnTasksPage = pathname === "/dashboard/boards" || pathname === "/dashboard/jobs" || pathname.startsWith("/dashboard/jobs/")
  
  // Check if we're on the inbox page
  const isOnInboxPage = pathname === "/dashboard/inbox"
  
  // Check if we're on the collection page
  const isOnCollectionPage = pathname === "/dashboard/collection" || pathname.startsWith("/dashboard/collection/")
  const isOnExpensesPage = pathname === "/dashboard/collection/expenses"
  const isOnInvoicesPage = pathname === "/dashboard/collection/invoices"
  

  return (
    <div
      className={`
        fixed left-0 top-0 h-full bg-white border-r border-gray-100 z-40
        flex flex-col w-64
        ${className}
      `}
    >
      {/* Logo */}
      <div className="h-20 flex items-center px-5">
        <Link href="/dashboard/boards" className="flex items-center">
          <img 
            src="/logo.svg" 
            alt="Vergo" 
            className="h-8 w-auto"
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 pt-4 overflow-y-auto flex flex-col">
        {/* Core Workflow Section */}
        <ul className="space-y-1">
          {/* Tasks - Direct link to Boards */}
          <li>
            <Link
              href="/dashboard/boards"
              className={`
                flex items-center gap-4 mx-3 px-3 py-3 rounded-xl
                transition-all duration-150
                ${isOnTasksPage
                  ? "bg-gray-100 text-gray-900" 
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }
              `}
              style={{ width: "calc(100% - 24px)" }}
            >
              <TasksIcon className="w-6 h-6 flex-shrink-0" />
              <span className="text-base font-normal whitespace-nowrap flex-1 text-left">
                {UI_LABELS.jobsNavLabel}
              </span>
            </Link>
          </li>

          {/* Inbox - visible to all */}
          <li>
            <Link
              href="/dashboard/inbox"
              className={`
                flex items-center gap-4 mx-3 px-3 py-3 rounded-xl
                transition-all duration-150
                ${isOnInboxPage
                  ? "bg-gray-100 text-gray-900" 
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }
              `}
              style={{ width: "calc(100% - 24px)" }}
            >
              <InboxIcon className="w-6 h-6 flex-shrink-0" />
              <span className="text-base font-normal whitespace-nowrap flex-1 text-left">
                Inbox
              </span>
              {inboxUnread > 0 && (
                <span className="bg-blue-600 text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                  {inboxUnread > 99 ? "99+" : inboxUnread}
                </span>
              )}
            </Link>
          </li>

          {/* Nav Items before Collection (Requests) - Admin Only */}
          {isAdmin && preCollectionNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
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
                  `}
                  style={{ width: "calc(100% - 24px)" }}
                >
                  <Icon className="w-6 h-6 flex-shrink-0" />
                  <span className="text-base font-normal whitespace-nowrap flex-1 text-left">
                    {item.label}
                  </span>
                </Link>
              </li>
            )
          })}

          {/* Collection Section - Admin Only */}
          {isAdmin && (
            <li>
              {/* Collection Header */}
              <button
                onClick={() => setCollectionExpanded(!collectionExpanded)}
                className={`
                  w-full flex items-center gap-4 mx-3 px-3 py-3 rounded-xl
                  transition-all duration-150
                  ${isOnCollectionPage
                    ? "bg-gray-100 text-gray-900" 
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }
                `}
                style={{ width: "calc(100% - 24px)" }}
              >
                <CollectionIcon className="w-6 h-6 flex-shrink-0" />
                <span className="text-base font-normal whitespace-nowrap flex-1 text-left">
                  Collection
                </span>
                {collectionExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {/* Collection Sub-items */}
              {collectionExpanded && (
                <ul className="mt-1 ml-6 space-y-0.5">
                  {/* Documents */}
                  <li>
                    <Link
                      href="/dashboard/collection"
                      className={`
                        flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-sm
                        transition-all duration-150
                        ${isOnCollectionPage && !isOnExpensesPage && !isOnInvoicesPage
                          ? "bg-blue-50 text-blue-700 font-medium" 
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                        }
                      `}
                    >
                      <DocumentIcon className="w-4 h-4 flex-shrink-0" />
                      <span>Documents</span>
                    </Link>
                  </li>
                  
                  {/* Expenses */}
                  <li>
                    <Link
                      href="/dashboard/collection/expenses"
                      className={`
                        flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-sm
                        transition-all duration-150
                        ${isOnExpensesPage
                          ? "bg-blue-50 text-blue-700 font-medium" 
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                        }
                      `}
                    >
                      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                        <line x1="1" y1="10" x2="23" y2="10" />
                      </svg>
                      <span>Expenses</span>
                    </Link>
                  </li>
                  
                  {/* Invoices */}
                  <li>
                    <Link
                      href="/dashboard/collection/invoices"
                      className={`
                        flex items-center gap-3 mx-3 px-3 py-2 rounded-lg text-sm
                        transition-all duration-150
                        ${isOnInvoicesPage
                          ? "bg-blue-50 text-blue-700 font-medium" 
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                        }
                      `}
                    >
                      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      <span>Invoices</span>
                    </Link>
                  </li>
                </ul>
              )}
            </li>
          )}

          {/* Reports - visible to all users */}
          {postCollectionNavItems.filter(item => item.href === "/dashboard/reports").map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
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
                  `}
                  style={{ width: "calc(100% - 24px)" }}
                >
                  <Icon className="w-6 h-6 flex-shrink-0" />
                  <span className="text-base font-normal whitespace-nowrap flex-1 text-left">
                    {item.label}
                  </span>
                </Link>
              </li>
            )
          })}

          {/* Forms - visible to all users */}
          {postCollectionNavItems.filter(item => item.href === "/dashboard/forms").map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
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
                  `}
                  style={{ width: "calc(100% - 24px)" }}
                >
                  <Icon className="w-6 h-6 flex-shrink-0" />
                  <span className="text-base font-normal whitespace-nowrap flex-1 text-left">
                    {item.label}
                  </span>
                </Link>
              </li>
            )
          })}

          {/* Databases - Admin Only */}
          {isAdmin && postCollectionNavItems.filter(item => item.href === "/dashboard/databases").map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
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
                  `}
                  style={{ width: "calc(100% - 24px)" }}
                >
                  <Icon className="w-6 h-6 flex-shrink-0" />
                  <span className="text-base font-normal whitespace-nowrap flex-1 text-left">
                    {item.label}
                  </span>
                </Link>
              </li>
            )
          })}

        </ul>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Onboarding Call CTA */}
        <div className="mx-3 mb-3">
          <a
            href="https://calendly.com/vergo-ai/vergo-onboarding-call"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 transition-all duration-150"
          >
            <Calendar className="w-5 h-5 flex-shrink-0" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">Book Onboarding</span>
              <span className="text-xs text-orange-500">Schedule a call</span>
            </div>
          </a>
        </div>

        {/* Settings/Management Section (Bottom) */}
        <ul className="space-y-1 pb-4 border-t border-gray-100 pt-4 mt-4">
          {settingsNavItems
            // Filter out Contacts, Team and Settings for non-admins
            .filter((item) => {
              if (!isAdmin && (item.href === "/dashboard/contacts" || item.href === "/dashboard/settings/team" || item.href === "/dashboard/settings")) {
                return false
              }
              return true
            })
            .map((item) => {
            let isActive = pathname === item.href || pathname.startsWith(item.href + "/")
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
                  `}
                >
                  <Icon className="w-6 h-6 flex-shrink-0" />
                  <span className="text-base font-normal whitespace-nowrap">
                    {item.label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}

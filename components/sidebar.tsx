"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { UI_LABELS } from "@/lib/ui-labels"
import { Calendar } from "lucide-react"
import { hasModuleAccess, type OrgActionPermissions, type ModuleKey } from "@/lib/permissions"

interface SidebarProps {
  className?: string
  userRole?: string  // User's role for showing/hiding admin items
  orgActionPermissions?: OrgActionPermissions // Org-level action permissions
  orgFeatures?: Record<string, boolean>  // Organization feature flags (e.g. { expenses: true, invoices: false })
  collapsed?: boolean
  pinned?: boolean
  onTogglePin?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

// External app URL for enabled modules
const MODULE_EXTERNAL_URL = "https://app.getvergo.com"

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

function ExpensesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

function ReconciliationsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h18" />
      <path d="M17 6l2 2-2 2" />
      <path d="M7 18l-2-2 2-2" />
    </svg>
  )
}

function InvoicesIcon({ className }: { className?: string }) {
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

function AgentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M12 2v2" />
      <path d="M12 12v2" />
      <rect x="6" y="16" width="12" height="5" rx="1" />
      <path d="M9 16v-2" />
      <path d="M15 16v-2" />
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
  {
    href: "/dashboard/profile",
    label: "Profile",
    icon: SettingsIcon
  },
]

export function Sidebar({
  className = "",
  userRole,
  orgActionPermissions,
  orgFeatures = {},
  collapsed = false,
  pinned = true,
  onTogglePin,
  onMouseEnter,
  onMouseLeave,
}: SidebarProps) {
  const [inboxUnread, setInboxUnread] = useState(0)

  // Check if user is admin (still needed for settings/team which are always admin-only)
  const isAdmin = userRole?.toUpperCase() === "ADMIN"
  const pathname = usePathname()

  // Check module access — derived from action permissions
  const hasAccess = useMemo(() => {
    return (module: ModuleKey) => hasModuleAccess(userRole, module, orgActionPermissions)
  }, [userRole, orgActionPermissions])

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
    const interval = setInterval(fetchInboxCount, 60000)
    return () => clearInterval(interval)
  }, [])

  // Check if we're on the tasks/boards page
  const isOnTasksPage = pathname === "/dashboard/boards" || pathname === "/dashboard/jobs" || pathname.startsWith("/dashboard/jobs/")
  const isOnInboxPage = pathname === "/dashboard/inbox"

  // --- Helper classes for collapsed / expanded states ---
  const navCls = (active: boolean) =>
    [
      "flex items-center rounded-lg transition-all duration-150",
      collapsed ? "justify-center mx-1.5 p-2" : "gap-3 mx-2 px-2.5 py-1.5",
      active
        ? "bg-gray-100 text-gray-900"
        : "text-gray-500 hover:bg-gray-50 hover:text-gray-700",
    ].join(" ")

  const labelCls = collapsed
    ? "hidden"
    : "text-[13px] font-normal whitespace-nowrap flex-1 text-left"

  const settingsLabelCls = collapsed
    ? "hidden"
    : "text-[13px] font-normal whitespace-nowrap"

  return (
    <div
      className={`
        fixed left-0 top-0 h-full bg-white border-r border-gray-100 z-40
        flex flex-col transition-all duration-200 ease-in-out overflow-hidden
        ${collapsed ? "w-[52px]" : "w-52"}
        ${!pinned && !collapsed ? "shadow-xl" : ""}
        ${className}
      `}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Logo / Collapse Toggle */}
      <div className={`h-14 flex items-center flex-shrink-0 ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
        <Link href="/dashboard/boards" className="flex items-center flex-shrink-0">
          {collapsed ? (
            <svg width="18" height="20" viewBox="0 0 22 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0 2.14941H5.18129L10.4949 17.1862L15.8305 2.14941H21.0339L12.9422 22.2352H8.04755L0 2.14941Z" fill="black"/>
            </svg>
          ) : (
            <img src="/logo.svg" alt="Vergo" className="h-6 w-auto" />
          )}
        </Link>
        {!collapsed && onTogglePin && (
          <button
            onClick={onTogglePin}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title={pinned ? "Collapse sidebar" : "Pin sidebar open"}
          >
            {pinned ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 17l-5-5 5-5" />
                <path d="M18 17l-5-5 5-5" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 17l5-5-5-5" />
                <path d="M6 17l5-5-5-5" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 pt-2 overflow-y-auto flex flex-col">

        {/* ── Organize ── */}
        {!collapsed && (
          <div className="px-4 pt-3 pb-1">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Organize</span>
          </div>
        )}
        {collapsed && <div className="pt-1" />}
        <ul className={collapsed ? "space-y-1" : "space-y-0.5"}>
          {/* Tasks */}
          {hasAccess("boards") && (
            <li>
              <Link
                href="/dashboard/boards"
                title={collapsed ? UI_LABELS.jobsNavLabel : undefined}
                className={navCls(isOnTasksPage)}
              >
                <TasksIcon className="w-[18px] h-[18px] flex-shrink-0" />
                <span className={labelCls}>{UI_LABELS.jobsNavLabel}</span>
              </Link>
            </li>
          )}

          {/* Requests */}
          {hasAccess("requests") && (() => {
            const isActive = pathname === "/dashboard/requests" || pathname.startsWith("/dashboard/requests/")
            return (
              <li>
                <Link
                  href="/dashboard/requests"
                  title={collapsed ? "Requests" : undefined}
                  className={navCls(isActive)}
                >
                  <RequestsIcon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className={labelCls}>Requests</span>
                </Link>
              </li>
            )
          })()}

          {/* Automations */}
          {hasAccess("agents") && (() => {
            const isActive = pathname === "/dashboard/automations" || pathname.startsWith("/dashboard/automations/")
            return (
              <li>
                <Link
                  href="/dashboard/automations"
                  title={collapsed ? "Agents" : undefined}
                  className={navCls(isActive)}
                >
                  <AgentsIcon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className={labelCls}>Agents</span>
                </Link>
              </li>
            )
          })()}
        </ul>

        {/* ── Collect ── */}
        {!collapsed && (
          <div className="px-4 pt-4 pb-1">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Collect</span>
          </div>
        )}
        {collapsed && <div className="pt-2 mx-2 border-t border-gray-100 mt-2" />}
        <ul className={collapsed ? "space-y-1" : "space-y-0.5"}>
          {/* Inbox */}
          {hasAccess("inbox") && (
            <li>
              <Link
                href="/dashboard/inbox"
                title={collapsed ? "Inbox" : undefined}
                className={navCls(isOnInboxPage)}
              >
                <div className="relative flex-shrink-0">
                  <InboxIcon className="w-[18px] h-[18px]" />
                  {inboxUnread > 0 && collapsed && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-600 rounded-full" />
                  )}
                </div>
                <span className={labelCls}>Inbox</span>
                {inboxUnread > 0 && !collapsed && (
                  <span className="bg-blue-600 text-white text-[10px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1">
                    {inboxUnread > 99 ? "99+" : inboxUnread}
                  </span>
                )}
              </Link>
            </li>
          )}

          {/* Documents */}
          {hasAccess("collection") && (() => {
            const isActive = pathname === "/dashboard/collection" || (pathname.startsWith("/dashboard/collection/") && pathname !== "/dashboard/collection/expenses" && pathname !== "/dashboard/collection/invoices")
            return (
              <li>
                <Link
                  href="/dashboard/collection"
                  title={collapsed ? "Documents" : undefined}
                  className={navCls(isActive)}
                >
                  <DocumentIcon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className={labelCls}>Documents</span>
                </Link>
              </li>
            )
          })()}

          {/* Expenses - feature-flagged */}
          {hasAccess("collection") && (() => {
            const hasModule = !!orgFeatures.expenses
            const href = hasModule ? MODULE_EXTERNAL_URL : "/dashboard/collection/expenses"
            const isActive = !hasModule && pathname === "/dashboard/collection/expenses"
            return (
              <li>
                {hasModule ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={collapsed ? "Expenses" : undefined}
                    className={navCls(false)}
                  >
                    <ExpensesIcon className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className={labelCls}>Expenses</span>
                  </a>
                ) : (
                  <Link
                    href={href}
                    title={collapsed ? "Expenses" : undefined}
                    className={navCls(isActive)}
                  >
                    <ExpensesIcon className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className={labelCls}>Expenses</span>
                  </Link>
                )}
              </li>
            )
          })()}

          {/* Invoices - feature-flagged */}
          {hasAccess("collection") && (() => {
            const hasModule = !!orgFeatures.invoices
            const href = hasModule ? MODULE_EXTERNAL_URL : "/dashboard/collection/invoices"
            const isActive = !hasModule && pathname === "/dashboard/collection/invoices"
            return (
              <li>
                {hasModule ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={collapsed ? "Invoices" : undefined}
                    className={navCls(false)}
                  >
                    <InvoicesIcon className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className={labelCls}>Invoices</span>
                  </a>
                ) : (
                  <Link
                    href={href}
                    title={collapsed ? "Invoices" : undefined}
                    className={navCls(isActive)}
                  >
                    <InvoicesIcon className="w-[18px] h-[18px] flex-shrink-0" />
                    <span className={labelCls}>Invoices</span>
                  </Link>
                )}
              </li>
            )
          })()}
        </ul>

        {/* ── Workflows ── */}
        {!collapsed && (
          <div className="px-4 pt-4 pb-1">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Workflows</span>
          </div>
        )}
        {collapsed && <div className="pt-2 mx-2 border-t border-gray-100 mt-2" />}
        <ul className={collapsed ? "space-y-1" : "space-y-0.5"}>
          {/* Reports */}
          {hasAccess("reports") && (() => {
            const isActive = pathname === "/dashboard/reports" || pathname.startsWith("/dashboard/reports/")
            return (
              <li>
                <Link
                  href="/dashboard/reports"
                  title={collapsed ? "Reports" : undefined}
                  className={navCls(isActive)}
                >
                  <ReportsIcon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className={labelCls}>Reports</span>
                </Link>
              </li>
            )
          })()}

          {/* Forms */}
          {hasAccess("forms") && (() => {
            const isActive = pathname === "/dashboard/forms" || pathname.startsWith("/dashboard/forms/")
            return (
              <li>
                <Link
                  href="/dashboard/forms"
                  title={collapsed ? "Forms" : undefined}
                  className={navCls(isActive)}
                >
                  <FormsIcon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className={labelCls}>Forms</span>
                </Link>
              </li>
            )
          })()}

          {/* Reconciliations */}
          {hasAccess("reconciliations") && (() => {
            const isActive = pathname === "/dashboard/reconciliations" || pathname.startsWith("/dashboard/reconciliations/")
            return (
              <li>
                <Link
                  href="/dashboard/reconciliations"
                  title={collapsed ? "Reconciliations" : undefined}
                  className={navCls(isActive)}
                >
                  <ReconciliationsIcon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className={labelCls}>Reconciliations</span>
                </Link>
              </li>
            )
          })()}
        </ul>

        {/* ── Data ── */}
        {!collapsed && (
          <div className="px-4 pt-4 pb-1">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">Data</span>
          </div>
        )}
        {collapsed && <div className="pt-2 mx-2 border-t border-gray-100 mt-2" />}
        <ul className={collapsed ? "space-y-1" : "space-y-0.5"}>
          {/* Databases */}
          {hasAccess("databases") && (() => {
            const isActive = pathname === "/dashboard/databases" || pathname.startsWith("/dashboard/databases/")
            return (
              <li>
                <Link
                  href="/dashboard/databases"
                  title={collapsed ? "Databases" : undefined}
                  className={navCls(isActive)}
                >
                  <DatabasesIcon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className={labelCls}>Databases</span>
                </Link>
              </li>
            )
          })()}
        </ul>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Onboarding Call CTA - Hidden when collapsed */}
        {!collapsed && (
          <div className="mx-2 mb-2">
            <a
              href="https://calendly.com/vergo-ai/vergo-onboarding-call"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 transition-all duration-150"
            >
              <Calendar className="w-4 h-4 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">Book Onboarding</span>
                <span className="text-[11px] text-orange-500">Schedule a call</span>
              </div>
            </a>
          </div>
        )}

        {/* Settings/Management Section (Bottom) */}
        <ul className={`${collapsed ? "space-y-1" : "space-y-0.5"} pb-3 border-t border-gray-100 pt-3 mt-2`}>
          {settingsNavItems
            .filter((item) => {
              // Contacts uses module access check (sidebar-only module)
              if (item.href === "/dashboard/contacts" && !hasAccess("contacts")) return false
              // Team and Settings are always admin-only
              if ((item.href === "/dashboard/settings/team" || item.href === "/dashboard/settings") && !isAdmin) return false
              // Profile is available to everyone, but admins already have Settings
              if (item.href === "/dashboard/profile" && isAdmin) return false
              return true
            })
            .map((item) => {
            let isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            if (item.href === "/dashboard/settings" && (pathname.startsWith("/dashboard/settings/team") || pathname === "/dashboard/profile")) {
              isActive = false
            }
            const Icon = item.icon

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={navCls(isActive)}
                >
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                  <span className={settingsLabelCls}>
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

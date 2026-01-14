"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  CheckSquare, 
  Users, 
  UserCircle, 
  Settings,
  Home
} from "lucide-react"
import { UI_LABELS } from "@/lib/ui-labels"

interface SidebarProps {
  className?: string
}

// Feature flag check for Jobs UI
function isJobsUIEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JOBS_UI === "true"
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
    icon: CheckSquare,
    featureFlag: isJobsUIEnabled 
  },
  { 
    href: "/dashboard/contacts", 
    label: "Contacts", 
    icon: Users 
  },
  { 
    href: "/dashboard/settings/team", 
    label: "Team", 
    icon: UserCircle 
  },
  { 
    href: "/dashboard/settings", 
    label: "Settings", 
    icon: Settings 
  },
]

export function Sidebar({ className = "" }: SidebarProps) {
  const [expanded, setExpanded] = useState(false)
  const pathname = usePathname()

  return (
    <div
      className={`
        fixed left-0 top-0 h-full bg-white border-r border-gray-100 z-40
        flex flex-col
        transition-all duration-200 ease-in-out
        ${expanded ? "w-56" : "w-16"}
        ${className}
      `}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* Logo */}
      <div className={`
        h-16 flex items-center border-b border-gray-100
        ${expanded ? "px-4" : "justify-center"}
      `}>
        <Link href="/dashboard/jobs" className="flex items-center gap-3">
          {/* Vergo Logo Icon */}
          <svg 
            width="28" 
            height="28" 
            viewBox="0 0 32 32" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className="flex-shrink-0"
          >
            <path d="M8 4L16 12L8 20L0 12L8 4Z" fill="currentColor"/>
            <path d="M16 4L24 12L16 20L8 12L16 4Z" fill="currentColor" fillOpacity="0.6"/>
            <path d="M16 12L24 20L16 28L8 20L16 12Z" fill="currentColor" fillOpacity="0.3"/>
          </svg>
          {expanded && (
            <span className="text-lg font-semibold text-gray-900">
              vergo
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <ul className="space-y-1">
          {navItems
            .filter((item) => !item.featureFlag || item.featureFlag())
            .map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              const Icon = item.icon
              
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`
                      flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg
                      transition-colors duration-150
                      ${isActive 
                        ? "bg-gray-100 text-gray-900" 
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                      }
                      ${expanded ? "" : "justify-center"}
                    `}
                    title={!expanded ? item.label : undefined}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {expanded && (
                      <span className="text-sm font-medium whitespace-nowrap">
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

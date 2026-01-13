"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { UI_LABELS } from "@/lib/ui-labels"

interface NavLink {
  href: string
  label: string
  featureFlag?: () => boolean
}

// Feature flag check for Quest UI
function isQuestUIEnabled(): boolean {
  return process.env.NEXT_PUBLIC_QUEST_UI === "true"
}

// Feature flag check for Jobs UI
function isJobsUIEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JOBS_UI === "true"
}

const navLinks: NavLink[] = [
  { href: "/dashboard/jobs", label: UI_LABELS.jobsNavLabel, featureFlag: isJobsUIEnabled },
  { href: "/dashboard/requests", label: "Requests" },
  { href: "/dashboard/contacts", label: "Contacts" },
]

// Get the appropriate "New Request" route based on feature flag
export function getNewRequestRoute(): string {
  return isQuestUIEnabled() ? "/dashboard/quest/new" : "/dashboard/compose?mode=request"
}

export function NavLinks() {
  const pathname = usePathname()

  return (
    <div className="hidden sm:flex items-center gap-1 text-sm font-medium">
      {navLinks
        .filter((link) => !link.featureFlag || link.featureFlag())
        .map((link) => {
          const isActive = pathname === link.href || pathname.startsWith(link.href + "/")
          
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-2 rounded-md transition-colors ${
                isActive
                  ? "text-blue-600 bg-blue-50"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              {link.label}
            </Link>
          )
        })}
    </div>
  )
}

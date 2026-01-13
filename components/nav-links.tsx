"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

interface NavLink {
  href: string
  label: string
}

const navLinks: NavLink[] = [
  { href: "/dashboard/requests", label: "Requests" },
  { href: "/dashboard/contacts", label: "Contacts" },
]

// Feature flag check for Quest UI
function isQuestUIEnabled(): boolean {
  return process.env.NEXT_PUBLIC_QUEST_UI === "true"
}

// Get the appropriate "New Request" route based on feature flag
export function getNewRequestRoute(): string {
  return isQuestUIEnabled() ? "/dashboard/quest/new" : "/dashboard/compose?mode=request"
}

export function NavLinks() {
  const pathname = usePathname()

  return (
    <div className="hidden sm:flex items-center gap-1 text-sm font-medium">
      {navLinks.map((link) => {
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

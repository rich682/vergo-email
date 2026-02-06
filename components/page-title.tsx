"use client"

import { usePathname } from "next/navigation"
import { UI_LABELS } from "@/lib/ui-labels"

const PAGE_TITLES: Record<string, string> = {
  "/dashboard/boards": "Boards",
  "/dashboard/jobs": UI_LABELS.jobsPageTitle,
  "/dashboard/contacts": "Contacts",
  "/dashboard/requests": "Requests",
  "/dashboard/settings": "Settings",
  "/dashboard/settings/team": "Team",
  "/dashboard/collection": "Collection",
}

export function PageTitle() {
  const pathname = usePathname()
  
  // Find matching title - check exact match first, then prefix matches
  let title = PAGE_TITLES[pathname]
  
  if (!title) {
    // Check for dynamic routes
    if (pathname.startsWith("/dashboard/jobs/")) {
      title = "Item Details"
    } else if (pathname.startsWith("/dashboard/review/")) {
      title = "Review"
    }
  }
  
  if (!title) return null
  
  return (
    <h1 className="text-2xl font-display font-normal text-gray-700">
      {title}
    </h1>
  )
}

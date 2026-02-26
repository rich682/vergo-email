"use client"

import { usePathname } from "next/navigation"
import { UI_LABELS } from "@/lib/ui-labels"

const PAGE_TITLES: Record<string, string> = {
  "/dashboard/boards": "Boards",
  "/dashboard/inbox": "Inbox",
  "/dashboard/jobs": UI_LABELS.jobsPageTitle,
  "/dashboard/contacts": "Contacts",
  "/dashboard/requests": "Requests",
  "/dashboard/settings": "Settings",
  "/dashboard/settings/team": "Team",
  "/dashboard/settings/accounting": "Settings",
  "/dashboard/settings/integrations": "Settings",
  "/dashboard/settings/role-permissions": "Settings",
  "/dashboard/profile": "Profile Settings",
  "/dashboard/collection": "Collection",
  "/dashboard/collection/invoices": "Collection",
  "/dashboard/collection/expenses": "Collection",
  "/dashboard/reconciliations": "Reconciliations",
  "/dashboard/reconciliations/new": "New Reconciliation",
  "/dashboard/reports": "Reports",
  "/dashboard/reports/new": "New Report Template",
  "/dashboard/databases": "Databases",
  "/dashboard/databases/new": "New Database",
  "/dashboard/forms": "Forms",
  "/dashboard/forms/new": "New Form",
  "/dashboard/automations": "Agents",
  "/dashboard/automations/new": "Agents",
  "/dashboard/agents": "Agents",
  "/dashboard/campaigns": "Campaigns",
  "/dashboard/analysis": "Analytics",
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
    } else if (pathname.startsWith("/dashboard/reports/")) {
      title = "Report Template"
    } else if (pathname.startsWith("/dashboard/databases/")) {
      title = "Database"
    } else if (pathname.startsWith("/dashboard/analysis/chat/")) {
      title = "Analytics"
    } else if (pathname.startsWith("/dashboard/forms/")) {
      title = "Form"
    } else if (pathname.startsWith("/dashboard/reconciliations/")) {
      title = "Reconciliations"
    } else if (pathname.startsWith("/dashboard/automations/")) {
      title = "Agents"
    } else if (pathname.startsWith("/dashboard/agents/")) {
      title = "Agents"
    } else if (pathname.startsWith("/dashboard/requests/")) {
      title = "Requests"
    }
  }
  
  if (!title) return null
  
  return (
    <h1 className="text-2xl font-display font-normal text-gray-700">
      {title}
    </h1>
  )
}

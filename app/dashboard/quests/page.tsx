"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Quests List Page - Redirects to Requests
 * 
 * The /dashboard/quests page is deprecated. Quests are now created via
 * /dashboard/quest/new and appear as Requests in /dashboard/requests
 * after being sent.
 * 
 * This page redirects to /dashboard/requests to avoid confusion.
 */
export default function QuestsListPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect to requests page - quests become requests after sending
    router.replace("/dashboard/requests")
  }, [router])

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-gray-500">Redirecting to Requests...</div>
    </div>
  )
}

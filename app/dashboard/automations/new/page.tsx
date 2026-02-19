"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Agent creation has moved to within tasks — redirect to agents list
export default function NewAutomationPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/dashboard/automations")
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-sm text-gray-500">Redirecting...</p>
    </div>
  )
}

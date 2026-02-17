"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Redirect from old /dashboard/agents to /dashboard/automations */
export default function AgentsRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/dashboard/automations")
  }, [router])

  return null
}

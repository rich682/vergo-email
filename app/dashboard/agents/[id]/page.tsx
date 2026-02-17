"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Redirect from old /dashboard/agents/[id] to /dashboard/automations */
export default function AgentDetailRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/dashboard/automations")
  }, [router])

  return null
}

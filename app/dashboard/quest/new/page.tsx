"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { QuestCreator } from "@/components/quest/quest-creator"

// Feature flag check
function useQuestUIEnabled() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  
  useEffect(() => {
    // Check if QUEST_UI is enabled via API or env
    const checkEnabled = async () => {
      try {
        const res = await fetch("/api/quests/interpret")
        if (res.status === 404) {
          setEnabled(false)
        } else {
          setEnabled(true)
        }
      } catch {
        setEnabled(false)
      }
    }
    checkEnabled()
  }, [])
  
  return enabled
}

export default function NewQuestPage() {
  const router = useRouter()
  const enabled = useQuestUIEnabled()

  // Show loading while checking feature flag
  if (enabled === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  // Show disabled message if feature flag is off
  if (enabled === false) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Feature Not Available</h1>
        <p className="text-gray-600">This feature is not currently enabled.</p>
        <button
          onClick={() => router.push("/dashboard/requests")}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Back to Requests
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <QuestCreator />
    </div>
  )
}

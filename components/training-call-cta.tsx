"use client"

import { useState } from "react"
import { Calendar, X } from "lucide-react"

const CALENDLY_URL = "https://meetings.hubspot.com/rich-kane/vergoclosemanagement?uuid=b8353232-bf3d-40f7-abc6-e779a45afcfc"
const DISMISSED_KEY = "vergo-training-cta-dismissed"

export function TrainingCallCTA() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem(DISMISSED_KEY) === "true"
  })

  if (dismissed) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
      <button
        onClick={() => {
          setDismissed(true)
          localStorage.setItem(DISMISSED_KEY, "true")
        }}
        className="w-7 h-7 rounded-full bg-gray-800/60 hover:bg-gray-800/80 text-white flex items-center justify-center transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => window.open(CALENDLY_URL, "_blank", "noopener,noreferrer")}
        className="
          flex items-center gap-2.5 px-5 py-3 rounded-full
          bg-orange-500 hover:bg-orange-600
          text-white font-medium text-sm
          shadow-lg shadow-orange-500/25 hover:shadow-xl hover:shadow-orange-500/30
          transition-all duration-200 hover:-translate-y-0.5
          active:scale-[0.98]
        "
      >
        <Calendar className="w-4 h-4" />
        Book Free Training Call
      </button>
    </div>
  )
}

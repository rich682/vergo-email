"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { QuestCreator } from "@/components/quest/quest-creator"
import { EmptyState } from "@/components/ui/empty-state"
import { AlertCircle } from "lucide-react"

function useQuestUIEnabled() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  
  useEffect(() => {
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
  const searchParams = useSearchParams()
  const enabled = useQuestUIEnabled()
  
  const jobId = searchParams.get("jobId")
  const [jobName, setJobName] = useState<string | null>(null)
  
  useEffect(() => {
    if (jobId) {
      const fetchJobName = async () => {
        try {
          const res = await fetch(`/api/jobs/${jobId}`)
          if (res.ok) {
            const data = await res.json()
            setJobName(data.job?.name || null)
          }
        } catch (error) {
          console.error("Failed to fetch job:", error)
        }
      }
      fetchJobName()
    }
  }, [jobId])

  if (enabled === null) {
    return (
      <div className="min-h-screen bg-white">
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
        </div>
      </div>
    )
  }

  if (enabled === false) {
    return (
      <div className="min-h-screen bg-white">
        <div className="px-8 py-6">
          <div className="max-w-lg mx-auto mt-12">
            <div className="border border-dashed border-gray-200 rounded-lg">
              <EmptyState
                icon={<AlertCircle className="w-6 h-6" />}
                title="Feature Not Available"
                description="This feature is not currently enabled for your organization."
                action={{
                  label: "Back to Requests",
                  onClick: () => router.push("/dashboard/requests")
                }}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <QuestCreator 
        jobId={jobId} 
        jobName={jobName || undefined}
        onComplete={jobId ? () => router.push(`/dashboard/jobs/${jobId}`) : undefined}
      />
    </div>
  )
}

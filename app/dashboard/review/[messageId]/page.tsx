"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { ReviewLayout } from "@/components/review/review-layout"
import { Loader2 } from "lucide-react"

interface ReviewData {
  message: {
    id: string
    direction: string
    subject: string | null
    body: string | null
    htmlBody: string | null
    fromAddress: string
    toAddress: string
    createdAt: string
    aiClassification: string | null
    aiReasoning: string | null
    isAutoReply: boolean
    reviewNotes: string | null
  }
  task: {
    id: string
    status: string
    campaignName: string | null
    aiSummary: string | null
    aiSummaryConfidence: string | null
    riskLevel: string | null
    riskReason: string | null
    entity: {
      id: string
      firstName: string
      lastName: string | null
      email: string | null
    } | null
  }
  job: {
    id: string
    name: string
    board: {
      id: string
      name: string
    } | null
  } | null
  thread: Array<{
    id: string
    direction: string
    subject: string | null
    body: string | null
    htmlBody: string | null
    fromAddress: string
    toAddress: string
    createdAt: string
    attachments: any
    aiClassification: string | null
    aiReasoning: string | null
    isAutoReply: boolean
    openedAt: string | null
    openedCount: number
  }>
  attachments: Array<{
    id: string
    filename: string
    fileKey: string
    fileUrl: string | null
    fileSize: number | null
    mimeType: string | null
    source: string
    status: string
    receivedAt: string
  }>
  reviewStatus: string
  reviewedAt: string | null
  reviewedBy: {
    id: string
    name: string | null
    email: string
  } | null
}

export default function ReviewPage() {
  const router = useRouter()
  const params = useParams()
  const messageId = params.messageId as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewData, setReviewData] = useState<ReviewData | null>(null)

  const fetchReviewData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/review/${messageId}`, {
        credentials: "include"
      })

      if (!response.ok) {
        const data = await response.json()
        if (response.status === 404) {
          // Guard: Invalid review - redirect back
          router.push("/dashboard/requests?notice=invalid-review")
          return
        }
        throw new Error(data.error || "Failed to load review")
      }

      const data = await response.json()
      setReviewData(data)
    } catch (err: any) {
      console.error("Error fetching review data:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [messageId, router])

  useEffect(() => {
    if (messageId) {
      fetchReviewData()
    }
  }, [messageId, fetchReviewData])

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Go back to requests or referrer
        router.back()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          <p className="text-sm text-gray-500">Loading review...</p>
        </div>
      </div>
    )
  }

  if (error || !reviewData) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || "Failed to load review"}</p>
          <button
            onClick={() => router.push("/dashboard/requests")}
            className="text-sm text-blue-600 hover:underline"
          >
            Return to Requests
          </button>
        </div>
      </div>
    )
  }

  return (
    <ReviewLayout
      data={reviewData}
      onRefresh={fetchReviewData}
      onClose={() => router.back()}
    />
  )
}

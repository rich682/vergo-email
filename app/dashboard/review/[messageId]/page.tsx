"use client"

import { useParams } from "next/navigation"
import { ReplyReviewLayout } from "@/components/reply-review"

export default function ReviewPage() {
  const params = useParams()
  const messageId = params.messageId as string

  return <ReplyReviewLayout messageId={messageId} />
}

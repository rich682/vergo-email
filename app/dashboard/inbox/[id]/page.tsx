"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export default function InboxDetailPage() {
  const params = useParams()
  const [task, setTask] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [replyText, setReplyText] = useState("")

  useEffect(() => {
    fetchTask()
    fetchMessages()
  }, [params.id])

  const fetchTask = async () => {
    try {
      const response = await fetch(`/api/tasks/${params.id}`)
      if (response.ok) {
        const data = await response.json()
        setTask(data)
      }
    } catch (error) {
      console.error("Error fetching inbox item:", error)
    }
  }

  const fetchMessages = async () => {
    try {
      const response = await fetch(`/api/tasks/${params.id}/messages`)
      if (response.ok) {
        const data = await response.json()
        setMessages(data)
      }
    } catch (error) {
      console.error("Error fetching messages:", error)
    }
  }

  const handleReply = async () => {
    try {
      const response = await fetch(`/api/tasks/${params.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyText })
      })

      if (response.ok) {
        setReplyText("")
        fetchMessages()
        fetchTask()
      }
    } catch (error) {
      console.error("Error sending reply:", error)
    }
  }

  if (!task) {
    return <div>Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Inbox Details</h2>
        <p className="text-gray-600">{task.entity?.firstName || task.entity?.email}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Message Thread</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`p-4 rounded ${
                    message.direction === "OUTBOUND"
                      ? "bg-blue-50"
                      : "bg-gray-50"
                  }`}
                >
                  <div className="flex justify-between mb-2">
                    <span className="font-medium">
                      {message.direction === "OUTBOUND" ? "You" : message.fromAddress}
                    </span>
                    <span className="text-sm text-gray-500">
                      {new Date(message.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm">{message.body || message.htmlBody}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Reply</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply..."
                rows={6}
              />
              <Button onClick={handleReply}>Send Reply</Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Inbox Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <span className="text-sm font-medium">Status:</span>
                <span className="ml-2 text-sm">{task.status}</span>
              </div>
              <div>
                <span className="text-sm font-medium">Campaign Name:</span>
                <span className="ml-2 text-sm">{task.campaignName || "None"}</span>
              </div>
              {task.campaignType && (
                <div>
                  <span className="text-sm font-medium">Campaign Type:</span>
                  <span className="ml-2 text-sm">{task.campaignType}</span>
                </div>
              )}
              {task.aiReasoning && (
                <div>
                  <span className="text-sm font-medium">AI Reasoning:</span>
                  <pre className="mt-2 text-xs bg-gray-100 p-2 rounded">
                    {JSON.stringify(task.aiReasoning, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}












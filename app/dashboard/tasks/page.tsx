"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

export default function TasksPage() {
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 30000) // Poll every 30 seconds
    return () => clearInterval(interval)
  }, [])

  const fetchTasks = async () => {
    try {
      const response = await fetch("/api/tasks")
      if (response.ok) {
        const data = await response.json()
        setTasks(data)
      }
    } catch (error) {
      console.error("Error fetching tasks:", error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      AWAITING_RESPONSE: "bg-yellow-100 text-yellow-800",
      REPLIED: "bg-blue-100 text-blue-800",
      HAS_ATTACHMENTS: "bg-purple-100 text-purple-800",
      FULFILLED: "bg-green-100 text-green-800",
      REJECTED: "bg-red-100 text-red-800",
      FLAGGED: "bg-orange-100 text-orange-800"
    }
    return colors[status] || "bg-gray-100 text-gray-800"
  }

  if (loading) {
    return <div>Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Tasks</h2>
        <p className="text-gray-600">Track email responses and submissions</p>
      </div>

      <div className="space-y-4">
        {tasks.map((task) => (
          <Link key={task.id} href={`/dashboard/tasks/${task.id}`}>
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{task.entity?.name || task.entity?.email}</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">
                      {task.campaign?.name || "No campaign"}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(task.status)}`}>
                    {task.status.replace(/_/g, " ")}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500">
                  Created: {new Date(task.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}

        {tasks.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No tasks yet. Compose an email to get started.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}


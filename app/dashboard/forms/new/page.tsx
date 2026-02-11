"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Plus, ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export default function NewFormPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  // Form data
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const handleCreate = async () => {
    if (!name.trim()) {
      alert("Please enter a form name")
      return
    }

    try {
      setLoading(true)
      const response = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          fields: [],
          settings: {
            allowEdit: false,
            enforceDeadline: false,
          },
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMsg = typeof data.error === 'string' ? data.error :
                         typeof data.error === 'object' ? JSON.stringify(data.error) :
                         "Failed to create form"
        throw new Error(errorMsg)
      }

      if (!data.form?.id) {
        throw new Error("Invalid response from server")
      }

      router.push(`/dashboard/forms/${data.form.id}`)
    } catch (error: any) {
      console.error("Error creating form:", error)
      const msg = typeof error.message === 'string' ? error.message : "Failed to create form"
      alert(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/forms">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Create New Form</h1>
              <p className="text-sm text-gray-500">
                Set up a form to collect data from your team or stakeholders
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-3 pb-4 border-b">
              <div className="p-2 bg-orange-50 rounded-lg">
                <ClipboardList className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h2 className="font-medium text-gray-900">Form Details</h2>
                <p className="text-sm text-gray-500">
                  Give your form a name and description
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Form Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Monthly Expense Report"
                  className="mt-1.5"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) {
                      handleCreate()
                    }
                  }}
                />
              </div>

              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the purpose of this form..."
                  className="mt-1.5"
                  rows={3}
                />
              </div>
            </div>
          </div>

          {/* Create Button */}
          <div className="flex items-center justify-end mt-8 pt-6 border-t">
            <Button
              onClick={handleCreate}
              disabled={loading || !name.trim()}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Form
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

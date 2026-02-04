"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Database, Plus, ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DatabaseOption {
  id: string
  name: string
  description: string | null
  schema: {
    columns: Array<{
      key: string
      label: string
      dataType: string
    }>
  }
}

type Step = "details" | "database"

export default function NewFormPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("details")
  const [loading, setLoading] = useState(false)
  const [databases, setDatabases] = useState<DatabaseOption[]>([])
  const [loadingDatabases, setLoadingDatabases] = useState(false)

  // Form data
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string>("none")

  // Fetch databases when moving to database step
  useEffect(() => {
    if (step === "database") {
      fetchDatabases()
    }
  }, [step])

  const fetchDatabases = async () => {
    try {
      setLoadingDatabases(true)
      const response = await fetch("/api/databases", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setDatabases(data.databases || [])
      }
    } catch (error) {
      console.error("Error fetching databases:", error)
    } finally {
      setLoadingDatabases(false)
    }
  }

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
          databaseId: selectedDatabaseId && selectedDatabaseId !== "none" ? selectedDatabaseId : undefined,
          fields: [],
          settings: {
            allowEdit: false,
            enforceDeadline: false,
          },
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create form")
      }

      const data = await response.json()
      router.push(`/dashboard/forms/${data.form.id}`)
    } catch (error: any) {
      console.error("Error creating form:", error)
      alert(error.message || "Failed to create form")
    } finally {
      setLoading(false)
    }
  }

  const canProceed = step === "details" ? name.trim().length > 0 : true

  return (
    <div className="min-h-screen bg-gray-50">
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
                Set up a form to collect data from your team
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="max-w-3xl mx-auto px-6 py-4">
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              step === "details"
                ? "bg-orange-100 text-orange-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs font-medium">
              1
            </span>
            Details
          </div>
          <div className="w-8 h-px bg-gray-300" />
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              step === "database"
                ? "bg-orange-100 text-orange-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-current/20 flex items-center justify-center text-xs font-medium">
              2
            </span>
            Database
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          {step === "details" && (
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
          )}

          {step === "database" && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b">
                <div className="p-2 bg-orange-50 rounded-lg">
                  <Database className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h2 className="font-medium text-gray-900">Link to Database (Optional)</h2>
                  <p className="text-sm text-gray-500">
                    Form responses can be stored in a database for reporting
                  </p>
                </div>
              </div>

              {loadingDatabases ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label>Target Database</Label>
                    <Select
                      value={selectedDatabaseId}
                      onValueChange={setSelectedDatabaseId}
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Select a database (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No database</SelectItem>
                        {databases.map((db) => (
                          <SelectItem key={db.id} value={db.id}>
                            {db.name}
                            {db.schema?.columns && (
                              <span className="text-gray-400 ml-2">
                                ({db.schema.columns.length} columns)
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500 mt-1.5">
                      You can link a database later or create one from the form builder.
                    </p>
                  </div>

                  {selectedDatabaseId && selectedDatabaseId !== "none" && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Database columns will be available as form fields:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {databases
                          .find((db) => db.id === selectedDatabaseId)
                          ?.schema?.columns?.map((col) => (
                            <span
                              key={col.key}
                              className="px-2 py-1 bg-white rounded border text-xs text-gray-600"
                            >
                              {col.label}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {databases.length === 0 && (
                    <div className="text-center py-6 bg-gray-50 rounded-lg">
                      <Database className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">
                        No databases yet.{" "}
                        <Link
                          href="/dashboard/databases/new"
                          className="text-orange-600 hover:underline"
                        >
                          Create one
                        </Link>{" "}
                        or skip this step.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t">
            {step === "details" ? (
              <div />
            ) : (
              <Button
                variant="outline"
                onClick={() => setStep("details")}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}

            {step === "details" ? (
              <Button
                onClick={() => setStep("database")}
                disabled={!canProceed}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleCreate}
                disabled={loading}
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
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

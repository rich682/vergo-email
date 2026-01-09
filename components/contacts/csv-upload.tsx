"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Group {
  id: string
  name: string
  color?: string | null
}

interface CSVUploadProps {
  onSuccess: () => void
}

export function CSVUpload({ onSuccess }: CSVUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [updateExisting, setUpdateExisting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])

  useEffect(() => {
    const loadGroups = async () => {
      try {
        const res = await fetch("/api/groups")
        if (res.ok) {
          const data = await res.json()
          setGroups(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        console.error("Failed to load groups", err)
      }
    }
    loadGroups()
  }, [])

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError("Please select a CSV file")
      return
    }

    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("updateExisting", updateExisting ? "true" : "false")
      if (selectedGroupIds.length > 0) {
        formData.append("groupIds", JSON.stringify(selectedGroupIds))
      }

      const res = await fetch("/api/entities/bulk", {
        method: "POST",
        body: formData
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to import CSV")
      }

      onSuccess()
      setFile(null)
    } catch (err: any) {
      setError(err?.message || "Failed to import CSV")
    } finally {
      setUploading(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="csv-file">CSV File</Label>
        <Input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <p className="text-xs text-gray-500">Headers: firstName,email,phone</p>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={updateExisting}
          onChange={(e) => setUpdateExisting(e.target.checked)}
        />
        Update existing contacts (matched by email)
      </label>

      <div className="space-y-2">
        <Label>Assign imported contacts to group(s) (optional)</Label>
        <div className="flex flex-wrap gap-2">
          {groups.length === 0 && (
            <p className="text-sm text-gray-500">No groups available</p>
          )}
          {groups.map((g) => {
            const checked = selectedGroupIds.includes(g.id)
            return (
              <button
                type="button"
                key={g.id}
                onClick={() => toggleGroup(g.id)}
                className={`rounded-full px-3 py-1 text-sm border ${
                  checked
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-800 border-gray-200"
                }`}
              >
                {g.name}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-500">
          Selected groups will be applied to all imported contacts
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <Button type="submit" disabled={uploading}>
        {uploading ? "Importing..." : "Import CSV"}
      </Button>
    </form>
  )
}

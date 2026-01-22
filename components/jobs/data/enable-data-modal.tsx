"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Database, Loader2 } from "lucide-react"

interface EnableResult {
  enabled: boolean
  template: {
    id: string
    name: string
  }
  lineage: {
    id: string
    datasetTemplateId: string
  }
}

interface EnableDataModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskInstanceId: string
  taskName: string
  onEnabled: (result: EnableResult) => void
}

/**
 * Modal to confirm enabling Data for a task.
 * 
 * Flow:
 * 1. User confirms (optionally customizes name)
 * 2. POST to /api/task-instances/[id]/data/enable
 * 3. On success, calls onEnabled with the result
 * 4. Parent component opens schema editor
 */
export function EnableDataModal({
  open,
  onOpenChange,
  taskInstanceId,
  taskName,
  onEnabled,
}: EnableDataModalProps) {
  const [customName, setCustomName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEnable = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/task-instances/${taskInstanceId}/data/enable`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: customName.trim() || undefined, // Use default if empty
          }),
        }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to enable data")
      }

      const result: EnableResult = await response.json()
      onOpenChange(false)
      onEnabled(result)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to enable data"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setCustomName("")
      setError(null)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            Enable Data
          </DialogTitle>
          <DialogDescription>
            Enable data management for <strong>{taskName}</strong>. You'll be able to define a schema, upload spreadsheets, and track period-based data.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div>
            <Label htmlFor="datasetName">Dataset Name (optional)</Label>
            <Input
              id="datasetName"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={`${taskName} Data`}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave blank to use the default name
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleEnable} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Enable Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

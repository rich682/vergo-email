"use client"

import { useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { TriggerDescriptionText } from "../shared/trigger-description"

interface SettingsTabProps {
  rule: {
    id: string
    name: string
    trigger: string
    conditions: Record<string, unknown>
    isActive: boolean
    cronExpression: string | null
    timezone: string | null
    nextRunAt: string | null
  }
  canManage: boolean
  onUpdate: () => void
  onDelete: () => void
}

export function SettingsTab({ rule, canManage, onUpdate, onDelete }: SettingsTabProps) {
  const [name, setName] = useState(rule.name)
  const [isActive, setIsActive] = useState(rule.isActive)
  const [saving, setSaving] = useState(false)

  const hasChanges = name !== rule.name || isActive !== rule.isActive

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/automation-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, name: name.trim(), isActive }),
      })
      if (res.ok) {
        onUpdate()
      }
    } catch {
      // Handle error
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* General settings */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-4">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">General</h3>

        <div>
          <Label className="text-xs text-gray-500">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1"
            disabled={!canManage}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm text-gray-700">Active</Label>
            <p className="text-xs text-gray-400">When active, this agent will run on its trigger.</p>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={setIsActive}
            disabled={!canManage}
          />
        </div>

        {canManage && hasChanges && (
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save Changes
          </Button>
        )}
      </div>

      {/* Trigger info */}
      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Trigger</h3>
        <TriggerDescriptionText
          trigger={rule.trigger}
          conditions={rule.conditions}
          className="text-sm text-gray-700"
        />
        {rule.nextRunAt && (
          <p className="text-xs text-gray-500">
            Next scheduled run: {new Date(rule.nextRunAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Danger zone */}
      {canManage && (
        <div className="border border-red-200 rounded-lg p-4">
          <h3 className="text-xs font-medium text-red-600 uppercase tracking-wider mb-2">Danger Zone</h3>
          <p className="text-xs text-gray-500 mb-3">
            Deactivating this agent will stop it from running. Existing run history will be preserved.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Delete Agent
          </Button>
        </div>
      )}
    </div>
  )
}

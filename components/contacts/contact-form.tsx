"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Group {
  id: string
  name: string
  color?: string | null
}

interface EntityInput {
  id?: string
  firstName?: string
  email?: string
  phone?: string
  groups?: { id: string; name: string }[]
}

interface ContactFormProps {
  entity?: EntityInput
  onSuccess: () => void
  onCancel: () => void
}

export function ContactForm({ entity, onSuccess, onCancel }: ContactFormProps) {
  const [firstName, setFirstName] = useState(entity?.firstName || "")
  const [email, setEmail] = useState(entity?.email || "")
  const [phone, setPhone] = useState(entity?.phone || "")
  const [groupIds, setGroupIds] = useState<string[]>(
    entity?.groups?.map((g) => g.id) || []
  )
  const [groups, setGroups] = useState<Group[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    setFirstName(entity?.firstName || "")
    setEmail(entity?.email || "")
    setPhone(entity?.phone || "")
    setGroupIds(entity?.groups?.map((g) => g.id) || [])
  }, [entity])

  const toggleGroup = (id: string) => {
    setGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const payload = {
        firstName,
        email,
        phone: phone || undefined,
        groupIds
      }

      const res = await fetch(
        entity?.id ? `/api/entities/${entity.id}` : "/api/entities",
        {
          method: entity?.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      )

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save contact")
      }

      onSuccess()
    } catch (err: any) {
      setError(err?.message || "Failed to save contact")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="firstName">Name</Label>
        <Input
          id="firstName"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Contact name"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
        />
      </div>
      <div className="space-y-2">
        <Label>Groups</Label>
        <div className="flex flex-wrap gap-2">
          {groups.length === 0 && (
            <p className="text-sm text-gray-500">No groups available</p>
          )}
          {groups.map((g) => {
            const checked = groupIds.includes(g.id)
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
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : entity?.id ? "Update Contact" : "Create Contact"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

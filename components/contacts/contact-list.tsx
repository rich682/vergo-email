"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Group {
  id: string
  name: string
  color?: string | null
}

interface Entity {
  id: string
  firstName: string
  email: string
  phone?: string
  isInternal?: boolean
  groups: Group[]
}

interface ContactListProps {
  entities: Entity[]
  groups: Group[]
  search: string
  selectedGroupId?: string
  onSearchChange: (value: string) => void
  onGroupFilterChange: (value?: string) => void
  onEdit: (entity: Entity) => void
  onDelete: () => void
}

export function ContactList({
  entities,
  groups,
  search,
  selectedGroupId,
  onSearchChange,
  onGroupFilterChange,
  onEdit,
  onDelete
}: ContactListProps) {
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/entities/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to delete contact")
      }
      onDelete()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-search">Search</Label>
          <Input
            id="contact-search"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-filter">Group</Label>
          <Select
            value={selectedGroupId}
            onValueChange={(value) => onGroupFilterChange(value || undefined)}
          >
            <SelectTrigger id="group-filter">
              <SelectValue placeholder="All groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All groups</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="grid grid-cols-5 gap-3 px-4 py-3 text-sm font-medium text-gray-600 border-b border-gray-200">
          <div className="col-span-2">Name</div>
          <div>Email</div>
          <div>Groups</div>
          <div className="text-right">Actions</div>
        </div>
        {entities.length === 0 && (
          <div className="p-4 text-sm text-gray-500">No contacts found.</div>
        )}
        {entities.map((entity) => (
          <div
            key={entity.id}
            className="grid grid-cols-5 gap-3 px-4 py-3 text-sm border-b border-gray-100 last:border-0"
          >
            <div className="col-span-2">
              <div className="font-medium">{entity.firstName}</div>
              {entity.phone && <div className="text-xs text-gray-500">{entity.phone}</div>}
            </div>
            <div className="break-all">{entity.email}</div>
            <div className="flex flex-wrap gap-1">
              {entity.groups.map((g) => (
                <span
                  key={g.id}
                  className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                >
                  {g.name}
                </span>
              ))}
              {entity.groups.length === 0 && (
                <span className="text-xs text-gray-500">None</span>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(entity)}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDelete(entity.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BulkActionToolbar } from "./bulk-action-toolbar"
import { X } from "lucide-react"

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
  contactType?: string
  contactTypeCustomLabel?: string
}

interface ContactListProps {
  entities: Entity[]
  groups: Group[]
  search: string
  selectedGroupId?: string
  selectedContactType?: string
  selectedEntityIds: string[]
  onSearchChange: (value: string) => void
  onGroupFilterChange: (value?: string) => void
  onContactTypeChange: (value?: string) => void
  onSelectedEntitiesChange: (ids: string[]) => void
  onEdit: (entity: Entity) => void
  onDelete: () => void
}

// Built-in contact types for filtering and bulk actions
const CONTACT_TYPES = [
  { id: "CLIENT", label: "Client" },
  { id: "VENDOR", label: "Vendor" },
  { id: "EMPLOYEE", label: "Employee" },
  { id: "CONTRACTOR", label: "Contractor" },
  { id: "MANAGEMENT", label: "Management" },
]

export function ContactList({
  entities,
  groups,
  search,
  selectedGroupId,
  selectedContactType,
  selectedEntityIds,
  onSearchChange,
  onGroupFilterChange,
  onContactTypeChange,
  onSelectedEntitiesChange,
  onEdit,
  onDelete
}: ContactListProps) {
  // Always show selection column
  const showSelectionColumn = true

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

  const toggleEntitySelection = (id: string) => {
    if (selectedEntityIds.includes(id)) {
      onSelectedEntitiesChange(selectedEntityIds.filter(eid => eid !== id))
    } else {
      onSelectedEntitiesChange([...selectedEntityIds, id])
    }
  }

  const selectAllEntities = () => {
    onSelectedEntitiesChange(entities.map(e => e.id))
  }

  const clearEntitySelection = () => {
    onSelectedEntitiesChange([])
  }

  const handleBulkActionComplete = () => {
    onDelete() // This refreshes the entity list
  }

  return (
    <div className="space-y-4">
      {/* Filters Row */}
      <div className="grid gap-4 md:grid-cols-4">
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
          <Label htmlFor="type-filter">Organization</Label>
          <Select
            value={selectedContactType ?? "all"}
            onValueChange={(value) =>
              onContactTypeChange(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger id="type-filter">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {CONTACT_TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-filter">Group</Label>
          <Select
            value={selectedGroupId ?? "all"}
            onValueChange={(value) =>
              onGroupFilterChange(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger id="group-filter">
              <SelectValue placeholder="All groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Personalization Tags filter - hidden for now */}
        {/* <div className="space-y-2">
          <Label>Personalization Tags</Label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setStateKeyDropdownOpen(!stateKeyDropdownOpen)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-200 rounded-md bg-white hover:bg-gray-50"
            >
              <span className={selectedStateKeys.length > 0 ? "text-gray-900" : "text-gray-500"}>
                {selectedStateKeys.length === 0 
                  ? "All tags" 
                  : selectedStateKeys.length === 1
                    ? selectedStateKeys[0]
                    : `${selectedStateKeys.length} tags selected`}
              </span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {stateKeyDropdownOpen && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {availableStateKeys.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-gray-500">No tags available</div>
                ) : (
                  <>
                    <div className="px-3 py-2 border-b border-gray-100 flex gap-2">
                      <button
                        type="button"
                        onClick={selectAllStateKeys}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Select all
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={clearStateKeys}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                    {availableStateKeys.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleStateKey(key)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        <div className={`w-4 h-4 border rounded flex items-center justify-center ${
                          selectedStateKeys.includes(key) 
                            ? "bg-blue-600 border-blue-600" 
                            : "border-gray-300"
                        }`}>
                          {selectedStateKeys.includes(key) && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                        <span>{key}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div> */}
      </div>

      {/* Selected state keys pills - hidden for now */}
      {/* {selectedStateKeys.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-500">Filtering by:</span>
          {selectedStateKeys.map((key) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full"
            >
              {key}
              <button
                type="button"
                onClick={() => toggleStateKey(key)}
                className="hover:bg-blue-200 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={clearStateKeys}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Clear all
          </button>
        </div>
      )} */}

      {/* Selection bar */}
      {entities.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border border-gray-200 rounded-md">
          <span className="text-sm text-gray-700">
            {selectedEntityIds.length} of {entities.length} selected
          </span>
          <button
            type="button"
            onClick={selectAllEntities}
            className="text-sm text-blue-600 hover:underline"
          >
            Select all
          </button>
          {selectedEntityIds.length > 0 && (
            <button
              type="button"
              onClick={clearEntitySelection}
              className="text-sm text-gray-500 hover:underline"
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-600 font-medium">
              {showSelectionColumn && (
                <th className="px-4 py-3 w-10">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedEntityIds.length === entities.length) {
                        clearEntitySelection()
                      } else {
                        selectAllEntities()
                      }
                    }}
                    className={`w-5 h-5 border rounded flex items-center justify-center ${
                      selectedEntityIds.length === entities.length && entities.length > 0
                        ? "bg-blue-600 border-blue-600"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {selectedEntityIds.length === entities.length && entities.length > 0 && (
                      <Check className="w-3 h-3 text-white" />
                    )}
                  </button>
                </th>
              )}
              <th className="px-4 py-3 w-40">Name</th>
              <th className="px-4 py-3 w-48">Email</th>
              <th className="px-4 py-3 w-24">Org</th>
              <th className="px-4 py-3 w-28">Groups</th>
              {/* Tags column hidden for now */}
              {/* <th className="px-4 py-3">Tags</th> */}
              <th className="px-4 py-3 w-32 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entities.length === 0 && (
              <tr>
                <td colSpan={showSelectionColumn ? 6 : 5} className="px-4 py-4 text-gray-500">
                  No contacts found.
                </td>
              </tr>
            )}
            {entities.map((entity) => (
              <tr
                key={entity.id}
                className={`border-b border-gray-100 last:border-0 ${
                  selectedEntityIds.includes(entity.id) ? "bg-blue-50" : ""
                }`}
              >
                {showSelectionColumn && (
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => toggleEntitySelection(entity.id)}
                      className={`w-5 h-5 border rounded flex items-center justify-center ${
                        selectedEntityIds.includes(entity.id)
                          ? "bg-blue-600 border-blue-600"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {selectedEntityIds.includes(entity.id) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </button>
                  </td>
                )}
                <td className="px-4 py-2">
                  <div className="font-medium">{entity.firstName}</div>
                  {entity.phone && <div className="text-xs text-gray-500">{entity.phone}</div>}
                </td>
                <td className="px-4 py-2 text-gray-600">{entity.email}</td>
                <td className="px-4 py-2">
                  <span className="text-xs inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                    {entity.contactType === "CUSTOM"
                      ? entity.contactTypeCustomLabel || "Custom"
                      : entity.contactType || "Unknown"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {entity.groups.length > 0 ? (
                    <span className="text-gray-600 text-xs">
                      {entity.groups.map(g => g.name).join(", ")}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">None</span>
                  )}
                </td>
                {/* Tags column data hidden for now */}
                {/* <td className="px-4 py-2">
                  {entity.contactStates && entity.contactStates.length > 0 ? (
                    <span className="text-gray-600 text-xs" title={entity.contactStates.map(cs => cs.stateKey).join(", ")}>
                      {entity.contactStates.map(cs => cs.stateKey).join(", ")}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">None</span>
                  )}
                </td> */}
                <td className="px-4 py-2">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={selectedEntityIds.length}
        selectedEntityIds={selectedEntityIds}
        groups={groups}
        contactTypes={CONTACT_TYPES}
        onClearSelection={clearEntitySelection}
        onActionComplete={handleBulkActionComplete}
      />
    </div>
  )
}

"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, X, Tag, User, Check, Edit2 } from "lucide-react"

// Types
interface MetadataFieldSchema {
  key: string
  label: string
  type: "text" | "number" | "date" | "currency"
}

interface JobLabel {
  id: string
  name: string
  color: string | null
  metadataSchema: MetadataFieldSchema[]
}

interface ContactLabel {
  id: string
  metadata: Record<string, string | number | null>
  jobLabel: JobLabel
}

interface ContactWithLabels {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
  jobLabels: ContactLabel[]
}

interface ContactLabelsTableProps {
  jobId: string
  canEdit?: boolean
}

export function ContactLabelsTable({ jobId, canEdit = true }: ContactLabelsTableProps) {
  const [contacts, setContacts] = useState<ContactWithLabels[]>([])
  const [labels, setLabels] = useState<JobLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  
  // Apply label dialog
  const [isApplyOpen, setIsApplyOpen] = useState(false)
  const [applyLabelId, setApplyLabelId] = useState<string>("")
  const [applyMetadata, setApplyMetadata] = useState<Record<string, string | number | null>>({})
  const [applying, setApplying] = useState(false)

  // Edit metadata dialog
  const [isEditMetadataOpen, setIsEditMetadataOpen] = useState(false)
  const [editingContactLabel, setEditingContactLabel] = useState<{
    contactLabelId: string
    contactName: string
    label: JobLabel
    metadata: Record<string, string | number | null>
  } | null>(null)
  const [editMetadata, setEditMetadata] = useState<Record<string, string | number | null>>({})
  const [savingMetadata, setSavingMetadata] = useState(false)

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [contactsRes, labelsRes] = await Promise.all([
        fetch(`/api/jobs/${jobId}/contact-labels`, { credentials: "include" }),
        fetch(`/api/jobs/${jobId}/labels`, { credentials: "include" }),
      ])

      if (contactsRes.ok) {
        const data = await contactsRes.json()
        setContacts(data.contacts || [])
      }

      if (labelsRes.ok) {
        const data = await labelsRes.json()
        setLabels(data.labels || [])
      }
    } catch (err) {
      console.error("Error fetching data:", err)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Toggle contact selection
  const toggleContact = (contactId: string) => {
    setSelectedContacts((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    )
  }

  // Toggle all contacts
  const toggleAll = () => {
    if (selectedContacts.length === contacts.length) {
      setSelectedContacts([])
    } else {
      setSelectedContacts(contacts.map((c) => c.id))
    }
  }

  // Open apply label dialog
  const openApplyDialog = () => {
    if (selectedContacts.length === 0) return
    setApplyLabelId("")
    setApplyMetadata({})
    setIsApplyOpen(true)
  }

  // Apply label to selected contacts
  const handleApplyLabel = async () => {
    if (!applyLabelId || selectedContacts.length === 0) return

    setApplying(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/contact-labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          jobLabelId: applyLabelId,
          entityIds: selectedContacts,
          metadata: applyMetadata,
        }),
      })

      if (response.ok) {
        setIsApplyOpen(false)
        setSelectedContacts([])
        fetchData()
      }
    } catch (err) {
      console.error("Error applying label:", err)
    } finally {
      setApplying(false)
    }
  }

  // Remove label from contact
  const handleRemoveLabel = async (contactId: string, labelId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/contact-labels`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          jobLabelId: labelId,
          entityId: contactId,
        }),
      })

      if (response.ok) {
        fetchData()
      }
    } catch (err) {
      console.error("Error removing label:", err)
    }
  }

  // Open edit metadata dialog
  const openEditMetadata = (
    contact: ContactWithLabels,
    contactLabel: ContactLabel
  ) => {
    setEditingContactLabel({
      contactLabelId: contactLabel.id,
      contactName: `${contact.firstName} ${contact.lastName || ""}`.trim(),
      label: contactLabel.jobLabel,
      metadata: contactLabel.metadata,
    })
    setEditMetadata({ ...contactLabel.metadata })
    setIsEditMetadataOpen(true)
  }

  // Save metadata
  const handleSaveMetadata = async () => {
    if (!editingContactLabel) return

    setSavingMetadata(true)
    try {
      const response = await fetch(`/api/jobs/${jobId}/contact-labels`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contactLabelId: editingContactLabel.contactLabelId,
          metadata: editMetadata,
        }),
      })

      if (response.ok) {
        setIsEditMetadataOpen(false)
        setEditingContactLabel(null)
        fetchData()
      }
    } catch (err) {
      console.error("Error saving metadata:", err)
    } finally {
      setSavingMetadata(false)
    }
  }

  // Get selected label for apply dialog
  const selectedLabel = labels.find((l) => l.id === applyLabelId)

  // Format metadata value for display
  const formatMetadataValue = (
    value: string | number | null,
    type: string
  ): string => {
    if (value === null || value === undefined || value === "") return "—"
    if (type === "currency") {
      return `$${Number(value).toFixed(2)}`
    }
    if (type === "date" && typeof value === "string") {
      try {
        return new Date(value).toLocaleDateString()
      } catch {
        return String(value)
      }
    }
    return String(value)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400" />
      </div>
    )
  }

  if (contacts.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg">
        <User className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No stakeholder contacts</p>
        <p className="text-xs text-gray-400 mt-1">
          Add stakeholders to this item to manage their labels
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      {canEdit && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedContacts.length > 0 && (
              <>
                <span className="text-sm text-gray-600">
                  {selectedContacts.length} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openApplyDialog}
                  disabled={labels.length === 0}
                  className="h-7 text-xs"
                >
                  <Tag className="w-3 h-3 mr-1" />
                  Apply Label
                </Button>
              </>
            )}
          </div>
          {labels.length === 0 && (
            <p className="text-xs text-gray-500">
              Create labels first to tag contacts
            </p>
          )}
        </div>
      )}

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {canEdit && (
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedContacts.length === contacts.length}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                  />
                </th>
              )}
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Contact
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Labels
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contacts.map((contact) => (
              <tr key={contact.id} className="hover:bg-gray-50">
                {canEdit && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedContacts.includes(contact.id)}
                      onChange={() => toggleContact(contact.id)}
                      className="w-4 h-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                    />
                  </td>
                )}
                <td className="px-4 py-2">
                  <div className="font-medium text-sm text-gray-900">
                    {contact.firstName} {contact.lastName || ""}
                  </div>
                  {contact.email && (
                    <div className="text-xs text-gray-500">{contact.email}</div>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {contact.jobLabels.length === 0 ? (
                      <span className="text-xs text-gray-400">No labels</span>
                    ) : (
                      contact.jobLabels.map((cl) => (
                        <div
                          key={cl.id}
                          className="group inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: `${cl.jobLabel.color || "#6b7280"}20`,
                            color: cl.jobLabel.color || "#6b7280",
                          }}
                        >
                          <span className="capitalize">{cl.jobLabel.name}</span>
                          {/* Show metadata preview */}
                          {cl.jobLabel.metadataSchema.length > 0 && (
                            <button
                              onClick={() => openEditMetadata(contact, cl)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Edit metadata"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              onClick={() =>
                                handleRemoveLabel(contact.id, cl.jobLabel.id)
                              }
                              className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5"
                              title="Remove label"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  {/* Metadata display */}
                  {contact.jobLabels.some(
                    (cl) =>
                      cl.jobLabel.metadataSchema.length > 0 &&
                      Object.keys(cl.metadata).length > 0
                  ) && (
                    <div className="mt-1 text-xs text-gray-500">
                      {contact.jobLabels
                        .filter(
                          (cl) =>
                            cl.jobLabel.metadataSchema.length > 0 &&
                            Object.keys(cl.metadata).length > 0
                        )
                        .map((cl) => (
                          <div key={cl.id} className="flex flex-wrap gap-2">
                            {cl.jobLabel.metadataSchema.map((field) => {
                              const value = cl.metadata[field.key]
                              if (value === null || value === undefined || value === "")
                                return null
                              return (
                                <span key={field.key}>
                                  {field.label}:{" "}
                                  <span className="font-medium">
                                    {formatMetadataValue(value, field.type)}
                                  </span>
                                </span>
                              )
                            })}
                          </div>
                        ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Apply Label Dialog */}
      <Dialog open={isApplyOpen} onOpenChange={setIsApplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Label</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-gray-600">
              Apply a label to {selectedContacts.length} selected contact
              {selectedContacts.length !== 1 ? "s" : ""}
            </p>

            {/* Label Selection */}
            <div>
              <Label>Label</Label>
              <Select value={applyLabelId} onValueChange={setApplyLabelId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a label" />
                </SelectTrigger>
                <SelectContent>
                  {labels.map((label) => (
                    <SelectItem key={label.id} value={label.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: label.color || "#6b7280" }}
                        />
                        <span className="capitalize">{label.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Metadata Fields */}
            {selectedLabel && selectedLabel.metadataSchema.length > 0 && (
              <div className="space-y-3">
                <Label>Metadata (Optional)</Label>
                {selectedLabel.metadataSchema.map((field) => (
                  <div key={field.key}>
                    <Label className="text-xs text-gray-500">{field.label}</Label>
                    <Input
                      type={field.type === "date" ? "date" : field.type === "number" || field.type === "currency" ? "number" : "text"}
                      step={field.type === "currency" ? "0.01" : undefined}
                      value={applyMetadata[field.key] ?? ""}
                      onChange={(e) =>
                        setApplyMetadata((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsApplyOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleApplyLabel}
                disabled={!applyLabelId || applying}
              >
                {applying ? "Applying..." : "Apply"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Metadata Dialog */}
      <Dialog open={isEditMetadataOpen} onOpenChange={setIsEditMetadataOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Metadata</DialogTitle>
          </DialogHeader>
          {editingContactLabel && (
            <div className="space-y-4 pt-4">
              <p className="text-sm text-gray-600">
                Edit metadata for{" "}
                <span className="font-medium">{editingContactLabel.contactName}</span>
                {" · "}
                <span
                  className="capitalize"
                  style={{ color: editingContactLabel.label.color || "#6b7280" }}
                >
                  {editingContactLabel.label.name}
                </span>
              </p>

              {editingContactLabel.label.metadataSchema.map((field) => (
                <div key={field.key}>
                  <Label>{field.label}</Label>
                  <Input
                    type={field.type === "date" ? "date" : field.type === "number" || field.type === "currency" ? "number" : "text"}
                    step={field.type === "currency" ? "0.01" : undefined}
                    value={editMetadata[field.key] ?? ""}
                    onChange={(e) =>
                      setEditMetadata((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    className="mt-1"
                  />
                </div>
              ))}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditMetadataOpen(false)
                    setEditingContactLabel(null)
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveMetadata} disabled={savingMetadata}>
                  {savingMetadata ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

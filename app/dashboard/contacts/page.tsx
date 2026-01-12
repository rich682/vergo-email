"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ContactForm } from "@/components/contacts/contact-form"
import { ContactList } from "@/components/contacts/contact-list"
import { ImportModal } from "@/components/contacts/import-modal"

interface Group {
  id: string
  name: string
  color?: string
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
  contactStates?: Array<{ stateKey: string; metadata?: any; updatedAt?: string }>
}

export default function ContactsPage() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>()
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null)

  useEffect(() => {
    fetchEntities()
    fetchGroups()
  }, [search, selectedGroupId])

  const fetchEntities = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.append("search", search)
      if (selectedGroupId) params.append("groupId", selectedGroupId)

      const response = await fetch(`/api/entities?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setEntities(data)
      }
    } catch (error) {
      console.error("Error fetching contacts:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchGroups = async () => {
    try {
      const response = await fetch("/api/groups")
      if (response.ok) {
        const data = await response.json()
        setGroups(data)
      }
    } catch (error) {
      console.error("Error fetching groups:", error)
    }
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingEntity(null)
    fetchEntities()
  }

  const handleEdit = (entity: Entity) => {
    setEditingEntity(entity)
    setShowForm(true)
    setShowImport(false)
  }

  const handleDelete = () => {
    fetchEntities()
  }

  return (
    <div className="w-full h-full flex flex-col border-l border-r border-gray-200">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Contacts</h2>
            <p className="text-sm text-gray-600">Manage people and organizations</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowImport(!showImport)
                setShowForm(false)
                setEditingEntity(null)
              }}
            >
              {showImport ? "Cancel" : "Import Contacts"}
            </Button>
            <Button
              onClick={() => {
                setShowForm(!showForm)
                setShowImport(false)
                setEditingEntity(null)
              }}
            >
              {showForm ? "Cancel" : "Add Contact"}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden bg-gray-50 border-t border-gray-200">
        <div className="h-full flex flex-col">
          {showForm && (
            <div className="flex-shrink-0 p-6 bg-white border-b border-gray-200">
              <ContactForm
                key={editingEntity?.id || "new"}
                entity={editingEntity || undefined}
                onSuccess={handleFormSuccess}
                onCancel={() => {
                  setShowForm(false)
                  setEditingEntity(null)
                }}
              />
            </div>
          )}

          {showImport && (
            <div className="flex-shrink-0 p-6 bg-white border-b border-gray-200">
              <ImportModal
                onSuccess={fetchEntities}
                onClose={() => setShowImport(false)}
              />
            </div>
          )}

          <div className="flex-1 overflow-auto p-6">
            {loading ? (
              <div className="border border-gray-200 rounded-lg bg-white py-8 text-center text-gray-500">
                Loading contacts...
              </div>
            ) : (
              <ContactList
                entities={entities}
                onEdit={handleEdit}
                onDelete={handleDelete}
                search={search}
                onSearchChange={setSearch}
                selectedGroupId={selectedGroupId}
                onGroupFilterChange={setSelectedGroupId}
                groups={groups}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ContactForm } from "@/components/contacts/contact-form"
import { ContactList } from "@/components/contacts/contact-list"
import { ImportModal } from "@/components/contacts/import-modal"
import { GroupsManager } from "@/components/contacts/groups-manager"
import { TypesManager } from "@/components/contacts/types-manager"
import { TagsManager } from "@/components/contacts/tags-manager"
import { Users, Settings, Building2, Tag } from "lucide-react"

interface Group {
  id: string
  name: string
  color?: string
  _count?: { entities: number }
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

type TabType = "contacts" | "groups" | "types" | "tags"

export default function ContactsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("contacts")
  const [entities, setEntities] = useState<Entity[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [availableStateKeys, setAvailableStateKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>()
  const [selectedContactType, setSelectedContactType] = useState<string | undefined>()
  const [selectedStateKeys, setSelectedStateKeys] = useState<string[]>([])
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchEntities()
    fetchGroups()
    fetchAvailableStateKeys()
  }, [search, selectedGroupId, selectedContactType, selectedStateKeys])

  const fetchEntities = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.append("search", search)
      if (selectedGroupId) params.append("groupId", selectedGroupId)
      if (selectedContactType) params.append("contactType", selectedContactType)
      if (selectedStateKeys.length > 0) params.append("stateKeys", selectedStateKeys.join(","))

      const response = await fetch(`/api/entities?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setEntities(data)
        // Clear selection when filters change
        setSelectedEntityIds([])
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

  const fetchAvailableStateKeys = async () => {
    try {
      const response = await fetch("/api/contacts/state-keys")
      if (response.ok) {
        const data = await response.json()
        setAvailableStateKeys(data.stateKeys || [])
      }
    } catch (error) {
      console.error("Error fetching state keys:", error)
    }
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingEntity(null)
    fetchEntities()
    fetchAvailableStateKeys() // Refresh available tags after adding/editing
  }

  const handleEdit = (entity: Entity) => {
    setEditingEntity(entity)
    setShowForm(true)
    setShowImport(false)
    // Scroll to form after state update
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
  }

  const handleDelete = () => {
    fetchEntities()
    fetchAvailableStateKeys() // Refresh available tags after delete
  }

  const handleImportSuccess = () => {
    fetchEntities()
    fetchAvailableStateKeys() // Refresh available tags after import
  }

  const switchToTab = (tab: TabType) => {
    setActiveTab(tab)
    setShowForm(false)
    setShowImport(false)
    setEditingEntity(null)
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
          {activeTab === "contacts" && (
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
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-gray-200 -mb-px">
          <button
            onClick={() => switchToTab("contacts")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "contacts"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Users className="w-4 h-4" />
            Contacts
          </button>
          <button
            onClick={() => switchToTab("groups")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "groups"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Settings className="w-4 h-4" />
            Groups
          </button>
          <button
            onClick={() => switchToTab("types")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "types"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Building2 className="w-4 h-4" />
            Types
          </button>
          <button
            onClick={() => switchToTab("tags")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "tags"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Tag className="w-4 h-4" />
            Tags
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden bg-gray-50 border-t border-gray-200">
        {activeTab === "contacts" ? (
          <div className="h-full flex flex-col">
            {showForm && (
              <div ref={formRef} className="flex-shrink-0 p-6 bg-white border-b border-gray-200 shadow-sm">
                <h3 className="text-lg font-semibold mb-4">
                  {editingEntity ? `Edit Contact: ${editingEntity.firstName}` : "Add New Contact"}
                </h3>
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
                  onSuccess={handleImportSuccess}
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
                  groups={groups}
                  availableStateKeys={availableStateKeys}
                  search={search}
                  selectedGroupId={selectedGroupId}
                  selectedContactType={selectedContactType}
                  selectedStateKeys={selectedStateKeys}
                  selectedEntityIds={selectedEntityIds}
                  onSearchChange={setSearch}
                  onGroupFilterChange={setSelectedGroupId}
                  onContactTypeChange={setSelectedContactType}
                  onStateKeysChange={setSelectedStateKeys}
                  onSelectedEntitiesChange={setSelectedEntityIds}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              )}
            </div>
          </div>
        ) : activeTab === "groups" ? (
          <div className="h-full overflow-auto p-6">
            <div className="max-w-2xl">
              <GroupsManager
                groups={groups}
                onGroupsChange={fetchGroups}
              />
            </div>
          </div>
        ) : activeTab === "types" ? (
          <div className="h-full overflow-auto p-6">
            <div className="max-w-2xl">
              <TypesManager
                onTypesChange={fetchEntities}
              />
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto p-6">
            <div className="max-w-2xl">
              <TagsManager
                onTagsChange={() => {
                  fetchEntities()
                  fetchAvailableStateKeys()
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

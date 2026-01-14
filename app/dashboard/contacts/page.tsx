"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ContactForm } from "@/components/contacts/contact-form"
import { ContactList } from "@/components/contacts/contact-list"
import { ImportModal } from "@/components/contacts/import-modal"
import { TagImportModal } from "@/components/contacts/tag-import-modal"
import { GroupsManager } from "@/components/contacts/groups-manager"
import { TypesManager } from "@/components/contacts/types-manager"
import { TagsManager } from "@/components/contacts/tags-manager"
import { Users, FolderOpen, Building2, Tag, Plus, Upload } from "lucide-react"

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

interface TagInfo {
  id: string
  name: string
  displayName: string
  contactCount: number
}

type TabType = "contacts" | "groups" | "types" | "tags"

export default function ContactsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("contacts")
  const [entities, setEntities] = useState<Entity[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [tags, setTags] = useState<TagInfo[]>([])
  const [availableStateKeys, setAvailableStateKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>()
  const [selectedContactType, setSelectedContactType] = useState<string | undefined>()
  const [selectedStateKeys, setSelectedStateKeys] = useState<string[]>([])
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showTagImport, setShowTagImport] = useState(false)
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchEntities()
    fetchGroups()
    fetchAvailableStateKeys()
    fetchTags()
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

  const fetchTags = async () => {
    try {
      const response = await fetch("/api/contacts/tags")
      if (response.ok) {
        const data = await response.json()
        setTags(data.tags || [])
      }
    } catch (error) {
      console.error("Error fetching tags:", error)
    }
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingEntity(null)
    fetchEntities()
    fetchAvailableStateKeys()
  }

  const handleEdit = (entity: Entity) => {
    setEditingEntity(entity)
    setShowForm(true)
    setShowImport(false)
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
  }

  const handleDelete = () => {
    fetchEntities()
    fetchAvailableStateKeys()
  }

  const handleImportSuccess = () => {
    fetchEntities()
    fetchAvailableStateKeys()
    fetchTags()
  }

  const handleTagImportSuccess = () => {
    fetchEntities()
    fetchAvailableStateKeys()
    fetchTags()
  }

  const switchToTab = (tab: TabType) => {
    setActiveTab(tab)
    setShowForm(false)
    setShowImport(false)
    setShowTagImport(false)
    setEditingEntity(null)
  }

  const tabs = [
    { id: "contacts" as TabType, label: "Contacts", icon: Users },
    { id: "groups" as TabType, label: "Groups", icon: FolderOpen },
    { id: "types" as TabType, label: "Types", icon: Building2 },
    { id: "tags" as TabType, label: "Tags", icon: Tag },
  ]

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-6">
        {/* Page Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">Contacts</h1>
            <p className="text-sm text-gray-500">Manage people and organizations</p>
          </div>
          
          {/* Contacts Tab CTAs */}
          {activeTab === "contacts" && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowImport(!showImport)
                  setShowForm(false)
                  setEditingEntity(null)
                }}
                className="
                  flex items-center gap-2 px-4 py-2 
                  border border-gray-200 rounded-full
                  text-sm font-medium text-gray-700
                  hover:border-gray-400 hover:bg-gray-50
                  transition-colors
                "
              >
                <Upload className="w-4 h-4" />
                {showImport ? "Cancel" : "Import"}
              </button>
              <button
                onClick={() => {
                  setShowForm(!showForm)
                  setShowImport(false)
                  setEditingEntity(null)
                }}
                className="
                  flex items-center gap-2 px-4 py-2 
                  border border-gray-200 rounded-full
                  text-sm font-medium text-gray-700
                  hover:border-orange-500 hover:text-orange-500
                  transition-colors
                "
              >
                <Plus className="w-4 h-4 text-orange-500" />
                {showForm ? "Cancel" : "Add Contact"}
              </button>
            </div>
          )}

          {/* Tags Tab CTAs */}
          {activeTab === "tags" && (
            <button
              onClick={() => setShowTagImport(!showTagImport)}
              className="
                flex items-center gap-2 px-4 py-2 
                border border-gray-200 rounded-full
                text-sm font-medium text-gray-700
                hover:border-gray-400 hover:bg-gray-50
                transition-colors
              "
            >
              <Upload className="w-4 h-4" />
              {showTagImport ? "Cancel" : "Import Tag Data"}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => switchToTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors
                  ${activeTab === tab.id
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Main Content */}
        {activeTab === "contacts" ? (
          <div className="space-y-6">
            {showForm && (
              <div ref={formRef} className="border border-gray-200 rounded-lg p-6 bg-white">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
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
              <div className="border border-gray-200 rounded-lg p-6 bg-white">
                <ImportModal
                  onSuccess={handleImportSuccess}
                  onClose={() => setShowImport(false)}
                />
              </div>
            )}

            {loading ? (
              <div className="border border-gray-200 rounded-lg py-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto"></div>
                <p className="text-sm text-gray-500 mt-4">Loading contacts...</p>
              </div>
            ) : (
              <ContactList
                entities={entities}
                groups={groups}
                tags={tags}
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
        ) : activeTab === "groups" ? (
          <div className="max-w-2xl">
            <GroupsManager
              groups={groups}
              onGroupsChange={fetchGroups}
            />
          </div>
        ) : activeTab === "types" ? (
          <div className="max-w-2xl">
            <TypesManager
              onTypesChange={fetchEntities}
            />
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            {showTagImport && (
              <div className="border border-gray-200 rounded-lg p-6 bg-white">
                <TagImportModal
                  existingTags={tags}
                  onSuccess={handleTagImportSuccess}
                  onClose={() => setShowTagImport(false)}
                />
              </div>
            )}

            <TagsManager
              onTagsChange={() => {
                fetchEntities()
                fetchAvailableStateKeys()
                fetchTags()
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

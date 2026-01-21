"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ContactForm } from "@/components/contacts/contact-form"
import { ContactList } from "@/components/contacts/contact-list"
import { ImportModal } from "@/components/contacts/import-modal"
import { GroupsManager } from "@/components/contacts/groups-manager"
import { TypesManager } from "@/components/contacts/types-manager"
import { Users, FolderOpen, Building2, Plus, Upload } from "lucide-react"

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
}

type TabType = "contacts" | "groups" | "types"

export default function ContactsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("contacts")
  const [entities, setEntities] = useState<Entity[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>()
  const [selectedContactType, setSelectedContactType] = useState<string | undefined>()
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchEntities()
    fetchGroups()
  }, [search, selectedGroupId, selectedContactType])

  const fetchEntities = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.append("search", search)
      if (selectedGroupId) params.append("groupId", selectedGroupId)
      if (selectedContactType) params.append("contactType", selectedContactType)

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

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditingEntity(null)
    fetchEntities()
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
  }

  const handleImportSuccess = () => {
    fetchEntities()
  }

  const switchToTab = (tab: TabType) => {
    setActiveTab(tab)
    setShowForm(false)
    setShowImport(false)
    setEditingEntity(null)
  }

  const tabs = [
    { id: "contacts" as TabType, label: "Contacts", icon: Users },
    { id: "types" as TabType, label: "Organization", icon: Building2 },
    { id: "groups" as TabType, label: "Groups", icon: FolderOpen },
  ]

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-4">
        {/* Action Row */}
        <div className="flex items-center justify-end mb-4">
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

          {/* Tags Tab CTAs - hidden for now */}
          {/* {activeTab === "tags" && (
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
          )} */}
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
                search={search}
                selectedGroupId={selectedGroupId}
                selectedContactType={selectedContactType}
                selectedEntityIds={selectedEntityIds}
                onSearchChange={setSearch}
                onGroupFilterChange={setSelectedGroupId}
                onContactTypeChange={setSelectedContactType}
                onSelectedEntitiesChange={setSelectedEntityIds}
                onEdit={handleEdit as any}
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
        ) : null /* Tags tab hidden for now */}
      </div>
    </div>
  )
}

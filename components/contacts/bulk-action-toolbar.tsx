"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { 
  Users, 
  UserMinus, 
  Tag, 
  TagIcon, 
  Trash2, 
  X, 
  Check,
  ChevronDown,
  AlertTriangle
} from "lucide-react"

interface Group {
  id: string
  name: string
}

interface TagInfo {
  id: string
  name: string
  displayName: string
}

interface BulkActionToolbarProps {
  selectedCount: number
  selectedEntityIds: string[]
  groups: Group[]
  tags: TagInfo[]
  contactTypes: Array<{ id: string; label: string }>
  onClearSelection: () => void
  onActionComplete: () => void
}

type ActionType = "add_group" | "remove_group" | "set_type" | "add_tag" | "remove_tag" | "delete" | null

export function BulkActionToolbar({
  selectedCount,
  selectedEntityIds,
  groups,
  tags,
  contactTypes,
  onClearSelection,
  onActionComplete
}: BulkActionToolbarProps) {
  const [activeAction, setActiveAction] = useState<ActionType>(null)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [selectedType, setSelectedType] = useState<string>("")
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([])
  const [newTagName, setNewTagName] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const resetState = () => {
    setActiveAction(null)
    setSelectedGroupIds([])
    setSelectedType("")
    setSelectedTagNames([])
    setNewTagName("")
    setError(null)
    setShowDeleteConfirm(false)
  }

  const executeAction = async (action: string, payload: any) => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/entities/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityIds: selectedEntityIds,
          action,
          payload
        })
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Action failed")
      }

      const result = await res.json()
      
      resetState()
      onActionComplete()
      
      if (action === "delete") {
        onClearSelection()
      }

      return result
    } catch (err: any) {
      setError(err.message || "Action failed")
    } finally {
      setLoading(false)
    }
  }

  const handleAddToGroups = () => {
    if (selectedGroupIds.length === 0) return
    executeAction("add_to_groups", { groupIds: selectedGroupIds })
  }

  const handleRemoveFromGroups = () => {
    if (selectedGroupIds.length === 0) return
    executeAction("remove_from_groups", { groupIds: selectedGroupIds })
  }

  const handleSetType = () => {
    if (!selectedType) return
    executeAction("set_type", { contactType: selectedType })
  }

  const handleAddTags = async () => {
    // Combine selected existing tags with new tag if provided
    const tagsToAdd = [...selectedTagNames]
    if (newTagName.trim()) {
      tagsToAdd.push(newTagName.trim().toLowerCase().replace(/\s+/g, "_"))
    }
    if (tagsToAdd.length === 0) return
    
    console.log("[BulkAction] Adding tags:", tagsToAdd, "to entities:", selectedEntityIds)
    
    // Add each tag
    setLoading(true)
    setError(null)
    
    try {
      const errors: string[] = []
      let successCount = 0
      
      for (const tagName of tagsToAdd) {
        console.log(`[BulkAction] Adding tag "${tagName}"...`)
        const res = await fetch("/api/entities/bulk-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityIds: selectedEntityIds,
            action: "add_tag",
            payload: { tagName }
          })
        })
        
        const data = await res.json().catch(() => ({}))
        console.log(`[BulkAction] Response for "${tagName}":`, data)
        
        if (!res.ok) {
          errors.push(`${tagName}: ${data.error || "Failed"}`)
        } else {
          successCount++
        }
      }
      
      if (errors.length > 0) {
        setError(errors.join(", "))
        // Still refresh if some succeeded
        if (successCount > 0) {
          onActionComplete()
        }
      } else {
        resetState()
        onActionComplete()
      }
    } catch (err: any) {
      console.error("[BulkAction] Error:", err)
      setError(err.message || "Failed to add tags")
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveTags = async () => {
    if (selectedTagNames.length === 0) return
    
    setLoading(true)
    setError(null)
    
    try {
      for (const tagName of selectedTagNames) {
        await fetch("/api/entities/bulk-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityIds: selectedEntityIds,
            action: "remove_tag",
            payload: { tagName }
          })
        })
      }
      
      resetState()
      onActionComplete()
    } catch (err: any) {
      setError(err.message || "Failed to remove tags")
    } finally {
      setLoading(false)
    }
  }

  const toggleTagSelection = (tagName: string) => {
    setSelectedTagNames(prev => 
      prev.includes(tagName) 
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    )
  }

  const handleDelete = () => {
    executeAction("delete", {})
  }

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroupIds(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    )
  }

  if (selectedCount === 0) return null

  return (
    <>
      {/* Floating toolbar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-white border border-gray-200 rounded-xl shadow-2xl px-6 py-4 flex items-center gap-4">
          {/* Selection count */}
          <div className="flex items-center gap-2 pr-4 border-r border-gray-200">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Check className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-sm font-medium text-gray-900">
              {selectedCount} selected
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Add to Group */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveAction(activeAction === "add_group" ? null : "add_group")}
                className="gap-2"
              >
                <Users className="w-4 h-4" />
                Add to Group
                <ChevronDown className="w-3 h-3" />
              </Button>
              
              {activeAction === "add_group" && (
                <div className="absolute bottom-full mb-2 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Select groups:</div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {groups.length === 0 ? (
                      <div className="text-sm text-gray-500 py-2">No groups available</div>
                    ) : (
                      groups.map(group => (
                        <button
                          key={group.id}
                          onClick={() => toggleGroupSelection(group.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-50"
                        >
                          <div className={`w-4 h-4 border rounded flex items-center justify-center ${
                            selectedGroupIds.includes(group.id) 
                              ? "bg-blue-600 border-blue-600" 
                              : "border-gray-300"
                          }`}>
                            {selectedGroupIds.includes(group.id) && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </div>
                          {group.name}
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <Button size="sm" variant="outline" onClick={resetState} className="flex-1">
                      Cancel
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={handleAddToGroups} 
                      disabled={selectedGroupIds.length === 0 || loading}
                      className="flex-1"
                    >
                      {loading ? "Adding..." : `Add to ${selectedGroupIds.length} group(s)`}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Remove from Group */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveAction(activeAction === "remove_group" ? null : "remove_group")}
                className="gap-2"
              >
                <UserMinus className="w-4 h-4" />
                Remove from Group
                <ChevronDown className="w-3 h-3" />
              </Button>
              
              {activeAction === "remove_group" && (
                <div className="absolute bottom-full mb-2 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Select groups to remove from:</div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {groups.length === 0 ? (
                      <div className="text-sm text-gray-500 py-2">No groups available</div>
                    ) : (
                      groups.map(group => (
                        <button
                          key={group.id}
                          onClick={() => toggleGroupSelection(group.id)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-gray-50"
                        >
                          <div className={`w-4 h-4 border rounded flex items-center justify-center ${
                            selectedGroupIds.includes(group.id) 
                              ? "bg-red-600 border-red-600" 
                              : "border-gray-300"
                          }`}>
                            {selectedGroupIds.includes(group.id) && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </div>
                          {group.name}
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <Button size="sm" variant="outline" onClick={resetState} className="flex-1">
                      Cancel
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={handleRemoveFromGroups} 
                      disabled={selectedGroupIds.length === 0 || loading}
                      className="flex-1"
                    >
                      {loading ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Set Type */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveAction(activeAction === "set_type" ? null : "set_type")}
                className="gap-2"
              >
                Set Type
                <ChevronDown className="w-3 h-3" />
              </Button>
              
              {activeAction === "set_type" && (
                <div className="absolute bottom-full mb-2 left-0 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Select contact type:</div>
                  <div className="space-y-1">
                    {contactTypes.map(type => (
                      <button
                        key={type.id}
                        onClick={() => setSelectedType(type.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded ${
                          selectedType === type.id ? "bg-blue-50 text-blue-700" : "hover:bg-gray-50"
                        }`}
                      >
                        <div className={`w-4 h-4 border rounded-full flex items-center justify-center ${
                          selectedType === type.id 
                            ? "border-blue-600" 
                            : "border-gray-300"
                        }`}>
                          {selectedType === type.id && (
                            <div className="w-2 h-2 rounded-full bg-blue-600" />
                          )}
                        </div>
                        {type.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <Button size="sm" variant="outline" onClick={resetState} className="flex-1">
                      Cancel
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={handleSetType} 
                      disabled={!selectedType || loading}
                      className="flex-1"
                    >
                      {loading ? "Applying..." : "Apply"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Add Tag */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveAction(activeAction === "add_tag" ? null : "add_tag")}
                className="gap-2"
              >
                <Tag className="w-4 h-4" />
                Add Tags
                <ChevronDown className="w-3 h-3" />
              </Button>
              
              {activeAction === "add_tag" && (
                <div className="absolute bottom-full mb-2 right-0 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Add tags to {selectedCount} contacts:</div>
                  
                  {tags.length > 0 && (
                    <div className="mb-3">
                      <label className="text-xs text-gray-500 mb-1 block">Select existing tags:</label>
                      <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md">
                        {tags.map(tag => (
                          <button
                            key={tag.id}
                            onClick={() => toggleTagSelection(tag.name)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50"
                          >
                            <div className={`w-4 h-4 border rounded flex items-center justify-center ${
                              selectedTagNames.includes(tag.name) 
                                ? "bg-blue-600 border-blue-600" 
                                : "border-gray-300"
                            }`}>
                              {selectedTagNames.includes(tag.name) && (
                                <Check className="w-3 h-3 text-white" />
                              )}
                            </div>
                            {tag.displayName}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="mb-3">
                    <label className="text-xs text-gray-500 mb-1 block">
                      {tags.length > 0 ? "Or create new tag:" : "Create new tag:"}
                    </label>
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="e.g., invoice_status"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={resetState} className="flex-1">
                      Cancel
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={handleAddTags} 
                      disabled={(selectedTagNames.length === 0 && !newTagName.trim()) || loading}
                      className="flex-1"
                    >
                      {loading ? "Adding..." : `Add ${selectedTagNames.length + (newTagName.trim() ? 1 : 0)} Tag(s)`}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Remove Tag */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveAction(activeAction === "remove_tag" ? null : "remove_tag")}
                className="gap-2"
              >
                <TagIcon className="w-4 h-4" />
                Remove Tags
                <ChevronDown className="w-3 h-3" />
              </Button>
              
              {activeAction === "remove_tag" && (
                <div className="absolute bottom-full mb-2 right-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Remove tags from {selectedCount} contacts:</div>
                  
                  {tags.length === 0 ? (
                    <div className="text-sm text-gray-500 py-2">No tags available</div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-md">
                      {tags.map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => toggleTagSelection(tag.name)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50"
                        >
                          <div className={`w-4 h-4 border rounded flex items-center justify-center ${
                            selectedTagNames.includes(tag.name) 
                              ? "bg-red-600 border-red-600" 
                              : "border-gray-300"
                          }`}>
                            {selectedTagNames.includes(tag.name) && (
                              <Check className="w-3 h-3 text-white" />
                            )}
                          </div>
                          {tag.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <Button size="sm" variant="outline" onClick={resetState} className="flex-1">
                      Cancel
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={handleRemoveTags} 
                      disabled={selectedTagNames.length === 0 || loading}
                      className="flex-1"
                    >
                      {loading ? "Removing..." : `Remove ${selectedTagNames.length} Tag(s)`}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Delete */}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>

          {/* Clear selection */}
          <button
            onClick={onClearSelection}
            className="ml-2 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-center">
            {error}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delete {selectedCount} contacts?</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            
            <p className="text-sm text-gray-600 mb-6">
              The selected contacts and all their associated data (groups, tags) will be permanently deleted.
            </p>
            
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setShowDeleteConfirm(false)} 
                className="flex-1"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDelete}
                className="flex-1"
                disabled={loading}
              >
                {loading ? "Deleting..." : `Delete ${selectedCount} contacts`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { 
  Users, 
  UserMinus, 
  Trash2, 
  X, 
  Check,
  ChevronDown,
  AlertTriangle,
  Plus,
  Loader2
} from "lucide-react"

interface Group {
  id: string
  name: string
}

interface BulkActionToolbarProps {
  selectedCount: number
  selectedEntityIds: string[]
  groups: Group[]
  onClearSelection: () => void
  onActionComplete: () => void
  canManage?: boolean
}

type ActionType = "add_group" | "remove_group" | "delete" | null

export function BulkActionToolbar({
  selectedCount,
  selectedEntityIds,
  groups,
  onClearSelection,
  onActionComplete,
  canManage = true
}: BulkActionToolbarProps) {
  const [activeAction, setActiveAction] = useState<ActionType>(null)
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  // State for creating new groups on the fly
  const [newGroupName, setNewGroupName] = useState("")
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [localGroups, setLocalGroups] = useState<Group[]>(groups)

  // Sync local state with props when they change
  useEffect(() => {
    setLocalGroups(groups)
  }, [groups])

  const createNewGroup = async () => {
    if (!newGroupName.trim()) return
    
    setCreatingGroup(true)
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() })
      })
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to create group")
      }
      
      const newGroup = await res.json()
      setLocalGroups(prev => [...prev, newGroup])
      setSelectedGroupIds(prev => [...prev, newGroup.id])
      setNewGroupName("")
    } catch (err: any) {
      setError(err.message || "Failed to create group")
    } finally {
      setCreatingGroup(false)
    }
  }

  const resetState = () => {
    setActiveAction(null)
    setSelectedGroupIds([])
    setError(null)
    setShowDeleteConfirm(false)
    setNewGroupName("")
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
            {/* Add to Tag */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveAction(activeAction === "add_group" ? null : "add_group")}
                className="gap-2"
              >
                <Users className="w-4 h-4" />
                Add to Tag
                <ChevronDown className="w-3 h-3" />
              </Button>
              
              {activeAction === "add_group" && (
                <div className="absolute bottom-full mb-2 left-0 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Select tags:</div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {localGroups.length === 0 ? (
                      <div className="text-sm text-gray-500 py-2">No tags yet</div>
                    ) : (
                      localGroups.map(group => (
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
                  
                  {/* Create new tag */}
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="New tag name..."
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && createNewGroup()}
                        className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={createNewGroup}
                        disabled={!newGroupName.trim() || creatingGroup}
                        className="px-2"
                      >
                        {creatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      </Button>
                    </div>
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
                      {loading ? "Adding..." : `Add to ${selectedGroupIds.length} tag(s)`}
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
                Remove from Tag
                <ChevronDown className="w-3 h-3" />
              </Button>
              
              {activeAction === "remove_group" && (
                <div className="absolute bottom-full mb-2 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                  <div className="text-sm font-medium text-gray-700 mb-2">Select tags to remove from:</div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {localGroups.length === 0 ? (
                      <div className="text-sm text-gray-500 py-2">No tags available</div>
                    ) : (
                      localGroups.map(group => (
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

            {/* Delete */}
            {canManage && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
            )}
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
              The selected contacts and all their associated data (groups) will be permanently deleted.
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

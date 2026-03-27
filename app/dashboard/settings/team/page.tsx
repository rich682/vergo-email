"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { UserPlus, Shield, User, Clock, Pencil, Trash2, Plus, X, Tag, Check, ChevronDown, RotateCw } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

interface ConnectedEmail {
  id: string
  email: string
  provider: "GMAIL" | "MICROSOFT" | "SMTP"
  isPrimary: boolean
  isActive: boolean
  lastSyncAt: string | null
}

interface OrgUser {
  id: string
  email: string
  name: string | null
  role: "ADMIN" | "MANAGER" | "MEMBER" | "VIEWER"
  tags: string[]
  status: "active" | "pending"
  createdAt: string
  connectedEmail: ConnectedEmail | null
  connectedEmailAccounts: ConnectedEmail[]
  isCurrentUser: boolean
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0]?.[0]?.toUpperCase() || email[0]?.toUpperCase() || "?"
  }
  return email[0]?.toUpperCase() || "?"
}

function parseName(fullName: string | null): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: "", lastName: "" }
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" }
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ")
  }
}

function combineName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ")
}

function TeamSettingsContent() {
  const router = useRouter()
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [teamUsers, setTeamUsers] = useState<OrgUser[]>([])
  const [loading, setLoading] = useState(true)

  // Invite modal state
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteFirstName, setInviteFirstName] = useState("")
  const [inviteLastName, setInviteLastName] = useState("")
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MANAGER" | "MEMBER">("MEMBER")
  const [inviting, setInviting] = useState(false)
  
  // Edit modal state
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null)
  const [editFirstName, setEditFirstName] = useState("")
  const [editLastName, setEditLastName] = useState("")
  const [editRole, setEditRole] = useState<"ADMIN" | "MANAGER" | "MEMBER">("MEMBER")
  const [editTags, setEditTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [orgTags, setOrgTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  
  // Delete confirmation state
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingUser, setDeletingUser] = useState<OrgUser | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Resend invite state
  const [resendingUserId, setResendingUserId] = useState<string | null>(null)

  // Inline tag popover state
  const [inlineTagInput, setInlineTagInput] = useState("")

  useEffect(() => {
    fetchTeamUsers()
    // Fetch org tags for inline tag dropdowns
    fetch("/api/org/tags").then(r => r.json()).then(d => {
      if (d.tags) setOrgTags(d.tags)
    }).catch(() => {})
  }, [])

  const fetchTeamUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/org/users")
      if (response.ok) {
        const data = await response.json()
        console.log("[Team] API response:", data)
        console.log("[Team] Users with isCurrentUser:", data.users?.map((u: any) => ({ id: u.id, email: u.email, isCurrentUser: u.isCurrentUser })))
        setTeamUsers(data.users || [])
        setIsAdmin(data.isAdmin || false)
      } else if (response.status === 403) {
        setIsAdmin(false)
      }
    } catch (error) {
      console.error("Error fetching team:", error)
      setIsAdmin(false)
    } finally {
      setLoading(false)
    }
  }


  const handleInviteUser = async () => {
    if (!inviteEmail.trim()) return

    setInviting(true)
    try {
      const fullName = combineName(inviteFirstName, inviteLastName)
      const response = await fetch("/api/org/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: fullName || undefined,
          role: inviteRole
        })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to invite user")
      }

      const data = await response.json()
      setTeamUsers(prev => [data.user, ...prev])
      setInviteEmail("")
      setInviteFirstName("")
      setInviteLastName("")
      setInviteRole("MEMBER")
      setIsInviteOpen(false)
      setMessage({ type: "success", text: "User invited successfully!" })
      setTimeout(() => setMessage(null), 5000)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to invite user" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setInviting(false)
    }
  }

  const openEditModal = (user: OrgUser) => {
    const { firstName, lastName } = parseName(user.name)
    setEditingUser(user)
    setEditFirstName(firstName)
    setEditLastName(lastName)
    // Map legacy VIEWER role to MEMBER (VIEWER has been removed)
    const mappedRole = user.role === "VIEWER" ? "MEMBER" : user.role
    setEditRole(mappedRole as "ADMIN" | "MANAGER" | "MEMBER")
    setEditTags(user.tags || [])
    setTagInput("")
    setIsEditOpen(true)
    // Fetch org tags for autocomplete
    fetch("/api/org/tags").then(r => r.json()).then(d => {
      if (d.tags) setOrgTags(d.tags)
    }).catch(() => {})
  }

  const handleSaveUser = async () => {
    if (!editingUser) return

    setSaving(true)
    try {
      const fullName = combineName(editFirstName, editLastName)
      const response = await fetch(`/api/org/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName,
          role: editRole,
          tags: editTags,
        })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update user")
      }

      const data = await response.json()
      // Merge API response with existing user data (preserve connectedEmail, isCurrentUser, etc.)
      setTeamUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...data.user } : u))
      setIsEditOpen(false)
      setEditingUser(null)
      setMessage({ type: "success", text: "User updated successfully!" })
      setTimeout(() => setMessage(null), 5000)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to update user" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setSaving(false)
    }
  }

  const openDeleteModal = (user: OrgUser) => {
    setDeletingUser(user)
    setIsDeleteOpen(true)
  }

  const handleDeleteUser = async () => {
    if (!deletingUser) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/org/users/${deletingUser.id}`, {
        method: "DELETE"
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to remove user")
      }

      setTeamUsers(prev => prev.filter(u => u.id !== deletingUser.id))
      setIsDeleteOpen(false)
      setDeletingUser(null)
      setMessage({ type: "success", text: "User removed successfully!" })
      setTimeout(() => setMessage(null), 5000)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to remove user" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setDeleting(false)
    }
  }

  const handleResendInvite = async (user: OrgUser) => {
    setResendingUserId(user.id)
    try {
      setMessage(null)
      const response = await fetch(`/api/org/users/${user.id}/resend-invite`, {
        method: "POST"
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to resend invite")
      }

      setMessage({ type: "success", text: `Invitation resent to ${user.email}` })
      setTimeout(() => setMessage(null), 5000)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to resend invite" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setResendingUserId(null)
    }
  }

  const handleInlineTagToggle = async (user: OrgUser, tag: string) => {
    const currentTags = user.tags || []
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag]

    // Optimistic update
    setTeamUsers(prev => prev.map(u => u.id === user.id ? { ...u, tags: newTags } : u))

    try {
      const response = await fetch(`/api/org/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newTags }),
      })
      if (!response.ok) throw new Error("Failed")
      const data = await response.json()
      setTeamUsers(prev => prev.map(u => u.id === user.id ? { ...u, ...data.user } : u))
    } catch {
      // Revert on failure
      setTeamUsers(prev => prev.map(u => u.id === user.id ? { ...u, tags: currentTags } : u))
    }
  }

  const handleInlineAddTag = async (user: OrgUser, newTag: string) => {
    const trimmed = newTag.trim()
    if (!trimmed || (user.tags || []).includes(trimmed)) return
    const newTags = [...(user.tags || []), trimmed]

    setTeamUsers(prev => prev.map(u => u.id === user.id ? { ...u, tags: newTags } : u))

    try {
      const response = await fetch(`/api/org/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newTags }),
      })
      if (!response.ok) throw new Error("Failed")
      const data = await response.json()
      setTeamUsers(prev => prev.map(u => u.id === user.id ? { ...u, ...data.user } : u))
      // Add to orgTags if new
      if (!orgTags.includes(trimmed)) {
        setOrgTags(prev => [...prev, trimmed].sort((a, b) => a.localeCompare(b)))
      }
    } catch {
      setTeamUsers(prev => prev.map(u => u.id === user.id ? { ...u, tags: (user.tags || []) } : u))
    }
    setInlineTagInput("")
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
          </div>
        </div>
      </div>
    )
  }

  // Non-admins can now see the page (just their own row) to connect their inbox
  // Only show access denied if they somehow can't see any users
  if (!isAdmin && teamUsers.length === 0 && !loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="px-8 py-4">
          <div className="border border-dashed border-gray-200 rounded-lg">
            <EmptyState
              icon={<Shield className="w-6 h-6" />}
              title="Access Denied"
              description="You don't have permission to view team settings. Contact an administrator for access."
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-4">
        {/* Action Row */}
        <div className="flex items-center justify-end mb-4">
          
          {/* Invite User Button - Admin only */}
          {isAdmin && (
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <button className="
                  flex items-center gap-2 px-4 py-2 
                  border border-gray-200 rounded-full
                  text-sm font-medium text-gray-700
                  hover:border-orange-500 hover:text-orange-500
                  transition-colors
                ">
                  <Plus className="w-4 h-4 text-orange-500" />
                  Invite User
                </button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="inviteEmail">Email Address</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="inviteFirstName">First Name</Label>
                    <Input
                      id="inviteFirstName"
                      placeholder="John"
                      value={inviteFirstName}
                      onChange={(e) => setInviteFirstName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="inviteLastName">Last Name</Label>
                    <Input
                      id="inviteLastName"
                      placeholder="Doe"
                      value={inviteLastName}
                      onChange={(e) => setInviteLastName(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="inviteRole">Role</Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "ADMIN" | "MANAGER" | "MEMBER")}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEMBER">Employee</SelectItem>
                      <SelectItem value="MANAGER">Manager</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    {inviteRole === "ADMIN" ? "Full access to all features and settings" :
                     inviteRole === "MANAGER" ? "Can see all tasks and manage team workflows" :
                     "Can access assigned tasks and enabled modules"}
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
                    Cancel
                  </Button>
                  <button
                    onClick={handleInviteUser}
                    disabled={!inviteEmail.trim() || inviting}
                    className="
                      px-4 py-2 rounded-md text-sm font-medium
                      bg-gray-900 text-white
                      hover:bg-gray-800
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-colors
                    "
                  >
                    {inviting ? "Inviting..." : "Send Invite"}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>

        {/* Success/Error Messages */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        {/* Team List */}
        {teamUsers.length === 0 && isAdmin ? (
          <div className="border border-dashed border-gray-200 rounded-lg">
            <EmptyState
              icon={<User className="w-6 h-6" />}
              title="No team members yet"
              description="Invite your first team member to get started"
              action={{
                label: "Invite User",
                onClick: () => setIsInviteOpen(true)
              }}
            />
          </div>
        ) : teamUsers.length > 0 ? (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="col-span-3">Name</div>
              <div className="col-span-3">Email</div>
              <div className="col-span-2">Tags</div>
              <div className="col-span-1">Role</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-2 text-right">{isAdmin ? "Actions" : ""}</div>
            </div>
            
            {/* Table Body */}
            <div className="divide-y divide-gray-100">
              {teamUsers.map((user) => {
                const initials = getInitials(user.name, user.email)

                return (
                  <div key={user.id} className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50">
                    {/* Name */}
                    <div className="col-span-3 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${
                        user.isCurrentUser ? "bg-orange-100 text-orange-700" : "bg-gray-200 text-gray-600"
                      }`}>
                        {initials}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-gray-900 truncate">
                          {user.name || <span className="text-gray-400 italic">No name set</span>}
                        </span>
                        {user.isCurrentUser && (
                          <span className="text-xs text-orange-600">You</span>
                        )}
                      </div>
                    </div>

                    {/* Email */}
                    <div className="col-span-3 text-sm text-gray-600 truncate">
                      {user.email}
                    </div>

                    {/* Tags */}
                    <div className="col-span-2">
                      {isAdmin ? (
                        <Popover onOpenChange={(open) => { if (!open) setInlineTagInput("") }}>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-1 min-h-[28px] max-w-full text-left group">
                              {(user.tags || []).length > 0 ? (
                                <div className="flex items-center gap-1 flex-wrap">
                                  {user.tags.map(tag => (
                                    <span key={tag} className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[11px] font-medium rounded">
                                      {tag}
                                    </span>
                                  ))}
                                  <ChevronDown className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Plus className="w-3 h-3" /> Add tag
                                </span>
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2" align="start">
                            <div className="space-y-1">
                              <Input
                                placeholder="New tag..."
                                value={inlineTagInput}
                                onChange={(e) => setInlineTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault()
                                    handleInlineAddTag(user, inlineTagInput)
                                  }
                                }}
                                className="h-8 text-sm"
                                autoFocus
                              />
                              {orgTags.length > 0 && (
                                <div className="max-h-40 overflow-y-auto pt-1 border-t border-gray-100 mt-1">
                                  {orgTags.map(tag => {
                                    const isSelected = (user.tags || []).includes(tag)
                                    return (
                                      <button
                                        key={tag}
                                        className="flex items-center justify-between w-full px-2 py-1.5 text-sm rounded hover:bg-gray-50 text-left"
                                        onClick={() => handleInlineTagToggle(user, tag)}
                                      >
                                        <span className={isSelected ? "text-gray-900 font-medium" : "text-gray-600"}>{tag}</span>
                                        {isSelected && <Check className="w-3.5 h-3.5 text-green-600" />}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <div className="flex items-center gap-1 flex-wrap">
                          {(user.tags || []).map(tag => (
                            <span key={tag} className="inline-flex items-center px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[11px] font-medium rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Role */}
                    <div className="col-span-1">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                        user.role === "ADMIN"
                          ? "border-purple-200 text-purple-700 bg-purple-50"
                          : user.role === "MANAGER"
                          ? "border-blue-200 text-blue-700 bg-blue-50"
                          : "border-gray-300 text-gray-700"
                      }`}>
                        {user.role === "ADMIN" ? "Admin" : user.role === "MANAGER" ? "Manager" : "Employee"}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="col-span-1">
                      {user.status === "active" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-green-200 text-green-700 bg-green-50 text-xs font-medium rounded-full">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-amber-200 text-amber-700 bg-amber-50 text-xs font-medium rounded-full">
                          <Clock className="w-3 h-3" />
                          Pending
                        </span>
                      )}
                    </div>

                    {/* Actions - only show for admins */}
                    <div className="col-span-2 flex items-center justify-end gap-1">
                      {isAdmin && (
                        <>
                          {user.status === "pending" && (
                            <button
                              onClick={() => handleResendInvite(user)}
                              disabled={resendingUserId === user.id}
                              className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors disabled:opacity-50"
                              title="Resend invite"
                            >
                              <RotateCw className={`w-4 h-4 ${resendingUserId === user.id ? "animate-spin" : ""}`} />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="Edit user"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openDeleteModal(user)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title={user.status === "pending" ? "Revoke invite" : "Remove user"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* Edit User Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4 pt-4">
              <div>
                <Label className="text-gray-500">Email</Label>
                <p className="text-sm font-medium mt-1">{editingUser.email}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editFirstName">First Name</Label>
                  <Input
                    id="editFirstName"
                    placeholder="Enter first name"
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="editLastName">Last Name</Label>
                  <Input
                    id="editLastName"
                    placeholder="Enter last name"
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="editRole">Role</Label>
                <Select value={editRole} onValueChange={(v) => setEditRole(v as "ADMIN" | "MANAGER" | "MEMBER")}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="MEMBER">Employee</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  {editRole === "ADMIN" ? "Full access to all features and settings" :
                   editRole === "MANAGER" ? "Can see all tasks and manage team workflows" :
                   "Access determined by role permissions"}
                </p>
              </div>

              <div>
                <Label>Tags</Label>
                <p className="text-xs text-gray-500 mt-0.5 mb-2">
                  Tags help filter users in form fields (e.g. &quot;Project Manager&quot;, &quot;Accountant&quot;)
                </p>
                {editTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {editTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-700 text-xs font-medium rounded-full"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => setEditTags(editTags.filter(t => t !== tag))}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Input
                    placeholder="Type a tag and press Enter"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        const trimmed = tagInput.trim()
                        if (trimmed && !editTags.includes(trimmed)) {
                          setEditTags([...editTags, trimmed])
                        }
                        setTagInput("")
                      }
                    }}
                  />
                  {tagInput && orgTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && !editTags.includes(t)).length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-32 overflow-y-auto">
                      {orgTags
                        .filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && !editTags.includes(t))
                        .map(tag => (
                          <button
                            key={tag}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                            onClick={() => {
                              setEditTags([...editTags, tag])
                              setTagInput("")
                            }}
                          >
                            {tag}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <button
                  onClick={handleSaveUser}
                  disabled={saving}
                  className="
                    px-4 py-2 rounded-md text-sm font-medium
                    bg-gray-900 text-white
                    hover:bg-gray-800
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors
                  "
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deletingUser?.status === "pending" ? "Revoke Invitation" : "Remove Team Member"}</DialogTitle>
          </DialogHeader>
          {deletingUser && (
            <div className="space-y-4 pt-4">
              <p className="text-gray-600">
                {deletingUser.status === "pending"
                  ? <>Are you sure you want to revoke the invitation for <strong>{deletingUser.name || deletingUser.email}</strong>?</>
                  : <>Are you sure you want to remove <strong>{deletingUser.name || deletingUser.email}</strong> from your organization?</>
                }
              </p>
              <p className="text-sm text-gray-500">
                {deletingUser.status === "pending"
                  ? "The pending invitation will be cancelled and the user will no longer be able to join."
                  : "This action cannot be undone. The user will lose access to all organization data."
                }
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
                  Cancel
                </Button>
                <button
                  onClick={handleDeleteUser}
                  disabled={deleting}
                  className="
                    px-4 py-2 rounded-md text-sm font-medium
                    bg-red-600 text-white
                    hover:bg-red-700
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors
                  "
                >
                  {deleting ? "Removing..." : deletingUser.status === "pending" ? "Revoke Invite" : "Remove User"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function TeamSettingsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white">
        <div className="px-8 py-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
          </div>
        </div>
      </div>
    }>
      <TeamSettingsContent />
    </Suspense>
  )
}

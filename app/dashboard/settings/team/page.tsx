"use client"

import { useState, useEffect } from "react"
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
import { UserPlus, Shield, User, Clock, Pencil, Trash2, Plus } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"

interface OrgUser {
  id: string
  email: string
  name: string | null
  role: "ADMIN" | "MEMBER" | "VIEWER"
  status: "active" | "pending"
  createdAt: string
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

export default function TeamSettingsPage() {
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
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER")
  const [inviting, setInviting] = useState(false)
  
  // Edit modal state
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null)
  const [editFirstName, setEditFirstName] = useState("")
  const [editLastName, setEditLastName] = useState("")
  const [editRole, setEditRole] = useState<"ADMIN" | "MEMBER" | "VIEWER">("MEMBER")
  const [saving, setSaving] = useState(false)
  
  // Delete confirmation state
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deletingUser, setDeletingUser] = useState<OrgUser | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchTeamUsers()
  }, [])

  const fetchTeamUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/org/users")
      if (response.ok) {
        const data = await response.json()
        setTeamUsers(data.users || [])
        setIsAdmin(true)
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
    setEditRole(user.role)
    setIsEditOpen(true)
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
          role: editRole
        })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update user")
      }

      const data = await response.json()
      setTeamUsers(prev => prev.map(u => u.id === editingUser.id ? data.user : u))
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

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-white">
        <div className="px-8 py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">Team</h1>
            <p className="text-sm text-gray-500">Manage your organization's team members</p>
          </div>
          <div className="border border-dashed border-gray-200 rounded-lg">
            <EmptyState
              icon={<Shield className="w-6 h-6" />}
              title="Access Denied"
              description="You don't have permission to manage team settings. Contact an administrator for access."
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-6">
        {/* Page Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-1">Team</h1>
            <p className="text-sm text-gray-500">
              Manage your organization's team members and their roles
            </p>
          </div>
          
          {/* Invite User Button */}
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
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "ADMIN" | "MEMBER")}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MEMBER">Employee</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    Admins can manage team members and settings
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
        {teamUsers.length === 0 ? (
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
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="col-span-4">Name</div>
              <div className="col-span-3">Email</div>
              <div className="col-span-2">Role</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>
            
            {/* Table Body */}
            <div className="divide-y divide-gray-100">
              {teamUsers.map((user) => {
                const initials = getInitials(user.name, user.email)
                
                return (
                  <div key={user.id} className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50">
                    {/* Name */}
                    <div className="col-span-4 flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 text-sm font-medium">
                        {initials}
                      </div>
                      <span className="font-medium text-gray-900">
                        {user.name || <span className="text-gray-400 italic">No name set</span>}
                      </span>
                    </div>
                    
                    {/* Email */}
                    <div className="col-span-3 text-sm text-gray-600 truncate">
                      {user.email}
                    </div>
                    
                    {/* Role */}
                    <div className="col-span-2">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${
                        user.role === "ADMIN" 
                          ? "border-purple-200 text-purple-700 bg-purple-50" 
                          : user.role === "VIEWER"
                          ? "border-gray-200 text-gray-600"
                          : "border-gray-300 text-gray-700"
                      }`}>
                        {user.role === "ADMIN" ? "Admin" : user.role === "VIEWER" ? "Viewer" : "Employee"}
                      </span>
                    </div>
                    
                    {/* Status */}
                    <div className="col-span-2">
                      {user.status === "active" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-green-200 text-green-700 bg-green-50 text-xs font-medium rounded-full">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-amber-200 text-amber-700 bg-amber-50 text-xs font-medium rounded-full">
                          <Clock className="w-3 h-3" />
                          Pending
                        </span>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div className="col-span-1 flex items-center justify-end gap-1">
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
                        title="Remove user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
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
                <Select value={editRole} onValueChange={(v) => setEditRole(v as "ADMIN" | "MEMBER" | "VIEWER")}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MEMBER">Employee</SelectItem>
                    <SelectItem value="VIEWER">Viewer</SelectItem>
                  </SelectContent>
                </Select>
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
            <DialogTitle>Remove Team Member</DialogTitle>
          </DialogHeader>
          {deletingUser && (
            <div className="space-y-4 pt-4">
              <p className="text-gray-600">
                Are you sure you want to remove <strong>{deletingUser.name || deletingUser.email}</strong> from your organization?
              </p>
              <p className="text-sm text-gray-500">
                This action cannot be undone. The user will lose access to all organization data.
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
                  {deleting ? "Removing..." : "Remove User"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

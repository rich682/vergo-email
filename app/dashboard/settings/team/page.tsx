"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { UserPlus, Shield, User, Clock, ArrowLeft, Pencil, Trash2 } from "lucide-react"

interface OrgUser {
  id: string
  email: string
  name: string | null
  role: "ADMIN" | "MEMBER" | "VIEWER"
  status: "active" | "pending"
  createdAt: string
}

// Helper to get initials from name
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

// Helper to parse name into first/last
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

// Helper to combine first/last into full name
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
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <button
          onClick={() => router.push("/dashboard/settings")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </button>
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
            <p className="text-gray-500">You don't have access to team settings.</p>
            <p className="text-sm text-gray-400 mt-1">Contact an administrator for access.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push("/dashboard/settings")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Settings
      </button>

      {/* Success/Error Messages */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-md ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <p className="font-medium">{message.text}</p>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Team Management
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Manage your organization's team members and their roles
            </p>
          </div>
          
          {/* Invite User Modal */}
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="w-4 h-4 mr-2" />
                Invite User
              </Button>
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
                  <Button
                    onClick={handleInviteUser}
                    disabled={!inviteEmail.trim() || inviting}
                  >
                    {inviting ? "Inviting..." : "Send Invite"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {teamUsers.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              <User className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No team members yet.</p>
              <p className="text-sm mt-1">Invite your first team member to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-600">Name</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-600">Email</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-600">Role</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-gray-600">Status</th>
                    <th className="text-right py-3 px-2 text-sm font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teamUsers.map((user) => {
                    const initials = getInitials(user.name, user.email)
                    const { firstName, lastName } = parseName(user.name)
                    
                    return (
                      <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-4 px-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium text-sm">
                              {initials}
                            </div>
                            <div>
                              {user.name ? (
                                <span className="font-medium text-gray-900">{user.name}</span>
                              ) : (
                                <span className="text-gray-400 italic">No name set</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-2 text-gray-600">{user.email}</td>
                        <td className="py-4 px-2">
                          <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${
                            user.role === "ADMIN" 
                              ? "bg-purple-100 text-purple-800" 
                              : user.role === "VIEWER"
                              ? "bg-gray-100 text-gray-800"
                              : "bg-blue-100 text-blue-800"
                          }`}>
                            {user.role === "ADMIN" ? "Admin" : user.role === "VIEWER" ? "Viewer" : "Employee"}
                          </span>
                        </td>
                        <td className="py-4 px-2">
                          {user.status === "active" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
                              <Clock className="w-3 h-3" />
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-2">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditModal(user)}
                              className="h-8 w-8 p-0"
                              title="Edit user"
                            >
                              <Pencil className="w-4 h-4 text-gray-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteModal(user)}
                              className="h-8 w-8 p-0 hover:bg-red-50"
                              title="Remove user"
                            >
                              <Trash2 className="w-4 h-4 text-gray-500 hover:text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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
                <p className="text-xs text-gray-500 mt-1">
                  Admins can manage team members and settings
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveUser} disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
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
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteUser} 
                  disabled={deleting}
                >
                  {deleting ? "Removing..." : "Remove User"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

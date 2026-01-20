"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
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
import { UserPlus, Shield, User, Clock, Pencil, Trash2, Plus, Mail, Check, ChevronDown, X } from "lucide-react"
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
  role: "ADMIN" | "MEMBER" | "VIEWER"
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
  const searchParams = useSearchParams()
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
  
  // Inbox connection state
  const [connectDropdownUserId, setConnectDropdownUserId] = useState<string | null>(null)
  const [inboxPopoverUserId, setInboxPopoverUserId] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  

  // Handle OAuth callback messages
  useEffect(() => {
    const success = searchParams.get("success")
    const error = searchParams.get("error")

    if (success === "gmail_connected" || success === "microsoft_connected") {
      setMessage({ type: "success", text: "Email inbox connected successfully!" })
      setTimeout(() => setMessage(null), 5000)
      window.history.replaceState({}, "", "/dashboard/settings/team")
      fetchTeamUsers() // Refresh to show new connection
    } else if (error) {
      const errorMessages: Record<string, string> = {
        oauth_failed: "OAuth authentication failed. Please try again.",
        no_tokens: "Failed to get access tokens. Please try again.",
        no_email: "Failed to get email address from provider.",
        session_mismatch: "Session mismatch - please ensure you're logged in and try again.",
        user_mismatch: "User ID mismatch - please try again.",
        org_mismatch: "Organization mismatch - please try again.",
        invalid_state: "Invalid OAuth state - please try again.",
        invalid_state_data: "Invalid OAuth state data - please try again.",
        missing_code_or_state: "OAuth callback missing required data.",
        token_exchange_failed: "Failed to exchange tokens with provider.",
        no_access_token: "No access token received from provider.",
        no_refresh_token: "No refresh token received - offline access may not be enabled.",
        profile_fetch_failed: "Failed to fetch profile from provider.",
        no_email_in_profile: "No email found in your account profile.",
        missing_config: "Server configuration error - contact support.",
        ms_access_denied: "Access denied - you may have declined permissions.",
        ms_consent_required: "Admin consent may be required for this app.",
        unexpected_error: "An unexpected error occurred.",
      }
      const customMessage = searchParams.get("message")
      let errorText = errorMessages[error] || `Connection error: ${error}`
      if (customMessage) {
        errorText += ` (${decodeURIComponent(customMessage)})`
      }
      setMessage({ type: "error", text: errorText })
      setTimeout(() => setMessage(null), 10000)
      window.history.replaceState({}, "", "/dashboard/settings/team")
    }
  }, [searchParams])

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setConnectDropdownUserId(null)
      }
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setInboxPopoverUserId(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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

  const handleConnectGmail = (userId: string) => {
    setConnectDropdownUserId(null)
    window.location.href = `/api/oauth/gmail?returnTo=/dashboard/settings/team`
  }

  const handleConnectMicrosoft = (userId: string) => {
    setConnectDropdownUserId(null)
    window.location.href = `/api/oauth/microsoft?returnTo=/dashboard/settings/team`
  }

  const handleDisconnect = async (accountId: string, userId: string) => {
    try {
      setDisconnecting(accountId)
      const res = await fetch(`/api/email-accounts/${accountId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to disconnect")
      }
      setMessage({ type: "success", text: "Inbox disconnected successfully" })
      setTimeout(() => setMessage(null), 5000)
      setInboxPopoverUserId(null)
      fetchTeamUsers()
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to disconnect" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setDisconnecting(null)
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
        <div className="flex items-center justify-between mb-4">
          {/* Info text for non-admins */}
          {!isAdmin && (
            <p className="text-sm text-gray-500">
              Connect your inbox to send and receive emails through Vergo.
            </p>
          )}
          
          {/* Spacer for layout */}
          <div />
          
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
          <div className="border border-gray-200 rounded-lg overflow-visible">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="col-span-3">Name</div>
              <div className="col-span-3">Email</div>
              <div className="col-span-1">Role</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-3">Inbox</div>
              <div className="col-span-1 text-right">{isAdmin ? "Actions" : ""}</div>
            </div>
            
            {/* Table Body */}
            <div className="divide-y divide-gray-100">
              {teamUsers.map((user) => {
                const initials = getInitials(user.name, user.email)
                const canManageInbox = user.isCurrentUser // Only the user themselves can connect/disconnect
                
                return (
                  <div key={user.id} className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50">
                    {/* Name */}
                    <div className="col-span-3 flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${
                        user.isCurrentUser ? "bg-orange-100 text-orange-700" : "bg-gray-200 text-gray-600"
                      }`}>
                        {initials}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">
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
                    
                    {/* Role */}
                    <div className="col-span-1">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
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
                    
                    {/* Inbox */}
                    <div className="col-span-3 relative">
                      {user.connectedEmail ? (
                        // Connected - show email with popover on click
                        <div className="relative">
                          <button
                            onClick={() => setInboxPopoverUserId(inboxPopoverUserId === user.id ? null : user.id)}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                              user.isCurrentUser 
                                ? "bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100"
                                : "bg-green-50 border border-green-200 text-green-700 hover:bg-green-100"
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[140px]">{user.connectedEmail.email}</span>
                            {canManageInbox && <ChevronDown className="w-3 h-3" />}
                          </button>
                          
                          {/* Popover for connected inbox */}
                          {inboxPopoverUserId === user.id && (
                            <div 
                              ref={popoverRef}
                              className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3"
                            >
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Mail className="w-4 h-4 text-gray-400" />
                                  <span className="text-sm font-medium text-gray-900 truncate">
                                    {user.connectedEmail.email}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    user.connectedEmail.provider === "GMAIL" 
                                      ? "bg-red-100 text-red-700"
                                      : user.connectedEmail.provider === "MICROSOFT"
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-gray-100 text-gray-700"
                                  }`}>
                                    {user.connectedEmail.provider}
                                  </span>
                                  {user.connectedEmail.isPrimary && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                      Primary
                                    </span>
                                  )}
                                </div>
                                {user.connectedEmail.lastSyncAt && (
                                  <p className="text-xs text-gray-500">
                                    Last synced: {new Date(user.connectedEmail.lastSyncAt).toLocaleString()}
                                  </p>
                                )}
                                {canManageInbox && (
                                  <button
                                    onClick={() => handleDisconnect(user.connectedEmail!.id, user.id)}
                                    disabled={disconnecting === user.connectedEmail.id}
                                    className="w-full mt-2 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                                  >
                                    {disconnecting === user.connectedEmail.id ? "Disconnecting..." : "Disconnect"}
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : user.status === "pending" ? (
                        // Pending user - can't connect yet
                        <span className="text-sm text-gray-400">—</span>
                      ) : canManageInbox ? (
                        // Not connected + is current user - show connect dropdown
                        <div className="relative" ref={dropdownRef}>
                          <button
                            onClick={() => setConnectDropdownUserId(connectDropdownUserId === user.id ? null : user.id)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:border-orange-300 hover:text-orange-600 transition-colors"
                          >
                            <Mail className="w-4 h-4" />
                            Connect
                            <ChevronDown className="w-3 h-3" />
                          </button>
                          
                          {/* Dropdown for connect options */}
                          {connectDropdownUserId === user.id && (
                            <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                              <button
                                onClick={() => handleConnectGmail(user.id)}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <div className="w-5 h-5 bg-red-100 rounded flex items-center justify-center">
                                  <Mail className="w-3 h-3 text-red-600" />
                                </div>
                                Connect Gmail
                              </button>
                              <button
                                onClick={() => handleConnectMicrosoft(user.id)}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                              >
                                <div className="w-5 h-5 bg-blue-100 rounded flex items-center justify-center">
                                  <Mail className="w-3 h-3 text-blue-600" />
                                </div>
                                Connect Microsoft
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        // Not connected + not current user - show not connected
                        <span className="text-sm text-gray-400">Not connected</span>
                      )}
                    </div>
                    
                    {/* Actions - only show for admins */}
                    <div className="col-span-1 flex items-center justify-end gap-1">
                      {isAdmin && (
                        <>
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

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
import { UserPlus, Shield, User, Clock, ArrowLeft } from "lucide-react"

interface OrgUser {
  id: string
  email: string
  name: string | null
  role: "ADMIN" | "MEMBER" | "VIEWER"
  status: "active" | "pending"
  createdAt: string
}

export default function TeamSettingsPage() {
  const router = useRouter()
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [teamUsers, setTeamUsers] = useState<OrgUser[]>([])
  const [loading, setLoading] = useState(true)
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteName, setInviteName] = useState("")
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER")
  const [inviting, setInviting] = useState(false)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)

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
      const response = await fetch("/api/org/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim() || undefined,
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
      setInviteName("")
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

  const handleUpdateRole = async (userId: string, newRole: "ADMIN" | "MEMBER" | "VIEWER") => {
    setUpdatingRole(userId)
    try {
      const response = await fetch(`/api/org/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole })
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update role")
      }

      const data = await response.json()
      setTeamUsers(prev => prev.map(u => u.id === userId ? data.user : u))
      setMessage({ type: "success", text: "Role updated successfully!" })
      setTimeout(() => setMessage(null), 5000)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to update role" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setUpdatingRole(null)
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
                <div>
                  <Label htmlFor="inviteName">Name (optional)</Label>
                  <Input
                    id="inviteName"
                    placeholder="John Doe"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="mt-1"
                  />
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
                  </tr>
                </thead>
                <tbody>
                  {teamUsers.map((user) => (
                    <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-4 px-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="w-5 h-5 text-blue-600" />
                          </div>
                          <span className="font-medium text-gray-900">
                            {user.name || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-2 text-gray-600">{user.email}</td>
                      <td className="py-4 px-2">
                        <Select
                          value={user.role}
                          onValueChange={(v) => handleUpdateRole(user.id, v as "ADMIN" | "MEMBER" | "VIEWER")}
                          disabled={updatingRole === user.id}
                        >
                          <SelectTrigger className="w-32 h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                            <SelectItem value="MEMBER">Employee</SelectItem>
                            <SelectItem value="VIEWER">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

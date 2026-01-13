"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
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
import { UserPlus, Shield, User, Clock } from "lucide-react"

interface OrgUser {
  id: string
  email: string
  name: string | null
  role: "ADMIN" | "MEMBER" | "VIEWER"
  status: "active" | "pending"
  createdAt: string
}

function SettingsContent() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [signature, setSignature] = useState<string>("")
  const [loadingSignature, setLoadingSignature] = useState(true)
  const [savingSignature, setSavingSignature] = useState(false)
  const searchParams = useSearchParams()

  // Team management state
  const [isAdmin, setIsAdmin] = useState(false)
  const [teamUsers, setTeamUsers] = useState<OrgUser[]>([])
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteName, setInviteName] = useState("")
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER")
  const [inviting, setInviting] = useState(false)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)

  useEffect(() => {
    // Check for success/error messages in URL
    const success = searchParams.get("success")
    const error = searchParams.get("error")

    if (success === "gmail_connected" || success === "microsoft_connected") {
      setMessage({ type: "success", text: "Email account connected successfully!" })
      // Clear the message after 5 seconds
      setTimeout(() => setMessage(null), 5000)
      // Clean up URL
      window.history.replaceState({}, "", "/dashboard/settings")
    } else if (error) {
      const errorMessages: Record<string, string> = {
        oauth_failed: "OAuth authentication failed. Please try again.",
        no_tokens: "Failed to get access tokens. Please try again.",
        no_email: "Failed to get email address. Please try again.",
        oauth_error: "An error occurred during OAuth. Please try again."
      }
      setMessage({ type: "error", text: errorMessages[error] || "An error occurred." })
      // Clear the message after 5 seconds
      setTimeout(() => setMessage(null), 5000)
      // Clean up URL
      window.history.replaceState({}, "", "/dashboard/settings")
    }

    fetchAccounts()
    fetchUserSignature()
    fetchTeamUsers()
  }, [searchParams])

  const fetchUserSignature = async () => {
    try {
      setLoadingSignature(true)
      const response = await fetch("/api/user/signature")
      if (response.ok) {
        const data = await response.json()
        setSignature(data.signature || "")
      }
    } catch (error) {
      console.error("Error fetching signature:", error)
    } finally {
      setLoadingSignature(false)
    }
  }

  const handleSaveSignature = async () => {
    try {
      setSavingSignature(true)
      setMessage(null)
      const response = await fetch("/api/user/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature })
      })
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save signature")
      }
      
      setMessage({ type: "success", text: "Signature saved successfully!" })
      setTimeout(() => setMessage(null), 5000)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to save signature" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setSavingSignature(false)
    }
  }

  const fetchAccounts = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/email-accounts")
      if (response.ok) {
        const data = await response.json()
        setAccounts(data)
      }
    } catch (error) {
      console.error("Error fetching accounts:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchTeamUsers = async () => {
    try {
      setLoadingTeam(true)
      const response = await fetch("/api/org/users")
      if (response.ok) {
        const data = await response.json()
        setTeamUsers(data.users || [])
        setIsAdmin(true)  // If we can fetch, we're admin
      } else if (response.status === 403) {
        setIsAdmin(false)  // Not admin
      }
    } catch (error) {
      console.error("Error fetching team:", error)
      setIsAdmin(false)
    } finally {
      setLoadingTeam(false)
    }
  }

  const handleConnectGmail = () => {
    window.location.href = "/api/oauth/gmail"
  }

  const handleConnectMicrosoft = () => {
    window.location.href = "/api/oauth/microsoft"
  }

  const handleSyncContacts = async (accountId: string) => {
    try {
      setMessage(null)
      const res = await fetch(`/api/contacts/sync?emailAccountId=${accountId}`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Sync failed")
      }
      const data = await res.json().catch(() => ({}))
      setMessage({ type: "success", text: data.message || "Sync started" })
      setTimeout(() => setMessage(null), 5000)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Sync failed" })
      setTimeout(() => setMessage(null), 5000)
    }
  }

  const handleDisconnect = async (accountId: string) => {
    try {
      const res = await fetch(`/api/email-accounts/${accountId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to disconnect")
      }
      fetchAccounts()
    } catch (err) {
      console.error("Disconnect error", err)
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

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "ADMIN": return "Admin"
      case "MEMBER": return "Employee"
      case "VIEWER": return "Viewer"
      default: return role
    }
  }

  return (
    <div className="w-full h-full flex flex-col border-l border-r border-gray-200">
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="text-sm text-gray-600">Manage your email connections and preferences</p>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-gray-50 border-t border-gray-200">
        <div className="p-6 space-y-6">

      {/* Success/Error Messages */}
      {message && (
        <div
          className={`p-4 rounded-md ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <p className="font-medium">{message.text}</p>
        </div>
      )}

      {/* Team Section - Admin Only */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Team
          </CardTitle>
          {isAdmin && (
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
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
          )}
        </CardHeader>
        <CardContent>
          {loadingTeam ? (
            <div className="py-4 text-gray-500">Loading team...</div>
          ) : !isAdmin ? (
            <div className="py-4 text-gray-500 text-center">
              <Shield className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>You don't have access to team settings.</p>
              <p className="text-sm">Contact an administrator for access.</p>
            </div>
          ) : teamUsers.length === 0 ? (
            <div className="py-4 text-gray-500">No team members yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 text-sm font-medium text-gray-600">Name</th>
                    <th className="text-left py-2 px-2 text-sm font-medium text-gray-600">Email</th>
                    <th className="text-left py-2 px-2 text-sm font-medium text-gray-600">Role</th>
                    <th className="text-left py-2 px-2 text-sm font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {teamUsers.map((user) => (
                    <tr key={user.id} className="border-b last:border-0">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                            <User className="w-4 h-4 text-gray-500" />
                          </div>
                          <span className="font-medium text-gray-900">
                            {user.name || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-gray-600">{user.email}</td>
                      <td className="py-3 px-2">
                        <Select
                          value={user.role}
                          onValueChange={(v) => handleUpdateRole(user.id, v as "ADMIN" | "MEMBER" | "VIEWER")}
                          disabled={updatingRole === user.id}
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ADMIN">Admin</SelectItem>
                            <SelectItem value="MEMBER">Employee</SelectItem>
                            <SelectItem value="VIEWER">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-3 px-2">
                        {user.status === "active" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded-full">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded-full">
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

      <Card>
        <CardHeader>
          <CardTitle>Email Signature</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="signature" className="text-sm font-medium text-gray-700 mb-2 block">
              Your email signature (will be appended to all outgoing emails)
            </Label>
            {loadingSignature ? (
              <div className="py-4 text-gray-500">Loading signature...</div>
            ) : (
              <>
                <Textarea
                  id="signature"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="John Doe&#10;Accountant&#10;john@example.com"
                  rows={5}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Leave empty to use auto-generated signature from your name, organization, and email.
                </p>
                <Button
                  onClick={handleSaveSignature}
                  disabled={savingSignature}
                  className="mt-4"
                >
                  {savingSignature ? "Saving..." : "Save Signature"}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleConnectGmail}>Connect Gmail inbox</Button>
            <Button variant="outline" onClick={handleConnectMicrosoft}>Connect Microsoft inbox</Button>
          </div>

          {loading ? (
            <div className="py-4 text-gray-500">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="py-4 text-gray-500">
              No email accounts connected. Click "Connect Gmail" to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex justify-between items-center p-4 border rounded"
                >
                  <div>
                    <p className="font-medium">{account.email}</p>
                    <p className="text-sm text-gray-500">{account.provider}</p>
                    {account.isActive && (
                      <p className="text-xs text-green-600 mt-1">● Active</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {account.isPrimary && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        Primary
                      </span>
                    )}
                    <Button size="sm" variant="outline" onClick={() => handleSyncContacts(account.id)}>
                      Sync contacts
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDisconnect(account.id)}>
                      Disconnect
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  )
}

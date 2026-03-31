"use client"

import { useState, useEffect, useCallback } from "react"

interface AdminUser {
  id: string
  email: string
  name: string | null
  status: "active" | "pending"
  createdAt: string
}

export function AdminsClient() {
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteName, setInviteName] = useState("")
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchAdmins = useCallback(async () => {
    const res = await fetch("/api/admin-users")
    if (res.ok) setAdmins(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAdmins()
  }, [fetchAdmins])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviting(true)
    setError("")

    const res = await fetch("/api/admin-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, name: inviteName || undefined }),
    })

    if (res.ok) {
      setShowInvite(false)
      setInviteEmail("")
      setInviteName("")
      fetchAdmins()
    } else {
      const data = await res.json()
      setError(data.error || "Failed to invite")
    }
    setInviting(false)
  }

  const handleResend = async (id: string) => {
    setActionLoading(id)
    await fetch(`/api/admin-users/${id}/resend-invite`, { method: "POST" })
    setActionLoading(null)
  }

  const handleRemove = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from admin access?`)) return
    setActionLoading(id)
    const res = await fetch(`/api/admin-users/${id}`, { method: "DELETE" })
    if (res.ok) {
      fetchAdmins()
    } else {
      const data = await res.json()
      alert(data.error || "Failed to remove")
    }
    setActionLoading(null)
  }

  if (loading) {
    return <p className="text-gray-400">Loading...</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Admins</h1>
          <p className="text-sm text-gray-400 mt-1">Manage who has access to the admin dashboard.</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Invite Admin
        </button>
      </div>

      {/* Invite Dialog */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-white mb-4">Invite Admin</h2>
            <form onSubmit={handleInvite}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email address"
                required
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 mb-3"
                autoFocus
              />
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Name (optional)"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
              />
              {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => { setShowInvite(false); setError("") }}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {inviting ? "Sending..." : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Table */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left text-xs font-medium text-gray-400 uppercase px-6 py-3">Admin</th>
              <th className="text-left text-xs font-medium text-gray-400 uppercase px-6 py-3">Status</th>
              <th className="text-right text-xs font-medium text-gray-400 uppercase px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.id} className="border-b border-gray-800/50 last:border-0">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-sm text-gray-300 font-medium">
                      {(admin.name || admin.email)[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{admin.name || "—"}</p>
                      <p className="text-xs text-gray-400">{admin.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                      admin.status === "active"
                        ? "bg-green-500/10 text-green-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${admin.status === "active" ? "bg-green-400" : "bg-amber-400"}`} />
                    {admin.status === "active" ? "Active" : "Pending"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {admin.status === "pending" && (
                      <button
                        onClick={() => handleResend(admin.id)}
                        disabled={actionLoading === admin.id}
                        className="text-xs text-gray-400 hover:text-orange-400 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === admin.id ? "..." : "Resend"}
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(admin.id, admin.email)}
                      disabled={actionLoading === admin.id}
                      className="text-xs text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

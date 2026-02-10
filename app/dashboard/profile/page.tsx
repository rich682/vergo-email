"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { User, Mail, Shield, Building2, Check, ChevronDown, X } from "lucide-react"

interface ConnectedEmail {
  id: string
  email: string
  provider: "GMAIL" | "MICROSOFT" | "SMTP"
  isPrimary: boolean
  isActive: boolean
  lastSyncAt: string | null
}

interface Profile {
  id: string
  email: string
  firstName: string
  lastName: string
  name: string | null
  role: string
  organizationName: string
  createdAt: string
  connectedEmailAccounts: ConnectedEmail[]
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Form state
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")

  // Email connection
  const [showConnectDropdown, setShowConnectDropdown] = useState(false)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  useEffect(() => {
    fetchProfile()
  }, [])

  // Check for OAuth callback messages
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const success = params.get("success")
    const error = params.get("error")

    if (success === "gmail_connected" || success === "microsoft_connected") {
      setMessage({ type: "success", text: "Email inbox connected successfully!" })
      setTimeout(() => setMessage(null), 5000)
      window.history.replaceState({}, "", "/dashboard/profile")
      fetchProfile()
    } else if (error) {
      setMessage({ type: "error", text: `Connection error: ${error}` })
      setTimeout(() => setMessage(null), 8000)
      window.history.replaceState({}, "", "/dashboard/profile")
    }
  }, [])

  const fetchProfile = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/user/profile")
      if (res.ok) {
        const data = await res.json()
        setProfile(data.profile)
        setFirstName(data.profile.firstName || "")
        setLastName(data.profile.lastName || "")
      }
    } catch (error) {
      console.error("Error fetching profile:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!firstName.trim()) {
      setMessage({ type: "error", text: "First name is required" })
      setTimeout(() => setMessage(null), 5000)
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update profile")
      }

      setMessage({ type: "success", text: "Profile updated successfully!" })
      setTimeout(() => setMessage(null), 5000)
      fetchProfile()
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to update profile" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setSaving(false)
    }
  }

  const handleConnectGmail = () => {
    setShowConnectDropdown(false)
    window.location.href = `/api/oauth/gmail?returnTo=/dashboard/profile`
  }

  const handleConnectMicrosoft = () => {
    setShowConnectDropdown(false)
    window.location.href = `/api/oauth/microsoft?returnTo=/dashboard/profile`
  }

  const handleDisconnect = async (accountId: string) => {
    try {
      setDisconnecting(accountId)
      const res = await fetch(`/api/email-accounts/${accountId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to disconnect")
      }
      setMessage({ type: "success", text: "Email disconnected successfully" })
      setTimeout(() => setMessage(null), 5000)
      fetchProfile()
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to disconnect" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setDisconnecting(null)
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "ADMIN": return "Admin"
      case "MANAGER": return "Manager"
      case "MEMBER": return "Employee"
      default: return "Employee"
    }
  }

  if (loading) {
    return (
      <div className="px-8 py-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="px-8 py-6">
        <p className="text-gray-500">Failed to load profile.</p>
      </div>
    )
  }

  return (
    <div className="px-8 py-6 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Profile Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account information and connected email.</p>
      </div>

      {/* Messages */}
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

      {/* Profile Info */}
      <div className="space-y-8">
        {/* Organization & Role */}
        <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Building2 className="w-4 h-4 text-gray-400" />
            <span>{profile.organizationName}</span>
          </div>
          <div className="w-px h-4 bg-gray-300" />
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Shield className="w-4 h-4 text-gray-400" />
            <span>{getRoleLabel(profile.role)}</span>
          </div>
        </div>

        {/* Name */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-gray-900 uppercase tracking-wider">Personal Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                placeholder="Enter first name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                placeholder="Enter last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          {/* Email (read-only) */}
          <div>
            <Label>Email Address</Label>
            <div className="mt-1 flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-600">
              <Mail className="w-4 h-4 text-gray-400" />
              {profile.email}
            </div>
            <p className="text-xs text-gray-400 mt-1">Contact your admin to change your email address.</p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || (!firstName.trim())}
              className="
                px-5 py-2 rounded-md text-sm font-medium
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

        {/* Connected Email Accounts */}
        <div className="space-y-4 border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-gray-900 uppercase tracking-wider">Connected Email</h2>
              <p className="text-xs text-gray-500 mt-1">Connect your inbox to send and receive emails through Vergo.</p>
            </div>
          </div>

          {profile.connectedEmailAccounts.length > 0 ? (
            <div className="space-y-3">
              {profile.connectedEmailAccounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      account.provider === "GMAIL"
                        ? "bg-red-100"
                        : account.provider === "MICROSOFT"
                        ? "bg-blue-100"
                        : "bg-gray-100"
                    }`}>
                      <Mail className={`w-4 h-4 ${
                        account.provider === "GMAIL"
                          ? "text-red-600"
                          : account.provider === "MICROSOFT"
                          ? "text-blue-600"
                          : "text-gray-600"
                      }`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{account.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          account.provider === "GMAIL"
                            ? "bg-red-50 text-red-700"
                            : account.provider === "MICROSOFT"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-gray-50 text-gray-700"
                        }`}>
                          {account.provider}
                        </span>
                        {account.isPrimary && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700">Primary</span>
                        )}
                        {account.lastSyncAt && (
                          <span className="text-xs text-gray-400">
                            Last synced {new Date(account.lastSyncAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDisconnect(account.id)}
                    disabled={disconnecting === account.id}
                    className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {disconnecting === account.id ? "..." : "Disconnect"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg">
              <Mail className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-3">No email connected yet</p>
            </div>
          )}

          {/* Connect button */}
          <div className="relative">
            <button
              onClick={() => setShowConnectDropdown(!showConnectDropdown)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:border-orange-300 hover:text-orange-600 transition-colors"
            >
              <Mail className="w-4 h-4" />
              Connect Email
              <ChevronDown className="w-3 h-3" />
            </button>

            {showConnectDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowConnectDropdown(false)} />
                <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                  <button
                    onClick={handleConnectGmail}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <div className="w-5 h-5 bg-red-100 rounded flex items-center justify-center">
                      <Mail className="w-3 h-3 text-red-600" />
                    </div>
                    Connect Gmail
                  </button>
                  <button
                    onClick={handleConnectMicrosoft}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <div className="w-5 h-5 bg-blue-100 rounded flex items-center justify-center">
                      <Mail className="w-3 h-3 text-blue-600" />
                    </div>
                    Connect Microsoft
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

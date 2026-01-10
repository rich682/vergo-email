"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

function SettingsContent() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [signature, setSignature] = useState<string>("")
  const [loadingSignature, setLoadingSignature] = useState(true)
  const [savingSignature, setSavingSignature] = useState(false)
  const [cleaningUp, setCleaningUp] = useState(false)
  const searchParams = useSearchParams()

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

  const handleCleanupRequests = async () => {
    if (!confirm("Are you sure you want to delete ALL requests? This cannot be undone.")) {
      return
    }

    try {
      setCleaningUp(true)
      setMessage(null)
      const res = await fetch("/api/admin/cleanup-requests", { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Cleanup failed")
      }
      const data = await res.json()
      setMessage({ 
        type: "success", 
        text: `Cleanup completed! Deleted ${data.deleted.tasks} tasks and ${data.deleted.emailDrafts} email drafts.` 
      })
      setTimeout(() => {
        setMessage(null)
        // Redirect to requests page to see empty state
        window.location.href = "/dashboard/requests"
      }, 2000)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Cleanup failed" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setCleaningUp(false)
    }
  }

  return (
    <div className="w-full h-full flex flex-col border-l border-r border-gray-200">
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <div>
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="text-sm text-gray-600">Manage your email connections</p>
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

      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-gray-700 mb-2">
              Delete all requests and email drafts for a clean start. This will permanently delete all tasks, messages, and drafts.
            </p>
            <Button
              variant="destructive"
              onClick={handleCleanupRequests}
              disabled={cleaningUp}
            >
              {cleaningUp ? "Deleting..." : "Delete All Requests"}
            </Button>
            <p className="text-xs text-gray-500 mt-2">
              ⚠️ This action cannot be undone. All requests, tasks, and associated data will be permanently deleted.
            </p>
          </div>
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

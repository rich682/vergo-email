"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Mail, Check, X, RefreshCw, RotateCcw, Building2, CalendarDays, ChevronRight } from "lucide-react"
import Link from "next/link"

function SettingsContent() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [signature, setSignature] = useState<string>("")
  const [loadingSignature, setLoadingSignature] = useState(true)
  const [savingSignature, setSavingSignature] = useState(false)
  const searchParams = useSearchParams()
  
  // Company settings state
  const [companyName, setCompanyName] = useState<string>("")
  const [loadingCompany, setLoadingCompany] = useState(true)
  const [savingCompany, setSavingCompany] = useState(false)

  useEffect(() => {
    // Check for success/error messages in URL
    const success = searchParams.get("success")
    const error = searchParams.get("error")

    if (success === "gmail_connected" || success === "microsoft_connected") {
      setMessage({ type: "success", text: "Email account connected successfully!" })
      setTimeout(() => setMessage(null), 5000)
      window.history.replaceState({}, "", "/dashboard/settings")
    } else if (error) {
      const customMessage = searchParams.get("message")
      const errorMessages: Record<string, string> = {
        oauth_failed: "OAuth authentication failed. Please try again.",
        no_tokens: "Failed to get access tokens. Please try again.",
        no_email: "Failed to get email address. Please try again.",
        oauth_error: "An error occurred during OAuth. Please try again.",
        // New detailed error messages
        missing_code_or_state: "OAuth callback missing required parameters. Please try again.",
        invalid_state: "OAuth state validation failed. Please try again.",
        invalid_state_data: "OAuth state data is invalid. Please try again.",
        session_mismatch: "Session mismatch - please ensure you're logged in and try again.",
        missing_config: "Server configuration error. Please contact support.",
        token_exchange_failed: "Failed to exchange authorization code for tokens.",
        no_access_token: "No access token received from provider.",
        no_refresh_token: "No refresh token received. The app may need offline_access permission.",
        profile_fetch_failed: "Failed to fetch user profile from provider.",
        no_email_in_profile: "No email address found in your account profile.",
        unexpected_error: "An unexpected error occurred.",
        // Microsoft-specific errors
        ms_access_denied: "Access was denied. You may have declined the permissions.",
        ms_consent_required: "Admin consent may be required for this application.",
      }
      let errorText = errorMessages[error] || `OAuth error: ${error}`
      if (customMessage) {
        errorText += ` Details: ${decodeURIComponent(customMessage)}`
      }
      setMessage({ type: "error", text: errorText })
      setTimeout(() => setMessage(null), 10000) // Show longer for detailed errors
      window.history.replaceState({}, "", "/dashboard/settings")
    }

    fetchAccounts()
    fetchUserSignature()
    fetchCompanySettings()
  }, [searchParams])

  const fetchCompanySettings = async () => {
    try {
      setLoadingCompany(true)
      const response = await fetch("/api/org/settings")
      if (response.ok) {
        const data = await response.json()
        setCompanyName(data.name || "")
      }
    } catch (error) {
      console.error("Error fetching company settings:", error)
    } finally {
      setLoadingCompany(false)
    }
  }

  const handleSaveCompanyName = async () => {
    try {
      setSavingCompany(true)
      setMessage(null)
      const response = await fetch("/api/org/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: companyName })
      })
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save company name")
      }
      
      setMessage({ type: "success", text: "Company name saved successfully!" })
      setTimeout(() => setMessage(null), 5000)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to save company name" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setSavingCompany(false)
    }
  }

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

  const [syncing, setSyncing] = useState(false)
  const [resetting, setResetting] = useState<string | null>(null)
  const [debugData, setDebugData] = useState<any>(null)
  const [showDebug, setShowDebug] = useState(false)

  const handleDebugMessages = async () => {
    try {
      setMessage(null)
      const res = await fetch("/api/admin/debug-messages")
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch debug data")
      }
      setDebugData(data)
      setShowDebug(true)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to fetch debug data" })
      setTimeout(() => setMessage(null), 5000)
    }
  }

  const handleSyncEmails = async () => {
    try {
      setSyncing(true)
      setMessage(null)
      const res = await fetch("/api/admin/sync-emails", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Sync failed")
      }
      setMessage({ 
        type: "success", 
        text: `Email sync complete! Found ${data.total?.messagesFetched || 0} messages, ${data.total?.repliesPersisted || 0} replies linked.` 
      })
      setTimeout(() => setMessage(null), 8000)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Sync failed" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setSyncing(false)
    }
  }

  const handleResetAndSync = async (accountId: string) => {
    try {
      setResetting(accountId)
      setMessage(null)
      
      // First reset the sync cursor
      const resetRes = await fetch("/api/admin/debug-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId })
      })
      if (!resetRes.ok) {
        const data = await resetRes.json().catch(() => ({}))
        throw new Error(data.error || "Failed to reset sync")
      }
      
      // Then trigger a sync
      const syncRes = await fetch("/api/admin/sync-emails", { method: "POST" })
      const syncData = await syncRes.json()
      if (!syncRes.ok) {
        // Check for specific error types
        const errorMsg = syncData.message || syncData.error || "Sync failed"
        if (errorMsg.includes("reconnect") || errorMsg.includes("invalid_grant") || errorMsg.includes("AADSTS")) {
          throw new Error("This account needs to be reconnected. Please click 'Disconnect' and then reconnect the account.")
        }
        throw new Error(errorMsg)
      }
      
      setMessage({ 
        type: "success", 
        text: `Reset & sync complete! Found ${syncData.total?.messagesFetched || 0} messages, ${syncData.total?.repliesPersisted || 0} replies linked.` 
      })
      setTimeout(() => setMessage(null), 8000)
      fetchAccounts()
    } catch (err: any) {
      const errorText = err?.message || "Reset & sync failed"
      setMessage({ type: "error", text: errorText })
      // Keep error visible longer for important messages
      setTimeout(() => setMessage(null), errorText.includes("reconnect") ? 15000 : 5000)
    } finally {
      setResetting(null)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-4">
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

        <div className="space-y-6 max-w-3xl">
          {/* Company Settings Section */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-medium text-gray-900">Company Settings</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <Label htmlFor="companyName" className="text-sm font-medium text-gray-700 mb-2 block">
                  Company Name
                </Label>
                {loadingCompany ? (
                  <div className="py-4 text-gray-500 text-sm">Loading...</div>
                ) : (
                  <>
                    <input
                      id="companyName"
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Your Company Inc."
                      maxLength={100}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      This name appears in email invitations and throughout the app.
                    </p>
                    <button
                      onClick={handleSaveCompanyName}
                      disabled={savingCompany || !companyName.trim()}
                      className="
                        mt-4 px-4 py-2 rounded-md text-sm font-medium
                        bg-gray-900 text-white
                        hover:bg-gray-800
                        disabled:opacity-50 disabled:cursor-not-allowed
                        transition-colors
                      "
                    >
                      {savingCompany ? "Saving..." : "Save Company Name"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Accounting Calendar Link */}
          <Link 
            href="/dashboard/settings/accounting"
            className="block border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors"
          >
            <div className="px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <CalendarDays className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-sm font-medium text-gray-900">Accounting Calendar</h2>
                  <p className="text-xs text-gray-500">Configure your fiscal year and accounting periods</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </Link>

          {/* Email Signature Section */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-medium text-gray-900">Email Signature</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <Label htmlFor="signature" className="text-sm font-medium text-gray-700 mb-2 block">
                  Your email signature (will be appended to all outgoing emails)
                </Label>
                {loadingSignature ? (
                  <div className="py-4 text-gray-500 text-sm">Loading signature...</div>
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
                    <button
                      onClick={handleSaveSignature}
                      disabled={savingSignature}
                      className="
                        mt-4 px-4 py-2 rounded-md text-sm font-medium
                        bg-gray-900 text-white
                        hover:bg-gray-800
                        disabled:opacity-50 disabled:cursor-not-allowed
                        transition-colors
                      "
                    >
                      {savingSignature ? "Saving..." : "Save Signature"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Email Accounts Section */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-medium text-gray-900">Email Accounts</h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleConnectGmail}
                  className="
                    flex items-center gap-2 px-4 py-2
                    border border-gray-200 rounded-lg
                    text-sm font-medium text-gray-700
                    hover:border-gray-400 hover:bg-gray-50
                    transition-colors
                  "
                >
                  <Mail className="w-4 h-4" />
                  Connect Gmail
                </button>
                <button
                  onClick={handleConnectMicrosoft}
                  className="
                    flex items-center gap-2 px-4 py-2
                    border border-gray-200 rounded-lg
                    text-sm font-medium text-gray-700
                    hover:border-gray-400 hover:bg-gray-50
                    transition-colors
                  "
                >
                  <Mail className="w-4 h-4" />
                  Connect Microsoft
                </button>
                <button
                  onClick={handleSyncEmails}
                  disabled={syncing}
                  className="
                    flex items-center gap-2 px-4 py-2
                    border border-green-200 rounded-lg
                    text-sm font-medium text-green-700
                    hover:border-green-400 hover:bg-green-50
                    transition-colors disabled:opacity-50
                  "
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync All Emails'}
                </button>
                <button
                  onClick={handleDebugMessages}
                  className="
                    flex items-center gap-2 px-4 py-2
                    border border-purple-200 rounded-lg
                    text-sm font-medium text-purple-700
                    hover:border-purple-400 hover:bg-purple-50
                    transition-colors
                  "
                >
                  Debug Messages
                </button>
              </div>

              {loading ? (
                <div className="py-4 text-gray-500 text-sm">Loading accounts...</div>
              ) : accounts.length === 0 ? (
                <div className="py-4 text-gray-500 text-sm">
                  No email accounts connected. Click "Connect Gmail" to get started.
                </div>
              ) : (
                <div className="space-y-2">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex justify-between items-center p-4 border border-gray-200 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                          <Mail className="w-5 h-5 text-gray-500" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{account.email}</p>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>{account.provider}</span>
                            {account.isActive && (
                              <span className="flex items-center gap-1 text-green-600">
                                <Check className="w-3 h-3" />
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {account.isPrimary && (
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                            Primary
                          </span>
                        )}
                        <button
                          onClick={() => handleSyncContacts(account.id)}
                          className="
                            px-3 py-1.5 text-sm font-medium
                            border border-gray-200 rounded-lg
                            text-gray-700 hover:bg-gray-50
                            transition-colors
                          "
                        >
                          Sync contacts
                        </button>
                        <button
                          onClick={() => handleResetAndSync(account.id)}
                          disabled={resetting === account.id}
                          className="
                            flex items-center gap-1 px-3 py-1.5 text-sm font-medium
                            border border-blue-200 rounded-lg
                            text-blue-600 hover:bg-blue-50
                            transition-colors disabled:opacity-50
                          "
                          title="Reset sync and fetch recent emails (use if replies aren't showing)"
                        >
                          <RotateCcw className={`w-3 h-3 ${resetting === account.id ? 'animate-spin' : ''}`} />
                          {resetting === account.id ? 'Syncing...' : 'Reset & Sync'}
                        </button>
                        <button
                          onClick={() => handleDisconnect(account.id)}
                          className="
                            px-3 py-1.5 text-sm font-medium
                            border border-red-200 rounded-lg
                            text-red-600 hover:bg-red-50
                            transition-colors
                          "
                        >
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Debug Panel */}
          {showDebug && debugData && (
            <div className="border border-purple-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-purple-50 border-b border-purple-200 flex justify-between items-center">
                <h2 className="text-sm font-medium text-purple-900">Debug: Message Tracking</h2>
                <button
                  onClick={() => setShowDebug(false)}
                  className="text-purple-600 hover:text-purple-800 text-sm"
                >
                  Close
                </button>
              </div>
              <div className="p-4 space-y-4 text-sm">
                <div className="bg-gray-50 p-3 rounded">
                  <h3 className="font-medium mb-2">Summary</h3>
                  <ul className="space-y-1 text-gray-600">
                    <li>Outbound messages: {debugData.summary?.outboundCount || 0}</li>
                    <li>With Message-ID header: {debugData.summary?.outboundWithMessageIdHeader || 0}</li>
                    <li>With Thread ID: {debugData.summary?.outboundWithThreadId || 0}</li>
                    <li>Inbound messages: {debugData.summary?.inboundCount || 0}</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Recent Outbound Messages (for reply matching)</h3>
                  {debugData.outboundMessages?.length === 0 ? (
                    <p className="text-gray-500">No outbound messages found</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {debugData.outboundMessages?.map((msg: any) => (
                        <div key={msg.id} className="bg-gray-50 p-2 rounded text-xs">
                          <div><strong>To:</strong> {msg.toAddress}</div>
                          <div><strong>Subject:</strong> {msg.subject?.substring(0, 50)}</div>
                          <div><strong>Message-ID:</strong> <code className="bg-gray-200 px-1">{msg.messageIdHeader || 'MISSING!'}</code></div>
                          <div><strong>Thread ID:</strong> <code className="bg-gray-200 px-1">{msg.threadId || 'N/A'}</code></div>
                          <div><strong>Provider Data:</strong> <code className="bg-gray-200 px-1">{JSON.stringify(msg.providerData)}</code></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="font-medium mb-2">Recent Inbound Messages (replies)</h3>
                  {debugData.inboundMessages?.length === 0 ? (
                    <p className="text-gray-500">No inbound messages found - replies are not being captured!</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {debugData.inboundMessages?.map((msg: any) => (
                        <div key={msg.id} className="bg-green-50 p-2 rounded text-xs">
                          <div><strong>From:</strong> {msg.fromAddress}</div>
                          <div><strong>Subject:</strong> {msg.subject?.substring(0, 50)}</div>
                          <div><strong>In-Reply-To:</strong> <code className="bg-gray-200 px-1">{msg.providerData?.inReplyTo || 'N/A'}</code></div>
                          <div><strong>Thread ID:</strong> <code className="bg-gray-200 px-1">{msg.providerData?.threadId || 'N/A'}</code></div>
                          <div><strong>Task ID:</strong> {msg.taskId || 'ORPHANED'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="font-medium mb-2">Connected Accounts</h3>
                  <div className="space-y-2">
                    {debugData.accounts?.map((acc: any) => (
                      <div key={acc.id} className="bg-gray-50 p-2 rounded text-xs">
                        <div><strong>Email:</strong> {acc.email}</div>
                        <div><strong>Provider:</strong> {acc.provider}</div>
                        <div><strong>Active:</strong> {acc.isActive ? 'Yes' : 'No'}</div>
                        <div><strong>Last Sync:</strong> {acc.lastSyncAt ? new Date(acc.lastSyncAt).toLocaleString() : 'Never'}</div>
                        <div><strong>Has Cursor:</strong> {acc.syncCursor ? 'Yes' : 'No (will bootstrap)'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
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
      <SettingsContent />
    </Suspense>
  )
}

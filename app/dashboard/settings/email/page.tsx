"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Mail, Check, ChevronDown, X } from "lucide-react"

interface ConnectedEmail {
  id: string
  email: string
  provider: "GMAIL" | "MICROSOFT" | "SMTP"
  isPrimary: boolean
  isActive: boolean
  lastSyncAt: string | null
}

function EmailSetupContent() {
  const searchParams = useSearchParams()
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Inbox connection state
  const [connectedEmail, setConnectedEmail] = useState<ConnectedEmail | null>(null)
  const [loadingInbox, setLoadingInbox] = useState(true)
  const [connectDropdownOpen, setConnectDropdownOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Signature state
  const [signature, setSignature] = useState<string>("")
  const [loadingSignature, setLoadingSignature] = useState(true)
  const [savingSignature, setSavingSignature] = useState(false)

  // Handle OAuth callback messages
  useEffect(() => {
    const success = searchParams.get("success")
    const error = searchParams.get("error")

    if (success === "gmail_connected" || success === "microsoft_connected") {
      setMessage({ type: "success", text: "Email inbox connected successfully!" })
      setTimeout(() => setMessage(null), 5000)
      window.history.replaceState({}, "", "/dashboard/settings/email")
      fetchInboxConnection()
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
      window.history.replaceState({}, "", "/dashboard/settings/email")
    }
  }, [searchParams])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setConnectDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    fetchInboxConnection()
    fetchUserSignature()
  }, [])

  const fetchInboxConnection = async () => {
    try {
      setLoadingInbox(true)
      const response = await fetch("/api/email-accounts")
      if (response.ok) {
        const data = await response.json()
        // Find the current user's active connected email
        const accounts = data.accounts || []
        const active = accounts.find((a: ConnectedEmail) => a.isActive)
        setConnectedEmail(active || null)
      }
    } catch (error) {
      console.error("Error fetching inbox connection:", error)
    } finally {
      setLoadingInbox(false)
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

  const handleConnectGmail = () => {
    setConnectDropdownOpen(false)
    window.location.href = `/api/oauth/gmail?returnTo=/dashboard/settings/email`
  }

  const handleConnectMicrosoft = () => {
    setConnectDropdownOpen(false)
    window.location.href = `/api/oauth/microsoft?returnTo=/dashboard/settings/email`
  }

  const handleDisconnect = async () => {
    if (!connectedEmail) return
    try {
      setDisconnecting(true)
      const res = await fetch(`/api/email-accounts/${connectedEmail.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to disconnect")
      }
      setMessage({ type: "success", text: "Inbox disconnected successfully" })
      setTimeout(() => setMessage(null), 5000)
      setConnectedEmail(null)
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to disconnect" })
      setTimeout(() => setMessage(null), 5000)
    } finally {
      setDisconnecting(false)
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

  return (
    <div className="p-8 space-y-6">
        {/* Success/Error Messages */}
        {message && (
          <div
            className={`p-4 rounded-lg ${
              message.type === "success"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            }`}
          >
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        <div className="space-y-6">
          {/* Connected Inbox Section */}
          <div className="border border-gray-200 rounded-lg">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 rounded-t-lg">
              <h2 className="text-sm font-medium text-gray-900">Connected Inbox</h2>
            </div>
            <div className="p-4 space-y-4">
              {loadingInbox ? (
                <div className="py-4 text-gray-500 text-sm">Loading...</div>
              ) : connectedEmail ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <Check className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{connectedEmail.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          connectedEmail.provider === "GMAIL"
                            ? "bg-red-100 text-red-700"
                            : connectedEmail.provider === "MICROSOFT"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-700"
                        }`}>
                          {connectedEmail.provider === "GMAIL" ? "Gmail" : connectedEmail.provider === "MICROSOFT" ? "Microsoft" : connectedEmail.provider}
                        </span>
                        {connectedEmail.lastSyncAt && (
                          <span className="text-xs text-gray-500">
                            Last synced: {new Date(connectedEmail.lastSyncAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {disconnecting ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Connect your email inbox to send and receive emails through Vergo.
                  </p>
                  <div className="relative" ref={dropdownRef}>
                    <button
                      onClick={() => setConnectDropdownOpen(!connectDropdownOpen)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:border-orange-300 hover:text-orange-600 transition-colors"
                    >
                      <Mail className="w-4 h-4" />
                      Connect Inbox
                      <ChevronDown className="w-3 h-3" />
                    </button>

                    {connectDropdownOpen && (
                      <div className="absolute left-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                        <button
                          onClick={handleConnectGmail}
                          className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <div className="w-5 h-5 bg-red-100 rounded flex items-center justify-center">
                            <Mail className="w-3 h-3 text-red-600" />
                          </div>
                          Connect Gmail
                        </button>
                        <button
                          onClick={handleConnectMicrosoft}
                          className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <div className="w-5 h-5 bg-blue-100 rounded flex items-center justify-center">
                            <Mail className="w-3 h-3 text-blue-600" />
                          </div>
                          Connect Microsoft
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

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
        </div>
    </div>
  )
}

export default function EmailSetupPage() {
  return (
    <Suspense fallback={
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
        </div>
      </div>
    }>
      <EmailSetupContent />
    </Suspense>
  )
}

"use client"

import { useState, useEffect, useCallback } from "react"
import { MergeLinkButton } from "@/components/accounting/merge-link-button"
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  Loader2,
  Unplug,
  Database,
} from "lucide-react"
import Link from "next/link"

interface IntegrationStatus {
  connected: boolean
  integrationName?: string
  integrationSlug?: string
  connectedAt?: string
  endUserEmail?: string
  lastSyncAt?: string
  syncStatus?: string
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never"
  const date = new Date(dateStr)
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function IntegrationsSettingsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [resyncingContacts, setResyncingContacts] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch("/api/integrations/accounting/status")
      if (resp.ok) {
        const data = await resp.json()
        setStatus(data)
      }
    } catch (e) {
      console.error("Error fetching integration status:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const handleConnect = async (publicToken: string) => {
    setConnecting(true)
    try {
      const resp = await fetch("/api/integrations/accounting/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicToken }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || "Failed to connect")
      }
      const data = await resp.json()
      showMessage(
        "success",
        `Connected to ${data.integrationName}. Contacts synced.`
      )
      await fetchStatus()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showMessage("error", msg)
    } finally {
      setConnecting(false)
    }
  }

  const handleResyncContacts = async () => {
    setResyncingContacts(true)
    try {
      const resp = await fetch("/api/integrations/accounting/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactsOnly: true }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || "Failed to resync contacts")
      }
      showMessage("success", "Contacts resynced successfully.")
      await fetchStatus()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showMessage("error", msg)
    } finally {
      setResyncingContacts(false)
    }
  }

  const handleDisconnect = async () => {
    if (
      !confirm(
        "Are you sure you want to disconnect your accounting software? Synced databases will remain but will no longer sync."
      )
    ) {
      return
    }

    setDisconnecting(true)
    try {
      const resp = await fetch(
        "/api/integrations/accounting/disconnect",
        { method: "DELETE" }
      )
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || "Failed to disconnect")
      }
      showMessage("success", "Accounting software disconnected.")
      await fetchStatus()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showMessage("error", msg)
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="px-8 py-4">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-4">
        {/* Back link */}
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </Link>

        <h1 className="text-lg font-semibold text-gray-900 mb-1">
          Accounting Integration
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Connect your accounting software to sync contacts and create databases
          from your financial data.
        </p>

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

        <div className="space-y-6 max-w-3xl">
          {/* Not Connected State */}
          {!status?.connected && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h2 className="text-sm font-medium text-gray-900">
                  Connect Accounting Software
                </h2>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4">
                  Connect your accounting software to sync contacts and
                  create databases from your financial data.
                </p>
                <div className="flex flex-wrap gap-2 mb-6">
                  {[
                    "Xero",
                    "QuickBooks Online",
                    "Sage",
                    "NetSuite",
                    "FreshBooks",
                    "Wave",
                  ].map((name) => (
                    <span
                      key={name}
                      className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
                    >
                      {name}
                    </span>
                  ))}
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">
                    + more
                  </span>
                </div>
                <MergeLinkButton
                  onSuccess={handleConnect}
                  onError={(err) => showMessage("error", err)}
                  disabled={connecting}
                />
                {connecting && (
                  <p className="text-sm text-gray-500 mt-2">
                    Connecting and syncing contacts...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Connected State */}
          {status?.connected && (
            <>
              {/* Connection Info */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <h2 className="text-sm font-medium text-gray-900">
                      Connected to {status.integrationName}
                    </h2>
                  </div>
                  <button
                    onClick={handleResyncContacts}
                    disabled={resyncingContacts}
                    className="
                      inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                      bg-white text-gray-700 border border-gray-200 rounded-md
                      hover:bg-gray-50 disabled:opacity-50
                      transition-colors
                    "
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        resyncingContacts ? "animate-spin" : ""
                      }`}
                    />
                    {resyncingContacts ? "Syncing..." : "Resync Contacts"}
                  </button>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Connected by</span>
                      <p className="font-medium text-gray-900">
                        {status.endUserEmail}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Connected on</span>
                      <p className="font-medium text-gray-900">
                        {formatDate(status.connectedAt)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Info Card — Create databases */}
              <div className="border border-blue-100 bg-blue-50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Database className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      Create databases from your accounting data
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      Go to{" "}
                      <Link
                        href="/dashboard/databases/new"
                        className="underline font-medium hover:text-blue-900"
                      >
                        Databases → New
                      </Link>{" "}
                      and choose &quot;From Accounting Software&quot; to create a database
                      from your {status.integrationName} data. You can apply
                      filters and sync as of any date.
                    </p>
                  </div>
                </div>
              </div>

              {/* Disconnect */}
              <div className="border border-red-100 rounded-lg overflow-hidden">
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Disconnect Integration
                    </p>
                    <p className="text-xs text-gray-500">
                      Synced databases will remain but will no longer sync
                      new data.
                    </p>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="
                      inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                      text-red-600 bg-white border border-red-200 rounded-md
                      hover:bg-red-50 disabled:opacity-50
                      transition-colors
                    "
                  >
                    <Unplug className="w-3.5 h-3.5" />
                    {disconnecting ? "Disconnecting..." : "Disconnect"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

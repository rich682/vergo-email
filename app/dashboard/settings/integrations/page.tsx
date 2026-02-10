"use client"

import { useState, useEffect, useCallback } from "react"
import { MergeLinkButton } from "@/components/accounting/merge-link-button"
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Loader2,
  Unplug,
  Calendar,
} from "lucide-react"
import Link from "next/link"

interface SyncModelState {
  lastSyncAt: string | null
  status: "success" | "error" | "pending" | "skipped"
  error: string | null
  rowCount?: number
}

interface DatabaseStat {
  name: string
  rowCount: number
  lastImportedAt: string | null
}

interface IntegrationStatus {
  connected: boolean
  integrationName?: string
  integrationSlug?: string
  connectedAt?: string
  endUserEmail?: string
  lastSyncAt?: string
  syncStatus?: string
  syncState?: Record<string, SyncModelState>
  syncConfig?: Record<string, boolean | number>
  lastSyncError?: string
  databaseStats?: Record<string, DatabaseStat>
}

const SYNC_MODELS = [
  { key: "contacts", configKey: "contacts", label: "Contacts", description: "Vendors, customers, and suppliers with email" },
  { key: "accounts", configKey: "accounts", label: "Chart of Accounts", description: "Account categories and balances" },
  { key: "invoices", configKey: "invoices", label: "Invoices", description: "AR and AP invoices with status" },
  { key: "invoice_line_items", configKey: "invoiceLineItems", label: "Invoice Line Items", description: "Individual line items from invoices" },
  { key: "journal_entries", configKey: "journalEntries", label: "Journal Entries", description: "Debit/credit journal entries" },
  { key: "payments", configKey: "payments", label: "Payments", description: "Payment records" },
  { key: "gl_transactions", configKey: "glTransactions", label: "General Ledger", description: "All GL transactions" },
]

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

function SyncStatusIcon({ status }: { status?: string }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />
    case "error":
      return <XCircle className="w-4 h-4 text-red-500" />
    case "skipped":
      return <AlertCircle className="w-4 h-4 text-amber-400" />
    case "syncing":
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
    default:
      return <Clock className="w-4 h-4 text-gray-400" />
  }
}

export default function IntegrationsSettingsPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [asOfDate, setAsOfDate] = useState(() => {
    // Default to today in YYYY-MM-DD format
    const today = new Date()
    return today.toISOString().split("T")[0]
  })
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

  // Poll for sync status when syncing
  useEffect(() => {
    if (status?.syncStatus !== "syncing") return
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [status?.syncStatus, fetchStatus])

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
        `Connected to ${data.integrationName}. Initial sync started.`
      )
      await fetchStatus()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showMessage("error", msg)
    } finally {
      setConnecting(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const resp = await fetch("/api/integrations/accounting/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asOfDate }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || "Failed to trigger sync")
      }
      showMessage(
        "success",
        `Snapshot sync started as of ${new Date(asOfDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}. This may take a few moments.`
      )
      await fetchStatus()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showMessage("error", msg)
    } finally {
      setSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    if (
      !confirm(
        "Are you sure you want to disconnect your accounting software? Synced data will remain but will no longer update."
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

  const handleToggleModel = async (configKey: string, enabled: boolean) => {
    setSavingConfig(true)
    try {
      const resp = await fetch("/api/integrations/accounting/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [configKey]: enabled }),
      })
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update config")
      }
      await fetchStatus()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      showMessage("error", msg)
    } finally {
      setSavingConfig(false)
    }
  }

  // Sync Interval removed — sync is now on-demand/snapshot-based

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
          Connect your accounting software and pull snapshots of contacts,
          invoices, and financial data as of any date.
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
                  Connect your accounting software to automatically sync
                  contacts, invoices, chart of accounts, journal entries,
                  payments, and general ledger transactions.
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
                    Connecting and starting initial sync...
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
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 border border-gray-200 rounded-md px-2 py-1">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="date"
                        value={asOfDate}
                        onChange={(e) => setAsOfDate(e.target.value)}
                        className="text-xs bg-transparent border-none outline-none text-gray-700 w-[110px]"
                      />
                    </div>
                    <button
                      onClick={handleSync}
                      disabled={
                        syncing || status.syncStatus === "syncing"
                      }
                      className="
                        inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                        bg-gray-900 text-white rounded-md
                        hover:bg-gray-800 disabled:opacity-50
                        transition-colors
                      "
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          status.syncStatus === "syncing"
                            ? "animate-spin"
                            : ""
                        }`}
                      />
                      {status.syncStatus === "syncing"
                        ? "Syncing..."
                        : `Sync as of ${new Date(asOfDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                    </button>
                  </div>
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
                    <div>
                      <span className="text-gray-500">Last sync</span>
                      <p className="font-medium text-gray-900">
                        {formatDate(status.lastSyncAt)}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-500">Status</span>
                      <p className="font-medium text-gray-900 capitalize">
                        {status.syncStatus}
                      </p>
                    </div>
                  </div>
                  {status.lastSyncError && (
                    <div className="mt-3 p-3 bg-red-50 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-red-700">
                          {status.lastSyncError}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sync Models */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h2 className="text-sm font-medium text-gray-900">
                    Data to Sync
                  </h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {SYNC_MODELS.map((model) => {
                    const modelState = status.syncState?.[model.key]
                    const dbStat =
                      status.databaseStats?.[
                        `merge_${model.key}`
                      ]
                    const isEnabled =
                      status.syncConfig?.[model.configKey] !== false

                    return (
                      <div
                        key={model.key}
                        className="px-4 py-3 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={(e) =>
                              handleToggleModel(
                                model.configKey,
                                e.target.checked
                              )
                            }
                            disabled={savingConfig}
                            className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {model.label}
                            </p>
                            <p className="text-xs text-gray-500">
                              {model.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          {modelState?.status === "skipped" ? (
                            <>
                              <AlertCircle className="w-4 h-4 text-amber-400" />
                              <span className="text-amber-600">Not available</span>
                            </>
                          ) : (
                            <>
                              {dbStat && (
                                <span>{dbStat.rowCount.toLocaleString()} rows</span>
                              )}
                              <SyncStatusIcon status={modelState?.status} />
                              <span>{formatDate(modelState?.lastSyncAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
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
                      Synced data will remain but will no longer update
                      automatically.
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

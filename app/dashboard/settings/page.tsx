"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

function SettingsContent() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    // Check for success/error messages in URL
    const success = searchParams.get("success")
    const error = searchParams.get("error")

    if (success === "gmail_connected") {
      setMessage({ type: "success", text: "Gmail account connected successfully!" })
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
  }, [searchParams])

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
          <CardTitle>Email Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleConnectGmail}>Connect Gmail</Button>

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

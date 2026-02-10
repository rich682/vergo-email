"use client"

import { useState, useEffect, Suspense } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { CalendarDays, ChevronRight, Link2, Shield } from "lucide-react"
import Link from "next/link"

function SettingsContent() {
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [signature, setSignature] = useState<string>("")
  const [loadingSignature, setLoadingSignature] = useState(true)
  const [savingSignature, setSavingSignature] = useState(false)
  
  // Company settings state
  const [companyName, setCompanyName] = useState<string>("")
  const [loadingCompany, setLoadingCompany] = useState(true)
  const [savingCompany, setSavingCompany] = useState(false)

  useEffect(() => {
    fetchUserSignature()
    fetchCompanySettings()
  }, [])

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

          {/* Accounting Integration Link */}
          {process.env.NEXT_PUBLIC_ACCOUNTING_INTEGRATION === "true" && (
            <Link
              href="/dashboard/settings/integrations"
              className="block border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors"
            >
              <div className="px-4 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Link2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-medium text-gray-900">Accounting Integration</h2>
                    <p className="text-xs text-gray-500">Connect Xero, QuickBooks, or other accounting software</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </Link>
          )}

          {/* Role Permissions Link */}
          <Link
            href="/dashboard/settings/role-permissions"
            className="block border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors"
          >
            <div className="px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-sm font-medium text-gray-900">Role Permissions</h2>
                  <p className="text-xs text-gray-500">Configure which areas of the app each role can access</p>
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

"use client"

import { useState } from "react"
import Link from "next/link"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    })

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
          <h1 className="text-xl font-semibold text-white mb-1">Reset Password</h1>
          <p className="text-sm text-gray-400 mb-6">
            {sent ? "Check your email for a reset link." : "Enter your email to receive a reset link."}
          </p>

          {sent ? (
            <div>
              <p className="text-sm text-gray-300 mb-4">
                If an account exists with that email, we've sent a password reset link. It expires in 1 hour.
              </p>
              <Link
                href="/login"
                className="block w-full py-2 text-center bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent mb-4"
                autoFocus
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? "..." : "Send Reset Link"}
              </button>
              <div className="mt-4 text-center">
                <Link href="/login" className="text-sm text-gray-400 hover:text-orange-400 transition-colors">
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

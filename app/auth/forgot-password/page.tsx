"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Mail, CheckCircle, Loader2, ArrowRight } from "lucide-react"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to send reset email")
      }

      setSubmitted(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex justify-center mb-8">
          <Image
            src="/logo.svg"
            alt="Vergo"
            width={105}
            height={32}
            className="h-8 w-auto"
          />
        </Link>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {submitted ? (
            <>
              {/* Success State */}
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/25">
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>

                <h1 className="font-display text-2xl text-gray-900 mb-2">
                  Check your email
                </h1>
                <p className="text-gray-500 mb-6">
                  If an account exists for <span className="font-medium text-gray-700">{email}</span>, you'll receive a password reset link shortly.
                </p>

                <p className="text-sm text-gray-400 mb-6">
                  Didn't receive the email? Check your spam folder or try again.
                </p>

                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setSubmitted(false)
                      setEmail("")
                    }}
                    className="w-full py-3 px-4 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Try another email
                  </button>
                  <Link
                    href="/auth/signin"
                    className="w-full py-3 px-4 text-gray-500 font-medium rounded-xl hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to sign in
                  </Link>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Form State */}
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
                  <Mail className="w-8 h-8 text-white" />
                </div>

                <h1 className="font-display text-2xl text-gray-900 mb-2">
                  Forgot your password?
                </h1>
                <p className="text-gray-500">
                  No worries! Enter your email and we'll send you reset instructions.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-red-500 text-xs">!</span>
                    </div>
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      Send reset link
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>

                <Link
                  href="/auth/signin"
                  className="w-full py-3 px-4 text-gray-500 font-medium rounded-xl hover:text-gray-700 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in
                </Link>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-sm text-gray-400">
          Need help?{" "}
          <a href="mailto:support@getvergo.com" className="text-gray-600 hover:text-gray-900 underline underline-offset-2">
            Contact support
          </a>
        </p>
      </div>
    </div>
  )
}

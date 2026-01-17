"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { UserPlus, CheckCircle, AlertCircle, Loader2, Lock, ArrowRight } from "lucide-react"

function AcceptInviteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")

  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(true)
  const [tokenValid, setTokenValid] = useState(false)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Invite details
  const [inviteEmail, setInviteEmail] = useState<string | null>(null)
  const [inviteName, setInviteName] = useState<string | null>(null)
  const [inviteRole, setInviteRole] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string | null>(null)

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setValidating(false)
      setTokenError("No invitation token provided")
      return
    }

    const validateToken = async () => {
      try {
        const response = await fetch(`/api/auth/accept-invite?token=${token}`)
        const data = await response.json()

        if (data.valid) {
          setTokenValid(true)
          setInviteEmail(data.email)
          setInviteName(data.name)
          setInviteRole(data.role)
          setOrgName(data.organizationName)
          if (data.name) {
            setName(data.name)
          }
        } else {
          setTokenError(data.error || "Invalid invitation link")
        }
      } catch (err) {
        setTokenError("Failed to validate invitation")
      } finally {
        setValidating(false)
      }
    }

    validateToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    setLoading(true)

    try {
      const response = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name: name.trim() })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to accept invitation")
      }

      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Loading state
  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-orange-500 mb-4" />
          <p className="text-gray-600">Validating invitation...</p>
        </div>
      </div>
    )
  }

  // Invalid token state
  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/">
              <Image
                src="/logo.svg"
                alt="Vergo"
                width={105}
                height={32}
                className="h-8 w-auto mx-auto"
              />
            </Link>
          </div>
          
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">Invalid Invitation</h1>
              <p className="text-gray-500 mb-6">
                {tokenError || "This invitation link is invalid or has expired."}
              </p>
              <p className="text-sm text-gray-400 mb-8">
                Please contact your team administrator to request a new invitation.
              </p>
              <Link
                href="/auth/signin"
                className="inline-flex items-center justify-center gap-2 w-full py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-all"
              >
                Go to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/">
              <Image
                src="/logo.svg"
                alt="Vergo"
                width={105}
                height={32}
                className="h-8 w-auto mx-auto"
              />
            </Link>
          </div>
          
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">Welcome to {orgName}!</h1>
              <p className="text-gray-500 mb-8">
                Your account has been created successfully. You can now sign in and start using Vergo.
              </p>
              <Link
                href="/auth/signin"
                className="inline-flex items-center justify-center gap-2 w-full py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-all group"
              >
                Sign in to your account
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Check if name was provided during invite
  const hasProvidedName = inviteName && inviteName.trim().length > 0

  // Accept invite form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/">
            <Image
              src="/logo.svg"
              alt="Vergo"
              width={105}
              height={32}
              className="h-8 w-auto mx-auto"
            />
          </Link>
        </div>
        
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-6">
              <UserPlus className="w-8 h-8 text-orange-600" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Join {orgName}</h1>
            <p className="text-gray-500">
              {hasProvidedName ? (
                <>Hi <span className="font-medium text-gray-700">{inviteName}</span>! Set a password to join as a <span className="font-medium text-gray-700">{inviteRole?.toLowerCase()}</span>.</>
              ) : (
                <>You've been invited to join as a <span className="font-medium text-gray-700">{inviteRole?.toLowerCase()}</span></>
              )}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-red-500 text-xs">!</span>
                </div>
                {error}
              </div>
            )}

            {/* Email - always shown but disabled */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                value={inviteEmail || ""}
                disabled
                className="w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed"
              />
            </div>

            {/* Name - only show if not provided during invite */}
            {!hasProvidedName && (
              <div className="space-y-1.5">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Your name
                </label>
                <input
                  id="name"
                  type="text"
                  placeholder="John Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
              </div>
            )}

            {/* Password fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoFocus
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  />
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 -mt-2">Must be at least 8 characters</p>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Accept invitation
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>

            <p className="text-center text-sm text-gray-500">
              Already have an account?{" "}
              <Link href="/auth/signin" className="text-orange-600 hover:text-orange-700 font-medium transition-colors">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-orange-500 mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  )
}

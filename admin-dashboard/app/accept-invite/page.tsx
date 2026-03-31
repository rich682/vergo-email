"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

function AcceptInviteForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(true)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (!token) {
      setInvalid(true)
      setValidating(false)
      return
    }

    fetch(`/api/auth/accept-invite?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setEmail(data.email)
        } else {
          setInvalid(true)
        }
        setValidating(false)
      })
      .catch(() => {
        setInvalid(true)
        setValidating(false)
      })
  }, [token])

  if (validating) {
    return <p className="text-gray-400 text-center">Validating invitation...</p>
  }

  if (invalid) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
        <h1 className="text-xl font-semibold text-white mb-2">Invalid Invitation</h1>
        <p className="text-sm text-gray-400 mb-4">This invitation link is invalid or has expired.</p>
        <Link href="/login" className="text-sm text-orange-400 hover:text-orange-300">
          Go to Sign In
        </Link>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match")
      return
    }

    setLoading(true)
    const res = await fetch("/api/auth/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    })

    if (res.ok) {
      router.push("/login")
    } else {
      const data = await res.json()
      setError(data.error || "Failed to accept invitation")
    }
    setLoading(false)
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
      <h1 className="text-xl font-semibold text-white mb-1">Welcome to Vergo Admin</h1>
      <p className="text-sm text-gray-400 mb-6">Set your password to get started.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          disabled
          className="w-full px-3 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-gray-400 mb-3 cursor-not-allowed"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent mb-3"
          autoFocus
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm password"
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent mb-4"
        />
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "Create Account"}
        </button>
      </form>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm">
        <Suspense fallback={<p className="text-gray-400 text-center">Loading...</p>}>
          <AcceptInviteForm />
        </Suspense>
      </div>
    </div>
  )
}

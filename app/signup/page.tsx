"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Building2, Mail, User, Lock, Loader2, ArrowRight, CheckCircle, Sparkles } from "lucide-react"

export default function SignupPage() {
  const [companyName, setCompanyName] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    if (!firstName.trim()) {
      setError("First name is required")
      return
    }

    if (!lastName.trim()) {
      setError("Last name is required")
      return
    }

    setLoading(true)

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to create account")
      }

      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex">
        {/* Left side - Success message */}
        <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24 bg-white">
          <div className="w-full max-w-md mx-auto text-center">
            {/* Logo */}
            <Link href="/" className="inline-block mb-12">
              <Image
                src="/logo.svg"
                alt="Vergo"
                width={105}
                height={32}
                className="h-8 w-auto"
              />
            </Link>

            {/* Success icon */}
            <div className="w-20 h-20 mx-auto mb-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/25">
              <Mail className="w-10 h-10 text-white" />
            </div>

            <h1 className="font-display text-3xl text-gray-900 mb-3">
              Check your inbox
            </h1>
            <p className="text-gray-500 mb-8">
              We've sent a verification link to <span className="font-medium text-gray-700">{email}</span>
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 text-left">
              <div className="flex gap-3">
                <Sparkles className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Don't see the email?
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    Check your spam folder or request a new verification link.
                  </p>
                </div>
              </div>
            </div>

            <Link
              href="/auth/signin"
              className="inline-flex items-center justify-center gap-2 py-3.5 px-8 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-all group"
            >
              Go to sign in
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>

        {/* Right side - Branding */}
        <div className="hidden lg:flex flex-1 relative overflow-hidden bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500">
          <div className="absolute inset-0">
            <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-white/10" />
            <div className="absolute top-1/4 -left-32 w-64 h-64 rounded-full bg-white/5" />
            <div className="absolute bottom-20 right-20 w-48 h-48 rounded-full bg-white/10" />
          </div>
          <div className="relative z-10 flex flex-col justify-center px-16 text-white">
            <div className="max-w-lg">
              <h2 className="font-display text-4xl mb-6">
                You're almost there!
              </h2>
              <p className="text-xl text-white/80 leading-relaxed">
                Verify your email to unlock all features and start collecting documents from your clients.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 sm:px-16 lg:px-24 bg-white py-12">
        <div className="w-full max-w-md mx-auto">
          {/* Logo */}
          <Link href="/" className="block mb-12">
            <Image
              src="/logo.svg"
              alt="Vergo"
              width={105}
              height={32}
              className="h-8 w-auto"
            />
          </Link>

          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl text-gray-900 mb-2">
              Create your account
            </h1>
            <p className="text-gray-500">
              Start automating your document collection today
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

            <div className="space-y-1.5">
              <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">
                Company name
              </label>
              <div className="relative">
                <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="companyName"
                  type="text"
                  placeholder="Acme Accounting"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  autoFocus
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  First name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                  Last name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="lastName"
                    type="text"
                    placeholder="Smith"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Work email
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
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                />
              </div>
            </div>

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
                  Create free account
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>

            <p className="text-center text-xs text-gray-400">
              By creating an account, you agree to our{" "}
              <a href="#" className="text-gray-600 hover:text-gray-900 underline underline-offset-2">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href="#" className="text-gray-600 hover:text-gray-900 underline underline-offset-2">
                Privacy Policy
              </a>
            </p>
          </form>

          {/* Sign in link */}
          <p className="mt-8 text-center text-gray-500">
            Already have an account?{" "}
            <Link href="/auth/signin" className="text-orange-600 hover:text-orange-700 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Right side - Branding */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600">
        {/* Decorative elements */}
        <div className="absolute inset-0">
          {/* Large circles */}
          <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full bg-white/10" />
          <div className="absolute top-1/4 -left-32 w-64 h-64 rounded-full bg-white/5" />
          <div className="absolute bottom-20 right-20 w-48 h-48 rounded-full bg-white/10" />
          
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="max-w-lg">
            {/* Testimonial / Value prop */}
            <div className="mb-12">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-300 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                  </svg>
                ))}
              </div>
              <blockquote className="text-2xl font-display leading-relaxed mb-6">
                "Vergo cut our month-end document collection time by 70%. What used to take days now takes hours."
              </blockquote>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-lg font-medium">
                  SK
                </div>
                <div>
                  <div className="font-medium">Sarah Kim</div>
                  <div className="text-white/70 text-sm">Partner, Horizon Accounting</div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 pt-8 border-t border-white/20">
              <div>
                <div className="text-3xl font-display">500+</div>
                <div className="text-white/70 text-sm">Accounting firms</div>
              </div>
              <div>
                <div className="text-3xl font-display">2M+</div>
                <div className="text-white/70 text-sm">Requests sent</div>
              </div>
              <div>
                <div className="text-3xl font-display">94%</div>
                <div className="text-white/70 text-sm">Response rate</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

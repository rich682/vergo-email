"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { CheckCircle, AlertCircle, Loader2, ArrowRight, Sparkles } from "lucide-react"

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [verifying, setVerifying] = useState(true)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orgName, setOrgName] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setVerifying(false)
      setError("No verification token provided")
      return
    }

    const verifyEmail = async () => {
      try {
        const response = await fetch(`/api/auth/verify?token=${token}`)
        const data = await response.json()

        if (data.success) {
          setSuccess(true)
          setOrgName(data.organizationName)
        } else {
          setError(data.error || "Verification failed")
        }
      } catch (err) {
        setError("Failed to verify email. Please try again.")
      } finally {
        setVerifying(false)
      }
    }

    verifyEmail()
  }, [token])

  // Loading state
  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <Link href="/" className="flex justify-center mb-8">
            <Image src="/logo.svg" alt="Vergo" width={105} height={32} className="h-8 w-auto" />
          </Link>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-orange-500 mb-4" />
              <p className="text-gray-600">Verifying your email...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <Link href="/" className="flex justify-center mb-8">
            <Image src="/logo.svg" alt="Vergo" width={105} height={32} className="h-8 w-auto" />
          </Link>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center shadow-lg shadow-red-500/25">
              <AlertCircle className="w-8 h-8 text-white" />
            </div>
            <h1 className="font-display text-2xl text-gray-900 mb-2">Verification Failed</h1>
            <p className="text-gray-500 mb-4">{error}</p>
            <p className="text-sm text-gray-400 mb-8">
              The verification link may have expired or already been used.
            </p>
            <div className="space-y-3">
              <Link
                href="/auth/signin"
                className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all group"
              >
                Go to sign in
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/signup"
                className="w-full py-3 px-4 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center"
              >
                Create new account
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Success state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="flex justify-center mb-8">
          <Image src="/logo.svg" alt="Vergo" width={105} height={32} className="h-8 w-auto" />
        </Link>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/25">
            <CheckCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-display text-2xl text-gray-900 mb-2">Email Verified!</h1>
          <p className="text-gray-500 mb-6">
            {orgName ? (
              <>Your account for <span className="font-medium text-gray-700">{orgName}</span> is now active.</>
            ) : (
              <>Your email has been verified successfully.</>
            )}
          </p>

          {/* Welcome message */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-8 text-left">
            <div className="flex gap-3">
              <Sparkles className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-orange-800">
                  You're all set!
                </p>
                <p className="text-sm text-orange-700 mt-1">
                  Sign in to start automating your document collection.
                </p>
              </div>
            </div>
          </div>

          <Link
            href="/auth/signin"
            className="w-full py-3.5 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-all group"
          >
            Sign in to your account
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8">
            <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 animate-spin mx-auto text-orange-500 mb-4" />
              <p className="text-gray-600">Verifying...</p>
            </div>
          </div>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}

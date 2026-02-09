"use client"

import { useState, useCallback } from "react"
import { useMergeLink } from "@mergeapi/react-merge-link"

interface MergeLinkButtonProps {
  onSuccess: (publicToken: string) => void
  onError?: (error: string) => void
  disabled?: boolean
}

export function MergeLinkButton({
  onSuccess,
  onError,
  disabled,
}: MergeLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSuccess = useCallback(
    (publicToken: string) => {
      onSuccess(publicToken)
    },
    [onSuccess]
  )

  const { open, isReady } = useMergeLink({
    linkToken: linkToken || "",
    onSuccess: handleSuccess,
    onValidationError: (error) => onError?.(String(error)),
  })

  const handleClick = async () => {
    if (loading || disabled) return

    // Fetch link token if we don't have one
    if (!linkToken) {
      setLoading(true)
      try {
        const resp = await fetch("/api/integrations/accounting/link-token", {
          method: "POST",
        })
        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}))
          throw new Error(data.error || "Failed to generate link token")
        }
        const data = await resp.json()
        setLinkToken(data.linkToken)

        // Need to wait for useMergeLink to re-initialize with the new token
        // The hook will update isReady once it processes the new linkToken
        setTimeout(() => {
          // Open will be called on next render cycle when isReady updates
        }, 100)
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        onError?.(msg)
        setLoading(false)
        return
      }
      setLoading(false)
    }

    if (isReady) {
      open()
    }
  }

  // Auto-open when link token is loaded and ready
  if (linkToken && isReady && !loading) {
    // Will open on next click
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading || disabled}
      className="
        px-4 py-2.5 rounded-lg text-sm font-medium
        bg-gray-900 text-white
        hover:bg-gray-800
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors
      "
    >
      {loading ? "Preparing..." : "Connect Accounting Software"}
    </button>
  )
}

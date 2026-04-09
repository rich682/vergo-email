"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

interface CheckResult {
  name: string
  category: string
  status: "ok" | "warning" | "critical"
  message: string
  details: Record<string, any>[]
  count: number
  link?: string
  diagnostic?: string
  fix?: string
}

interface HealthRun {
  id: string
  runAt: string | Date
  status: string
  checksRun: number
  issuesFound: number
  durationMs: number
  results: CheckResult[]
  summary: string | null
}

export function HealthDetail({
  mode,
  run,
  check,
}: {
  mode: "trigger" | "row" | "issue"
  run?: HealthRun
  check?: CheckResult
}) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [expanded, setExpanded] = useState(false)

  // ── Trigger button mode ────────────────────────────────────────────

  if (mode === "trigger") {
    const handleRun = async () => {
      setRunning(true)
      try {
        const res = await fetch("/api/health-monitor", { method: "POST" })
        if (!res.ok) throw new Error("Failed to trigger health check")
        router.refresh()
      } catch (err) {
        console.error("Health check trigger failed:", err)
      } finally {
        setRunning(false)
      }
    }

    return (
      <button
        onClick={handleRun}
        disabled={running}
        className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {running ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Running...
          </span>
        ) : (
          "Run Now"
        )}
      </button>
    )
  }

  // ── Issue card mode ────────────────────────────────────────────────

  if (mode === "issue" && check) {
    const isCritical = check.status === "critical"

    return (
      <div className="group">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-5 py-4 flex items-center gap-4 hover:bg-gray-800/30 transition-colors text-left"
        >
          <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${
            isCritical ? "bg-red-900/40 text-red-400" : "bg-yellow-900/40 text-yellow-400"
          }`}>
            {check.status.toUpperCase()}
          </span>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded shrink-0">
            {check.category}
          </span>
          <span className="text-sm text-gray-200 flex-1">
            {check.message}
          </span>
          {check.link && (
            <Link
              href={check.link}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-orange-400 hover:text-orange-300 shrink-0"
            >
              View &rarr;
            </Link>
          )}
          <span className="text-xs text-gray-500 shrink-0">{check.count}</span>
          <svg
            className={`w-4 h-4 text-gray-500 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expanded && (check.diagnostic || check.fix || check.details.length > 0) && (
          <div className="px-5 pb-4 space-y-3">
            {check.diagnostic && (
              <div className="bg-gray-800/50 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Diagnostic</p>
                <p className="text-sm text-gray-300 leading-relaxed">{check.diagnostic}</p>
              </div>
            )}
            {check.fix && (
              <div className="bg-orange-950/20 border border-orange-900/30 rounded-lg p-4">
                <p className="text-xs font-medium text-orange-400 uppercase tracking-wider mb-2">How to Fix</p>
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{check.fix}</p>
              </div>
            )}
            {check.details.length > 0 && check.details.length <= 10 && (
              <div className="bg-gray-800/30 rounded-lg p-4">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Details</p>
                <div className="space-y-1">
                  {check.details.map((d, i) => (
                    <pre key={i} className="text-xs text-gray-400 font-mono overflow-x-auto">
                      {JSON.stringify(d, null, 0)}
                    </pre>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── History row mode ───────────────────────────────────────────────

  if (!run) return null

  const results = (run.results || []) as CheckResult[]
  const issueChecks = results.filter((r) => r.status !== "ok")

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer"
      >
        <td className="px-5 py-3 text-sm text-gray-300">
          {new Date(run.runAt).toLocaleString()}
        </td>
        <td className="px-5 py-3">
          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded ${
            run.status === "critical"
              ? "bg-red-900/40 text-red-400"
              : run.status === "warning"
                ? "bg-yellow-900/40 text-yellow-400"
                : "bg-green-900/40 text-green-400"
          }`}>
            {run.status.toUpperCase()}
          </span>
        </td>
        <td className="px-5 py-3 text-sm text-right text-gray-400">{run.issuesFound}</td>
        <td className="px-5 py-3 text-sm text-right text-gray-400">{run.checksRun}</td>
        <td className="px-5 py-3 text-sm text-right text-gray-400">{(run.durationMs / 1000).toFixed(1)}s</td>
      </tr>
      {expanded && issueChecks.length > 0 && (
        <tr>
          <td colSpan={5} className="px-5 py-3 bg-gray-800/20">
            <div className="space-y-2">
              {issueChecks.map((c, i) => (
                <div key={i} className="flex items-start gap-3 text-xs">
                  <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium ${
                    c.status === "critical" ? "bg-red-900/40 text-red-400" : "bg-yellow-900/40 text-yellow-400"
                  }`}>
                    {c.status.toUpperCase()}
                  </span>
                  <span className="text-gray-300">{c.message}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Sparkles } from "lucide-react"
import { usePermissions } from "@/components/permissions-context"
import Link from "next/link"
import { ReconciliationSetup } from "@/components/jobs/reconciliation/reconciliation-setup"

export default function NewReconciliationPage() {
  const router = useRouter()
  const { can } = usePermissions()

  // Redirect if user lacks manage permission
  useEffect(() => {
    if (!can("reconciliations:manage")) {
      router.replace("/dashboard/reconciliations")
    }
  }, [can, router])

  return (
    <div className="p-8 max-w-4xl">
      {/* Back link */}
      <Link
        href="/dashboard/reconciliations"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Reconciliations
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-orange-500" />
          <h1 className="text-xl font-semibold text-gray-900">New Reconciliation</h1>
        </div>
        <p className="text-sm text-gray-500">
          Upload two data sources and AI will detect columns, suggest mappings, and configure matching rules.
          Once saved, you can assign this reconciliation to any task.
        </p>
      </div>

      {/* Standalone setup wizard */}
      <ReconciliationSetup
        mode="standalone"
        onCreated={(configId) => {
          router.push("/dashboard/reconciliations")
        }}
      />
    </div>
  )
}

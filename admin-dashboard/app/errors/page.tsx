import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { DashboardLayout } from "@/components/dashboard-layout"
import { StatCard } from "@/components/stat-card"
import { ErrorTable } from "./error-table"

export const dynamic = "force-dynamic"

interface SearchParams {
  severity?: string
  org?: string
  status?: string
  page?: string
}

async function getErrorData(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || "1")
  const pageSize = 50
  const skip = (page - 1) * pageSize

  const where: any = {}
  if (searchParams.severity && searchParams.severity !== "all") {
    where.severity = searchParams.severity
  }
  if (searchParams.org && searchParams.org !== "all") {
    where.organizationId = searchParams.org
  }
  if (searchParams.status === "resolved") {
    where.resolved = true
  } else if (searchParams.status === "open" || !searchParams.status) {
    where.resolved = false
  }

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 7)

  const [errors, totalCount, unresolvedCount, errorsToday, errorsThisWeek, organizations, errorsByOrg] =
    await Promise.all([
      prisma.appError.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.appError.count({ where }),
      prisma.appError.count({ where: { resolved: false } }),
      prisma.appError.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.appError.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.organization.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.appError.groupBy({
        by: ["organizationId"],
        where: { resolved: false },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
    ])

  // Map org names to error-by-org
  const orgMap = new Map(organizations.map((o) => [o.id, o.name]))
  const topErrorOrgs = errorsByOrg
    .filter((e) => e.organizationId)
    .map((e) => ({
      orgName: orgMap.get(e.organizationId!) || "Unknown",
      orgId: e.organizationId!,
      count: e._count.id,
    }))

  return {
    errors,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
    currentPage: page,
    unresolvedCount,
    errorsToday,
    errorsThisWeek,
    organizations,
    topErrorOrgs,
  }
}

export default async function ErrorsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  requireAuth()
  const data = await getErrorData(searchParams)

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Errors</h1>
        <p className="text-sm text-gray-400 mt-1">Frontend error tracking across all accounts</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Unresolved" value={data.unresolvedCount} color={data.unresolvedCount > 0 ? "red" : "default"} />
        <StatCard title="Today" value={data.errorsToday} color={data.errorsToday > 0 ? "red" : "default"} />
        <StatCard title="This Week" value={data.errorsThisWeek} />
        <StatCard title="Total (filtered)" value={data.totalCount} />
      </div>

      {/* Top error accounts */}
      {data.topErrorOrgs.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-red-900/30 p-5 mb-8">
          <h2 className="text-sm font-semibold text-red-400 mb-3">Accounts with Most Errors</h2>
          <div className="flex flex-wrap gap-3">
            {data.topErrorOrgs.map((org) => (
              <div key={org.orgId} className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg">
                <span className="text-sm text-gray-300">{org.orgName}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-900/30 text-red-400">
                  {org.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error table with client-side interactivity */}
      <ErrorTable
        errors={data.errors.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        }))}
        organizations={data.organizations}
        totalPages={data.totalPages}
        currentPage={data.currentPage}
        currentFilters={{
          severity: searchParams.severity || "all",
          org: searchParams.org || "all",
          status: searchParams.status || "open",
        }}
      />
    </DashboardLayout>
  )
}

import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { DashboardLayout } from "@/components/dashboard-layout"
import { formatDate, timeAgo } from "@/lib/utils"
import Link from "next/link"

export const dynamic = "force-dynamic"

async function getCompanies() {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          users: true,
          taskInstances: true,
          boards: true,
          formDefinitions: true,
          databases: true,
        },
      },
      users: {
        select: { lastLoginAt: true },
        orderBy: { lastLoginAt: "desc" },
        take: 1,
      },
    },
  })

  // Get request counts per org
  const requestCounts = await prisma.request.groupBy({
    by: ["organizationId"],
    _count: { id: true },
  })
  const requestMap = new Map(requestCounts.map((r: any) => [r.organizationId, r._count.id]))

  // Get error counts per org
  const errorCounts = await prisma.appError.groupBy({
    by: ["organizationId"],
    where: { resolved: false },
    _count: { id: true },
  })
  const errorMap = new Map(errorCounts.map((e: any) => [e.organizationId, e._count.id]))

  return orgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: org.createdAt,
    timezone: org.timezone,
    userCount: org._count.users,
    taskCount: org._count.taskInstances,
    boardCount: org._count.boards,
    formCount: org._count.formDefinitions,
    databaseCount: org._count.databases,
    requestCount: requestMap.get(org.id) || 0,
    errorCount: errorMap.get(org.id) || 0,
    lastActive: org.users[0]?.lastLoginAt || null,
  }))
}

export default async function CompaniesPage() {
  requireAuth()
  const companies = await getCompanies()

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Companies</h1>
        <p className="text-sm text-gray-400 mt-1">{companies.length} organizations</p>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
              <th className="text-left px-5 py-3">Company</th>
              <th className="text-left px-5 py-3">Users</th>
              <th className="text-left px-5 py-3">Boards</th>
              <th className="text-left px-5 py-3">Tasks</th>
              <th className="text-left px-5 py-3">Requests</th>
              <th className="text-left px-5 py-3">Errors</th>
              <th className="text-left px-5 py-3">Last Active</th>
              <th className="text-left px-5 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {companies.map((company) => (
              <tr key={company.id} className="hover:bg-gray-800/50 transition-colors">
                <td className="px-5 py-3">
                  <Link
                    href={`/companies/${company.id}`}
                    className="text-sm text-orange-400 hover:text-orange-300 font-medium"
                  >
                    {company.name}
                  </Link>
                  <p className="text-xs text-gray-500">{company.slug}</p>
                </td>
                <td className="px-5 py-3 text-sm text-gray-300">{company.userCount}</td>
                <td className="px-5 py-3 text-sm text-gray-300">{company.boardCount}</td>
                <td className="px-5 py-3 text-sm text-gray-300">{company.taskCount}</td>
                <td className="px-5 py-3 text-sm text-gray-300">{company.requestCount}</td>
                <td className="px-5 py-3">
                  {company.errorCount > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-900/30 text-red-400">
                      {company.errorCount}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-500">0</span>
                  )}
                </td>
                <td className="px-5 py-3 text-sm text-gray-400">{timeAgo(company.lastActive)}</td>
                <td className="px-5 py-3 text-sm text-gray-400">{formatDate(company.createdAt)}</td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-500">
                  No companies registered yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}

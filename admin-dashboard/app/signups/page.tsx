import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { DashboardLayout } from "@/components/dashboard-layout"
import { StatCard } from "@/components/stat-card"
import { formatDate, formatDateTime } from "@/lib/utils"
import { ExportButton } from "./export-button"

export const dynamic = "force-dynamic"

async function getSignups() {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 7)
  const monthStart = new Date(todayStart)
  monthStart.setDate(monthStart.getDate() - 30)

  const [signups, totalSignups, signupsThisWeek, signupsThisMonth, unverified] = await Promise.all([
    prisma.user.findMany({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        emailVerified: true,
        lastLoginAt: true,
        organization: { select: { name: true } },
      },
    }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { role: "ADMIN", createdAt: { gte: weekStart } } }),
    prisma.user.count({ where: { role: "ADMIN", createdAt: { gte: monthStart } } }),
    prisma.user.count({ where: { role: "ADMIN", emailVerified: false } }),
  ])

  return { signups, totalSignups, signupsThisWeek, signupsThisMonth, unverified }
}

function splitName(fullName: string | null): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: "—", lastName: "—" }
  const parts = fullName.trim().split(/\s+/)
  return {
    firstName: parts[0] || "—",
    lastName: parts.slice(1).join(" ") || "—",
  }
}

export default async function SignupsPage() {
  requireAuth()
  const data = await getSignups()

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Sign Ups</h1>
          <p className="text-sm text-gray-400 mt-1">{data.totalSignups} total sign ups</p>
        </div>
        <ExportButton />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Sign Ups" value={data.totalSignups} color="blue" />
        <StatCard title="This Week" value={data.signupsThisWeek} color="green" />
        <StatCard title="This Month" value={data.signupsThisMonth} color="orange" />
        <StatCard title="Unverified" value={data.unverified} color={data.unverified > 0 ? "red" : "default"} />
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
              <th className="text-left px-5 py-3">First Name</th>
              <th className="text-left px-5 py-3">Last Name</th>
              <th className="text-left px-5 py-3">Email</th>
              <th className="text-left px-5 py-3">Company</th>
              <th className="text-left px-5 py-3">Verified</th>
              <th className="text-left px-5 py-3">Sign Up Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {data.signups.map((user: any) => {
              const { firstName, lastName } = splitName(user.name)
              return (
                <tr key={user.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-5 py-3 text-sm text-white">{firstName}</td>
                  <td className="px-5 py-3 text-sm text-white">{lastName}</td>
                  <td className="px-5 py-3 text-sm text-gray-300">{user.email}</td>
                  <td className="px-5 py-3 text-sm text-gray-300">{user.organization.name}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      user.emailVerified
                        ? "bg-green-900/30 text-green-400"
                        : "bg-red-900/30 text-red-400"
                    }`}>
                      {user.emailVerified ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-sm text-gray-300">{formatDate(user.createdAt)}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(user.createdAt)}</p>
                  </td>
                </tr>
              )
            })}
            {data.signups.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-500">
                  No sign ups yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  )
}

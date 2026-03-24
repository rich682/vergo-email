import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"

export const dynamic = "force-dynamic"

export async function GET() {
  // Check auth
  const cookieStore = cookies()
  if (cookieStore.get("vergo_admin_auth")?.value !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get first user (founder) per organization
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      users: {
        orderBy: { createdAt: "asc" },
        take: 1,
        where: { isDebugUser: { not: true } },
        select: { name: true, email: true, createdAt: true, emailVerified: true },
      },
    },
  })

  const signups = orgs
    .filter((org) => org.users.length > 0)
    .map((org) => ({ ...org.users[0], organization: { name: org.name } }))

  // Build CSV with BOM for Excel compatibility
  const BOM = "\uFEFF"
  const headers = ["First Name", "Last Name", "Email", "Company", "Email Verified", "Sign Up Date"]
  const rows = signups.map((user) => {
    const parts = (user.name || "").trim().split(/\s+/)
    const firstName = parts[0] || ""
    const lastName = parts.slice(1).join(" ") || ""
    const date = new Date(user.createdAt).toISOString().split("T")[0]
    return [firstName, lastName, user.email, user.organization.name, user.emailVerified ? "Yes" : "No", date]
  })

  const csvContent = BOM + [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
  ].join("\n")

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vergo-signups-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  })
}

import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { requireAuth } from "@/lib/auth"

const prisma = new PrismaClient()

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const currentAdmin = requireAuth()

  if (params.id === currentAdmin.id) {
    return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 })
  }

  const totalAdmins = await prisma.adminUser.count({ where: { emailVerified: true } })
  const target = await prisma.adminUser.findUnique({ where: { id: params.id } })

  if (!target) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 })
  }

  if (target.emailVerified && totalAdmins <= 1) {
    return NextResponse.json({ error: "Cannot remove the last active admin" }, { status: 400 })
  }

  await prisma.adminUser.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}

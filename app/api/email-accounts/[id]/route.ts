import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailAccountService } from "@/lib/services/email-account.service"
import { EmailConnectionService } from "@/lib/services/email-connection.service"

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgId = session.user.organizationId
  const emailAccount = await EmailAccountService.getById(params.id, orgId)
  if (emailAccount) {
    await EmailAccountService.deactivate(params.id, orgId)
    return NextResponse.json({ success: true })
  }

  // Fallback to legacy connected account
  try {
    await EmailConnectionService.delete(params.id, orgId)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Account not found" }, { status: 404 })
  }
}



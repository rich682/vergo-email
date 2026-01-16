import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
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

  try {
    // Delete from ConnectedEmailAccount - this is the table used by email sync
    await EmailConnectionService.delete(params.id, orgId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error disconnecting email account:", error)
    return NextResponse.json({ error: "Account not found or could not be deleted" }, { status: 404 })
  }
}

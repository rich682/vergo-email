import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailAccountService } from "@/lib/services/email-account.service"
import { EmailProvider } from "@prisma/client"
import { GmailProvider } from "@/lib/providers/email/gmail-provider"
import { MicrosoftProvider } from "@/lib/providers/email/microsoft-provider"

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const emailAccountId = request.nextUrl.searchParams.get("emailAccountId")
  if (!emailAccountId) {
    return NextResponse.json({ error: "emailAccountId is required" }, { status: 400 })
  }

  const account = await EmailAccountService.getById(emailAccountId, session.user.organizationId)
  if (!account) {
    return NextResponse.json({ error: "Email account not found" }, { status: 404 })
  }

  try {
    let result: any
    if (account.provider === EmailProvider.GMAIL) {
      const provider = new GmailProvider()
      result = await provider.syncContacts?.(account)
    } else if (account.provider === EmailProvider.MICROSOFT) {
      const provider = new MicrosoftProvider()
      result = await provider.syncContacts?.(account)
    } else {
      return NextResponse.json({ error: "Unsupported provider" }, { status: 400 })
    }

    return NextResponse.json(result || { imported: 0, skipped: 0, message: "Sync not implemented" })
  } catch (error: any) {
    console.error("Contact sync error:", error)
    return NextResponse.json({ error: error.message || "Sync failed" }, { status: 500 })
  }
}


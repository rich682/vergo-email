import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { EmailDraftService } from "@/lib/services/email-draft.service"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  const draft = await EmailDraftService.findById(
    params.id,
    session.user.organizationId
  )

  if (!draft) {
    return NextResponse.json(
      { error: "Draft not found" },
      { status: 404 }
    )
  }

  return NextResponse.json(draft)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    
    const draft = await EmailDraftService.update(
      params.id,
      session.user.organizationId,
      body
    )

    return NextResponse.json(draft)
  } catch (error: any) {
    console.error("Error updating draft:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}










import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { signature: true }
    })

    return NextResponse.json({
      signature: user?.signature || ""
    })
  } catch (error: any) {
    console.error("Error fetching user signature:", error)
    return NextResponse.json(
      { error: "Failed to fetch signature" },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { signature } = body

    if (typeof signature !== "string") {
      return NextResponse.json(
        { error: "Invalid signature format" },
        { status: 400 }
      )
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { signature: signature.trim() || null }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error updating user signature:", error)
    return NextResponse.json(
      { error: "Failed to update signature" },
      { status: 500 }
    )
  }
}



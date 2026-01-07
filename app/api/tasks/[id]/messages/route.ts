import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  const task = await prisma.task.findFirst({
    where: {
      id: params.id,
      organizationId: session.user.organizationId
    }
  })

  if (!task) {
    return NextResponse.json(
      { error: "Task not found" },
      { status: 404 }
    )
  }

  const messages = await prisma.message.findMany({
    where: {
      taskId: params.id
    },
    orderBy: {
      createdAt: "asc"
    }
  })

  return NextResponse.json(messages)
}







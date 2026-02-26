import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getStorageService } from "@/lib/services/storage.service"

export async function GET(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgId = session.user.organizationId
  const fileKey = decodeURIComponent(params.key)

  // Verify the file belongs to the user's organization
  const [attachment, collectedItem] = await Promise.all([
    prisma.attachment.findFirst({
      where: { fileKey, organizationId: orgId },
      select: { id: true },
    }),
    prisma.collectedItem.findFirst({
      where: { fileKey, organizationId: orgId },
      select: { id: true },
    }),
  ])

  if (!attachment && !collectedItem) {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }

  try {
    const storage = getStorageService()
    const file = await storage.download(fileKey)

    // Try to determine content type from key
    const contentType = getContentType(fileKey)

    // Sanitize the filename to prevent header injection
    const filename = fileKey.split("/").pop()?.replace(/[\r\n"]/g, "") || "download"

    return new NextResponse(file as any, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`
      }
    })
  } catch (error: any) {
    // Handle different storage backend errors
    if (error.code === "ENOENT" || error.code === 404 || error.name === "NoSuchKey") {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      )
    }

    console.error("Error downloading attachment:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

function getContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase()
  const contentTypes: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    txt: "text/plain",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  }

  return contentTypes[ext || ""] || "application/octet-stream"
}

import { NextRequest, NextResponse } from "next/server"
import { getStorageService } from "@/lib/services/storage.service"

export async function GET(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  try {
    const storage = getStorageService()
    const file = await storage.download(params.key)

    // Try to determine content type from key
    const contentType = getContentType(params.key)

    return new NextResponse(file as any, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${params.key.split("/").pop()}"`
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


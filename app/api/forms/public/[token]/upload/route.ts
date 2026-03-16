/**
 * Public Form File Upload API
 *
 * POST /api/forms/public/[token]/upload
 * Uploads a file to Vercel Blob for a public form submission.
 * Files are stored temporarily; they get linked to a FormRequest on submission.
 * No auth required (public form access via token).
 */

import { NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { prisma } from "@/lib/prisma"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    // Validate token
    const formDef = await prisma.formDefinition.findFirst({
      where: {
        universalAccessToken: token,
        universalLinkEnabled: true,
        deletedAt: null,
      },
      select: { id: true, organizationId: true },
    })

    if (!formDef) {
      return NextResponse.json(
        { error: "Form not found or link is disabled" },
        { status: 404 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const fieldKey = formData.get("fieldKey") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!fieldKey) {
      return NextResponse.json({ error: "Field key is required" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      )
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "File type not allowed. Please upload PDF, Office documents, or images." },
        { status: 400 }
      )
    }

    // Upload to Vercel Blob (temporary — will be linked to FormRequest on submission)
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
    const blobPath = `form-attachments/${formDef.organizationId}/public-upload/${formDef.id}/${fieldKey}/${timestamp}-${safeName}`

    const blob = await put(blobPath, file, {
      access: "public",
      contentType: file.type,
    })

    return NextResponse.json({
      upload: {
        url: blob.url,
        filename: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        fieldKey,
      },
    }, { status: 201 })
  } catch (error: any) {
    console.error("Error uploading public form file:", error)
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    )
  }
}

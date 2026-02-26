/**
 * CSV Upload API Endpoint
 * 
 * Handles CSV file upload, parsing, and validation for personalized requests.
 * Returns parsed data with detected email column, available tags, and validation summary.
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { parseCSV, CSVParseError } from "@/lib/utils/csv-parser"
import { canPerformAction } from "@/lib/permissions"
import { checkRateLimit } from "@/lib/utils/rate-limit"

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.organizationId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  if (!canPerformAction(session.user.role, "inbox:manage_drafts", session.user.orgActionPermissions)) {
    return NextResponse.json({ error: "You do not have permission to manage drafts" }, { status: 403 })
  }

  const { allowed } = await checkRateLimit(`upload:csv:${session.user.id}`, 10)
  if (!allowed) {
    return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    // Validate file size (max 5MB)
    const MAX_CSV_SIZE = 5 * 1024 * 1024
    if (file.size > MAX_CSV_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 413 }
      )
    }

    // Validate file type
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      return NextResponse.json(
        { error: "File must be a CSV file" },
        { status: 400 }
      )
    }

    // Read file content
    const csvContent = await file.text()

    // Parse CSV
    const result = parseCSV(csvContent)

    if ('code' in result) {
      // Parse error occurred
      const error = result as CSVParseError
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 400 }
      )
    }

    // Tags are directly derived from CSV headers (all non-email columns)
    // tagColumns already contains the original column names, so use them directly as tags
    const tags = result.tagColumns // Original column names become tags
    
    // Extract recipient emails (sample first 10 for display)
    const recipientEmails = result.rows
      .map(row => row[result.emailColumn]?.trim())
      .filter(Boolean)
      .slice(0, 10)
    
    // Check for blocking errors
    const blockingErrors: string[] = []
    if (result.validation.duplicateEmails.length > 0) {
      blockingErrors.push(`Duplicate emails found: ${result.validation.duplicateEmails.length} duplicates`)
    }
    if (!result.emailColumn) {
      blockingErrors.push('Email column not found')
    }
    
    // Return parsed data with tags directly derived from CSV headers
    return NextResponse.json({
      success: true,
      data: {
        rows: result.rows,
        emailColumn: result.emailColumn,
        emailColumnName: result.emailColumn,
        recipients: {
          emails: recipientEmails,
          count: result.validation.rowCount
        },
        tags: tags, // Original column names become tags directly
        tagColumns: result.tagColumns, // Keep for backward compatibility
        normalizedTagMap: result.normalizedTagMap,
        missingCountsByTag: result.validation.missingValues,
        blockingErrors,
        validation: result.validation
      }
    })
  } catch (error: any) {
    console.error("Error processing CSV upload:", error)
    return NextResponse.json(
      { error: "Failed to process CSV file" },
      { status: 500 }
    )
  }
}


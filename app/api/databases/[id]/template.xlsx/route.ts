/**
 * Database Template Download API
 * 
 * GET /api/databases/[id]/template.xlsx - Download Excel template for a database
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DatabaseSchema } from "@/lib/services/database.service"
import { generateSchemaTemplate } from "@/lib/utils/excel-utils"

interface RouteParams {
  params: { id: string }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { organizationId: true },
    })

    if (!user?.organizationId) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    // Get the database
    const database = await prisma.database.findFirst({
      where: {
        id: params.id,
        organizationId: user.organizationId,
      },
      select: {
        name: true,
        schema: true,
        identifierKeys: true,
      },
    })

    if (!database) {
      return NextResponse.json({ error: "Database not found" }, { status: 404 })
    }

    const schema = database.schema as unknown as DatabaseSchema
    const identifierKeys = (database.identifierKeys as unknown as string[]) || []

    // Generate the template - pass the first identifier key for backward compatibility
    const buffer = generateSchemaTemplate(schema, (identifierKeys[0] || null) as any, database.name!)

    // Generate filename
    const safeName = database.name.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 50)
    const filename = `${safeName}_template.xlsx`

    // Return as downloadable file
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    })
  } catch (error) {
    console.error("Error generating template:", error)
    return NextResponse.json(
      { error: "Failed to generate template" },
      { status: 500 }
    )
  }
}

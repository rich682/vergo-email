/**
 * Jobs Import Template Endpoint
 * 
 * GET /api/task-instances/template - Download a CSV template for bulk import
 */

import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  // CSV template content
  const csvContent = `Task Name,Due Date,Owner,Description,Priority
"Review monthly financial statements",2024-01-31,"",Review P&L and balance sheet for accuracy,high
"Reconcile bank accounts",2024-01-25,"",Match all bank transactions with records,high
"Submit expense reports",2024-01-20,"","Collect and submit all pending expense reports",medium
"Update project status",2024-01-15,"",Weekly status update for all active projects,low
"Schedule team meeting",2024-01-10,"",Book meeting room and send calendar invites,low`

  // Return as downloadable CSV
  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=vergo-task-import-template.csv"
    }
  })
}

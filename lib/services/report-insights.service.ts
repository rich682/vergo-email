/**
 * Report Insights Service
 * 
 * Generates AI-powered insights for reports, including:
 * - Executive summary
 * - Key findings with specific data points
 * - Period-over-period comparison
 * - Concerning trends that need attention
 * - Actionable recommendations
 */

import { callOpenAI } from "@/lib/utils/openai-retry"
import { getOpenAIClient } from "@/lib/utils/openai-client"
import { prisma } from "@/lib/prisma"
import { ReportExecutionService } from "./report-execution.service"

// ============================================
// Types
// ============================================

export interface ReportInsightsInput {
  reportDefinitionId: string
  organizationId: string
  periodKey: string
  filterBindings?: Record<string, string[]>
  compareMode?: "none" | "mom" | "yoy"
}

export interface KeyFinding {
  category: "positive" | "negative" | "neutral"
  title: string
  detail: string
  value?: string
  change?: string
}

export interface ConcerningTrend {
  severity: "warning" | "critical"
  entity: string
  metric: string
  description: string
  value?: string
  recommendation?: string
}

export interface DataHighlight {
  label: string
  value: string
  context?: string
}

export interface PeriodComparison {
  currentPeriod: string
  comparePeriod: string
  changes: Array<{
    metric: string
    currentValue: string
    previousValue: string
    changePercent: string
    trend: "up" | "down" | "flat"
  }>
}

export interface ReportInsight {
  executiveSummary: string
  keyFindings: KeyFinding[]
  periodComparison: PeriodComparison | null
  concerningTrends: ConcerningTrend[]
  recommendations: string[]
  dataHighlights: DataHighlight[]
  generatedAt: Date
}

export interface OrganizationAIContext {
  industry?: string
  entityType?: string
  keyMetrics?: string[]
  terminology?: Record<string, string>
}

// ============================================
// Service
// ============================================

export class ReportInsightsService {
  /**
   * Generate comprehensive insights for a report
   */
  static async generateInsights(input: ReportInsightsInput): Promise<ReportInsight> {
    const {
      reportDefinitionId,
      organizationId,
      periodKey,
      filterBindings,
      compareMode = "mom",
    } = input

    // 1. Fetch report definition
    const report = await prisma.reportDefinition.findFirst({
      where: { id: reportDefinitionId, organizationId },
      include: {
        database: {
          select: {
            id: true,
            name: true,
            schema: true,
          },
        },
      },
    })

    if (!report) {
      throw new Error("Report not found")
    }

    // 2. Fetch organization AI context
    const org = await prisma.organization.findFirst({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        aiContext: true,
      },
    })

    const aiContext = (org?.aiContext as OrganizationAIContext) || {}

    // 3. Execute report preview for current period
    const currentPreview = await ReportExecutionService.executePreview({
      reportDefinitionId,
      organizationId,
      currentPeriodKey: periodKey,
      compareMode,
      filters: filterBindings,
    })

    // 4. Build context for AI
    const context = this.buildAIContext({
      report,
      currentPreview,
      aiContext,
      filterBindings,
      periodKey,
    })

    // 5. Generate insights using AI
    const insights = await this.callAI(context)

    // 6. Optionally update organization AI context if we learned something
    if (!aiContext.entityType || !aiContext.industry) {
      const inferredContext = this.inferOrganizationContext(report, currentPreview)
      if (Object.keys(inferredContext).length > 0) {
        await this.updateOrganizationContext(organizationId, {
          ...aiContext,
          ...inferredContext,
        })
      }
    }

    return {
      ...insights,
      generatedAt: new Date(),
    }
  }

  /**
   * Build structured context for the AI prompt
   */
  private static buildAIContext(params: {
    report: any
    currentPreview: any
    aiContext: OrganizationAIContext
    filterBindings?: Record<string, string[]>
    periodKey: string
  }): string {
    const { report, currentPreview, aiContext, filterBindings, periodKey } = params

    // Build filter summary
    let filterSummary = "No filters applied"
    if (filterBindings && Object.keys(filterBindings).length > 0) {
      const filterParts = Object.entries(filterBindings)
        .filter(([_, values]) => values.length > 0)
        .map(([key, values]) => {
          if (values.length === 1) return `${key}: ${values[0]}`
          return `${key}: ${values.length} values`
        })
      if (filterParts.length > 0) {
        filterSummary = filterParts.join(", ")
      }
    }

    // Infer entity type if not set
    const entityType = aiContext.entityType || this.inferEntityType(report, currentPreview)
    const industry = aiContext.industry || this.inferIndustry(report, currentPreview)

    // Build column descriptions
    const columns = currentPreview.table.columns || []
    const columnDescriptions = columns
      .filter((col: any) => col.key !== "_label" && col.key !== "_format" && col.key !== "_type")
      .map((col: any) => `${col.label} (${col.dataType})`)
      .join(", ")

    // Build data summary
    const rows = currentPreview.table.rows || []
    const dataSummary = this.buildDataSummary(rows, columns, entityType)

    // Build period comparison summary if available
    let comparisonSummary = ""
    if (currentPreview.compare) {
      comparisonSummary = `
COMPARISON DATA:
- Compare Period: ${currentPreview.compare.label} (${currentPreview.compare.rowCount} ${entityType})
- Available for period-over-period analysis`
    }

    // Build the full context
    return `CONTEXT:
- Organization Industry: ${industry}
- Entity Type: ${entityType}
- Report Name: "${report.name}"
- Report Type: ${this.inferReportType(report.name)}
- Cadence: ${report.cadence}
- Layout: ${report.layout}
- Current Period: ${currentPreview.current?.label || periodKey} (${currentPreview.current?.rowCount || rows.length} ${entityType})
- Filters Applied: ${filterSummary}
${comparisonSummary}

COLUMNS AVAILABLE:
${columnDescriptions}

DATA SUMMARY:
${dataSummary}

ANALYSIS GUIDELINES:
- Focus on actionable insights relevant to a ${industry} business
- Reference specific ${entityType} by name when highlighting trends
- For financial metrics, note percentage changes and absolute values
- Flag any ${entityType} that show concerning patterns
- Consider the report type "${report.name}" when prioritizing insights`
  }

  /**
   * Build a summary of the data for the AI
   */
  private static buildDataSummary(
    rows: Array<Record<string, unknown>>,
    columns: Array<{ key: string; label: string; dataType: string }>,
    entityType: string
  ): string {
    if (rows.length === 0) {
      return "No data available for this period."
    }

    const summary: string[] = []
    summary.push(`Total ${entityType}: ${rows.length}`)

    // Find numeric columns for aggregation
    const numericColumns = columns.filter(
      col => col.dataType === "number" || col.dataType === "currency"
    )

    // Calculate aggregates for numeric columns
    for (const col of numericColumns.slice(0, 5)) {
      const values = rows
        .map(row => {
          const val = row[col.key]
          if (typeof val === "number") return val
          if (typeof val === "string" && !isNaN(Number(val))) return Number(val)
          return null
        })
        .filter((v): v is number => v !== null)

      if (values.length > 0) {
        const total = values.reduce((a, b) => a + b, 0)
        const avg = total / values.length
        const max = Math.max(...values)
        const min = Math.min(...values)

        if (col.dataType === "currency") {
          summary.push(`${col.label}: Total $${total.toLocaleString()}, Avg $${avg.toLocaleString(undefined, { maximumFractionDigits: 0 })}, Range $${min.toLocaleString()} - $${max.toLocaleString()}`)
        } else {
          summary.push(`${col.label}: Total ${total.toLocaleString()}, Avg ${avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}, Range ${min.toLocaleString()} - ${max.toLocaleString()}`)
        }
      }
    }

    // Include sample of top/bottom performers if we have a label column
    const labelCol = columns.find(c => c.key === "_label")
    if (labelCol && rows.length > 0) {
      // For pivot layout, rows are metrics, not entities
      // Show the row labels
      const rowLabels = rows
        .slice(0, 10)
        .map(r => r._label)
        .filter(Boolean)
      if (rowLabels.length > 0) {
        summary.push(`\nMetrics: ${rowLabels.join(", ")}`)
      }
    } else {
      // For standard layout, show entity names if available
      const nameCol = columns.find(c => 
        c.label.toLowerCase().includes("name") || 
        c.label.toLowerCase().includes("project") ||
        c.label.toLowerCase().includes("location")
      )
      if (nameCol) {
        const entities = rows
          .slice(0, 10)
          .map(r => r[nameCol.key])
          .filter(Boolean)
        if (entities.length > 0) {
          summary.push(`\nSample ${entityType}: ${entities.join(", ")}`)
        }
      }
    }

    // Add row data for AI to analyze (limited to prevent token overflow)
    if (rows.length <= 20) {
      summary.push("\nFULL DATA:")
      for (const row of rows) {
        const rowData = columns
          .filter(c => !c.key.startsWith("_"))
          .slice(0, 6)
          .map(c => {
            const val = row[c.key]
            if (val === null || val === undefined) return `${c.label}: -`
            if (typeof val === "number" && c.dataType === "currency") {
              return `${c.label}: $${val.toLocaleString()}`
            }
            return `${c.label}: ${val}`
          })
          .join(", ")
        summary.push(`- ${row._label || "Row"}: ${rowData}`)
      }
    }

    return summary.join("\n")
  }

  /**
   * Call OpenAI to generate insights
   */
  private static async callAI(context: string): Promise<Omit<ReportInsight, "generatedAt">> {
    const openai = getOpenAIClient()

    const completion = await callOpenAI(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a financial analyst assistant that provides comprehensive insights on business reports. Your analysis should be:
- Specific: Reference actual data points, entity names, and numbers
- Actionable: Provide clear recommendations
- Balanced: Highlight both positive trends and areas of concern
- Professional: Use business-appropriate language suitable for executive presentations

Respond with a JSON object containing:
{
  "executiveSummary": "2-3 sentence overview of the key takeaways",
  "keyFindings": [
    {
      "category": "positive" | "negative" | "neutral",
      "title": "Brief title",
      "detail": "Detailed finding with specific numbers",
      "value": "Key metric value (optional)",
      "change": "Change description (optional)"
    }
  ],
  "periodComparison": {
    "currentPeriod": "Period label",
    "comparePeriod": "Compare period label",
    "changes": [
      {
        "metric": "Metric name",
        "currentValue": "Current value",
        "previousValue": "Previous value",
        "changePercent": "+X% or -X%",
        "trend": "up" | "down" | "flat"
      }
    ]
  } | null,
  "concerningTrends": [
    {
      "severity": "warning" | "critical",
      "entity": "Specific project/location/etc name",
      "metric": "Metric that's concerning",
      "description": "What's happening",
      "value": "Current value (optional)",
      "recommendation": "What to do about it (optional)"
    }
  ],
  "recommendations": ["Action item 1", "Action item 2"],
  "dataHighlights": [
    {
      "label": "Highlight label",
      "value": "Value",
      "context": "Why it matters (optional)"
    }
  ]
}

Provide 3-5 key findings, 0-3 concerning trends (only if genuinely concerning), 2-4 recommendations, and 3-5 data highlights.
If no comparison data is available, set periodComparison to null.`
        },
        {
          role: "user",
          content: context
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2000
    })

    const response = completion.choices[0]?.message?.content
    if (!response) {
      throw new Error("No response from AI")
    }

    const parsed = JSON.parse(response)
    
    return {
      executiveSummary: parsed.executiveSummary || "Unable to generate summary.",
      keyFindings: parsed.keyFindings || [],
      periodComparison: parsed.periodComparison || null,
      concerningTrends: parsed.concerningTrends || [],
      recommendations: parsed.recommendations || [],
      dataHighlights: parsed.dataHighlights || [],
    }
  }

  /**
   * Infer entity type from report data
   */
  private static inferEntityType(report: any, preview: any): string {
    const reportName = (report.name || "").toLowerCase()
    const columns = preview.table?.columns || []
    const columnNames = columns.map((c: any) => (c.label || "").toLowerCase()).join(" ")

    // Check common patterns
    if (reportName.includes("project") || columnNames.includes("project")) {
      return "projects"
    }
    if (reportName.includes("hospital") || columnNames.includes("hospital") || columnNames.includes("facility")) {
      return "facilities"
    }
    if (reportName.includes("department") || columnNames.includes("department")) {
      return "departments"
    }
    if (reportName.includes("location") || columnNames.includes("location") || columnNames.includes("store")) {
      return "locations"
    }
    if (reportName.includes("product") || columnNames.includes("product") || columnNames.includes("sku")) {
      return "products"
    }
    if (reportName.includes("customer") || columnNames.includes("customer") || columnNames.includes("client")) {
      return "customers"
    }
    if (reportName.includes("employee") || columnNames.includes("employee")) {
      return "employees"
    }

    return "items"
  }

  /**
   * Infer industry from report data
   */
  private static inferIndustry(report: any, preview: any): string {
    const reportName = (report.name || "").toLowerCase()
    const columns = preview.table?.columns || []
    const columnNames = columns.map((c: any) => (c.label || "").toLowerCase()).join(" ")
    const combined = reportName + " " + columnNames

    // Check industry patterns
    if (combined.includes("construction") || combined.includes("project") || 
        combined.includes("labor") || combined.includes("subcontractor") ||
        combined.includes("material")) {
      return "construction"
    }
    if (combined.includes("hospital") || combined.includes("patient") || 
        combined.includes("medical") || combined.includes("healthcare")) {
      return "healthcare"
    }
    if (combined.includes("retail") || combined.includes("store") || 
        combined.includes("inventory") || combined.includes("sku")) {
      return "retail"
    }
    if (combined.includes("restaurant") || combined.includes("food") || 
        combined.includes("menu")) {
      return "restaurant"
    }
    if (combined.includes("manufacturing") || combined.includes("production") || 
        combined.includes("assembly")) {
      return "manufacturing"
    }

    return "general business"
  }

  /**
   * Infer report type from name
   */
  private static inferReportType(reportName: string): string {
    const name = reportName.toLowerCase()
    
    if (name.includes("profit") || name.includes("p&l") || name.includes("pnl")) {
      return "Profitability/P&L - Focus on margins, revenue vs costs, profit trends"
    }
    if (name.includes("income") || name.includes("revenue")) {
      return "Income Statement - Focus on revenue sources, growth trends"
    }
    if (name.includes("expense") || name.includes("cost")) {
      return "Expense Report - Focus on cost drivers, budget variance, savings opportunities"
    }
    if (name.includes("balance") || name.includes("asset")) {
      return "Balance Sheet - Focus on asset utilization, liability management"
    }
    if (name.includes("cash") || name.includes("flow")) {
      return "Cash Flow - Focus on liquidity, cash position, timing"
    }
    if (name.includes("budget") || name.includes("variance")) {
      return "Budget Variance - Focus on over/under budget items, forecasting"
    }

    return "General Financial Report"
  }

  /**
   * Infer organization context from report data
   */
  private static inferOrganizationContext(
    report: any,
    preview: any
  ): Partial<OrganizationAIContext> {
    const context: Partial<OrganizationAIContext> = {}

    const entityType = this.inferEntityType(report, preview)
    if (entityType !== "items") {
      context.entityType = entityType
    }

    const industry = this.inferIndustry(report, preview)
    if (industry !== "general business") {
      context.industry = industry
    }

    return context
  }

  /**
   * Update organization AI context
   */
  private static async updateOrganizationContext(
    organizationId: string,
    context: OrganizationAIContext
  ): Promise<void> {
    try {
      await prisma.organization.update({
        where: { id: organizationId },
        data: { aiContext: context as any },
      })
    } catch (error) {
      // Non-critical, just log
      console.warn("[ReportInsights] Failed to update org AI context:", error)
    }
  }
}

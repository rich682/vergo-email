/**
 * Text-to-SQL Chat Service
 *
 * Handles the full chat flow:
 * 1. Build schema context from databases
 * 2. Smart model routing (gpt-4o for complex, gpt-4o-mini for simple)
 * 3. Call LLM to generate SQL
 * 4. Execute SQL against DuckDB (read-only, with timeout)
 * 5. Self-correct on error (one retry)
 * 6. Explain results + recommend chart visualization
 * 7. Stream progress events to the client
 */

import { prisma } from "@/lib/prisma"
import { callAgentLLM } from "@/lib/agents/llm-client"
import { createOrgDuckDB, executeQuery, validateReadOnlySQL } from "./duckdb-manager"
import { buildSchemaContext, buildSystemPrompt } from "./schema-context"
import { ensureFreshParquet } from "./database-to-parquet"
import type { ModelTier } from "@/lib/agents/types"

interface ChatInput {
  conversationId: string
  userMessage: string
  organizationId: string
  userId: string
}

// Streaming event callback — the route handler wires this to SSE
export type AnalysisEventCallback = (event: string, data: unknown) => void

/**
 * Extract SQL from an LLM response. Looks for ```sql code blocks.
 */
function extractSQL(response: string): string | null {
  const match = response.match(/```sql\s*\n([\s\S]*?)```/)
  return match?.[1]?.trim() || null
}

/**
 * Sanitize DuckDB/internal error messages before showing to users.
 * Strips file paths, stack traces, and internal details.
 */
function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/\/tmp\/[^\s'")]+/g, "[file]")
    .replace(/\/var\/[^\s'")]+/g, "[file]")
    .replace(/\/Users\/[^\s'")]+/g, "[file]")
    .replace(/at\s+\S+\s+\(\S+:\d+:\d+\)/g, "")
    .replace(/Error:\s*/gi, "")
    .trim()
    .substring(0, 300)
}

/**
 * Complexity keywords that suggest the query needs GPT-4o.
 */
const COMPLEXITY_KEYWORDS = [
  "analyze", "analyse", "compare", "trend", "correlate", "predict",
  "why", "insight", "pattern", "most profitable", "least profitable",
  "report", "breakdown", "summarize", "summary", "forecast",
  "regression", "variance", "anomaly", "outlier", "benchmark",
  "year over year", "month over month", "growth", "decline",
  "top \\d+", "bottom \\d+", "rank", "percentile",
]

const COMPLEXITY_REGEX = new RegExp(COMPLEXITY_KEYWORDS.join("|"), "i")

/**
 * Select the LLM model tier based on query complexity.
 *
 * Uses GPT-4o ("reasoning") for complex queries that benefit from
 * deeper analysis. Falls back to GPT-4o-mini ("tool") for simple lookups.
 */
function selectModelTier(
  userMessage: string,
  databases: Array<{ analysisSummaryStats: Record<string, unknown> }>,
  databaseCount: number
): { tier: ModelTier; maxTokens: number } {
  // Multi-database queries need better reasoning (joins)
  if (databaseCount > 1) {
    return { tier: "reasoning", maxTokens: 4000 }
  }

  // Complex question keywords
  if (COMPLEXITY_REGEX.test(userMessage)) {
    return { tier: "reasoning", maxTokens: 4000 }
  }

  // Large datasets benefit from better SQL generation
  const totalRows = databases.reduce((sum, db) => {
    const stats = db.analysisSummaryStats as { rowCount?: number } | null
    return sum + (stats?.rowCount || 0)
  }, 0)

  if (totalRows > 50_000) {
    return { tier: "reasoning", maxTokens: 4000 }
  }

  // Simple query — use the faster, cheaper model
  return { tier: "tool", maxTokens: 2000 }
}

/**
 * Handle a chat message: generate SQL, execute, explain, recommend chart.
 *
 * Accepts an optional `onEvent` callback for streaming progress to the client.
 */
export async function handleAnalysisChat(
  input: ChatInput,
  onEvent?: AnalysisEventCallback
) {
  const { conversationId, userMessage, organizationId, userId } = input
  const emit = onEvent || (() => {})

  // 1. Load conversation + verify ownership
  emit("status", "Loading conversation...")
  const conversation = await prisma.analysisConversation.findFirst({
    where: { id: conversationId, organizationId, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 20,
      },
    },
  })

  if (!conversation) {
    throw new Error("Conversation not found")
  }

  // 2. Load databases and ensure Parquet is fresh
  const databaseIds = conversation.databaseIds as string[]
  if (databaseIds.length === 0) {
    await prisma.analysisMessage.create({
      data: { conversationId, role: "user", content: userMessage },
    })
    const msg = await prisma.analysisMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: "No databases are selected for this conversation. Please create a new chat and select at least one database to query.",
      },
    })
    emit("done", { messageId: msg.id })
    return msg
  }

  emit("status", "Preparing your data for analysis...")
  const databases = await Promise.all(
    databaseIds.map((id) => ensureFreshParquet(id, organizationId))
  )

  // 3. Save user message
  await prisma.analysisMessage.create({
    data: {
      conversationId,
      role: "user",
      content: userMessage,
    },
  })

  // Auto-update conversation title from first user message
  if (conversation.messages.length === 0) {
    const title = userMessage.length > 80
      ? userMessage.substring(0, 77) + "..."
      : userMessage
    await prisma.analysisConversation.update({
      where: { id: conversationId },
      data: { title },
    })
  }

  // 4. Build LLM context
  const datasetsForContext = databases.map((db) => ({
    tableName: db.analysisTableName,
    name: db.name,
    schemaSnapshot: db.analysisSchemaSnapshot,
    summaryStats: db.analysisSummaryStats as any,
  }))
  const schemaContext = buildSchemaContext(datasetsForContext)
  const systemPrompt = buildSystemPrompt(schemaContext)

  // Build conversation history for LLM
  const historyMessages = conversation.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.role === "assistant"
      ? m.content + (m.generatedSql ? `\n\n[SQL used: ${m.generatedSql}]` : "")
      : m.content,
  }))

  // 5. Smart model selection
  const { tier, maxTokens } = selectModelTier(userMessage, databases, databaseIds.length)
  emit("status", "Generating SQL query...")

  const { content: llmResponse, model, tokensUsed, cost } = await callAgentLLM(
    [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: userMessage },
    ],
    { tier, maxTokens, temperature: 0.1 }
  )

  // 6. Extract SQL from response
  const generatedSql = extractSQL(llmResponse)
  if (generatedSql) {
    emit("sql", generatedSql)
  }

  if (!generatedSql) {
    // LLM responded without SQL (clarification, explanation, etc.)
    const msg = await prisma.analysisMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: llmResponse,
        model,
        tokensUsed,
        estimatedCostUsd: cost,
      },
    })
    emit("explanation", llmResponse)
    emit("done", { messageId: msg.id })
    return msg
  }

  // 7. Validate SQL safety
  const validationError = validateReadOnlySQL(generatedSql)
  if (validationError) {
    const msg = await prisma.analysisMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: "I can only run SELECT queries for data analysis. I cannot modify or delete data.",
        generatedSql,
        queryError: validationError,
        model,
        tokensUsed,
        estimatedCostUsd: cost,
      },
    })
    emit("explanation", msg.content)
    emit("done", { messageId: msg.id })
    return msg
  }

  // 8. Execute SQL against DuckDB
  const totalRows = databases.reduce((sum, db) => {
    const stats = db.analysisSummaryStats as { rowCount?: number } | null
    return sum + (stats?.rowCount || 0)
  }, 0)
  emit("status", `Executing query across ${totalRows.toLocaleString()} rows...`)

  const datasetInfos = databases.map((db) => ({
    tableName: db.analysisTableName,
    parquetUrl: db.parquetBlobUrl,
  }))

  const handle = await createOrgDuckDB(datasetInfos)

  try {
    const result = await executeQuery(handle.connection, generatedSql, {
      timeoutMs: 60_000,
      maxRows: 2000,
    })

    emit("result", {
      rows: result.rows,
      totalRows: result.totalRows,
      durationMs: result.durationMs,
    })

    // 9. Ask LLM to explain results + recommend chart
    emit("status", "Analyzing results...")

    const resultSample = JSON.stringify(result.rows.slice(0, 30), null, 2)
    const rowCountDesc = result.totalRows === -1
      ? "more than 2,000"
      : String(result.totalRows)

    const columnNames = result.rows.length > 0 ? Object.keys(result.rows[0]) : []

    const { content: analysisJson } = await callAgentLLM(
      [
        {
          role: "system",
          content: `You are a data analyst. Given query results, provide:
1. A clear explanation in plain English (3-5 sentences). Highlight key numbers, trends, and business insights. If the result has multiple rows, summarize patterns rather than listing every row.
2. A chart recommendation if the data is suitable for visualization.

Return valid JSON in this exact format:
{
  "explanation": "Your detailed analysis here...",
  "chart": {
    "type": "bar",
    "xKey": "column_name",
    "yKeys": ["value_column"],
    "title": "Chart Title"
  }
}

Chart type options: "bar" (comparisons), "line" (trends over time), "pie" (proportions), "area" (volume over time).
Set "chart" to null if the data isn't suitable for a chart (e.g., single value, text-only results).
The xKey and yKeys MUST be actual column names from the result set. Available columns: ${JSON.stringify(columnNames)}`,
        },
        {
          role: "user",
          content: `User's question: ${userMessage}\n\nSQL query: ${generatedSql}\n\nResults (${rowCountDesc} rows, took ${result.durationMs}ms):\n${resultSample}`,
        },
      ],
      { tier, maxTokens: 1000, temperature: 0.2, responseFormat: "json" }
    )

    // Parse structured response
    let explanation = ""
    let chartConfig: Record<string, unknown> | null = null

    try {
      const parsed = JSON.parse(analysisJson)
      explanation = parsed.explanation || analysisJson
      if (parsed.chart && parsed.chart.type && parsed.chart.xKey && parsed.chart.yKeys) {
        chartConfig = parsed.chart
        emit("chart", chartConfig)
      }
    } catch {
      // If JSON parsing fails, use the raw response as explanation
      explanation = analysisJson
    }

    emit("explanation", explanation)

    const msg = await prisma.analysisMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: explanation,
        generatedSql,
        queryResultJson: result.rows as any,
        queryRowCount: result.totalRows,
        queryDurationMs: result.durationMs,
        chartConfig: chartConfig as any,
        model,
        tokensUsed,
        estimatedCostUsd: cost,
      },
    })

    emit("done", { messageId: msg.id })
    return msg
  } catch (queryError: any) {
    // 10. Self-correction: let LLM fix the SQL (one retry)
    emit("status", "Query encountered an error, retrying with corrected SQL...")

    try {
      const { content: fixedResponse } = await callAgentLLM(
        [
          { role: "system", content: systemPrompt },
          ...historyMessages,
          { role: "user", content: userMessage },
          { role: "assistant", content: llmResponse },
          {
            role: "user",
            content: `The SQL query returned an error: ${sanitizeErrorMessage(queryError.message)}\n\nPlease fix the SQL and try again. Return only the corrected SQL in a \`\`\`sql code block.`,
          },
        ],
        { tier, maxTokens, temperature: 0.1 }
      )

      const fixedSql = extractSQL(fixedResponse)

      if (fixedSql) {
        emit("sql", fixedSql)
        const fixedValidation = validateReadOnlySQL(fixedSql)
        if (!fixedValidation) {
          const retryResult = await executeQuery(handle.connection, fixedSql, {
            timeoutMs: 60_000,
            maxRows: 2000,
          })

          emit("result", {
            rows: retryResult.rows,
            totalRows: retryResult.totalRows,
            durationMs: retryResult.durationMs,
          })

          // Explain the retried results with chart recommendation
          emit("status", "Analyzing results...")
          const retrySample = JSON.stringify(retryResult.rows.slice(0, 30), null, 2)
          const retryRowCount = retryResult.totalRows === -1
            ? "more than 2,000"
            : String(retryResult.totalRows)
          const retryColumnNames = retryResult.rows.length > 0 ? Object.keys(retryResult.rows[0]) : []

          const { content: retryAnalysisJson } = await callAgentLLM(
            [
              {
                role: "system",
                content: `You are a data analyst. Given query results, provide:
1. A clear explanation in plain English (3-5 sentences). Highlight key numbers, trends, and business insights.
2. A chart recommendation if the data is suitable for visualization.

Return valid JSON: { "explanation": "...", "chart": { "type": "bar"|"line"|"pie"|"area", "xKey": "col", "yKeys": ["col"], "title": "..." } }
Set "chart" to null if not suitable. Available columns: ${JSON.stringify(retryColumnNames)}`,
              },
              {
                role: "user",
                content: `User's question: ${userMessage}\n\nSQL query: ${fixedSql}\n\nResults (${retryRowCount} rows):\n${retrySample}`,
              },
            ],
            { tier, maxTokens: 1000, temperature: 0.2, responseFormat: "json" }
          )

          let retryExplanation = ""
          let retryChartConfig: Record<string, unknown> | null = null
          try {
            const parsed = JSON.parse(retryAnalysisJson)
            retryExplanation = parsed.explanation || retryAnalysisJson
            if (parsed.chart && parsed.chart.type && parsed.chart.xKey && parsed.chart.yKeys) {
              retryChartConfig = parsed.chart
              emit("chart", retryChartConfig)
            }
          } catch {
            retryExplanation = retryAnalysisJson
          }

          emit("explanation", retryExplanation)

          const msg = await prisma.analysisMessage.create({
            data: {
              conversationId,
              role: "assistant",
              content: retryExplanation,
              generatedSql: fixedSql,
              queryResultJson: retryResult.rows as any,
              queryRowCount: retryResult.totalRows,
              queryDurationMs: retryResult.durationMs,
              chartConfig: retryChartConfig as any,
              model,
              tokensUsed,
              estimatedCostUsd: cost,
            },
          })

          emit("done", { messageId: msg.id })
          return msg
        }
      }
    } catch {
      // Self-correction also failed — fall through to error response
    }

    // Both attempts failed
    const errorContent = `I tried to query your data but encountered an error. Could you rephrase your question?\n\nError: ${sanitizeErrorMessage(queryError.message)}`
    const msg = await prisma.analysisMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: errorContent,
        generatedSql,
        queryError: sanitizeErrorMessage(queryError.message),
        model,
        tokensUsed,
        estimatedCostUsd: cost,
      },
    })
    emit("error", errorContent)
    emit("done", { messageId: msg.id })
    return msg
  } finally {
    handle.cleanup()
  }
}

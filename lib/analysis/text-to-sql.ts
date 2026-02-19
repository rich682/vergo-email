/**
 * Text-to-SQL Chat Service
 *
 * Handles the full chat flow:
 * 1. Build schema context from databases
 * 2. Smart model routing (gpt-4o for complex, gpt-4o-mini for simple)
 * 3. Call LLM to generate SQL (primary + optional context query)
 * 4. Execute SQL against DuckDB (read-only, with timeout)
 * 5. Self-correct on error (one retry)
 * 6. Rich narrative explanation + optional chart visualization
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
 * Extract SQL blocks from an LLM response.
 * Returns the primary SQL and an optional context SQL block.
 */
function extractSQLBlocks(response: string): { primary: string | null; context: string | null } {
  // Match all ```sql blocks, with optional "context" label
  const blocks = [...response.matchAll(/```sql\s*(context)?\s*\n([\s\S]*?)```/g)]
  let primary: string | null = null
  let context: string | null = null

  for (const match of blocks) {
    const isContext = match[1] === "context"
    const sql = match[2]?.trim() || null
    if (isContext && sql) {
      context = sql
    } else if (!primary && sql) {
      primary = sql
    }
  }

  return { primary, context }
}

/** Backward-compatible single SQL extraction */
function extractSQL(response: string): string | null {
  return extractSQLBlocks(response).primary
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
 * Generate a rich narrative explanation + optional chart recommendation.
 *
 * Shared by both the primary path and the retry path.
 */
async function generateExplanation(params: {
  userMessage: string
  sql: string
  result: { rows: Record<string, unknown>[]; totalRows: number; durationMs: number }
  contextRows: Record<string, unknown>[] | null
  tier: ModelTier
  emit: AnalysisEventCallback
}): Promise<{ explanation: string; chartConfig: Record<string, unknown> | null }> {
  const { userMessage, sql, result, contextRows, tier, emit } = params

  emit("status", "Analyzing results...")

  const resultSample = JSON.stringify(result.rows.slice(0, 30), null, 2)
  const rowCountDesc = result.totalRows === -1
    ? "more than 2,000"
    : String(result.totalRows)
  const columnNames = result.rows.length > 0 ? Object.keys(result.rows[0]) : []

  const contextSection = contextRows && contextRows.length > 0
    ? `\n\nBROADER CONTEXT (full distribution from a supplementary query — use this to provide fuller context in your explanation):\n${JSON.stringify(contextRows.slice(0, 50), null, 2)}`
    : ""

  const { content: analysisJson } = await callAgentLLM(
    [
      {
        role: "system",
        content: `You are a senior finance analyst briefing a CFO at a mid-market company. Your audience is experienced, time-poor, and values clarity over volume. Write in plain text only — no markdown, no asterisks, no bullet symbols.

STRUCTURE:
- Open with a clear, direct one-sentence answer to the question
- Then provide 2-4 short paragraphs of supporting analysis depending on complexity
- For comparisons/distributions: call out the top items by name and amount, then summarize the rest (e.g., "The remaining 10 vendors each have balances under $5,000")
- For simple lookups: 2-3 sentences is enough
- Close with a brief insight or takeaway when the data warrants it (concentration risk, trends, anomalies)

DATA FORMATTING:
- Format all dollar amounts with commas and 2 decimals (e.g., "$15,220.10" not "15220.1")
- Format counts with commas (e.g., "1,234 invoices")
- Use percentages where they add context (e.g., "Brandon represents 21% of total outstanding")
- Never repeat every row — synthesize and highlight what matters
- Tone: confident, precise, no filler

CHART RECOMMENDATION:
- Only recommend a chart when the data clearly benefits from visualization (comparisons of 3+ items, time trends, proportional breakdowns)
- Many questions are better answered with text alone — set chart to null in those cases
- Single-value results, text-only results, or results with only 1-2 rows usually don't need a chart

The result has ${rowCountDesc} rows with columns: ${JSON.stringify(columnNames)}.

Return valid JSON:
{
  "explanation": "Your narrative analysis here...",
  "chart": { "type": "bar"|"line"|"pie"|"area", "xKey": "col", "yKeys": ["col"], "title": "..." } or null
}

The xKey and yKeys MUST be actual column names from the result set. Available columns: ${JSON.stringify(columnNames)}`,
      },
      {
        role: "user",
        content: `User's question: ${userMessage}\n\nSQL query: ${sql}\n\nQuery results (${rowCountDesc} rows, ${result.durationMs}ms):\n${resultSample}${contextSection}`,
      },
    ],
    { tier, maxTokens: 2000, temperature: 0.3, responseFormat: "json" }
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
  return { explanation, chartConfig }
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

  // 6. Extract SQL from response (supports primary + optional context block)
  const { primary: generatedSql, context: contextSql } = extractSQLBlocks(llmResponse)
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

    // 8b. Execute optional context query for broader analysis
    let contextRows: Record<string, unknown>[] | null = null
    if (contextSql) {
      const ctxValidation = validateReadOnlySQL(contextSql)
      if (!ctxValidation) {
        try {
          const ctxResult = await executeQuery(handle.connection, contextSql, {
            timeoutMs: 30_000,
            maxRows: 500,
          })
          contextRows = ctxResult.rows
        } catch {
          // Context query failed — non-fatal, continue with primary results only
        }
      }
    }

    // 9. Rich narrative explanation + chart recommendation
    const { explanation, chartConfig } = await generateExplanation({
      userMessage,
      sql: generatedSql,
      result,
      contextRows,
      tier,
      emit,
    })

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

          // Use shared explanation helper for retry too
          const { explanation: retryExplanation, chartConfig: retryChartConfig } = await generateExplanation({
            userMessage,
            sql: fixedSql,
            result: retryResult,
            contextRows: null, // No context query on retry
            tier,
            emit,
          })

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

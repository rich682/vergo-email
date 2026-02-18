/**
 * Text-to-SQL Chat Service
 *
 * Handles the full chat flow:
 * 1. Build schema context from datasets
 * 2. Call LLM to generate SQL
 * 3. Execute SQL against DuckDB (read-only, with timeout)
 * 4. Self-correct on error (one retry)
 * 5. Explain results in plain English
 */

import { prisma } from "@/lib/prisma"
import { callAgentLLM } from "@/lib/agents/llm-client"
import { createOrgDuckDB, executeQuery, validateReadOnlySQL } from "./duckdb-manager"
import { buildSchemaContext, buildSystemPrompt } from "./schema-context"

interface ChatInput {
  conversationId: string
  userMessage: string
  organizationId: string
  userId: string
}

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
 * Handle a chat message: generate SQL, execute, explain.
 */
export async function handleAnalysisChat(input: ChatInput) {
  const { conversationId, userMessage, organizationId, userId } = input

  // 1. Load conversation + verify ownership
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

  // 2. Load datasets
  const datasetIds = conversation.datasetIds as string[]
  const datasets = await prisma.analysisDataset.findMany({
    where: {
      organizationId,
      status: "ready",
      ...(datasetIds.length > 0 ? { id: { in: datasetIds } } : {}),
    },
  })

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
  const datasetsForContext = datasets.map((ds) => ({
    tableName: ds.tableName,
    name: ds.name,
    schemaSnapshot: ds.schemaSnapshot as any,
    summaryStats: ds.summaryStats as any,
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

  // 5. Call LLM to generate SQL
  const { content: llmResponse, model, tokensUsed, cost } = await callAgentLLM(
    [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: userMessage },
    ],
    { tier: "tool", maxTokens: 2000, temperature: 0.1 }
  )

  // 6. Extract SQL from response
  const generatedSql = extractSQL(llmResponse)

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
    return msg
  }

  // 8. Execute SQL against DuckDB
  const datasetInfos = datasets
    .filter((ds) => ds.parquetBlobUrl)
    .map((ds) => ({
      tableName: ds.tableName,
      parquetUrl: ds.parquetBlobUrl!,
    }))

  if (datasetInfos.length === 0) {
    const msg = await prisma.analysisMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: "No datasets are available for querying. Please upload a dataset first.",
        model,
        tokensUsed,
        estimatedCostUsd: cost,
      },
    })
    return msg
  }

  const handle = await createOrgDuckDB(datasetInfos)

  try {
    const result = await executeQuery(handle.connection, generatedSql, {
      timeoutMs: 30_000,
      maxRows: 500,
    })

    // 9. Ask LLM to explain results
    const resultSample = JSON.stringify(result.rows.slice(0, 20), null, 2)
    const rowCountDesc = result.totalRows === -1
      ? "more than 500"
      : String(result.totalRows)

    const { content: explanation } = await callAgentLLM(
      [
        {
          role: "system",
          content: "You are a data analyst. Explain the following query results in plain English for a business user. Be concise (2-4 sentences). Highlight key numbers and trends. If the result has multiple rows, summarize the pattern rather than listing every row.",
        },
        {
          role: "user",
          content: `User's question: ${userMessage}\n\nSQL query: ${generatedSql}\n\nResults (${rowCountDesc} rows, took ${result.durationMs}ms):\n${resultSample}`,
        },
      ],
      { tier: "tool", maxTokens: 500, temperature: 0.2 }
    )

    const msg = await prisma.analysisMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: explanation,
        generatedSql,
        queryResultJson: result.rows as any,
        queryRowCount: result.totalRows,
        queryDurationMs: result.durationMs,
        model,
        tokensUsed,
        estimatedCostUsd: cost,
      },
    })
    return msg
  } catch (queryError: any) {
    // 10. Self-correction: let LLM fix the SQL (one retry)
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
        { tier: "tool", maxTokens: 2000, temperature: 0.1 }
      )

      const fixedSql = extractSQL(fixedResponse)

      if (fixedSql) {
        const fixedValidation = validateReadOnlySQL(fixedSql)
        if (!fixedValidation) {
          const retryResult = await executeQuery(handle.connection, fixedSql, {
            timeoutMs: 30_000,
            maxRows: 500,
          })

          // Explain the retried results
          const retrySample = JSON.stringify(retryResult.rows.slice(0, 20), null, 2)
          const retryRowCount = retryResult.totalRows === -1
            ? "more than 500"
            : String(retryResult.totalRows)

          const { content: retryExplanation } = await callAgentLLM(
            [
              {
                role: "system",
                content: "You are a data analyst. Explain the following query results in plain English for a business user. Be concise (2-4 sentences). Highlight key numbers and trends.",
              },
              {
                role: "user",
                content: `User's question: ${userMessage}\n\nSQL query: ${fixedSql}\n\nResults (${retryRowCount} rows):\n${retrySample}`,
              },
            ],
            { tier: "tool", maxTokens: 500, temperature: 0.2 }
          )

          const msg = await prisma.analysisMessage.create({
            data: {
              conversationId,
              role: "assistant",
              content: retryExplanation,
              generatedSql: fixedSql,
              queryResultJson: retryResult.rows as any,
              queryRowCount: retryResult.totalRows,
              queryDurationMs: retryResult.durationMs,
              model,
              tokensUsed,
              estimatedCostUsd: cost,
            },
          })
          return msg
        }
      }
    } catch {
      // Self-correction also failed — fall through to error response
    }

    // Both attempts failed
    const msg = await prisma.analysisMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: `I tried to query your data but encountered an error. Could you rephrase your question?\n\nError: ${sanitizeErrorMessage(queryError.message)}`,
        generatedSql,
        queryError: sanitizeErrorMessage(queryError.message),
        model,
        tokensUsed,
        estimatedCostUsd: cost,
      },
    })
    return msg
  } finally {
    handle.cleanup()
  }
}

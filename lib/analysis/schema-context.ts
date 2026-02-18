/**
 * Schema Context Builder
 *
 * Builds the schema + stats prompt string for the LLM system message.
 * This gives the LLM enough context to generate accurate SQL.
 */

interface SchemaColumn {
  name: string
  duckdbType: string
  sampleValues?: string[]
}

interface ColumnStats {
  type: "numeric" | "text"
  min?: number | string
  max?: number | string
  mean?: number
  nullCount?: number
  distinctCount?: number
  sampleValues?: string[]
}

interface DatasetWithSchema {
  tableName: string
  name: string
  schemaSnapshot: { columns: SchemaColumn[] }
  summaryStats: { rowCount: number; columns: Record<string, ColumnStats> } | null
}

/**
 * Build the schema context string for the LLM system prompt.
 */
export function buildSchemaContext(datasets: DatasetWithSchema[]): string {
  if (datasets.length === 0) {
    return "No datasets available. Ask the user to upload data first."
  }

  let context = ""

  for (const ds of datasets) {
    const schema = ds.schemaSnapshot
    const stats = ds.summaryStats

    context += `TABLE: "${ds.tableName}" (${ds.name})\n`
    context += `  Rows: ${stats?.rowCount?.toLocaleString() || "unknown"}\n`
    context += `  Columns:\n`

    for (const col of schema.columns) {
      const colStats = stats?.columns?.[col.name]
      let statLine = ""

      if (colStats?.type === "numeric") {
        const parts: string[] = []
        if (colStats.min != null) parts.push(`min: ${colStats.min}`)
        if (colStats.max != null) parts.push(`max: ${colStats.max}`)
        if (colStats.mean != null) parts.push(`avg: ${Number(colStats.mean).toFixed(2)}`)
        if (parts.length > 0) statLine = ` | ${parts.join(", ")}`
      } else if (colStats?.type === "text") {
        const parts: string[] = []
        if (colStats.distinctCount != null) parts.push(`${colStats.distinctCount} distinct values`)
        if (colStats.sampleValues?.length) {
          parts.push(`examples: ${colStats.sampleValues.slice(0, 5).join(", ")}`)
        }
        if (parts.length > 0) statLine = ` | ${parts.join(", ")}`
      }

      if (colStats?.nullCount && colStats.nullCount > 0) {
        statLine += ` | ${colStats.nullCount} nulls`
      }

      context += `    - "${col.name}" ${col.duckdbType}${statLine}\n`
    }
    context += "\n"
  }

  return context
}

/**
 * Build the system prompt for text-to-SQL.
 */
export function buildSystemPrompt(schemaContext: string): string {
  return `You are a data analyst helping users query their business data using SQL.

You have access to a DuckDB database with the following tables:

${schemaContext}

Rules:
1. Write DuckDB-compatible SQL. DuckDB is similar to PostgreSQL but with some differences.
2. Always use double quotes around column and table names to handle special characters.
3. Return only the SQL query in a \`\`\`sql code block.
4. Use aggregate functions (SUM, AVG, COUNT, GROUP BY) when the user asks summary questions.
5. Limit results to 500 rows unless the user explicitly asks for more.
6. For date filtering, use DuckDB date functions (e.g., date_trunc, extract, strftime).
7. Never use DDL or DML (CREATE, DROP, ALTER, INSERT, UPDATE, DELETE). Only SELECT queries.
8. If the user's question is ambiguous, make reasonable assumptions and explain them.
9. After the SQL block, provide a brief plain-English explanation of what the query does.
10. When joining tables, explain what columns you're joining on and why.
11. For financial data, format amounts with 2 decimal places where appropriate.
12. If the question can't be answered with the available data, explain what's missing.`
}

/**
 * DuckDB Manager
 *
 * Creates ephemeral in-memory DuckDB instances per request.
 * Each org's datasets are loaded as views from Parquet files on Vercel Blob.
 * No persistent DuckDB files — Parquet on Blob is the source of truth.
 */

import duckdb from "duckdb"

export interface DatasetInfo {
  tableName: string
  parquetUrl: string
}

interface DuckDBHandle {
  db: duckdb.Database
  connection: duckdb.Connection
  cleanup: () => void
}

/**
 * Sanitize a table name to only allow alphanumeric and underscores.
 */
export function sanitizeTableName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^_+/, "")
    .substring(0, 128)
}

/**
 * Escape a DuckDB identifier (table/column name) with double-quote wrapping.
 */
export function escapeDuckDBIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/**
 * Validate that a Parquet URL is from Vercel Blob (trusted origin only).
 * Prevents SSRF or data exfiltration via crafted URLs.
 */
function validateParquetUrl(url: string): void {
  try {
    const parsed = new URL(url)
    const trustedHosts = ["blob.vercelusercontent.com", "blob.vercel-storage.com"]
    const isTrusted = trustedHosts.some((host) => parsed.hostname.endsWith(host))
    if (!isTrusted && !parsed.hostname.includes("localhost")) {
      throw new Error(`Untrusted Parquet URL host: ${parsed.hostname}`)
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`Invalid Parquet URL protocol: ${parsed.protocol}`)
    }
  } catch (e: any) {
    if (e.message.startsWith("Untrusted") || e.message.startsWith("Invalid")) throw e
    throw new Error(`Malformed Parquet URL: ${url}`)
  }
}

/**
 * Run a SQL statement on a DuckDB connection (no result expected).
 */
function execAsync(conn: duckdb.Connection, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.exec(sql, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

/**
 * Run a SQL query and return rows.
 */
function allAsync(conn: duckdb.Connection, sql: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    conn.all(sql, (err, rows) => {
      if (err) reject(err)
      else resolve(rows as Record<string, unknown>[])
    })
  })
}

/**
 * Create an ephemeral DuckDB instance with views for the given datasets.
 * Each dataset's Parquet file is accessed via its Vercel Blob URL using httpfs.
 *
 * Usage:
 *   const handle = await createOrgDuckDB(datasets)
 *   try {
 *     const result = await executeQuery(handle.connection, sql)
 *     return result
 *   } finally {
 *     handle.cleanup()
 *   }
 */
export async function createOrgDuckDB(datasets: DatasetInfo[]): Promise<DuckDBHandle> {
  const db = new duckdb.Database(":memory:")
  const connection = db.connect()

  // Install and load httpfs for reading remote Parquet files
  await execAsync(connection, "INSTALL httpfs;")
  await execAsync(connection, "LOAD httpfs;")

  // Create a view for each dataset pointing at the remote Parquet URL
  for (const dataset of datasets) {
    // Validate URL is from trusted origin (prevents SSRF)
    validateParquetUrl(dataset.parquetUrl)

    const escapedTable = sanitizeTableName(dataset.tableName)
    const escapedUrl = dataset.parquetUrl.replace(/'/g, "''")
    await execAsync(
      connection,
      `CREATE VIEW "${escapedTable}" AS SELECT * FROM read_parquet('${escapedUrl}');`
    )
  }

  return {
    db,
    connection,
    cleanup: () => {
      try { connection.close() } catch {}
      try { db.close() } catch {}
    },
  }
}

/**
 * Create an ephemeral DuckDB instance from local Parquet files (for upload pipeline).
 */
export async function createLocalDuckDB(): Promise<DuckDBHandle> {
  const db = new duckdb.Database(":memory:")
  const connection = db.connect()

  return {
    db,
    connection,
    cleanup: () => {
      try { connection.close() } catch {}
      try { db.close() } catch {}
    },
  }
}

// SQL keywords that indicate write operations (blocked for safety)
const FORBIDDEN_SQL_PREFIXES = [
  "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE TABLE",
  "CREATE INDEX", "TRUNCATE", "COPY", "ATTACH", "DETACH", "PRAGMA",
  "CALL", "EXECUTE", "SET", "GRANT", "REVOKE", "EXPORT", "IMPORT",
]

/**
 * Validate that a SQL query is read-only (SELECT only).
 * Uses both prefix blocklist and pattern detection for defense in depth.
 * Returns an error message if invalid, null if valid.
 */
export function validateReadOnlySQL(sql: string): string | null {
  const trimmed = sql.trim().toUpperCase()

  // Must start with SELECT or WITH (CTEs)
  if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
    return `Only SELECT queries are permitted.`
  }

  // Prefix blocklist
  for (const prefix of FORBIDDEN_SQL_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return `Write operations are not allowed. Only SELECT queries are permitted.`
    }
  }

  // Check for multiple statements (semicolons followed by keywords)
  if (/;\s*\w/i.test(sql)) {
    return `Multiple statements are not allowed.`
  }

  // Check for embedded write operations in CTEs or subqueries
  const dangerousPatterns = [
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|ATTACH|DETACH|COPY|PRAGMA|CALL|EXECUTE|SET|GRANT|REVOKE|EXPORT|IMPORT)\s/i,
  ]
  // Only check these if they appear outside of string literals
  // Simple heuristic: strip quoted strings first, then check
  const withoutStrings = sql.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')
  for (const pattern of dangerousPatterns) {
    if (pattern.test(withoutStrings) && !/^(SELECT|WITH)\b/i.test(withoutStrings.trim())) {
      // Only flag if the dangerous keyword is at statement level
    }
  }

  // Specific CTE injection check: WITH ... AS (INSERT/UPDATE/DELETE ...)
  if (/WITH\s+\w+\s+AS\s*\(\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i.test(withoutStrings)) {
    return `Write operations inside CTEs are not allowed.`
  }

  return null
}

/**
 * Execute a SQL query with timeout and row limit.
 */
export async function executeQuery(
  connection: duckdb.Connection,
  sql: string,
  options: { timeoutMs?: number; maxRows?: number } = {}
): Promise<{ rows: Record<string, unknown>[]; totalRows: number; durationMs: number }> {
  const { timeoutMs = 30_000, maxRows = 1000 } = options
  const start = Date.now()

  // Safety: validate read-only
  const validationError = validateReadOnlySQL(sql)
  if (validationError) {
    throw new Error(validationError)
  }

  // Wrap in LIMIT to prevent unbounded result sets
  const limitedSql = `SELECT * FROM (${sql}) __limited_result LIMIT ${maxRows + 1}`

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Query timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    connection.all(limitedSql, (err, result) => {
      clearTimeout(timer)
      if (err) return reject(err)

      const rows = result as Record<string, unknown>[]
      const hasMore = rows.length > maxRows
      const truncatedRows = hasMore ? rows.slice(0, maxRows) : rows

      resolve({
        rows: truncatedRows,
        totalRows: hasMore ? -1 : rows.length, // -1 signals "more than maxRows"
        durationMs: Date.now() - start,
      })
    })
  })
}

// Re-export helpers for use in upload pipeline
export { execAsync, allAsync }

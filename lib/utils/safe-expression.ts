/**
 * Safe Expression Evaluator
 * 
 * A secure expression evaluator that does NOT use Function() or eval().
 * Supports basic arithmetic operations and variable references.
 * 
 * Supported operations:
 * - Numbers (integers and decimals)
 * - Arithmetic: +, -, *, /
 * - Parentheses for grouping
 * - Variable references (identifiers)
 * 
 * NOT supported (for security):
 * - Function calls (except aggregate functions handled separately)
 * - String operations
 * - Object access
 * - Any JavaScript code execution
 */

// ============================================
// Types
// ============================================

type TokenType = "number" | "identifier" | "operator" | "lparen" | "rparen" | "end"

interface Token {
  type: TokenType
  value: string | number
}

// ============================================
// Tokenizer
// ============================================

/**
 * Tokenize an expression string into tokens
 */
function tokenize(expression: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const expr = expression.trim()

  while (i < expr.length) {
    const char = expr[i]

    // Skip whitespace
    if (/\s/.test(char)) {
      i++
      continue
    }

    // Numbers (including decimals)
    if (/\d/.test(char) || (char === "." && /\d/.test(expr[i + 1]))) {
      let numStr = ""
      while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === ".")) {
        numStr += expr[i]
        i++
      }
      const num = parseFloat(numStr)
      if (isNaN(num)) {
        throw new Error(`Invalid number: ${numStr}`)
      }
      tokens.push({ type: "number", value: num })
      continue
    }

    // Identifiers (variable names)
    if (/[a-zA-Z_]/.test(char)) {
      let ident = ""
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        ident += expr[i]
        i++
      }
      tokens.push({ type: "identifier", value: ident })
      continue
    }

    // Operators
    if (["+", "-", "*", "/"].includes(char)) {
      tokens.push({ type: "operator", value: char })
      i++
      continue
    }

    // Parentheses
    if (char === "(") {
      tokens.push({ type: "lparen", value: "(" })
      i++
      continue
    }
    if (char === ")") {
      tokens.push({ type: "rparen", value: ")" })
      i++
      continue
    }

    // Unknown character
    throw new Error(`Unexpected character: ${char}`)
  }

  tokens.push({ type: "end", value: "" })
  return tokens
}

// ============================================
// Parser (Recursive Descent)
// ============================================

class Parser {
  private tokens: Token[]
  private pos: number
  private context: Record<string, number>

  constructor(tokens: Token[], context: Record<string, number>) {
    this.tokens = tokens
    this.pos = 0
    this.context = context
  }

  private current(): Token {
    return this.tokens[this.pos]
  }

  private consume(expectedType?: TokenType): Token {
    const token = this.current()
    if (expectedType && token.type !== expectedType) {
      throw new Error(`Expected ${expectedType}, got ${token.type}`)
    }
    this.pos++
    return token
  }

  // Expression = Term (('+' | '-') Term)*
  parseExpression(): number {
    let left = this.parseTerm()

    while (
      this.current().type === "operator" &&
      (this.current().value === "+" || this.current().value === "-")
    ) {
      const op = this.consume().value as string
      const right = this.parseTerm()
      if (op === "+") {
        left = left + right
      } else {
        left = left - right
      }
    }

    return left
  }

  // Term = Factor (('*' | '/') Factor)*
  private parseTerm(): number {
    let left = this.parseFactor()

    while (
      this.current().type === "operator" &&
      (this.current().value === "*" || this.current().value === "/")
    ) {
      const op = this.consume().value as string
      const right = this.parseFactor()
      if (op === "*") {
        left = left * right
      } else {
        if (right === 0) {
          throw new Error("Division by zero")
        }
        left = left / right
      }
    }

    return left
  }

  // Factor = Number | Identifier | '(' Expression ')' | '-' Factor
  private parseFactor(): number {
    const token = this.current()

    // Unary minus
    if (token.type === "operator" && token.value === "-") {
      this.consume()
      return -this.parseFactor()
    }

    // Unary plus (just consume it)
    if (token.type === "operator" && token.value === "+") {
      this.consume()
      return this.parseFactor()
    }

    // Number literal
    if (token.type === "number") {
      this.consume()
      return token.value as number
    }

    // Identifier (variable reference)
    if (token.type === "identifier") {
      this.consume()
      const name = token.value as string
      if (!(name in this.context)) {
        throw new Error(`Unknown variable: ${name}`)
      }
      return this.context[name]
    }

    // Parenthesized expression
    if (token.type === "lparen") {
      this.consume("lparen")
      const result = this.parseExpression()
      this.consume("rparen")
      return result
    }

    throw new Error(`Unexpected token: ${token.type} (${token.value})`)
  }
}

// ============================================
// Public API
// ============================================

/**
 * Safely evaluate a mathematical expression with variable substitution
 * 
 * @param expression - The expression string (e.g., "revenue * 0.1 + cost")
 * @param context - Variable values (e.g., { revenue: 1000, cost: 50 })
 * @returns The result or null if evaluation fails
 */
export function evaluateSafeExpression(
  expression: string,
  context: Record<string, number>
): number | null {
  try {
    if (!expression || expression.trim() === "") {
      return null
    }

    const tokens = tokenize(expression)
    const parser = new Parser(tokens, context)
    const result = parser.parseExpression()

    // Ensure we consumed all tokens
    if (parser["current"]().type !== "end") {
      throw new Error("Unexpected tokens after expression")
    }

    // Validate result
    if (typeof result !== "number" || !isFinite(result) || isNaN(result)) {
      return null
    }

    // Round to 6 decimal places to preserve precision for ratios (e.g. percent values)
    return Math.round(result * 1000000) / 1000000
  } catch (error) {
    // Return null for any parsing/evaluation errors
    return null
  }
}

// ============================================
// Aggregate Formula Parsing
// ============================================

export type AggregateFunction = "SUM" | "AVG" | "COUNT" | "MIN" | "MAX"
export type AggregateContext = "current" | "compare"

export interface AggregateCall {
  fn: AggregateFunction
  context: AggregateContext
  column: string
}

/**
 * Parse an aggregate expression like "SUM(current.revenue)" or "AVG(compare.cost)"
 * Returns null if not a valid aggregate expression
 */
export function parseAggregateExpression(expr: string): AggregateCall | null {
  const trimmed = expr.trim().toUpperCase()
  
  // Pattern: FUNCTION(context.column)
  const match = trimmed.match(/^(SUM|AVG|COUNT|MIN|MAX)\s*\(\s*(CURRENT|COMPARE)\s*\.\s*([A-Z0-9_]+)\s*\)$/i)
  
  if (!match) return null

  return {
    fn: match[1].toUpperCase() as AggregateFunction,
    context: match[2].toLowerCase() as AggregateContext,
    column: match[3].toLowerCase(),
  }
}

/**
 * Parse a simple aggregate expression like "SUM(revenue)" (defaults to current context)
 */
export function parseSimpleAggregateExpression(expr: string): { fn: AggregateFunction; column: string } | null {
  const trimmed = expr.trim()
  
  // Pattern: FUNCTION(column)
  const match = trimmed.match(/^(SUM|AVG|COUNT|MIN|MAX)\s*\(\s*([a-zA-Z0-9_]+)\s*\)$/i)
  
  if (!match) return null

  return {
    fn: match[1].toUpperCase() as AggregateFunction,
    column: match[2].toLowerCase(),
  }
}

/**
 * Parse a numeric value that might be a currency string
 */
export function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return isFinite(value) ? value : null
  }
  if (typeof value === "string") {
    let str = value.trim()
    // Handle accounting format: ($1,234.56) or (1,234.56) → negative
    const isAccounting = /^\(.*\)$/.test(str)
    if (isAccounting) {
      str = str.slice(1, -1) // Remove parentheses
    }
    // Remove currency symbols, commas, and whitespace
    const cleaned = str.replace(/[$£€¥,\s]/g, "")
    if (cleaned === "") return null
    const num = Number(cleaned)
    if (!isFinite(num)) return null
    return isAccounting ? -num : num
  }
  return null
}

/**
 * Compute an aggregate function over an array of values
 */
export function computeAggregate(
  fn: AggregateFunction,
  values: number[]
): number | null {
  if (values.length === 0) return null

  switch (fn) {
    case "SUM":
      return Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100
    case "AVG":
      return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
    case "COUNT":
      return values.length
    case "MIN":
      return Math.min(...values)
    case "MAX":
      return Math.max(...values)
    default:
      return null
  }
}

/**
 * Extract numeric values for a column from rows
 */
export function extractColumnValues(
  rows: Array<Record<string, unknown>>,
  columnKey: string
): number[] {
  const values: number[] = []
  for (const row of rows) {
    const num = parseNumericValue(row[columnKey])
    if (num !== null) {
      values.push(num)
    }
  }
  return values
}

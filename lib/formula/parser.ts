/**
 * Formula Parser
 *
 * Tokenizes and parses formula expressions into an AST.
 *
 * Supports:
 * - Column references: {Column Name} or {Sheet Name.Column Name}
 * - Number literals: 42, 3.14, -5
 * - Operators: +, -, *, /
 * - Functions: SUM, AVERAGE, COUNT, MIN, MAX
 * - Parentheses for grouping
 *
 * Grammar (simplified):
 *   expression -> term (('+' | '-') term)*
 *   term       -> factor (('*' | '/') factor)*
 *   factor     -> unary | primary
 *   unary      -> '-' factor | primary
 *   primary    -> NUMBER | COLUMN_REF | function_call | '(' expression ')'
 *   function   -> FUNCTION '(' arguments ')'
 *   arguments  -> expression (',' expression)*
 */

import type {
  Token,
  TokenType,
  ASTNode,
  ColumnRefNode,
  FunctionCallNode,
  BinaryOpNode,
  UnaryOpNode,
  GroupNode,
  NumberNode,
  FormulaRef,
  ParseResult,
} from "./types"
import { isSupportedFunction } from "./types"

// ============================================
// Lexer (Tokenizer)
// ============================================

/**
 * Tokenize a formula expression into tokens.
 */
export function tokenize(expression: string): Token[] {
  const tokens: Token[] = []
  let pos = 0

  while (pos < expression.length) {
    const char = expression[pos]

    // Skip whitespace
    if (/\s/.test(char)) {
      pos++
      continue
    }

    // Single-character tokens
    if (char === "+") {
      tokens.push({ type: "PLUS", value: "+", position: pos })
      pos++
      continue
    }
    if (char === "-") {
      tokens.push({ type: "MINUS", value: "-", position: pos })
      pos++
      continue
    }
    if (char === "*") {
      tokens.push({ type: "STAR", value: "*", position: pos })
      pos++
      continue
    }
    if (char === "/") {
      tokens.push({ type: "SLASH", value: "/", position: pos })
      pos++
      continue
    }
    if (char === "(") {
      tokens.push({ type: "LPAREN", value: "(", position: pos })
      pos++
      continue
    }
    if (char === ")") {
      tokens.push({ type: "RPAREN", value: ")", position: pos })
      pos++
      continue
    }
    if (char === ",") {
      tokens.push({ type: "COMMA", value: ",", position: pos })
      pos++
      continue
    }

    // Column reference: {Column Name} or {Sheet.Column}
    if (char === "{") {
      const startPos = pos
      pos++ // Skip opening brace
      let refContent = ""
      
      while (pos < expression.length && expression[pos] !== "}") {
        refContent += expression[pos]
        pos++
      }
      
      if (pos >= expression.length) {
        throw new Error(`Unclosed column reference at position ${startPos}`)
      }
      
      pos++ // Skip closing brace
      tokens.push({ type: "COLUMN_REF", value: refContent.trim(), position: startPos })
      continue
    }

    // Number literal
    if (/[0-9]/.test(char) || (char === "." && pos + 1 < expression.length && /[0-9]/.test(expression[pos + 1]))) {
      const startPos = pos
      let numStr = ""
      
      while (pos < expression.length && /[0-9.]/.test(expression[pos])) {
        numStr += expression[pos]
        pos++
      }
      
      const num = parseFloat(numStr)
      if (isNaN(num)) {
        throw new Error(`Invalid number "${numStr}" at position ${startPos}`)
      }
      
      tokens.push({ type: "NUMBER", value: num, position: startPos })
      continue
    }

    // Function name (alphabetic identifier)
    if (/[a-zA-Z]/.test(char)) {
      const startPos = pos
      let name = ""
      
      while (pos < expression.length && /[a-zA-Z_]/.test(expression[pos])) {
        name += expression[pos]
        pos++
      }
      
      tokens.push({ type: "FUNCTION", value: name.toUpperCase(), position: startPos })
      continue
    }

    throw new Error(`Unexpected character "${char}" at position ${pos}`)
  }

  tokens.push({ type: "EOF", value: "", position: pos })
  return tokens
}

// ============================================
// Parser
// ============================================

class Parser {
  private tokens: Token[]
  private pos: number
  private references: FormulaRef[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
    this.pos = 0
    this.references = []
  }

  private current(): Token {
    return this.tokens[this.pos]
  }

  private advance(): Token {
    const token = this.current()
    if (token.type !== "EOF") {
      this.pos++
    }
    return token
  }

  private expect(type: TokenType): Token {
    const token = this.current()
    if (token.type !== type) {
      throw new Error(`Expected ${type} but got ${token.type} at position ${token.position}`)
    }
    return this.advance()
  }

  private match(...types: TokenType[]): boolean {
    return types.includes(this.current().type)
  }

  /**
   * Parse the entire expression.
   */
  parse(): { ast: ASTNode; references: FormulaRef[] } {
    const ast = this.expression()
    
    if (this.current().type !== "EOF") {
      throw new Error(`Unexpected token "${this.current().value}" at position ${this.current().position}`)
    }
    
    return { ast, references: this.references }
  }

  /**
   * expression -> term (('+' | '-') term)*
   */
  private expression(): ASTNode {
    let left = this.term()

    while (this.match("PLUS", "MINUS")) {
      const opToken = this.advance()
      const operator = opToken.value as "+" | "-"
      const right = this.term()
      left = {
        type: "binary_op",
        operator,
        left,
        right,
      } as BinaryOpNode
    }

    return left
  }

  /**
   * term -> factor (('*' | '/') factor)*
   */
  private term(): ASTNode {
    let left = this.factor()

    while (this.match("STAR", "SLASH")) {
      const opToken = this.advance()
      const operator = opToken.value as "*" | "/"
      const right = this.factor()
      left = {
        type: "binary_op",
        operator,
        left,
        right,
      } as BinaryOpNode
    }

    return left
  }

  /**
   * factor -> unary | primary
   */
  private factor(): ASTNode {
    // Unary minus
    if (this.match("MINUS")) {
      this.advance()
      const operand = this.factor()
      return {
        type: "unary_op",
        operator: "-",
        operand,
      } as UnaryOpNode
    }

    return this.primary()
  }

  /**
   * primary -> NUMBER | COLUMN_REF | function_call | '(' expression ')'
   */
  private primary(): ASTNode {
    const token = this.current()

    // Number literal
    if (token.type === "NUMBER") {
      this.advance()
      return {
        type: "number",
        value: token.value as number,
      } as NumberNode
    }

    // Column reference
    if (token.type === "COLUMN_REF") {
      this.advance()
      return this.parseColumnRef(token.value as string, token.position)
    }

    // Function call or identifier
    if (token.type === "FUNCTION") {
      const name = token.value as string
      this.advance()

      // Must be followed by (
      if (!this.match("LPAREN")) {
        throw new Error(`Expected '(' after function name "${name}" at position ${this.current().position}`)
      }

      return this.functionCall(name)
    }

    // Parenthesized expression
    if (token.type === "LPAREN") {
      this.advance()
      const expr = this.expression()
      this.expect("RPAREN")
      return {
        type: "group",
        expression: expr,
      } as GroupNode
    }

    throw new Error(`Unexpected token "${token.value}" at position ${token.position}`)
  }

  /**
   * Parse a column reference: "Column Name" or "Sheet.Column Name"
   */
  private parseColumnRef(content: string, position: number): ColumnRefNode {
    let sheetLabel: string | null = null
    let columnName: string

    // Check for sheet.column syntax
    const dotIndex = content.indexOf(".")
    if (dotIndex !== -1) {
      sheetLabel = content.substring(0, dotIndex).trim()
      columnName = content.substring(dotIndex + 1).trim()
    } else {
      columnName = content.trim()
    }

    if (!columnName) {
      throw new Error(`Empty column name in reference at position ${position}`)
    }

    // Add to references list
    const ref: FormulaRef = {
      sheetId: null, // Will be resolved during evaluation
      sheetLabel,
      columnKey: columnName, // Will be resolved to key during evaluation
      displayName: `{${content}}`,
    }
    this.references.push(ref)

    return {
      type: "column_ref",
      sheetLabel,
      columnName,
      raw: `{${content}}`,
    }
  }

  /**
   * Parse a function call: FUNCTION(args)
   */
  private functionCall(name: string): FunctionCallNode {
    if (!isSupportedFunction(name)) {
      throw new Error(`Unknown function "${name}". Supported: SUM, AVERAGE, COUNT, MIN, MAX`)
    }

    this.expect("LPAREN")
    const args: ASTNode[] = []

    // Handle empty argument list
    if (!this.match("RPAREN")) {
      args.push(this.expression())

      while (this.match("COMMA")) {
        this.advance()
        args.push(this.expression())
      }
    }

    this.expect("RPAREN")

    return {
      type: "function_call",
      name,
      args,
    }
  }
}

// ============================================
// Public API
// ============================================

/**
 * Parse a formula expression into an AST.
 *
 * @param expression The formula expression (e.g., "{Revenue} - {Cost}")
 * @returns ParseResult with AST and references, or error
 */
export function parseFormula(expression: string): ParseResult {
  try {
    if (!expression || !expression.trim()) {
      return { ok: false, error: "Formula expression is empty" }
    }

    const tokens = tokenize(expression)
    const parser = new Parser(tokens)
    const { ast, references } = parser.parse()

    return { ok: true, ast, references }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown parse error"
    return { ok: false, error: message }
  }
}

/**
 * Validate a formula expression without full parsing.
 * Checks basic syntax like balanced braces.
 *
 * @param expression The formula expression
 * @returns Error message or null if valid
 */
export function validateFormulaSyntax(expression: string): string | null {
  if (!expression || !expression.trim()) {
    return "Formula expression is empty"
  }

  // Check balanced braces
  let braceCount = 0
  for (let i = 0; i < expression.length; i++) {
    if (expression[i] === "{") braceCount++
    if (expression[i] === "}") braceCount--
    if (braceCount < 0) {
      return `Unexpected '}' at position ${i}`
    }
  }
  if (braceCount > 0) {
    return "Unclosed column reference '{'"}

  // Check balanced parentheses
  let parenCount = 0
  for (let i = 0; i < expression.length; i++) {
    if (expression[i] === "(") parenCount++
    if (expression[i] === ")") parenCount--
    if (parenCount < 0) {
      return `Unexpected ')' at position ${i}`
    }
  }
  if (parenCount > 0) {
    return "Unclosed parenthesis '('"
  }

  return null
}

/**
 * Extract column references from a formula expression.
 * Useful for dependency tracking without full parsing.
 *
 * @param expression The formula expression
 * @returns Array of column references (raw strings like "Column Name" or "Sheet.Column")
 */
export function extractColumnReferences(expression: string): string[] {
  const refs: string[] = []
  const regex = /\{([^}]+)\}/g
  let match

  while ((match = regex.exec(expression)) !== null) {
    refs.push(match[1].trim())
  }

  return refs
}

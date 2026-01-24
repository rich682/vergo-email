/**
 * Excel-Style Cell Formula Parser
 *
 * Parses A1-style cell references and formulas:
 * - Cell references: A1, B5, AA100
 * - Absolute references: $A$1, A$1, $A1
 * - Ranges: A1:H1, $A$1:$H$10
 * - Cross-sheet: 'Sheet Name'!A1
 * - Functions: SUM, AVERAGE, COUNT, MIN, MAX
 * - Operators: +, -, *, /
 */

// ============================================
// Types
// ============================================

export interface CellRef {
  col: number      // 0-indexed column number
  row: number      // 0-indexed row number (Excel uses 1-indexed, we convert)
  absCol: boolean  // $ before column letter
  absRow: boolean  // $ before row number
  sheet?: string   // Sheet name for cross-sheet references
}

export interface CellRange {
  start: CellRef
  end: CellRef
}

export type CellFormulaNode =
  | { type: "number"; value: number }
  | { type: "cell_ref"; ref: CellRef }
  | { type: "range"; range: CellRange }
  | { type: "binary_op"; operator: "+" | "-" | "*" | "/"; left: CellFormulaNode; right: CellFormulaNode }
  | { type: "unary_op"; operator: "-"; operand: CellFormulaNode }
  | { type: "function_call"; name: string; args: CellFormulaNode[] }
  | { type: "group"; expression: CellFormulaNode }

export type ParseResult =
  | { ok: true; ast: CellFormulaNode }
  | { ok: false; error: string }

// ============================================
// Column/Letter Conversion
// ============================================

/**
 * Convert 0-indexed column number to Excel column letters.
 * 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB, etc.
 */
export function columnToLetter(col: number): string {
  let result = ""
  let n = col
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

/**
 * Convert Excel column letters to 0-indexed column number.
 * A -> 0, Z -> 25, AA -> 26, AB -> 27, etc.
 */
export function letterToColumn(letters: string): number {
  let result = 0
  for (let i = 0; i < letters.length; i++) {
    result = result * 26 + (letters.charCodeAt(i) - 64)
  }
  return result - 1
}

/**
 * Format a cell reference to A1 notation.
 */
export function formatCellRef(ref: CellRef): string {
  const colStr = ref.absCol ? "$" + columnToLetter(ref.col) : columnToLetter(ref.col)
  const rowStr = ref.absRow ? "$" + (ref.row + 1) : String(ref.row + 1)
  const sheetPrefix = ref.sheet ? `'${ref.sheet}'!` : ""
  return sheetPrefix + colStr + rowStr
}

/**
 * Adjust a cell reference when copying (for relative references).
 */
export function adjustCellRef(ref: CellRef, colDelta: number, rowDelta: number): CellRef {
  return {
    col: ref.absCol ? ref.col : ref.col + colDelta,
    row: ref.absRow ? ref.row : ref.row + rowDelta,
    absCol: ref.absCol,
    absRow: ref.absRow,
    sheet: ref.sheet,
  }
}

// ============================================
// Lexer
// ============================================

type Token =
  | { type: "NUMBER"; value: number }
  | { type: "CELL_REF"; col: string; row: number; absCol: boolean; absRow: boolean; sheet?: string }
  | { type: "COLON" }
  | { type: "PLUS" }
  | { type: "MINUS" }
  | { type: "STAR" }
  | { type: "SLASH" }
  | { type: "LPAREN" }
  | { type: "RPAREN" }
  | { type: "COMMA" }
  | { type: "FUNCTION"; name: string }
  | { type: "EOF" }

function tokenize(formula: string): Token[] | { error: string } {
  const tokens: Token[] = []
  let pos = 0
  
  // Skip the leading = sign
  if (formula.startsWith("=")) {
    pos = 1
  }
  
  while (pos < formula.length) {
    const char = formula[pos]
    
    // Skip whitespace
    if (/\s/.test(char)) {
      pos++
      continue
    }
    
    // Number
    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(formula[pos + 1] || ""))) {
      let numStr = ""
      while (pos < formula.length && /[0-9.]/.test(formula[pos])) {
        numStr += formula[pos]
        pos++
      }
      tokens.push({ type: "NUMBER", value: parseFloat(numStr) })
      continue
    }
    
    // Operators and punctuation
    if (char === "+") { tokens.push({ type: "PLUS" }); pos++; continue }
    if (char === "-") { tokens.push({ type: "MINUS" }); pos++; continue }
    if (char === "*") { tokens.push({ type: "STAR" }); pos++; continue }
    if (char === "/") { tokens.push({ type: "SLASH" }); pos++; continue }
    if (char === "(") { tokens.push({ type: "LPAREN" }); pos++; continue }
    if (char === ")") { tokens.push({ type: "RPAREN" }); pos++; continue }
    if (char === ",") { tokens.push({ type: "COMMA" }); pos++; continue }
    if (char === ":") { tokens.push({ type: "COLON" }); pos++; continue }
    
    // Cross-sheet reference: 'Sheet Name'!A1
    if (char === "'") {
      pos++ // skip opening quote
      let sheetName = ""
      while (pos < formula.length && formula[pos] !== "'") {
        sheetName += formula[pos]
        pos++
      }
      if (pos >= formula.length) {
        return { error: "Unterminated sheet name string" }
      }
      pos++ // skip closing quote
      
      // Expect !
      if (formula[pos] !== "!") {
        return { error: "Expected ! after sheet name" }
      }
      pos++ // skip !
      
      // Now parse the cell reference
      const cellResult = parseCellRefToken(formula, pos)
      if ("error" in cellResult) {
        return cellResult
      }
      tokens.push({ ...cellResult.token, sheet: sheetName })
      pos = cellResult.newPos
      continue
    }
    
    // Cell reference or function name: starts with $ or letter
    if (char === "$" || /[A-Za-z]/.test(char)) {
      // Check if this is a function (followed by opening paren)
      let lookAhead = pos
      let identifier = ""
      
      // Skip $ for cell refs
      if (formula[lookAhead] === "$") lookAhead++
      
      while (lookAhead < formula.length && /[A-Za-z]/.test(formula[lookAhead])) {
        identifier += formula[lookAhead]
        lookAhead++
      }
      
      // Skip $ and numbers for cell refs
      if (formula[lookAhead] === "$") lookAhead++
      while (lookAhead < formula.length && /[0-9]/.test(formula[lookAhead])) {
        lookAhead++
      }
      
      // Check if next non-whitespace is (
      let checkPos = lookAhead
      while (checkPos < formula.length && /\s/.test(formula[checkPos])) {
        checkPos++
      }
      
      // If identifier followed by ( and no numbers in between, it's a function
      if (formula[checkPos] === "(" && !/[0-9$]/.test(formula.slice(pos + (formula[pos] === "$" ? 1 : 0), lookAhead).slice(identifier.length))) {
        tokens.push({ type: "FUNCTION", name: identifier.toUpperCase() })
        pos += identifier.length
        continue
      }
      
      // Otherwise it's a cell reference
      const cellResult = parseCellRefToken(formula, pos)
      if ("error" in cellResult) {
        return cellResult
      }
      tokens.push(cellResult.token)
      pos = cellResult.newPos
      continue
    }
    
    return { error: `Unexpected character: ${char}` }
  }
  
  tokens.push({ type: "EOF" })
  return tokens
}

function parseCellRefToken(formula: string, pos: number): { token: Token; newPos: number } | { error: string } {
  let absCol = false
  let absRow = false
  let colLetters = ""
  let rowNum = ""
  
  // Check for $ before column
  if (formula[pos] === "$") {
    absCol = true
    pos++
  }
  
  // Parse column letters
  while (pos < formula.length && /[A-Za-z]/.test(formula[pos])) {
    colLetters += formula[pos].toUpperCase()
    pos++
  }
  
  if (colLetters.length === 0) {
    return { error: "Expected column letters in cell reference" }
  }
  
  // Check for $ before row
  if (formula[pos] === "$") {
    absRow = true
    pos++
  }
  
  // Parse row number
  while (pos < formula.length && /[0-9]/.test(formula[pos])) {
    rowNum += formula[pos]
    pos++
  }
  
  if (rowNum.length === 0) {
    return { error: "Expected row number in cell reference" }
  }
  
  return {
    token: {
      type: "CELL_REF",
      col: colLetters,
      row: parseInt(rowNum, 10),
      absCol,
      absRow,
    },
    newPos: pos,
  }
}

// ============================================
// Parser
// ============================================

class Parser {
  private tokens: Token[]
  private pos: number = 0
  
  constructor(tokens: Token[]) {
    this.tokens = tokens
  }
  
  private current(): Token {
    return this.tokens[this.pos] || { type: "EOF" }
  }
  
  private advance(): Token {
    const token = this.current()
    this.pos++
    return token
  }
  
  private expect(type: Token["type"]): Token {
    const token = this.current()
    if (token.type !== type) {
      throw new Error(`Expected ${type} but got ${token.type}`)
    }
    return this.advance()
  }
  
  parse(): CellFormulaNode {
    const result = this.parseExpression()
    if (this.current().type !== "EOF") {
      throw new Error(`Unexpected token: ${this.current().type}`)
    }
    return result
  }
  
  private parseExpression(): CellFormulaNode {
    return this.parseAddSub()
  }
  
  private parseAddSub(): CellFormulaNode {
    let left = this.parseMulDiv()
    
    while (this.current().type === "PLUS" || this.current().type === "MINUS") {
      const op = this.advance().type === "PLUS" ? "+" : "-"
      const right = this.parseMulDiv()
      left = { type: "binary_op", operator: op, left, right }
    }
    
    return left
  }
  
  private parseMulDiv(): CellFormulaNode {
    let left = this.parseUnary()
    
    while (this.current().type === "STAR" || this.current().type === "SLASH") {
      const op = this.advance().type === "STAR" ? "*" : "/"
      const right = this.parseUnary()
      left = { type: "binary_op", operator: op, left, right }
    }
    
    return left
  }
  
  private parseUnary(): CellFormulaNode {
    if (this.current().type === "MINUS") {
      this.advance()
      const operand = this.parseUnary()
      return { type: "unary_op", operator: "-", operand }
    }
    return this.parsePrimary()
  }
  
  private parsePrimary(): CellFormulaNode {
    const token = this.current()
    
    // Number
    if (token.type === "NUMBER") {
      this.advance()
      return { type: "number", value: token.value }
    }
    
    // Function call
    if (token.type === "FUNCTION") {
      const name = token.name
      this.advance()
      this.expect("LPAREN")
      
      const args: CellFormulaNode[] = []
      if (this.current().type !== "RPAREN") {
        args.push(this.parseExpression())
        while (this.current().type === "COMMA") {
          this.advance()
          args.push(this.parseExpression())
        }
      }
      
      this.expect("RPAREN")
      return { type: "function_call", name, args }
    }
    
    // Cell reference (possibly with range)
    if (token.type === "CELL_REF") {
      const startRef = this.parseCellRef(token)
      this.advance()
      
      // Check for range
      if (this.current().type === "COLON") {
        this.advance()
        const endToken = this.current()
        if (endToken.type !== "CELL_REF") {
          throw new Error("Expected cell reference after :")
        }
        const endRef = this.parseCellRef(endToken)
        this.advance()
        return { type: "range", range: { start: startRef, end: endRef } }
      }
      
      return { type: "cell_ref", ref: startRef }
    }
    
    // Grouped expression
    if (token.type === "LPAREN") {
      this.advance()
      const expr = this.parseExpression()
      this.expect("RPAREN")
      return { type: "group", expression: expr }
    }
    
    throw new Error(`Unexpected token: ${token.type}`)
  }
  
  private parseCellRef(token: Extract<Token, { type: "CELL_REF" }>): CellRef {
    return {
      col: letterToColumn(token.col),
      row: token.row - 1, // Convert to 0-indexed
      absCol: token.absCol,
      absRow: token.absRow,
      sheet: token.sheet,
    }
  }
}

// ============================================
// Public API
// ============================================

/**
 * Parse an Excel-style formula string into an AST.
 */
export function parseCellFormula(formula: string): ParseResult {
  try {
    const tokens = tokenize(formula)
    if ("error" in tokens) {
      return { ok: false, error: tokens.error }
    }
    
    const parser = new Parser(tokens)
    const ast = parser.parse()
    return { ok: true, ast }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Parse error" }
  }
}

/**
 * Check if a string looks like a formula (starts with =).
 */
export function isFormula(value: string): boolean {
  return value.trim().startsWith("=")
}

/**
 * Extract all cell references from a formula AST.
 */
export function extractCellRefs(ast: CellFormulaNode): CellRef[] {
  const refs: CellRef[] = []
  
  function visit(node: CellFormulaNode) {
    switch (node.type) {
      case "cell_ref":
        refs.push(node.ref)
        break
      case "range":
        refs.push(node.range.start)
        refs.push(node.range.end)
        break
      case "binary_op":
        visit(node.left)
        visit(node.right)
        break
      case "unary_op":
        visit(node.operand)
        break
      case "function_call":
        node.args.forEach(visit)
        break
      case "group":
        visit(node.expression)
        break
    }
  }
  
  visit(ast)
  return refs
}

/**
 * Adjust all relative references in a formula AST when copying.
 */
export function adjustFormulaRefs(ast: CellFormulaNode, colDelta: number, rowDelta: number): CellFormulaNode {
  switch (ast.type) {
    case "number":
      return ast
    case "cell_ref":
      return { type: "cell_ref", ref: adjustCellRef(ast.ref, colDelta, rowDelta) }
    case "range":
      return {
        type: "range",
        range: {
          start: adjustCellRef(ast.range.start, colDelta, rowDelta),
          end: adjustCellRef(ast.range.end, colDelta, rowDelta),
        },
      }
    case "binary_op":
      return {
        type: "binary_op",
        operator: ast.operator,
        left: adjustFormulaRefs(ast.left, colDelta, rowDelta),
        right: adjustFormulaRefs(ast.right, colDelta, rowDelta),
      }
    case "unary_op":
      return {
        type: "unary_op",
        operator: ast.operator,
        operand: adjustFormulaRefs(ast.operand, colDelta, rowDelta),
      }
    case "function_call":
      return {
        type: "function_call",
        name: ast.name,
        args: ast.args.map(arg => adjustFormulaRefs(arg, colDelta, rowDelta)),
      }
    case "group":
      return {
        type: "group",
        expression: adjustFormulaRefs(ast.expression, colDelta, rowDelta),
      }
  }
}

/**
 * Convert an AST back to formula string.
 */
export function astToFormula(ast: CellFormulaNode): string {
  switch (ast.type) {
    case "number":
      return String(ast.value)
    case "cell_ref":
      return formatCellRef(ast.ref)
    case "range":
      return `${formatCellRef(ast.range.start)}:${formatCellRef(ast.range.end)}`
    case "binary_op":
      return `${astToFormula(ast.left)}${ast.operator}${astToFormula(ast.right)}`
    case "unary_op":
      return `-${astToFormula(ast.operand)}`
    case "function_call":
      return `${ast.name}(${ast.args.map(astToFormula).join(",")})`
    case "group":
      return `(${astToFormula(ast.expression)})`
  }
}

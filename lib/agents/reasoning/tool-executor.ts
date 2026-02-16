/**
 * Tool Executor
 *
 * Routes tool calls from the reasoning loop to existing services.
 * Each tool wraps an existing Vergo service as a consumer.
 */

import type { ToolContext, ToolResult, ToolDefinition } from "../types"

// Tool registry — populated by tool definition files
const toolRegistry = new Map<string, ToolDefinition>()

/**
 * Register a tool for use by agents.
 */
export function registerTool(tool: ToolDefinition): void {
  toolRegistry.set(tool.name, tool)
}

/**
 * Execute a tool by name with the given input and context.
 */
export async function executeTool(
  toolName: string,
  toolInput: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const tool = toolRegistry.get(toolName)

  if (!tool) {
    return {
      success: false,
      error: `Unknown tool: ${toolName}. Available tools: ${Array.from(toolRegistry.keys()).join(", ")}`,
    }
  }

  const startTime = Date.now()

  try {
    const result = await tool.handler(toolInput, context)
    return {
      ...result,
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    console.error(`[Tool Executor] Error executing tool ${toolName}:`, error)
    return {
      success: false,
      error: `Tool ${toolName} failed: ${(error as Error).message}`,
      durationMs: Date.now() - startTime,
    }
  }
}

/**
 * Get descriptions of all registered tools for the LLM system prompt.
 */
export function getToolDescriptions(): string {
  const tools = Array.from(toolRegistry.values())
  return tools
    .map(t => `- ${t.name}: ${t.description}`)
    .join("\n")
}

/**
 * Get list of registered tool names.
 */
export function getRegisteredToolNames(): string[] {
  return Array.from(toolRegistry.keys())
}

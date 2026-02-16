/**
 * Agent Definition Service
 *
 * CRUD operations for AgentDefinition (configured agents).
 */

import { prisma } from "@/lib/prisma"
import type { AgentTaskType, AgentSettings } from "./types"

interface CreateAgentInput {
  organizationId: string
  createdById: string
  taskType?: AgentTaskType | null
  name: string
  description?: string
  configId?: string
  configType?: string
  settings?: AgentSettings
}

interface UpdateAgentInput {
  name?: string
  description?: string
  settings?: AgentSettings
  isActive?: boolean
}

export class AgentDefinitionService {
  /**
   * Create a new agent definition.
   */
  static async create(input: CreateAgentInput) {
    return prisma.agentDefinition.create({
      data: {
        organizationId: input.organizationId,
        createdById: input.createdById,
        taskType: input.taskType || null,
        name: input.name,
        description: input.description || null,
        configId: input.configId || null,
        configType: input.configType || null,
        settings: (input.settings || {}) as any,
      },
    })
  }

  /**
   * List agents for an organization.
   */
  static async list(organizationId: string) {
    const agents = await prisma.agentDefinition.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        executions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            completedAt: true,
            createdAt: true,
            outcome: true,
          },
        },
        _count: { select: { executions: true, memories: true } },
      },
    })

    return agents
  }

  /**
   * Get a single agent by ID.
   */
  static async getById(id: string, organizationId: string) {
    return prisma.agentDefinition.findFirst({
      where: { id, organizationId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { executions: true, memories: true } },
      },
    })
  }

  /**
   * Update an agent definition.
   */
  static async update(id: string, organizationId: string, input: UpdateAgentInput) {
    return prisma.agentDefinition.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.settings !== undefined && { settings: input.settings as any }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    })
  }

  /**
   * Delete an agent definition.
   */
  static async delete(id: string, organizationId: string) {
    return prisma.agentDefinition.delete({
      where: { id },
    })
  }

  /**
   * Find agent by linked config.
   */
  static async findByConfig(organizationId: string, configId: string) {
    return prisma.agentDefinition.findFirst({
      where: { organizationId, configId },
    })
  }
}

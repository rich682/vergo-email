import { prisma } from "@/lib/prisma"
import { TaskType, TaskLineage } from "@prisma/client"

export interface CreateTaskLineageInput {
  organizationId: string
  name: string
  description?: string
  type: TaskType
  config?: any // Schema for TABLE, match rules for RECONCILIATION
}

export class TaskLineageService {
  /**
   * Create a new task lineage (the template for recurring obligations)
   */
  static async create(input: CreateTaskLineageInput): Promise<TaskLineage> {
    return prisma.taskLineage.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        type: input.type,
        config: input.config || {}
      }
    })
  }

  /**
   * Get all lineages for an organization
   */
  static async getByOrganizationId(organizationId: string): Promise<TaskLineage[]> {
    return prisma.taskLineage.findMany({
      where: { organizationId },
      orderBy: { name: "asc" }
    })
  }

  /**
   * Update lineage config (only affects future instances)
   */
  static async updateConfig(lineageId: string, config: any): Promise<TaskLineage> {
    return prisma.taskLineage.update({
      where: { id: lineageId },
      data: { config }
    })
  }

  /**
   * Find lineage by ID
   */
  static async findById(id: string): Promise<TaskLineage | null> {
    return prisma.taskLineage.findUnique({
      where: { id },
      include: { instances: { orderBy: { createdAt: "desc" }, take: 10 } }
    })
  }
}

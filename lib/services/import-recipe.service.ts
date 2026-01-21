import { prisma } from "@/lib/prisma"

export interface ImportRecipeMapping {
  header: string
  columnId: string
}

export class ImportRecipeService {
  /**
   * Save an import recipe for a task lineage
   */
  static async saveRecipe(data: {
    organizationId: string
    lineageId: string
    name: string
    mapping: ImportRecipeMapping[]
  }) {
    return prisma.importRecipe.upsert({
      where: {
        // We'll use a simple name-based uniqueness within lineage for now
        // or just create a new one every time if name differs
        id: "new-recipe" // Placeholder, in practice use a real ID or name
      },
      create: {
        organizationId: data.organizationId,
        lineageId: data.lineageId,
        name: data.name,
        mapping: data.mapping as any
      },
      update: {
        mapping: data.mapping as any
      }
    })
  }

  /**
   * Get recipes for a lineage
   */
  static async getByLineageId(lineageId: string) {
    return prisma.importRecipe.findMany({
      where: { lineageId },
      orderBy: { updatedAt: "desc" }
    })
  }
}

import { prisma } from "@/lib/prisma"
import { User, UserRole } from "@prisma/client"
import bcrypt from "bcryptjs"

export class UserService {
  static async create(data: {
    email: string
    password: string
    name?: string
    role?: UserRole
    organizationId: string
  }): Promise<User> {
    const passwordHash = await bcrypt.hash(data.password, 10)
    
    return prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        role: data.role || "MEMBER",
        organizationId: data.organizationId
      }
    })
  }

  static async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
      include: { organization: true }
    })
  }

  static async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
      include: { organization: true }
    })
  }

  static async findByOrganization(
    organizationId: string
  ): Promise<User[]> {
    return prisma.user.findMany({
      where: { organizationId }
    })
  }

  static async update(
    id: string,
    data: Partial<Pick<User, "name" | "role" | "email">>
  ): Promise<User> {
    return prisma.user.update({
      where: { id },
      data
    })
  }

  static async updatePassword(
    id: string,
    newPassword: string
  ): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id },
      data: { passwordHash }
    })
  }

  static async delete(id: string): Promise<void> {
    await prisma.user.delete({
      where: { id }
    })
  }

  static async hasRole(
    userId: string,
    requiredRole: UserRole
  ): Promise<boolean> {
    const user = await this.findById(userId)
    if (!user) return false

    const roleHierarchy: Record<UserRole, number> = {
      VIEWER: 1,
      MEMBER: 2,
      ADMIN: 3
    }

    return roleHierarchy[user.role] >= roleHierarchy[requiredRole]
  }
}











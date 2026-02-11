import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export type NotificationType =
  | "comment"
  | "reply"
  | "mention"
  | "status_change"
  | "collaborator_added"
  | "request_sent"
  | "form_response"
  | "form_request"

interface CreateNotificationInput {
  userId: string
  organizationId: string
  type: NotificationType
  title: string
  body?: string
  taskInstanceId?: string
  requestId?: string
  actorId?: string
  metadata?: Record<string, any>
}

export class NotificationService {
  /**
   * Create a notification for a user
   */
  static async create(input: CreateNotificationInput) {
    return prisma.notification.create({
      data: {
        userId: input.userId,
        organizationId: input.organizationId,
        type: input.type,
        title: input.title,
        body: input.body || null,
        taskInstanceId: input.taskInstanceId || null,
        requestId: input.requestId || null,
        actorId: input.actorId || null,
        metadata: input.metadata ?? Prisma.JsonNull,
      },
    })
  }

  /**
   * Create notifications for multiple users at once
   */
  static async createMany(
    inputs: CreateNotificationInput[]
  ) {
    if (inputs.length === 0) return

    return prisma.notification.createMany({
      data: inputs.map((input) => ({
        userId: input.userId,
        organizationId: input.organizationId,
        type: input.type,
        title: input.title,
        body: input.body || null,
        taskInstanceId: input.taskInstanceId || null,
        requestId: input.requestId || null,
        actorId: input.actorId || null,
        metadata: input.metadata ?? Prisma.JsonNull,
      })),
    })
  }

  /**
   * Notify all collaborators and owner of a task (excluding the actor)
   */
  static async notifyTaskParticipants(
    taskInstanceId: string,
    organizationId: string,
    actorId: string,
    type: NotificationType,
    title: string,
    body?: string,
    metadata?: Record<string, any>,
    excludeUserIds?: string[]
  ) {
    // Get the task with owner and collaborators
    const task = await prisma.taskInstance.findUnique({
      where: { id: taskInstanceId },
      select: {
        ownerId: true,
        collaborators: { select: { userId: true } },
        boardId: true,
      },
    })

    if (!task) return

    const excludeSet = new Set(excludeUserIds || [])

    // Collect all participant user IDs (excluding the actor and excluded users)
    const participantIds = new Set<string>()
    if (task.ownerId !== actorId && !excludeSet.has(task.ownerId)) {
      participantIds.add(task.ownerId)
    }
    task.collaborators.forEach((c) => {
      if (c.userId !== actorId && !excludeSet.has(c.userId)) participantIds.add(c.userId)
    })

    // Also notify board collaborators if task belongs to a board
    if (task.boardId) {
      const boardCollabs = await prisma.boardCollaborator.findMany({
        where: { boardId: task.boardId },
        select: { userId: true },
      })
      boardCollabs.forEach((c) => {
        if (c.userId !== actorId && !excludeSet.has(c.userId)) participantIds.add(c.userId)
      })
    }

    if (participantIds.size === 0) return

    const inputs: CreateNotificationInput[] = Array.from(participantIds).map(
      (userId) => ({
        userId,
        organizationId,
        type,
        title,
        body,
        taskInstanceId,
        actorId,
        metadata,
      })
    )

    return this.createMany(inputs)
  }

  /**
   * Get notifications for a user (with pagination)
   */
  static async getForUser(
    userId: string,
    options?: { limit?: number; offset?: number; unreadOnly?: boolean }
  ) {
    const where: any = { userId }
    if (options?.unreadOnly) {
      where.read = false
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: options?.limit || 20,
        skip: options?.offset || 0,
        include: {
          taskInstance: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, read: false } }),
    ])

    return { notifications, total, unreadCount }
  }

  /**
   * Get unread count for a user
   */
  static async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, read: false },
    })
  }

  /**
   * Mark a notification as read
   */
  static async markAsRead(notificationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    })
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    })
  }
}

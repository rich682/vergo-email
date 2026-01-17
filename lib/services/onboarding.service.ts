import { prisma } from "@/lib/prisma"

export interface OnboardingProgress {
  accountCreated: boolean
  emailConnected: boolean
  contactAdded: boolean
  boardCreated: boolean
  taskCreated: boolean
  requestSent: boolean
}

export class OnboardingService {
  /**
   * Get the current onboarding progress for a user's organization
   * Progress is calculated dynamically based on actual data
   */
  static async getProgress(userId: string, organizationId: string): Promise<OnboardingProgress> {
    // Check each milestone in parallel for performance
    const [emailAccounts, contacts, boards, tasks, sentRequests] = await Promise.all([
      prisma.connectedEmailAccount.count({ where: { organizationId } }),
      prisma.entity.count({ where: { organizationId } }),
      prisma.board.count({ where: { organizationId } }),
      prisma.job.count({ where: { organizationId } }),
      // Count tasks that have outbound messages (requests sent)
      prisma.task.count({ 
        where: { 
          organizationId,
          messages: {
            some: {
              direction: "OUTBOUND"
            }
          }
        } 
      }),
    ])

    return {
      accountCreated: true, // Always true if they're logged in
      emailConnected: emailAccounts > 0,
      contactAdded: contacts > 0,
      boardCreated: boards > 0,
      taskCreated: tasks > 0,
      requestSent: sentRequests > 0,
    }
  }

  /**
   * Check if onboarding is complete (all steps done)
   */
  static isComplete(progress: OnboardingProgress): boolean {
    return Object.values(progress).every(v => v === true)
  }

  /**
   * Get the count of completed steps
   */
  static getCompletedCount(progress: OnboardingProgress): number {
    return Object.values(progress).filter(Boolean).length
  }

  /**
   * Dismiss the onboarding checklist for a user
   */
  static async dismissOnboarding(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { onboardingDismissed: true }
    })
  }

  /**
   * Mark onboarding as complete for a user
   */
  static async markComplete(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { 
        onboardingCompleted: true,
        onboardingDismissed: true // Also dismiss when complete
      }
    })
  }

  /**
   * Get the user's onboarding preferences
   */
  static async getUserOnboardingStatus(userId: string): Promise<{
    completed: boolean
    dismissed: boolean
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        onboardingCompleted: true,
        onboardingDismissed: true
      }
    })

    return {
      completed: user?.onboardingCompleted ?? false,
      dismissed: user?.onboardingDismissed ?? false
    }
  }
}

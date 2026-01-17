import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { OnboardingService } from "@/lib/services/onboarding.service"

export const dynamic = "force-dynamic"

/**
 * GET /api/user/onboarding
 * Get the current user's onboarding progress
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session?.user?.organizationId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const organizationId = session.user.organizationId

    // Get progress and user preferences in parallel
    const [progress, userStatus] = await Promise.all([
      OnboardingService.getProgress(userId, organizationId),
      OnboardingService.getUserOnboardingStatus(userId)
    ])

    const allComplete = OnboardingService.isComplete(progress)
    const completedCount = OnboardingService.getCompletedCount(progress)

    // Auto-mark as complete if all steps done
    if (allComplete && !userStatus.completed) {
      await OnboardingService.markComplete(userId)
      userStatus.completed = true
      userStatus.dismissed = true
    }

    return NextResponse.json({
      progress,
      allComplete,
      completedCount,
      totalSteps: 6,
      dismissed: userStatus.dismissed,
      completed: userStatus.completed
    })
  } catch (error: any) {
    console.error("[API/user/onboarding] Error:", error)
    return NextResponse.json(
      { error: "Failed to get onboarding progress" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/user/onboarding
 * Update onboarding status (dismiss or mark complete)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = session.user.id
    const body = await request.json()
    const { action } = body

    if (action === "dismiss") {
      await OnboardingService.dismissOnboarding(userId)
      return NextResponse.json({ success: true, action: "dismissed" })
    } else if (action === "complete") {
      await OnboardingService.markComplete(userId)
      return NextResponse.json({ success: true, action: "completed" })
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'dismiss' or 'complete'" },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error("[API/user/onboarding] Error:", error)
    return NextResponse.json(
      { error: "Failed to update onboarding status" },
      { status: 500 }
    )
  }
}

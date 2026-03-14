import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { ActivationWizard } from "@/components/activation-wizard"

export const dynamic = "force-dynamic"

export default async function GetStartedPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect("/auth/signin")
  }

  if (session.user.onboardingCompleted) {
    redirect("/dashboard/boards")
  }

  const firstName = session.user.name?.split(" ")[0] || ""

  return <ActivationWizard userName={firstName} />
}

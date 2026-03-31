import { requireAuth } from "@/lib/auth"
import { DashboardLayout } from "@/components/dashboard-layout"
import { AdminsClient } from "./admins-client"

export default function AdminsPage() {
  requireAuth()

  return (
    <DashboardLayout>
      <AdminsClient />
    </DashboardLayout>
  )
}

"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Campaigns</h2>
        <p className="text-gray-600">Manage your email campaigns</p>
      </div>

      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          Campaign management coming soon
        </CardContent>
      </Card>
    </div>
  )
}


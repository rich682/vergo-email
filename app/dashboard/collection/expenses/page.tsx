"use client"

import { useEffect } from "react"
import { Receipt, Check, Zap, Shield, BarChart3 } from "lucide-react"

const features = [
  {
    icon: Receipt,
    title: "Automated Expense Capture",
    description: "Automatically capture and categorize expenses from receipts, credit card statements, and bank feeds."
  },
  {
    icon: Zap,
    title: "Smart Matching",
    description: "AI-powered matching of expenses to projects, clients, and GL codes for faster reconciliation."
  },
  {
    icon: Shield,
    title: "Policy Compliance",
    description: "Built-in policy checks ensure expenses meet your firm's guidelines before approval."
  },
  {
    icon: BarChart3,
    title: "Real-time Reporting",
    description: "Track spending trends, budget utilization, and expense patterns across your organization."
  }
]

export default function ExpensesPage() {
  // Load HubSpot meetings script
  useEffect(() => {
    const script = document.createElement("script")
    script.src = "https://static.hsappstatic.net/MeetingsEmbed/ex/MeetingsEmbedCode.js"
    script.async = true
    document.body.appendChild(script)
    
    return () => {
      // Cleanup script on unmount
      const existingScript = document.querySelector('script[src="https://static.hsappstatic.net/MeetingsEmbed/ex/MeetingsEmbedCode.js"]')
      if (existingScript) {
        existingScript.remove()
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50/30">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium mb-4">
            <Zap className="w-4 h-4" />
            Coming Soon
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Expense Management
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Streamline expense tracking, approvals, and reimbursements for your accounting firm.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left: HubSpot Meeting Embed */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Book a Demo
            </h2>
            <p className="text-gray-600 mb-6">
              See how Vergo can transform your expense management workflow. Schedule a personalized demo with our team.
            </p>
            <div 
              className="meetings-iframe-container rounded-lg overflow-hidden" 
              data-src="https://meetings.hubspot.com/richard-kane?embed=true"
              style={{ minHeight: "650px" }}
            />
          </div>

          {/* Right: Features */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                What's Coming
              </h2>
              
              <div className="space-y-6">
                {features.map((feature, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                      <feature.icon className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">
                        {feature.title}
                      </h3>
                      <p className="text-gray-600 text-sm">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Early Access CTA */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-6 text-white">
              <h3 className="text-lg font-semibold mb-2">
                Get Early Access
              </h3>
              <p className="text-orange-100 text-sm mb-4">
                Be the first to know when Expense Management launches. Early adopters get exclusive pricing and priority support.
              </p>
              <div className="flex items-center gap-2 text-sm">
                <Check className="w-4 h-4" />
                <span>No credit card required</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

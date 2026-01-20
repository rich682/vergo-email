"use client"

import { useEffect } from "react"
import { FileText, Clock, Link2, Send } from "lucide-react"

const features = [
  {
    icon: FileText,
    title: "Invoice Processing",
    description: "Automatically extract data from vendor invoices using AI-powered OCR and validation."
  },
  {
    icon: Clock,
    title: "Approval Workflows",
    description: "Customizable approval chains with automatic routing based on amount, vendor, or department."
  },
  {
    icon: Link2,
    title: "Accounting Software Integrations",
    description: "Connect with QuickBooks, Xero, Sage, and other accounting platforms for seamless data sync."
  },
  {
    icon: Send,
    title: "Client Billing",
    description: "Generate and send professional invoices to clients with automatic follow-up reminders."
  }
]

export default function InvoicesPage() {
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Invoice Management
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            End-to-end invoice processing, from capture to payment, designed for accounting teams.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left: HubSpot Meeting Embed */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Book a Demo
            </h2>
            <p className="text-gray-600 mb-6">
              Discover how Vergo can automate your invoice workflows. Schedule a personalized demo with our team.
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
                Features
              </h2>
              
              <div className="space-y-6">
                {features.map((feature, index) => (
                  <div key={index} className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <feature.icon className="w-5 h-5 text-blue-600" />
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
          </div>
        </div>
      </div>
    </div>
  )
}

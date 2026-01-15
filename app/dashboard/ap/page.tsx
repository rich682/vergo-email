"use client"

import { FileText, Workflow, Shield, BarChart3, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const features = [
  {
    icon: FileText,
    title: "Invoice Processing",
    description: "Automatically capture, extract, and validate invoice data with AI-powered OCR and matching."
  },
  {
    icon: Workflow,
    title: "Approval Workflows",
    description: "Configurable multi-level approval workflows with automatic routing based on amount and vendor."
  },
  {
    icon: Shield,
    title: "Fraud Detection",
    description: "AI-powered duplicate detection and anomaly alerts to prevent payment errors and fraud."
  },
  {
    icon: BarChart3,
    title: "Cash Flow Insights",
    description: "Real-time visibility into payables, aging reports, and cash flow forecasting."
  }
]

export default function APPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-purple-50">
      <div className="max-w-5xl mx-auto px-8 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 mb-6 shadow-lg shadow-violet-200">
            <FileText className="w-10 h-10 text-white" />
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Accounts Payable
          </h1>
          
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Automate your entire AP process from invoice receipt to payment. 
            Reduce manual work, eliminate errors, and gain complete visibility.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Button 
              size="lg"
              className="bg-violet-600 hover:bg-violet-700 text-white px-8 py-6 text-lg rounded-xl shadow-lg shadow-violet-200"
              onClick={() => window.open('mailto:sales@vergo.io?subject=Accounts Payable Demo Request', '_blank')}
            >
              Contact Sales
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button 
              size="lg"
              variant="outline"
              className="px-8 py-6 text-lg rounded-xl border-2"
              onClick={() => window.open('https://vergo.io/ap', '_blank')}
            >
              Learn More
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <div 
                key={index}
                className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md hover:border-violet-100 transition-all"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-violet-100 mb-4">
                  <Icon className="w-6 h-6 text-violet-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">
                  {feature.description}
                </p>
              </div>
            )
          })}
        </div>

        {/* Stats Section */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-violet-600 mb-2">70%</div>
              <div className="text-gray-600">Reduction in processing time</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-violet-600 mb-2">99%</div>
              <div className="text-gray-600">Invoice matching accuracy</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-violet-600 mb-2">50%</div>
              <div className="text-gray-600">Cost savings on AP operations</div>
            </div>
          </div>
        </div>

        {/* Integration Section */}
        <div className="mt-12 bg-gradient-to-r from-violet-600 to-purple-600 rounded-2xl p-8 text-white">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">
              Seamless Integrations
            </h2>
            <p className="text-violet-100 max-w-xl mx-auto mb-6">
              Connect with your existing accounting software, ERP systems, and banking platforms 
              for a fully automated AP workflow.
            </p>
            <div className="flex items-center justify-center gap-6 text-sm text-violet-200">
              <span>QuickBooks</span>
              <span>•</span>
              <span>Xero</span>
              <span>•</span>
              <span>NetSuite</span>
              <span>•</span>
              <span>Sage</span>
              <span>•</span>
              <span>SAP</span>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-16 text-center">
          <p className="text-gray-500 mb-4">
            Ready to modernize your accounts payable?
          </p>
          <Button 
            size="lg"
            className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-6 text-lg rounded-xl"
            onClick={() => window.open('mailto:sales@vergo.io?subject=Accounts Payable Demo Request', '_blank')}
          >
            Schedule a Demo
          </Button>
        </div>
      </div>
    </div>
  )
}

"use client"

import { Receipt, CheckCircle, Zap, Clock, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"

const features = [
  {
    icon: Receipt,
    title: "Smart Receipt Capture",
    description: "Automatically extract data from receipts using AI. Just snap a photo or forward an email."
  },
  {
    icon: Zap,
    title: "Automated Categorization",
    description: "Expenses are automatically categorized based on vendor, amount, and historical patterns."
  },
  {
    icon: CheckCircle,
    title: "Policy Compliance",
    description: "Built-in policy checks ensure expenses comply with your company guidelines before submission."
  },
  {
    icon: Clock,
    title: "Faster Reimbursements",
    description: "Streamlined approval workflows mean employees get reimbursed faster than ever."
  }
]

export default function ExpensesPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="max-w-5xl mx-auto px-8 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 mb-6 shadow-lg shadow-emerald-200">
            <Receipt className="w-10 h-10 text-white" />
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Expense Management
          </h1>
          
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Simplify expense tracking and reimbursements with AI-powered automation. 
            From receipt capture to approval workflows, we handle it all.
          </p>

          <div className="flex items-center justify-center gap-4">
            <Button 
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-6 text-lg rounded-xl shadow-lg shadow-emerald-200"
              onClick={() => window.open('mailto:sales@vergo.io?subject=Expense Management Demo Request', '_blank')}
            >
              Contact Sales
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <Button 
              size="lg"
              variant="outline"
              className="px-8 py-6 text-lg rounded-xl border-2"
              onClick={() => window.open('https://vergo.io/expenses', '_blank')}
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
                className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md hover:border-emerald-100 transition-all"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-100 mb-4">
                  <Icon className="w-6 h-6 text-emerald-600" />
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
              <div className="text-4xl font-bold text-emerald-600 mb-2">80%</div>
              <div className="text-gray-600">Faster expense processing</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-emerald-600 mb-2">95%</div>
              <div className="text-gray-600">Receipt data accuracy</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-emerald-600 mb-2">3x</div>
              <div className="text-gray-600">Faster reimbursements</div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-16 text-center">
          <p className="text-gray-500 mb-4">
            Ready to transform your expense management?
          </p>
          <Button 
            size="lg"
            className="bg-gray-900 hover:bg-gray-800 text-white px-8 py-6 text-lg rounded-xl"
            onClick={() => window.open('mailto:sales@vergo.io?subject=Expense Management Demo Request', '_blank')}
          >
            Schedule a Demo
          </Button>
        </div>
      </div>
    </div>
  )
}

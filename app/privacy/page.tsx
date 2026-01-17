"use client"

import Link from "next/link"
import Image from "next/image"

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <Link href="/">
            <Image
              src="/logo.svg"
              alt="Vergo"
              width={105}
              height={32}
              className="h-8 w-auto"
            />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="font-display text-4xl text-gray-900 mb-4">Privacy Policy</h1>
        <p className="text-gray-500 mb-12">Last updated: January 17, 2026</p>

        <div className="prose prose-gray max-w-none">
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              Vergo ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy 
              explains how we collect, use, disclose, and safeguard your information when you use our 
              software-as-a-service platform ("Service").
            </p>
            <p className="text-gray-600 leading-relaxed">
              Please read this Privacy Policy carefully. By using the Service, you consent to the practices 
              described in this policy.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Information We Collect</h2>
            
            <h3 className="text-lg font-medium text-gray-800 mb-3 mt-6">Information You Provide</h3>
            <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
              <li><strong>Account Information:</strong> Name, email address, company name, and password when you register</li>
              <li><strong>Profile Information:</strong> Job title, phone number, and other optional profile details</li>
              <li><strong>Content:</strong> Emails, requests, tasks, and other content you create or upload</li>
              <li><strong>Contact Data:</strong> Information about your stakeholders and contacts that you add to the Service</li>
              <li><strong>Communications:</strong> Messages you send to us for support or feedback</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mb-3 mt-6">Information Collected Automatically</h3>
            <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
              <li><strong>Usage Data:</strong> Pages visited, features used, time spent, and actions taken</li>
              <li><strong>Device Information:</strong> Browser type, operating system, IP address, and device identifiers</li>
              <li><strong>Cookies:</strong> We use cookies and similar technologies to enhance your experience</li>
              <li><strong>Log Data:</strong> Server logs including access times, error reports, and referral URLs</li>
            </ul>

            <h3 className="text-lg font-medium text-gray-800 mb-3 mt-6">Email Integration Data</h3>
            <p className="text-gray-600 leading-relaxed">
              When you connect your email account (Gmail or Microsoft), we access email data necessary to 
              provide our Service, including sending emails on your behalf, tracking responses, and 
              processing attachments. We only access data required for the functionality you use.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">3. How We Use Your Information</h2>
            <p className="text-gray-600 leading-relaxed mb-4">We use the information we collect to:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process transactions and send related information</li>
              <li>Send emails and requests on your behalf to your stakeholders</li>
              <li>Track email opens, responses, and engagement</li>
              <li>Provide customer support and respond to inquiries</li>
              <li>Send administrative notifications about your account</li>
              <li>Analyze usage patterns to improve our Service</li>
              <li>Detect, prevent, and address technical issues and security threats</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">4. How We Share Your Information</h2>
            <p className="text-gray-600 leading-relaxed mb-4">We may share your information in the following circumstances:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li><strong>Service Providers:</strong> With third-party vendors who assist in operating our Service (e.g., hosting, email delivery, analytics)</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights and safety</li>
              <li><strong>With Your Consent:</strong> When you have given explicit consent to share</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Data Retention</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              We retain your information for as long as your account is active or as needed to provide the Service. 
              We may also retain and use your information as necessary to comply with legal obligations, 
              resolve disputes, and enforce our agreements.
            </p>
            <p className="text-gray-600 leading-relaxed">
              When you delete your account, we will delete or anonymize your personal information within 
              90 days, except where retention is required by law.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Data Security</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              We implement appropriate technical and organizational measures to protect your information, including:
            </p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li>Encryption of data in transit and at rest</li>
              <li>Regular security assessments and penetration testing</li>
              <li>Access controls and authentication requirements</li>
              <li>Employee training on data protection practices</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              However, no method of transmission over the Internet is 100% secure. We cannot guarantee 
              absolute security of your data.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Your Rights and Choices</h2>
            <p className="text-gray-600 leading-relaxed mb-4">Depending on your location, you may have the following rights:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2">
              <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
              <li><strong>Deletion:</strong> Request deletion of your personal information</li>
              <li><strong>Portability:</strong> Request a copy of your data in a portable format</li>
              <li><strong>Objection:</strong> Object to certain processing of your information</li>
              <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              To exercise these rights, please contact us at{" "}
              <a href="mailto:privacy@vergo.app" className="text-orange-600 hover:text-orange-700">
                privacy@vergo.app
              </a>
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Cookies and Tracking</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              We use cookies and similar tracking technologies to collect information about your browsing 
              activities. You can control cookies through your browser settings, but disabling cookies 
              may limit your ability to use certain features of the Service.
            </p>
            <p className="text-gray-600 leading-relaxed">
              We use both session cookies (which expire when you close your browser) and persistent 
              cookies (which remain on your device until deleted or expired).
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Third-Party Services</h2>
            <p className="text-gray-600 leading-relaxed">
              Our Service may integrate with third-party services (e.g., Google, Microsoft). When you 
              connect these services, their privacy policies govern their collection and use of your data. 
              We encourage you to review their privacy policies before connecting your accounts.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">10. International Data Transfers</h2>
            <p className="text-gray-600 leading-relaxed">
              Your information may be transferred to and processed in countries other than your own. 
              We ensure appropriate safeguards are in place for international data transfers in 
              accordance with applicable data protection laws.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Children's Privacy</h2>
            <p className="text-gray-600 leading-relaxed">
              Our Service is not intended for individuals under the age of 16. We do not knowingly 
              collect personal information from children. If we become aware that we have collected 
              personal information from a child, we will take steps to delete that information.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">12. Changes to This Policy</h2>
            <p className="text-gray-600 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any material 
              changes by posting the new policy on this page and updating the "Last updated" date. 
              Your continued use of the Service after any changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">13. Contact Us</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              If you have any questions about this Privacy Policy or our data practices, please contact us:
            </p>
            <ul className="text-gray-600 space-y-2">
              <li>Email: <a href="mailto:privacy@vergo.app" className="text-orange-600 hover:text-orange-700">privacy@vergo.app</a></li>
            </ul>
          </section>
        </div>

        {/* Back link */}
        <div className="mt-12 pt-8 border-t border-gray-100">
          <Link 
            href="/signup" 
            className="text-orange-600 hover:text-orange-700 font-medium"
          >
            ← Back to Sign Up
          </Link>
        </div>
      </main>
    </div>
  )
}

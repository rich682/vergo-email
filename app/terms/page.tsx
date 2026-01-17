"use client"

import Link from "next/link"
import Image from "next/image"

export default function TermsOfServicePage() {
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
        <h1 className="font-display text-4xl text-gray-900 mb-4">Terms of Service</h1>
        <p className="text-gray-500 mb-12">Last updated: January 17, 2026</p>

        <div className="prose prose-gray max-w-none">
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              By accessing or using Vergo ("Service"), you agree to be bound by these Terms of Service ("Terms"). 
              If you are using the Service on behalf of an organization, you represent and warrant that you have 
              the authority to bind that organization to these Terms.
            </p>
            <p className="text-gray-600 leading-relaxed">
              If you do not agree to these Terms, you may not access or use the Service.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Description of Service</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              Vergo provides a software-as-a-service platform that enables businesses to send requests, 
              track responses, and manage tasks with stakeholders through automated email communications 
              and AI-powered follow-ups.
            </p>
            <p className="text-gray-600 leading-relaxed">
              We reserve the right to modify, suspend, or discontinue the Service (or any part thereof) 
              at any time with or without notice.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Account Registration</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              To use certain features of the Service, you must register for an account. When you register, 
              you agree to provide accurate, current, and complete information and to update such information 
              to keep it accurate, current, and complete.
            </p>
            <p className="text-gray-600 leading-relaxed">
              You are responsible for safeguarding your account credentials and for all activities that 
              occur under your account. You agree to notify us immediately of any unauthorized use of your account.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Acceptable Use</h2>
            <p className="text-gray-600 leading-relaxed mb-4">You agree not to:</p>
            <ul className="list-disc pl-6 text-gray-600 space-y-2 mb-4">
              <li>Use the Service for any unlawful purpose or in violation of any applicable laws</li>
              <li>Send spam, unsolicited communications, or violate anti-spam laws</li>
              <li>Impersonate any person or entity or misrepresent your affiliation</li>
              <li>Interfere with or disrupt the Service or servers or networks connected to the Service</li>
              <li>Attempt to gain unauthorized access to any part of the Service</li>
              <li>Use the Service to transmit any malware, viruses, or malicious code</li>
              <li>Collect or harvest any information from the Service without authorization</li>
            </ul>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Your Data</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              You retain all rights to the data you submit to the Service ("Your Data"). By using the Service, 
              you grant us a limited license to use, process, and store Your Data solely as necessary to 
              provide the Service to you.
            </p>
            <p className="text-gray-600 leading-relaxed">
              You are responsible for ensuring that you have all necessary rights and permissions to submit 
              Your Data to the Service, including any personal data of third parties.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Payment Terms</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              Certain features of the Service may require payment of fees. You agree to pay all applicable 
              fees as described on our pricing page. Fees are non-refundable except as expressly set forth 
              in these Terms or as required by law.
            </p>
            <p className="text-gray-600 leading-relaxed">
              We may change our fees at any time by posting the changes on our website or by notifying you 
              directly. Your continued use of the Service after a fee change constitutes acceptance of the new fees.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Intellectual Property</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              The Service and its original content, features, and functionality are owned by Vergo and are 
              protected by international copyright, trademark, patent, trade secret, and other intellectual 
              property laws.
            </p>
            <p className="text-gray-600 leading-relaxed">
              You may not copy, modify, distribute, sell, or lease any part of the Service without our 
              prior written consent.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Disclaimer of Warranties</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER 
              EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, 
              FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p className="text-gray-600 leading-relaxed">
              We do not warrant that the Service will be uninterrupted, secure, or error-free, or that 
              defects will be corrected.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Limitation of Liability</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, VERGO SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, 
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES, WHETHER 
              INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Our total liability for any claims under these Terms shall not exceed the amount you paid us 
              in the twelve (12) months preceding the claim.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Indemnification</h2>
            <p className="text-gray-600 leading-relaxed">
              You agree to indemnify, defend, and hold harmless Vergo and its officers, directors, employees, 
              and agents from and against any claims, liabilities, damages, losses, and expenses arising out 
              of or in any way connected with your access to or use of the Service or your violation of these Terms.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Termination</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              You may terminate your account at any time by contacting us. We may terminate or suspend your 
              access to the Service immediately, without prior notice or liability, for any reason, including 
              if you breach these Terms.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Upon termination, your right to use the Service will immediately cease. All provisions of these 
              Terms that by their nature should survive termination shall survive.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">12. Governing Law</h2>
            <p className="text-gray-600 leading-relaxed">
              These Terms shall be governed by and construed in accordance with the laws of the jurisdiction 
              in which Vergo is incorporated, without regard to its conflict of law provisions.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">13. Changes to Terms</h2>
            <p className="text-gray-600 leading-relaxed">
              We reserve the right to modify these Terms at any time. If we make material changes, we will 
              notify you by email or by posting a notice on our website prior to the changes becoming effective. 
              Your continued use of the Service after any changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">14. Contact Us</h2>
            <p className="text-gray-600 leading-relaxed">
              If you have any questions about these Terms, please contact us at{" "}
              <a href="mailto:legal@vergo.app" className="text-orange-600 hover:text-orange-700">
                legal@vergo.app
              </a>
            </p>
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

"use client"

import { useState, useEffect, useCallback } from "react"
import { User } from "lucide-react"

// Types
interface ContactWithCompany {
  id: string
  firstName: string
  lastName: string | null
  email: string | null
  companyName: string | null
}

interface ContactLabelsTableProps {
  jobId: string
  canEdit?: boolean
}

export function ContactLabelsTable({ jobId, canEdit = true }: ContactLabelsTableProps) {
  const [contacts, setContacts] = useState<ContactWithCompany[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const contactsRes = await fetch(`/api/jobs/${jobId}/contact-labels`, { credentials: "include" })

      if (contactsRes.ok) {
        const data = await contactsRes.json()
        setContacts(data.contacts || [])
      }
    } catch (err) {
      console.error("Error fetching data:", err)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400" />
      </div>
    )
  }

  if (contacts.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg">
        <User className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No stakeholder contacts</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Contact
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Company
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contacts.map((contact) => (
              <tr key={contact.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <div className="font-medium text-sm text-gray-900">
                    {contact.firstName} {contact.lastName || ""}
                  </div>
                  {contact.email && (
                    <div className="text-xs text-gray-500">{contact.email}</div>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className="text-sm text-gray-600">
                    {contact.companyName || "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

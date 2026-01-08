"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

interface UserMenuProps {
  userEmail: string
}

export function UserMenu({ userEmail }: UserMenuProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <Button variant="outline" onClick={() => setOpen((v) => !v)}>
        {userEmail || "Account"}
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-md border border-gray-200 bg-white shadow">
          <button
            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}

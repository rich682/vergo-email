"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type SelectedRecipient = {
  id: string
  name: string
  type: "entity" | "group"
  email?: string | null
}

interface RecipientSelectorProps {
  selectedRecipients: SelectedRecipient[]
  onRecipientsChange: (recipients: SelectedRecipient[]) => void
}

export function RecipientSelector({
  selectedRecipients,
  onRecipientsChange
}: RecipientSelectorProps) {
  const [input, setInput] = useState("")

  const addRecipient = () => {
    const value = input.trim()
    if (!value) return
    const recipient: SelectedRecipient = {
      id: value,
      name: value,
      type: "entity",
      email: value.includes("@") ? value : undefined
    }
    onRecipientsChange([...selectedRecipients, recipient])
    setInput("")
  }

  const removeRecipient = (id: string) => {
    onRecipientsChange(selectedRecipients.filter((r) => r.id !== id))
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Add recipient (email or name)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addRecipient()
            }
          }}
        />
        <Button type="button" onClick={addRecipient}>
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {selectedRecipients.map((r) => (
          <span
            key={r.id}
            className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm"
          >
            {r.name}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2"
              onClick={() => removeRecipient(r.id)}
            >
              Remove
            </Button>
          </span>
        ))}
      </div>
    </div>
  )
}

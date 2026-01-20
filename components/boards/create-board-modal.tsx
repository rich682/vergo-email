"use client"

import { useState, useEffect, useMemo } from "react"
import { Loader2, X, Check, ChevronsUpDown, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

type BoardCadence = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEAR_END" | "AD_HOC"

interface TeamMember {
  id: string
  name: string | null
  email: string
}

interface CreateBoardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onBoardCreated?: (board: any) => void
}

const CADENCE_OPTIONS: { value: BoardCadence; label: string }[] = [
  { value: "MONTHLY", label: "Monthly" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEAR_END", label: "Year-End" },
  { value: "DAILY", label: "Daily" },
  { value: "AD_HOC", label: "Ad Hoc" },
]

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.split(" ")
    return parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

export function CreateBoardModal({
  open,
  onOpenChange,
  onBoardCreated
}: CreateBoardModalProps) {
  // Form state
  const [cadence, setCadence] = useState<BoardCadence | null>(null)
  const [name, setName] = useState("")
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([])
  
  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [ownerOpen, setOwnerOpen] = useState(false)
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Fetch team members on mount
  useEffect(() => {
    if (open) {
      fetchTeamMembers()
    }
  }, [open])

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch("/api/boards/team-members")
      if (response.ok) {
        const data = await response.json()
        setTeamMembers(data.members || [])
        setCurrentUserId(data.currentUserId || null)
        // Set default owner to current user
        if (data.currentUserId && !ownerId) {
          setOwnerId(data.currentUserId)
        }
      }
    } catch (err) {
      console.error("Failed to fetch team members:", err)
    }
  }

  const selectedOwner = useMemo(() => {
    return teamMembers.find(m => m.id === ownerId)
  }, [teamMembers, ownerId])

  const selectedCollaborators = useMemo(() => {
    return teamMembers.filter(m => collaboratorIds.includes(m.id))
  }, [teamMembers, collaboratorIds])

  const toggleCollaborator = (userId: string) => {
    setCollaboratorIds(prev => 
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    if (!name.trim()) {
      setError("Board name is required")
      return
    }

    if (!cadence) {
      setError("Please select a board type")
      return
    }

    setLoading(true)

    try {
      const response = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          cadence,
          ownerId: ownerId || undefined,
          collaboratorIds: collaboratorIds.length > 0 ? collaboratorIds : undefined
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create board")
      }

      const data = await response.json()
      
      // Reset form
      resetForm()
      
      onOpenChange(false)
      onBoardCreated?.(data.board)
    } catch (error: any) {
      setError(error.message || "Failed to create board")
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setCadence(null)
    setName("")
    setOwnerId(currentUserId)
    setCollaboratorIds([])
    setError(null)
  }

  const handleClose = () => {
    resetForm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Board</DialogTitle>
            <DialogDescription>
              Organize your tasks into a board
            </DialogDescription>
          </DialogHeader>
          
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
              {error}
            </div>
          )}
          
          <div className="py-4 space-y-4">
            {/* Board Name */}
            <div className="grid gap-2">
              <Label htmlFor="name">Board Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., January 2026 Close"
              />
            </div>

            {/* Board Type (Cadence) */}
            <div className="grid gap-2">
              <Label htmlFor="cadence">Board Type *</Label>
              <Select
                value={cadence || ""}
                onValueChange={(v) => setCadence(v as BoardCadence)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select board type" />
                </SelectTrigger>
                <SelectContent>
                  {CADENCE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Used for filtering and automation</p>
            </div>

            {/* Owner */}
            <div className="grid gap-2">
              <Label>Owner *</Label>
              <Popover open={ownerOpen} onOpenChange={setOwnerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={ownerOpen}
                    className="justify-between"
                  >
                    {selectedOwner ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-xs bg-orange-100 text-orange-700">
                            {getInitials(selectedOwner.name, selectedOwner.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span>{selectedOwner.name || selectedOwner.email}</span>
                      </div>
                    ) : (
                      <span className="text-gray-500">Select owner</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search team members..." />
                    <CommandList>
                      <CommandEmpty>No team members found.</CommandEmpty>
                      <CommandGroup>
                        {teamMembers.map((member) => (
                          <CommandItem
                            key={member.id}
                            value={member.name || member.email}
                            onSelect={() => {
                              setOwnerId(member.id)
                              setOwnerOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                ownerId === member.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <Avatar className="h-6 w-6 mr-2">
                              <AvatarFallback className="text-xs bg-gray-100">
                                {getInitials(member.name, member.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                              <span>{member.name || member.email}</span>
                              {member.name && (
                                <span className="text-xs text-gray-500">{member.email}</span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Collaborators */}
            <div className="grid gap-2">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Collaborators
                <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Popover open={collaboratorsOpen} onOpenChange={setCollaboratorsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={collaboratorsOpen}
                    className="justify-between h-auto min-h-[40px]"
                  >
                    {selectedCollaborators.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selectedCollaborators.map(member => (
                          <Badge
                            key={member.id}
                            variant="secondary"
                            className="flex items-center gap-1"
                          >
                            {member.name || member.email.split("@")[0]}
                            <X
                              className="h-3 w-3 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleCollaborator(member.id)
                              }}
                            />
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-500">Add team members...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search team members..." />
                    <CommandList>
                      <CommandEmpty>No team members found.</CommandEmpty>
                      <CommandGroup>
                        {teamMembers
                          .filter(m => m.id !== ownerId) // Can't be both owner and collaborator
                          .map((member) => (
                            <CommandItem
                              key={member.id}
                              value={member.name || member.email}
                              onSelect={() => toggleCollaborator(member.id)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  collaboratorIds.includes(member.id) ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <Avatar className="h-6 w-6 mr-2">
                                <AvatarFallback className="text-xs bg-gray-100">
                                  {getInitials(member.name, member.email)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col">
                                <span>{member.name || member.email}</span>
                                {member.name && (
                                  <span className="text-xs text-gray-500">{member.email}</span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !name.trim() || !cadence}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Board
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

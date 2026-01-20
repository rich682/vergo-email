"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Loader2, X, Check, ChevronsUpDown, Users, Zap, Info, Calendar } from "lucide-react"
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
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { format, startOfWeek, startOfMonth, startOfQuarter, startOfYear } from "date-fns"

type BoardCadence = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEAR_END" | "AD_HOC"

/**
 * Calculate periodStart based on today's date and cadence
 */
function calculatePeriodStart(cadence: BoardCadence): Date | null {
  const today = new Date()
  
  switch (cadence) {
    case "DAILY":
      return today
    case "WEEKLY":
      return startOfWeek(today, { weekStartsOn: 1 }) // Monday
    case "MONTHLY":
      return startOfMonth(today)
    case "QUARTERLY":
      return startOfQuarter(today)
    case "YEAR_END":
      return startOfYear(today)
    case "AD_HOC":
      return null
    default:
      return null
  }
}

/**
 * Generate a board name based on cadence and period
 */
function generateBoardName(cadence: BoardCadence, periodStart: Date | null): string {
  if (!periodStart || cadence === "AD_HOC") return ""
  
  switch (cadence) {
    case "DAILY":
      return format(periodStart, "EEEE, MMM d") // "Tuesday, Jan 20"
    case "WEEKLY":
      return `Week of ${format(periodStart, "MMM d, yyyy")}` // "Week of Jan 20, 2026"
    case "MONTHLY":
      return format(periodStart, "MMMM yyyy") // "January 2026"
    case "QUARTERLY": {
      const quarter = Math.floor(periodStart.getMonth() / 3) + 1
      return `Q${quarter} ${periodStart.getFullYear()}` // "Q1 2026"
    }
    case "YEAR_END":
      return `Year-End ${periodStart.getFullYear()}` // "Year-End 2026"
    default:
      return ""
  }
}

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
  const [periodStart, setPeriodStart] = useState<Date | null>(null)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([])
  const [autoCreateNextBoard, setAutoCreateNextBoard] = useState(true)
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false)
  
  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [ownerOpen, setOwnerOpen] = useState(false)
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Auto-set periodStart and name when cadence changes
  const handleCadenceChange = useCallback((newCadence: BoardCadence) => {
    setCadence(newCadence)
    
    // Calculate period start based on today
    const newPeriodStart = calculatePeriodStart(newCadence)
    setPeriodStart(newPeriodStart)
    
    // Auto-generate board name if not manually edited
    if (!nameManuallyEdited || !name.trim()) {
      const suggestedName = generateBoardName(newCadence, newPeriodStart)
      setName(suggestedName)
    }
  }, [nameManuallyEdited, name])

  // Track if name was manually edited
  const handleNameChange = useCallback((newName: string) => {
    setName(newName)
    setNameManuallyEdited(true)
  }, [])

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
      // For AD_HOC boards, automation is always disabled
      const automationEnabled = cadence !== "AD_HOC" ? autoCreateNextBoard : false

      const response = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          cadence,
          periodStart: periodStart?.toISOString(),
          ownerId: ownerId || undefined,
          collaboratorIds: collaboratorIds.length > 0 ? collaboratorIds : undefined,
          automationEnabled
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
    setPeriodStart(null)
    setOwnerId(currentUserId)
    setCollaboratorIds([])
    setAutoCreateNextBoard(true)
    setNameManuallyEdited(false)
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
            {/* Board Type (Cadence) - Show first to auto-generate name */}
            <div className="grid gap-2">
              <Label htmlFor="cadence">Board Type *</Label>
              <Select
                value={cadence || ""}
                onValueChange={(v) => handleCadenceChange(v as BoardCadence)}
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

            {/* Board Name */}
            <div className="grid gap-2">
              <Label htmlFor="name">Board Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder={cadence && cadence !== "AD_HOC" ? "Auto-generated from board type" : "e.g., Q1 Tax Prep"}
              />
              {periodStart && cadence && cadence !== "AD_HOC" && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Calendar className="h-3 w-3" />
                  <span>Period: {format(periodStart, "MMM d, yyyy")}</span>
                </div>
              )}
            </div>

            {/* Automation Section - shown after cadence is selected */}
            {cadence && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                {cadence === "AD_HOC" ? (
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-600">
                      Ad hoc boards are one-off and do not repeat.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <Zap className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-600">
                        This is a <span className="font-medium">{CADENCE_OPTIONS.find(o => o.value === cadence)?.label}</span> board. 
                        Vergo will automatically create the next board when this one completes.
                      </p>
                    </div>
                    <div className="flex items-center justify-between pl-6">
                      <Label htmlFor="auto-create" className="text-sm font-medium text-gray-700 cursor-pointer">
                        Auto-create next board
                      </Label>
                      <Switch
                        id="auto-create"
                        checked={autoCreateNextBoard}
                        onCheckedChange={setAutoCreateNextBoard}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

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

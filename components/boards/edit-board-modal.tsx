"use client"

import { useState, useEffect, useMemo } from "react"
import { Loader2, X, Check, ChevronsUpDown, Users, Calendar, Zap } from "lucide-react"
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
import { Switch } from "@/components/ui/switch"
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
import { format } from "date-fns"
import { formatPeriodDisplay } from "@/lib/utils/timezone"

type BoardStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED" | "ARCHIVED"
type BoardCadence = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEAR_END" | "AD_HOC"

interface TeamMember {
  id: string
  name: string | null
  email: string
}

interface BoardOwner {
  id: string
  name: string | null
  email: string
}

interface BoardCollaborator {
  id: string
  userId: string
  user: {
    id: string
    name: string | null
    email: string
  }
}

interface Board {
  id: string
  name: string
  status: BoardStatus
  cadence: BoardCadence | null
  periodStart: string | null
  periodEnd: string | null
  automationEnabled?: boolean
  skipWeekends?: boolean
  owner: BoardOwner | null
  collaborators: BoardCollaborator[]
}

interface EditBoardModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  board: Board | null
  onBoardUpdated?: (board: any) => void
}

const STATUS_OPTIONS: { value: BoardStatus; label: string; color: string }[] = [
  { value: "NOT_STARTED", label: "Not Started", color: "bg-gray-100 text-gray-600" },
  { value: "IN_PROGRESS", label: "In Progress", color: "bg-blue-100 text-blue-700" },
  { value: "COMPLETE", label: "Complete", color: "bg-green-100 text-green-700" },
  { value: "BLOCKED", label: "Blocked", color: "bg-red-100 text-red-700" },
  { value: "ARCHIVED", label: "Archived", color: "bg-amber-100 text-amber-700" },
]

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

/**
 * Format period using the shared timezone utility.
 * Wrapper to maintain existing function signature.
 */
function formatPeriod(periodStart: string | null, periodEnd: string | null, cadence: BoardCadence | null, timezone: string): string {
  if (!timezone) {
    console.warn("[EditBoardModal] formatPeriod called without timezone")
  }
  return formatPeriodDisplay(periodStart, periodEnd, cadence, timezone) || ""
}

export function EditBoardModal({
  open,
  onOpenChange,
  board,
  onBoardUpdated
}: EditBoardModalProps) {
  // Form state
  const [name, setName] = useState("")
  const [status, setStatus] = useState<BoardStatus>("NOT_STARTED")
  const [cadence, setCadence] = useState<BoardCadence | null>(null)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>([])
  const [automationEnabled, setAutomationEnabled] = useState(false)
  const [skipWeekends, setSkipWeekends] = useState(true)
  
  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [ownerOpen, setOwnerOpen] = useState(false)
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false)
  const [organizationTimezone, setOrganizationTimezone] = useState<string>("UTC")

  // Fetch organization timezone
  useEffect(() => {
    if (open) {
      fetch("/api/org/accounting-calendar")
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.timezone) {
            setOrganizationTimezone(data.timezone)
          }
        })
        .catch((err) => { console.warn("Failed to fetch organization timezone:", err) })
    }
  }, [open])

  // Initialize form with board data
  useEffect(() => {
    if (board && open) {
      setName(board.name)
      // Normalize legacy statuses
      const normalizedStatus = board.status === "OPEN" as any ? "NOT_STARTED" : 
                               board.status === "CLOSED" as any ? "COMPLETE" : 
                               board.status
      setStatus(normalizedStatus)
      setCadence(board.cadence)
      setOwnerId(board.owner?.id || null)
      setCollaboratorIds(board.collaborators.map(c => c.user.id))
      setAutomationEnabled(board.automationEnabled || false)
      setSkipWeekends(board.skipWeekends ?? true)
      
      fetchTeamMembers()
    }
  }, [board, open])

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch("/api/boards/team-members")
      if (response.ok) {
        const data = await response.json()
        setTeamMembers(data.members || [])
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
    if (!board) return
    
    setError(null)
    
    if (!name.trim()) {
      setError("Board name is required")
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`/api/boards/${board.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          status,
          cadence,
          ownerId: ownerId || undefined,
          collaboratorIds,
          automationEnabled,
          skipWeekends
        })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update board")
      }

      const data = await response.json()
      
      onOpenChange(false)
      onBoardUpdated?.(data.board)
    } catch (error: any) {
      setError(error.message || "Failed to update board")
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setError(null)
    onOpenChange(false)
  }

  // Check if board has existing period data (for backward compatibility display)
  const hasPeriodData = board?.periodStart != null

  if (!board) return null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Board</DialogTitle>
            <DialogDescription>
              Update board details and team assignments
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
              <Label htmlFor="edit-name">Board Name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., January 2026 Close"
              />
            </div>

            {/* Status */}
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as BoardStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${opt.color}`}>
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Board Type (Cadence) */}
            <div className="grid gap-2">
              <Label>Board Type</Label>
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

            {/* Read-only Period Display (for backward compatibility) */}
            {hasPeriodData && (
              <div className="grid gap-2">
                <Label className="flex items-center gap-2 text-gray-500">
                  <Calendar className="h-4 w-4" />
                  Period
                </Label>
                <div className="px-3 py-2 bg-gray-50 border rounded-md text-sm text-gray-600">
                  {formatPeriod(board.periodStart, board.periodEnd, board.cadence, organizationTimezone)}
                </div>
                <p className="text-xs text-gray-400">Period is set when the board is created</p>
              </div>
            )}

            {/* Owner */}
            <div className="grid gap-2">
              <Label>Owner</Label>
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
                          .filter(m => m.id !== ownerId)
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

            {/* Automation Section */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-amber-500" />
                <Label className="text-sm font-medium">Automation</Label>
              </div>
              
              <div className="space-y-3">
                {/* Auto-create next period */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Auto-create next period</p>
                    <p className="text-xs text-gray-500">When this board completes, automatically create the next period with all tasks copied forward</p>
                  </div>
                  <Switch
                    checked={automationEnabled}
                    onCheckedChange={setAutomationEnabled}
                  />
                </div>

                {/* Skip weekends hidden - always enabled by default */}
              </div>
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
              disabled={loading || !name.trim()}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

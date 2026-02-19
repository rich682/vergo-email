"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { Check, ChevronsUpDown, X, Calendar, Users, Zap, Settings2 } from "lucide-react"
import { formatPeriodDisplay } from "@/lib/utils/timezone"

// Types - use string for status to support legacy values
type BoardStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "BLOCKED" | "ARCHIVED" | "OPEN" | "CLOSED"
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
  role?: string
  user: {
    id: string
    name: string | null
    email: string
  }
}

interface BoardInput {
  id: string
  name: string
  status: BoardStatus | string
  cadence: BoardCadence | null
  periodStart: string | null
  periodEnd: string | null
  automationEnabled?: boolean
  skipWeekends?: boolean
  owner: BoardOwner | null
  collaborators: BoardCollaborator[]
}

interface BoardDetailSidebarProps {
  board: BoardInput
  onUpdate: (updates: Partial<BoardInput>) => void
  advancedBoardTypes?: boolean
}

const STATUS_OPTIONS: { value: BoardStatus; label: string; color: string }[] = [
  { value: "NOT_STARTED", label: "Not Started", color: "bg-gray-100 text-gray-600" },
  { value: "IN_PROGRESS", label: "In Progress", color: "bg-blue-100 text-blue-700" },
  { value: "COMPLETE", label: "Complete", color: "bg-green-100 text-green-700" },
  { value: "CLOSED", label: "Closed", color: "bg-green-100 text-green-700" },
  { value: "BLOCKED", label: "Blocked", color: "bg-red-100 text-red-700" },
  { value: "ARCHIVED", label: "Archived", color: "bg-amber-100 text-amber-700" },
]

const SIMPLIFIED_STATUS_OPTIONS: { value: BoardStatus; label: string; color: string }[] = [
  { value: "NOT_STARTED", label: "Not Started", color: "bg-gray-100 text-gray-600" },
  { value: "IN_PROGRESS", label: "In Progress", color: "bg-blue-100 text-blue-700" },
  { value: "CLOSED", label: "Closed", color: "bg-green-100 text-green-700" },
]

const CADENCE_OPTIONS: { value: BoardCadence; label: string }[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "YEAR_END", label: "Year-End" },
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
function formatPeriod(periodStart: string | null, cadence: BoardCadence | null, timezone: string): string {
  if (!timezone) {
    console.warn("[BoardDetailSidebar] formatPeriod called without timezone")
  }
  return formatPeriodDisplay(periodStart, null, cadence, timezone)
}

export function BoardDetailSidebar({ board, onUpdate, advancedBoardTypes = true }: BoardDetailSidebarProps) {
  // State for dropdowns
  const [ownerOpen, setOwnerOpen] = useState(false)
  const [collaboratorsOpen, setCollaboratorsOpen] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [saving, setSaving] = useState(false)
  const [organizationTimezone, setOrganizationTimezone] = useState<string>("UTC")

  // Fetch organization timezone
  useEffect(() => {
    fetch("/api/org/accounting-calendar")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.timezone) {
          setOrganizationTimezone(data.timezone)
        }
      })
      .catch((err) => { console.warn("Failed to fetch organization timezone:", err) })
  }, [])

  // Local state for editing
  const [ownerId, setOwnerId] = useState<string | null>(board.owner?.id || null)
  const [collaboratorIds, setCollaboratorIds] = useState<string[]>(
    board.collaborators.map(c => c.user.id)
  )

  // Fetch team members
  useEffect(() => {
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
    fetchTeamMembers()
  }, [])

  // Reset local state when board changes
  useEffect(() => {
    setOwnerId(board.owner?.id || null)
    setCollaboratorIds(board.collaborators.map(c => c.user.id))
  }, [board])

  const selectedOwner = useMemo(() => {
    return teamMembers.find(m => m.id === ownerId)
  }, [teamMembers, ownerId])

  const selectedCollaborators = useMemo(() => {
    return teamMembers.filter(m => collaboratorIds.includes(m.id))
  }, [teamMembers, collaboratorIds])

  // Handle field updates
  const handleUpdate = async (field: string, value: any) => {
    setSaving(true)
    try {
      const response = await fetch(`/api/boards/${board.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value })
      })

      if (response.ok) {
        const data = await response.json()
        onUpdate(data.board)
      }
    } catch (err) {
      console.error("Failed to update board:", err)
    } finally {
      setSaving(false)
    }
  }

  const handleOwnerChange = async (newOwnerId: string) => {
    setOwnerId(newOwnerId)
    setOwnerOpen(false)
    await handleUpdate("ownerId", newOwnerId)
  }

  const toggleCollaborator = async (userId: string) => {
    const newIds = collaboratorIds.includes(userId)
      ? collaboratorIds.filter(id => id !== userId)
      : [...collaboratorIds, userId]
    
    setCollaboratorIds(newIds)
    await handleUpdate("collaboratorIds", newIds)
  }

  const removeCollaborator = async (userId: string) => {
    const newIds = collaboratorIds.filter(id => id !== userId)
    setCollaboratorIds(newIds)
    await handleUpdate("collaboratorIds", newIds)
  }

  // Normalize legacy statuses
  const normalizedStatus = board.status === "OPEN" as any ? "NOT_STARTED" : board.status

  const statusOptions = advancedBoardTypes ? STATUS_OPTIONS : SIMPLIFIED_STATUS_OPTIONS

  return (
    <div className="space-y-4 w-full max-w-xs">
      {/* Status */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</Label>
        <Select
          value={normalizedStatus}
          onValueChange={(value) => handleUpdate("status", value)}
          disabled={saving}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                <span className={`px-2 py-0.5 rounded-full text-xs ${opt.color}`}>
                  {opt.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Board Type / Cadence - advanced only */}
      {advancedBoardTypes && (
      <div className="space-y-2">
        <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Board Type</Label>
        <Select
          value={board.cadence || ""}
          onValueChange={(value) => handleUpdate("cadence", value)}
          disabled={saving}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {CADENCE_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-400">Used for filtering and automation</p>
      </div>
      )}

      {/* Period (read-only) */}
      {board.periodStart && (
        <div className="space-y-2">
          <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Period
          </Label>
          <div className="px-3 py-2 bg-gray-50 border rounded-md text-sm text-gray-600">
            {formatPeriod(board.periodStart, board.cadence, organizationTimezone)}
          </div>
          <p className="text-xs text-gray-400">Period is set when the board is created</p>
        </div>
      )}

      {/* Owner - advanced only */}
      {advancedBoardTypes && (
      <div className="space-y-2">
        <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</Label>
        <Popover open={ownerOpen} onOpenChange={setOwnerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={ownerOpen}
              className="w-full justify-between"
              disabled={saving}
            >
              {selectedOwner ? (
                <div className="flex items-center gap-2">
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-xs bg-orange-100 text-orange-700">
                      {getInitials(selectedOwner.name, selectedOwner.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{selectedOwner.name || selectedOwner.email}</span>
                </div>
              ) : (
                <span className="text-gray-500">Select owner</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search team members..." />
              <CommandList>
                <CommandEmpty>No team members found.</CommandEmpty>
                <CommandGroup>
                  {teamMembers.map((member) => (
                    <CommandItem
                      key={member.id}
                      value={member.name || member.email}
                      onSelect={() => handleOwnerChange(member.id)}
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
                        <span className="text-sm">{member.name || member.email}</span>
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
      )}

      {/* Collaborators - advanced only */}
      {advancedBoardTypes && (
      <div className="space-y-2">
        <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1">
          <Users className="w-3 h-3" />
          Collaborators
        </Label>
        <Popover open={collaboratorsOpen} onOpenChange={setCollaboratorsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={collaboratorsOpen}
              className="w-full justify-between h-auto min-h-[40px]"
              disabled={saving}
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
                          removeCollaborator(member.id)
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
          <PopoverContent className="w-[280px] p-0" align="start">
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
                          <span className="text-sm">{member.name || member.email}</span>
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
      )}

      {/* Automation Section - only show for non-AD_HOC boards, advanced only */}
      {advancedBoardTypes && board.cadence && board.cadence !== "AD_HOC" && (
        <div className="space-y-3 pt-3 border-t">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <Label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Automation</Label>
          </div>
          
          {/* Auto-create next period */}
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-2">
              <p className="text-sm font-medium text-gray-700">Auto-create next period</p>
              <p className="text-xs text-gray-500">Create next period when complete</p>
            </div>
            <Switch
              checked={board.automationEnabled || false}
              onCheckedChange={(checked) => handleUpdate("automationEnabled", checked)}
              disabled={saving}
            />
          </div>

          {/* Skip weekends hidden - always enabled by default */}
        </div>
      )}
    </div>
  )
}

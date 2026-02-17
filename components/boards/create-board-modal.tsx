"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { Loader2, X, Check, ChevronsUpDown, Users, Zap, Info, Calendar, AlertTriangle, Settings, ChevronLeft, ChevronRight } from "lucide-react"
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
import Link from "next/link"
import {
  isTimezoneConfigured,
  getStartOfPeriod,
  generatePeriodBoardName,
  formatDateInTimezone,
  calculateNextPeriodStart,
  calculatePreviousPeriodStart,
} from "@/lib/utils/timezone"

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
  
  // Organization settings
  const [orgTimezone, setOrgTimezone] = useState<string | null>(null)
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState<number>(1)
  const [loadingOrgSettings, setLoadingOrgSettings] = useState(true)
  
  // Check if timezone is properly configured (not just the default "UTC")
  const timezoneConfigured = isTimezoneConfigured(orgTimezone)
  
  // For recurring boards (non-AD_HOC), warn if timezone not configured
  const showTimezoneWarning = cadence && cadence !== "AD_HOC" && !timezoneConfigured

  // Fetch organization settings on mount
  useEffect(() => {
    if (open) {
      fetchOrgSettings()
    }
  }, [open])

  const fetchOrgSettings = async () => {
    setLoadingOrgSettings(true)
    try {
      const response = await fetch("/api/org/accounting-calendar")
      if (response.ok) {
        const data = await response.json()
        setOrgTimezone(data.timezone || null)
        setFiscalYearStartMonth(data.fiscalYearStartMonth || 1)
      }
    } catch (err) {
      console.error("Failed to fetch org settings:", err)
    } finally {
      setLoadingOrgSettings(false)
    }
  }

  // Auto-set periodStart and name when cadence changes
  const handleCadenceChange = useCallback((newCadence: BoardCadence) => {
    setCadence(newCadence)
    
    // Calculate period start using timezone-aware function
    // If timezone not configured, fall back to the org's stored timezone (even if UTC)
    const timezone = orgTimezone || "UTC"
    const newPeriodStart = getStartOfPeriod(newCadence, timezone, { fiscalYearStartMonth })
    setPeriodStart(newPeriodStart)
    
    // Auto-generate board name if not manually edited
    if (!nameManuallyEdited || !name.trim()) {
      const suggestedName = newPeriodStart 
        ? generatePeriodBoardName(newCadence, newPeriodStart, timezone, { fiscalYearStartMonth })
        : ""
      setName(suggestedName)
    }
  }, [nameManuallyEdited, name, orgTimezone, fiscalYearStartMonth])

  // Navigate to previous/next period
  const handlePeriodChange = useCallback((direction: "prev" | "next") => {
    if (!cadence || !periodStart || cadence === "AD_HOC") return
    const timezone = orgTimezone || "UTC"
    const opts = { fiscalYearStartMonth }
    const newPeriodStart = direction === "prev"
      ? calculatePreviousPeriodStart(cadence, periodStart, timezone, opts)
      : calculateNextPeriodStart(cadence, periodStart, timezone, opts)
    if (!newPeriodStart) return
    setPeriodStart(newPeriodStart)
    if (!nameManuallyEdited || !name.trim()) {
      const suggestedName = generatePeriodBoardName(cadence, newPeriodStart, timezone, { fiscalYearStartMonth })
      setName(suggestedName)
    }
  }, [cadence, periodStart, orgTimezone, fiscalYearStartMonth, nameManuallyEdited, name])

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

          {/* Timezone Warning for Recurring Boards */}
          {showTimezoneWarning && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800">Timezone Not Configured</p>
                  <p className="text-amber-700 mt-1">
                    Your organization timezone is not set. Recurring boards require a timezone 
                    to ensure periods are created correctly.
                  </p>
                  <Link 
                    href="/dashboard/settings/accounting" 
                    className="inline-flex items-center gap-1 mt-2 text-amber-800 hover:text-amber-900 font-medium underline"
                    onClick={() => onOpenChange(false)}
                  >
                    <Settings className="h-3 w-3" />
                    Configure in Settings
                  </Link>
                </div>
              </div>
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
              {periodStart && cadence && cadence !== "AD_HOC" && orgTimezone && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Calendar className="h-3 w-3" />
                  <span>Period: {formatDateInTimezone(periodStart, orgTimezone)}</span>
                  <div className="flex items-center gap-0.5 ml-1">
                    <button
                      type="button"
                      onClick={() => handlePeriodChange("prev")}
                      className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Previous period"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePeriodChange("next")}
                      className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Next period"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
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
                        When this board completes, Vergo will create the next period with all tasks copied forward.
                      </p>
                    </div>
                    <div className="flex items-center justify-between pl-6">
                      <Label htmlFor="auto-create" className="text-sm font-medium text-gray-700 cursor-pointer">
                        Enable automation
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
              disabled={loading || !name.trim() || !cadence || loadingOrgSettings}
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

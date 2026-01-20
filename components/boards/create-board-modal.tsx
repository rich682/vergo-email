"use client"

import { useState, useEffect, useMemo } from "react"
import { Loader2, X, Check, ChevronsUpDown, Users, Calendar } from "lucide-react"
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
import { format, startOfWeek, endOfWeek } from "date-fns"

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

const CADENCE_OPTIONS: { value: BoardCadence; label: string; description: string }[] = [
  { value: "MONTHLY", label: "Monthly", description: "e.g., January 2026 Close" },
  { value: "WEEKLY", label: "Weekly", description: "e.g., Week of Jan 20, 2026" },
  { value: "QUARTERLY", label: "Quarterly", description: "e.g., Q1 2026" },
  { value: "YEAR_END", label: "Year-End", description: "e.g., Year-End Close 2026" },
  { value: "DAILY", label: "Daily", description: "e.g., Daily Close - Jan 20, 2026" },
  { value: "AD_HOC", label: "Ad Hoc", description: "One-off project or audit" },
]

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"]

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i) // -1 to +3 years

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.split(" ")
    return parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.substring(0, 2).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

// Get Monday of the week for a given date (ISO week: Monday = start)
function getMondayOfWeek(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 }) // 1 = Monday
}

// Get Sunday of the week for a given date
function getSundayOfWeek(date: Date): Date {
  return endOfWeek(date, { weekStartsOn: 1 })
}

// Get current quarter (1-4)
function getCurrentQuarter(): string {
  const month = new Date().getMonth()
  return `Q${Math.floor(month / 3) + 1}`
}

// Get current month name
function getCurrentMonth(): string {
  return MONTHS[new Date().getMonth()]
}

function generateBoardName(
  cadence: BoardCadence | null,
  selectedDate: Date | null,
  month: string | null,
  quarter: string | null,
  year: number | null
): string {
  if (!cadence) return ""
  
  switch (cadence) {
    case "DAILY":
      return selectedDate ? `Daily Close - ${format(selectedDate, "MMM d, yyyy")}` : ""
    case "WEEKLY":
      if (selectedDate) {
        const monday = getMondayOfWeek(selectedDate)
        return `Weekly Tasks - Week of ${format(monday, "MMM d, yyyy")}`
      }
      return ""
    case "MONTHLY":
      return month && year ? `${month} ${year} Close` : ""
    case "QUARTERLY":
      return quarter && year ? `${quarter} ${year}` : ""
    case "YEAR_END":
      return year ? `Year-End Close ${year}` : ""
    case "AD_HOC":
      return ""
    default:
      return ""
  }
}

function getPeriodDates(
  cadence: BoardCadence | null,
  selectedDate: Date | null,
  month: string | null,
  quarter: string | null,
  year: number | null
): { start: Date | null; end: Date | null } {
  if (!cadence) return { start: null, end: null }
  
  switch (cadence) {
    case "DAILY":
      if (!selectedDate) return { start: null, end: null }
      // Daily: start and end are the same date
      return {
        start: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate()),
        end: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate())
      }
    case "WEEKLY":
      if (!selectedDate) return { start: null, end: null }
      // Weekly: Monday to Sunday of the selected week
      return {
        start: getMondayOfWeek(selectedDate),
        end: getSundayOfWeek(selectedDate)
      }
    case "MONTHLY":
      if (!month || !year) return { start: null, end: null }
      const monthIndex = MONTHS.indexOf(month)
      if (monthIndex === -1) return { start: null, end: null }
      return {
        start: new Date(year, monthIndex, 1),
        end: new Date(year, monthIndex + 1, 0) // Last day of month
      }
    case "QUARTERLY":
      if (!quarter || !year) return { start: null, end: null }
      const qIndex = QUARTERS.indexOf(quarter)
      if (qIndex === -1) return { start: null, end: null }
      return {
        start: new Date(year, qIndex * 3, 1),
        end: new Date(year, (qIndex + 1) * 3, 0) // Last day of quarter
      }
    case "YEAR_END":
      if (!year) return { start: null, end: null }
      return {
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31)
      }
    case "AD_HOC":
      return { start: null, end: null }
    default:
      return { start: null, end: null }
  }
}

export function CreateBoardModal({
  open,
  onOpenChange,
  onBoardCreated
}: CreateBoardModalProps) {
  // Form state
  const [cadence, setCadence] = useState<BoardCadence | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date()) // For Daily and Weekly
  const [month, setMonth] = useState<string | null>(getCurrentMonth())
  const [quarter, setQuarter] = useState<string | null>(getCurrentQuarter())
  const [year, setYear] = useState<number | null>(CURRENT_YEAR)
  const [name, setName] = useState("")
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false)
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

  // Auto-generate name when cadence/period changes
  useEffect(() => {
    if (!nameManuallyEdited) {
      const generated = generateBoardName(cadence, selectedDate, month, quarter, year)
      setName(generated)
    }
  }, [cadence, selectedDate, month, quarter, year, nameManuallyEdited])

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

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value)
    setNameManuallyEdited(true)
  }

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
      setError("Please select a cadence")
      return
    }

    // Validate period selection for non-ad-hoc cadences
    if (cadence !== "AD_HOC") {
      if (cadence === "DAILY" || cadence === "WEEKLY") {
        if (!selectedDate) {
          setError("Please select a date")
          return
        }
      } else if (cadence === "MONTHLY") {
        if (!month || !year) {
          setError("Please select a month and year")
          return
        }
      } else if (cadence === "QUARTERLY") {
        if (!quarter || !year) {
          setError("Please select a quarter and year")
          return
        }
      } else if (cadence === "YEAR_END") {
        if (!year) {
          setError("Please select a year")
          return
        }
      }
    }

    setLoading(true)

    try {
      const { start, end } = getPeriodDates(cadence, selectedDate, month, quarter, year)
      
      const response = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          cadence,
          ownerId: ownerId || undefined,
          periodStart: start?.toISOString(),
          periodEnd: end?.toISOString(),
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
    setSelectedDate(new Date())
    setMonth(getCurrentMonth())
    setQuarter(getCurrentQuarter())
    setYear(CURRENT_YEAR)
    setName("")
    setNameManuallyEdited(false)
    setOwnerId(currentUserId)
    setCollaboratorIds([])
    setError(null)
  }

  const handleClose = () => {
    resetForm()
    onOpenChange(false)
  }

  // Handle cadence change - reset to appropriate defaults
  const handleCadenceChange = (newCadence: BoardCadence) => {
    setCadence(newCadence)
    setNameManuallyEdited(false)
    
    // Reset to current defaults
    setSelectedDate(new Date())
    setMonth(getCurrentMonth())
    setQuarter(getCurrentQuarter())
    setYear(CURRENT_YEAR)
  }

  // Format the week range for display
  const weekRangeDisplay = useMemo(() => {
    if (!selectedDate) return ""
    const monday = getMondayOfWeek(selectedDate)
    const sunday = getSundayOfWeek(selectedDate)
    return `${format(monday, "MMM d")} - ${format(sunday, "MMM d, yyyy")}`
  }, [selectedDate])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Board</DialogTitle>
            <DialogDescription>
              Organize your tasks by time period
            </DialogDescription>
          </DialogHeader>
          
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
              {error}
            </div>
          )}
          
          <div className="py-4 space-y-4">
            {/* Cadence */}
            <div className="grid gap-2">
              <Label htmlFor="cadence">Cadence *</Label>
              <Select
                value={cadence || ""}
                onValueChange={(v) => handleCadenceChange(v as BoardCadence)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select cadence type" />
                </SelectTrigger>
                <SelectContent>
                  {CADENCE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div>
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-gray-500 ml-2 text-xs">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time Period Selectors - Cadence-specific */}
            {cadence && cadence !== "AD_HOC" && (
              <div className="grid gap-2">
                <Label>
                  {cadence === "DAILY" && "Date *"}
                  {cadence === "WEEKLY" && "Week of *"}
                  {cadence === "MONTHLY" && "Month *"}
                  {cadence === "QUARTERLY" && "Quarter *"}
                  {cadence === "YEAR_END" && "Year *"}
                </Label>
                
                {/* Daily: Date picker */}
                {cadence === "DAILY" && (
                  <div className="relative">
                    <Input
                      type="date"
                      value={selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          setSelectedDate(new Date(e.target.value + "T12:00:00"))
                        }
                      }}
                      className="w-full"
                    />
                  </div>
                )}

                {/* Weekly: Date picker with week display */}
                {cadence === "WEEKLY" && (
                  <div className="space-y-2">
                    <Input
                      type="date"
                      value={selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          setSelectedDate(new Date(e.target.value + "T12:00:00"))
                        }
                      }}
                      className="w-full"
                    />
                    {selectedDate && (
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        Week: {weekRangeDisplay}
                      </p>
                    )}
                  </div>
                )}

                {/* Monthly: Month + Year dropdowns */}
                {cadence === "MONTHLY" && (
                  <div className="flex gap-2">
                    <Select value={month || ""} onValueChange={setMonth}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Month" />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={year?.toString() || ""} onValueChange={(v) => setYear(parseInt(v))}>
                      <SelectTrigger className="w-28">
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {YEARS.map(y => (
                          <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Quarterly: Quarter + Year dropdowns */}
                {cadence === "QUARTERLY" && (
                  <div className="flex gap-2">
                    <Select value={quarter || ""} onValueChange={setQuarter}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Quarter" />
                      </SelectTrigger>
                      <SelectContent>
                        {QUARTERS.map(q => (
                          <SelectItem key={q} value={q}>{q}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={year?.toString() || ""} onValueChange={(v) => setYear(parseInt(v))}>
                      <SelectTrigger className="w-28">
                        <SelectValue placeholder="Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {YEARS.map(y => (
                          <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Year-End: Year dropdown only */}
                {cadence === "YEAR_END" && (
                  <Select value={year?.toString() || ""} onValueChange={(v) => setYear(parseInt(v))}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {YEARS.map(y => (
                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Board Name */}
            <div className="grid gap-2">
              <Label htmlFor="name">Board Name</Label>
              <Input
                id="name"
                value={name}
                onChange={handleNameChange}
                placeholder={cadence === "AD_HOC" ? "Enter board name" : "Auto-generated or enter custom name"}
              />
              {!nameManuallyEdited && name && (
                <p className="text-xs text-gray-500">Auto-generated from cadence and period</p>
              )}
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

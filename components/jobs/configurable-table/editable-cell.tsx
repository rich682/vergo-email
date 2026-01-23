"use client"

import { ColumnDefinition, JobRow, TeamMember } from "./types"
import { TextCell, StatusCell, PersonCell, DateCell, NotesCell, FilesCell, ResponsesCell, DataStatusCell } from "./cell-types"

interface EditableCellProps {
  column: ColumnDefinition
  job: JobRow
  teamMembers: TeamMember[]
  onUpdate: (jobId: string, field: string, value: any) => void
}

export function EditableCell({ column, job, teamMembers, onUpdate }: EditableCellProps) {
  const handleChange = (value: any) => {
    if (column.field) {
      onUpdate(job.id, column.field, value)
    } else {
      // Custom field - store in customFields JSON
      onUpdate(job.id, `customFields.${column.id}`, value)
    }
  }

  switch (column.type) {
    case "text":
      const textValue = column.field === "name" 
        ? job.name 
        : (job.customFields?.[column.id] || null)
      
      return (
        <TextCell
          value={textValue}
          onChange={handleChange}
          placeholder={column.label}
        />
      )

    case "status":
      return (
        <StatusCell
          value={job.status}
          onChange={handleChange}
        />
      )

    case "person":
      return (
        <PersonCell
          value={job.ownerId}
          displayName={job.ownerName}
          displayEmail={job.ownerEmail}
          teamMembers={teamMembers}
          onChange={handleChange}
        />
      )

    case "date":
      return (
        <DateCell
          value={job.dueDate}
          onChange={handleChange}
        />
      )

    case "notes":
      return (
        <NotesCell
          value={job.notes}
          onChange={handleChange}
        />
      )

    case "files":
      return (
        <FilesCell
          jobId={job.id}
          fileCount={job.collectedItemCount || 0}
        />
      )

    case "responses":
      return (
        <ResponsesCell
          jobId={job.id}
          respondedCount={job.respondedCount || 0}
          totalCount={job.taskCount || 0}
        />
      )

    case "dataStatus":
      return (
        <DataStatusCell
          value={job.dataStatus}
        />
      )

    default:
      return <span className="text-sm text-gray-400">—</span>
  }
}

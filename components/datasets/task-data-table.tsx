"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Download, Upload, ExternalLink, Plus, Trash2 } from "lucide-react"
import Link from "next/link"

export type DataState = "no_schema" | "schema_only" | "has_data"

export interface SchemaColumn {
  key: string
  label: string
  type: string
  required: boolean
}

export interface TaskDataRow {
  id: string // TaskInstance ID
  lineageId: string | null // TaskLineage ID for schema linkage
  name: string
  type: "TABLE" | "RECONCILIATION"
  description: string | null
  dataState: DataState
  // Board info (directly from TaskInstance's board)
  boardName: string | null
  cadence: string | null
  accountingPeriod: string | null
  datasetTemplate?: {
    id: string
    name: string
    schema: SchemaColumn[]
    identityKey: string
    columnCount: number
    snapshotCount: number
    latestSnapshot?: {
      id: string
      rowCount: number
      createdAt: string
    }
  }
}

interface TaskDataTableProps {
  tasks: TaskDataRow[]
  onCreateSchema: (task: TaskDataRow) => void
  onUploadData: (task: TaskDataRow) => void
  onDownloadTemplate: (task: TaskDataRow) => void
  onDeleteData: (task: TaskDataRow) => void
}

const TYPE_LABELS: Record<string, string> = {
  TABLE: "Variance",
  RECONCILIATION: "Reconciliation",
}

const TYPE_COLORS: Record<string, string> = {
  TABLE: "bg-purple-100 text-purple-800",
  RECONCILIATION: "bg-blue-100 text-blue-800",
}

const CADENCE_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEAR_END: "Year End",
  AD_HOC: "Ad Hoc",
}

function DataStatusBadge({ state, snapshotCount }: { state: DataState; snapshotCount?: number }) {
  switch (state) {
    case "no_schema":
      return (
        <Badge variant="outline" className="text-gray-500 border-gray-300">
          No schema
        </Badge>
      )
    case "schema_only":
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
          Schema only
        </Badge>
      )
    case "has_data":
      return (
        <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
          {snapshotCount} snapshot{snapshotCount !== 1 ? "s" : ""}
        </Badge>
      )
  }
}

export function TaskDataTable({
  tasks,
  onCreateSchema,
  onUploadData,
  onDownloadTemplate,
  onDeleteData,
}: TaskDataTableProps) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Task Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Board
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Recurring
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Period
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Data Status
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {tasks.map((task) => (
            <tr key={task.id} className="hover:bg-gray-50">
              <td className="px-6 py-4">
                <div>
                  <div className="text-sm font-medium text-gray-900">{task.name}</div>
                  {task.description && (
                    <div className="text-sm text-gray-500 truncate max-w-xs">
                      {task.description}
                    </div>
                  )}
                </div>
              </td>
              <td className="px-6 py-4">
                <Badge className={TYPE_COLORS[task.type]}>
                  {TYPE_LABELS[task.type]}
                </Badge>
              </td>
              <td className="px-6 py-4 text-sm text-gray-900">
                {task.boardName || <span className="text-gray-400">—</span>}
              </td>
              <td className="px-6 py-4 text-sm text-gray-900">
                {task.cadence ? CADENCE_LABELS[task.cadence] || task.cadence : <span className="text-gray-400">—</span>}
              </td>
              <td className="px-6 py-4 text-sm text-gray-900">
                {task.accountingPeriod || <span className="text-gray-400">—</span>}
              </td>
              <td className="px-6 py-4">
                <DataStatusBadge
                  state={task.dataState}
                  snapshotCount={task.datasetTemplate?.snapshotCount}
                />
              </td>
              <td className="px-6 py-4 text-right">
                <TaskActions
                  task={task}
                  onCreateSchema={onCreateSchema}
                  onUploadData={onUploadData}
                  onDownloadTemplate={onDownloadTemplate}
                  onDeleteData={onDeleteData}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface TaskActionsProps {
  task: TaskDataRow
  onCreateSchema: (task: TaskDataRow) => void
  onUploadData: (task: TaskDataRow) => void
  onDownloadTemplate: (task: TaskDataRow) => void
  onDeleteData: (task: TaskDataRow) => void
}

function TaskActions({ task, onCreateSchema, onUploadData, onDownloadTemplate, onDeleteData }: TaskActionsProps) {
  switch (task.dataState) {
    case "no_schema":
      return (
        <Button size="sm" onClick={() => onCreateSchema(task)}>
          <Plus className="w-4 h-4 mr-1" />
          Create Schema
        </Button>
      )

    case "schema_only":
      return (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDownloadTemplate(task)}
          >
            <Download className="w-4 h-4 mr-1" />
            Template
          </Button>
          <Button size="sm" onClick={() => onUploadData(task)}>
            <Upload className="w-4 h-4 mr-1" />
            Upload
          </Button>
        </div>
      )

    case "has_data":
      return (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUploadData(task)}
          >
            <Upload className="w-4 h-4 mr-1" />
            Upload
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/data/${task.datasetTemplate?.id}`}>
              <ExternalLink className="w-4 h-4 mr-1" />
              Open
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDeleteData(task)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )
  }
}

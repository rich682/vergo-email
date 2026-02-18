import type { AutomationTemplate } from "./types"

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  // ─── Data Collection ──────────────────────────────────────────────────

  {
    id: "send-standard-request",
    name: "Send Standard Request",
    description:
      "Auto-send a recurring request to the same contacts each period (e.g. monthly timesheets). Inherits email template and recipients from a previously completed task.",
    icon: "Send",
    triggerType: "board_created",
    defaultConditions: {},
    defaultSteps: [
      {
        type: "action",
        label: "Send requests",
        actionType: "send_request",
        actionParams: {},
      },
    ],
    category: "requests",
    requiresDatabase: false,
    allowedTriggers: ["board_created", "scheduled", "board_status_changed"],
    recipientSource: "task_history",
  },
  {
    id: "send-form",
    name: "Send Form",
    description:
      "Auto-send the same form to recipients each period (e.g. monthly surveys, onboarding). Inherits form template and recipients from a previously completed task.",
    icon: "ClipboardList",
    triggerType: "board_created",
    defaultConditions: {},
    defaultSteps: [
      {
        type: "action",
        label: "Send forms",
        actionType: "send_form",
        actionParams: {},
      },
    ],
    category: "forms",
    requiresDatabase: false,
    allowedTriggers: ["board_created", "scheduled", "board_status_changed"],
    recipientSource: "task_history",
  },
  {
    id: "send-data-request",
    name: "Send Data Personalized Request",
    description:
      "Auto-send personalized emails to recipients from a database (e.g. clients with unpaid invoices). Inherits email template from a previously completed task; recipients come from a database.",
    icon: "Database",
    triggerType: "board_created",
    defaultConditions: {},
    defaultSteps: [
      {
        type: "action",
        label: "Send data requests",
        actionType: "send_request",
        actionParams: { recipientSourceType: "database" },
      },
    ],
    category: "requests",
    requiresDatabase: true,
    allowedTriggers: [
      "board_created",
      "scheduled",
      "board_status_changed",
      "database_update",
    ],
    recipientSource: "database",
  },

  // ─── Processing ─────────────────────────────────────────────────────

  {
    id: "run-reconciliation",
    name: "Run Reconciliation",
    description:
      "Auto-reconcile two databases each period (e.g. general ledger vs bank statement). Requires a Database vs Database reconciliation configuration.",
    icon: "Scale",
    triggerType: "board_created",
    defaultConditions: {},
    defaultSteps: [
      {
        type: "action",
        label: "Run reconciliation",
        actionType: "run_reconciliation",
        actionParams: {},
      },
      {
        type: "human_approval",
        label: "Review reconciliation results",
        approvalMessage:
          "Please review the reconciliation results before completing.",
        timeoutHours: 72,
      },
      {
        type: "action",
        label: "Complete reconciliation",
        actionType: "complete_reconciliation",
        actionParams: {},
      },
    ],
    category: "reconciliation",
    requiresDatabase: true,
    allowedTriggers: [
      "board_created",
      "scheduled",
      "board_status_changed",
      "database_update",
    ],
    recipientSource: "config",
  },
  {
    id: "run-report",
    name: "Run Report",
    description:
      "Auto-generate a report each period (e.g. monthly profitability report). Uses an existing Report Definition.",
    icon: "FileBarChart",
    triggerType: "board_created",
    defaultConditions: {},
    defaultSteps: [
      {
        type: "action",
        label: "Generate report",
        actionType: "complete_report",
        actionParams: {},
      },
    ],
    category: "reports",
    requiresDatabase: true,
    allowedTriggers: [
      "board_created",
      "scheduled",
      "board_status_changed",
      "database_update",
    ],
    recipientSource: "config",
  },
]

/** Get a template by its ID */
export function getTemplate(id: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find((t) => t.id === id)
}

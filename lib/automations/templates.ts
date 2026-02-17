import type { AutomationTemplate } from "./types"

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  // ─── Data Collection ──────────────────────────────────────────────────

  {
    id: "send-requests-new-period",
    name: "Send requests when a new period starts",
    description: "Automatically send data requests to contacts when a new accounting period board is created.",
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
  },
  {
    id: "send-forms-new-period",
    name: "Send forms when a new period starts",
    description: "Automatically send forms to contacts when a new accounting period board is created.",
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
  },
  {
    id: "monthly-scheduled-request",
    name: "Monthly scheduled request",
    description: "Send data requests on a recurring schedule (e.g., 1st of every month).",
    icon: "Clock",
    triggerType: "scheduled",
    defaultConditions: { cronExpression: "0 9 1 * *", timezone: "UTC" },
    defaultSteps: [
      {
        type: "action",
        label: "Send requests",
        actionType: "send_request",
        actionParams: {},
      },
    ],
    category: "requests",
  },

  // ─── Overdue & Outstanding Follow-ups ─────────────────────────────────

  {
    id: "chase-overdue-invoices",
    name: "Chase overdue invoices",
    description: "Automatically email clients with overdue invoices pulled from your invoices database, with reminders until they respond.",
    icon: "AlertCircle",
    triggerType: "scheduled",
    defaultConditions: { cronExpression: "0 9 * * 1", timezone: "UTC" },
    defaultSteps: [
      {
        type: "action",
        label: "Send overdue invoice reminders",
        actionType: "send_request",
        actionParams: {
          recipientSourceType: "database",
        },
      },
    ],
    category: "requests",
  },
  {
    id: "outstanding-balance-follow-up",
    name: "Follow up on outstanding balances",
    description: "Weekly check for contacts with outstanding balances and send personalized follow-up requests.",
    icon: "DollarSign",
    triggerType: "scheduled",
    defaultConditions: { cronExpression: "0 9 * * 1", timezone: "UTC" },
    defaultSteps: [
      {
        type: "action",
        label: "Send balance reminders",
        actionType: "send_request",
        actionParams: {
          recipientSourceType: "database",
        },
      },
    ],
    category: "requests",
  },

  // ─── Compliance & Document Collection ─────────────────────────────────

  {
    id: "collect-w9-new-vendors",
    name: "Collect W-9s from new vendors",
    description: "When a form is submitted for a new vendor, automatically send a W-9 collection request.",
    icon: "FileCheck",
    triggerType: "form_submitted",
    defaultConditions: {},
    defaultSteps: [
      {
        type: "action",
        label: "Send W-9 request",
        actionType: "send_request",
        actionParams: {
          recipientSourceType: "contact_types",
          contactTypes: ["VENDOR"],
        },
      },
    ],
    category: "requests",
  },
  {
    id: "annual-coi-renewal",
    name: "Annual COI renewal requests",
    description: "Send certificate of insurance renewal requests to all vendors on an annual schedule.",
    icon: "ShieldCheck",
    triggerType: "scheduled",
    defaultConditions: { cronExpression: "0 9 1 1 *", timezone: "UTC" },
    defaultSteps: [
      {
        type: "action",
        label: "Send COI renewal requests",
        actionType: "send_request",
        actionParams: {
          recipientSourceType: "contact_types",
          contactTypes: ["VENDOR"],
        },
      },
    ],
    category: "requests",
  },

  // ─── Reconciliation ───────────────────────────────────────────────────

  {
    id: "auto-reconcile-data-uploaded",
    name: "Auto-reconcile when data is uploaded",
    description: "Run the AI reconciliation agent when new data is matched, with human approval before completing.",
    icon: "Scale",
    triggerType: "data_uploaded",
    defaultConditions: {},
    defaultSteps: [
      {
        type: "agent_run",
        label: "Run reconciliation agent",
      },
      {
        type: "human_approval",
        label: "Review reconciliation results",
        approvalMessage: "Please review the reconciliation results before completing.",
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
  },
  {
    id: "reconcile-and-report",
    name: "Reconcile, approve, then generate report",
    description: "Full end-to-end: AI reconciles uploaded data, human reviews, then auto-generates a summary report.",
    icon: "Scale",
    triggerType: "data_uploaded",
    defaultConditions: {},
    defaultSteps: [
      {
        type: "agent_run",
        label: "Run reconciliation agent",
      },
      {
        type: "human_approval",
        label: "Review reconciliation",
        approvalMessage: "Review the reconciliation results. Approve to generate the summary report.",
        timeoutHours: 72,
      },
      {
        type: "action",
        label: "Complete reconciliation",
        actionType: "complete_reconciliation",
        actionParams: {},
      },
      {
        type: "action",
        label: "Generate report",
        actionType: "complete_report",
        actionParams: {},
      },
    ],
    category: "reconciliation",
  },

  // ─── Reports & Analysis ───────────────────────────────────────────────

  {
    id: "report-on-board-complete",
    name: "Generate report when board completes",
    description: "Automatically generate a report when an accounting period board is marked as complete.",
    icon: "FileBarChart",
    triggerType: "board_status_changed",
    defaultConditions: { targetStatus: "COMPLETE" },
    defaultSteps: [
      {
        type: "action",
        label: "Generate report",
        actionType: "complete_report",
        actionParams: {},
      },
    ],
    category: "reports",
  },

  // ─── AI Agent Workflows ───────────────────────────────────────────────

  {
    id: "scheduled-agent-run",
    name: "Run agent on schedule",
    description: "Run an AI agent on a recurring schedule with human review before completing.",
    icon: "Bot",
    triggerType: "scheduled",
    defaultConditions: { cronExpression: "0 9 * * 1", timezone: "UTC" },
    defaultSteps: [
      {
        type: "agent_run",
        label: "Run AI agent",
      },
      {
        type: "human_approval",
        label: "Review agent results",
        approvalMessage: "Please review the AI agent results.",
        timeoutHours: 48,
      },
    ],
    category: "agents",
  },
  {
    id: "agent-on-form-submission",
    name: "Run agent when form is submitted",
    description: "Trigger an AI agent to process data when a form response comes in, with human approval gate.",
    icon: "Bot",
    triggerType: "form_submitted",
    defaultConditions: {},
    defaultSteps: [
      {
        type: "agent_run",
        label: "Run AI agent",
      },
      {
        type: "human_approval",
        label: "Review results",
        approvalMessage: "Review the AI agent output before finalizing.",
        timeoutHours: 48,
      },
    ],
    category: "agents",
  },

  // ─── Multi-step Period Close ──────────────────────────────────────────

  {
    id: "full-period-close",
    name: "Full period close workflow",
    description: "Complete period close: send requests, wait for approval, run reconciliation agent, generate reports.",
    icon: "Workflow",
    triggerType: "board_created",
    defaultConditions: {},
    defaultSteps: [
      {
        type: "action",
        label: "Send data requests",
        actionType: "send_request",
        actionParams: {},
      },
      {
        type: "human_approval",
        label: "Confirm all data received",
        approvalMessage: "Confirm that all requested data has been received before proceeding to reconciliation.",
        timeoutHours: 168,
      },
      {
        type: "agent_run",
        label: "Run reconciliation agent",
      },
      {
        type: "human_approval",
        label: "Review reconciliation",
        approvalMessage: "Review reconciliation results before generating the final report.",
        timeoutHours: 72,
      },
      {
        type: "action",
        label: "Generate period report",
        actionType: "complete_report",
        actionParams: {},
      },
    ],
    category: "requests",
  },

  // ─── Custom ───────────────────────────────────────────────────────────

  {
    id: "custom",
    name: "Custom automation",
    description: "Build a custom automation with your own trigger and workflow steps.",
    icon: "Wrench",
    triggerType: "board_created", // Placeholder — user will select
    defaultConditions: {},
    defaultSteps: [],
    category: "requests",
  },
]

/** Get a template by its ID */
export function getTemplate(id: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find((t) => t.id === id)
}

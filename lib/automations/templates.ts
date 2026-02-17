import type { AutomationTemplate } from "./types"

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
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

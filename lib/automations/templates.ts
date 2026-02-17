import type { AutomationTemplate } from "./types"

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  // ─── Data Collection ──────────────────────────────────────────────────
  // Single-step workflows that send requests or forms to recipients.
  // Trigger and recipients are configured in later wizard steps.

  {
    id: "send-requests",
    name: "Send data requests",
    description: "Send data collection requests to contacts, groups, or recipients pulled from a database. Configure who receives them and when in the next steps.",
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
    id: "send-forms",
    name: "Send forms",
    description: "Send forms to contacts for data intake — onboarding, surveys, questionnaires, or any structured data collection.",
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
    id: "send-request-with-reminders",
    name: "Send requests with follow-up reminders",
    description: "Send data requests and automatically follow up with reminders until recipients respond or a deadline passes.",
    icon: "Clock",
    triggerType: "board_created",
    defaultConditions: {},
    defaultSteps: [
      {
        type: "action",
        label: "Send requests",
        actionType: "send_request",
        actionParams: {
          remindersConfig: {
            enabled: true,
            frequency: "weekly",
            stopCondition: "reply",
          },
        },
      },
    ],
    category: "requests",
  },

  // ─── Reconciliation ───────────────────────────────────────────────────
  // Agent-driven reconciliation with human-in-the-loop approval.

  {
    id: "run-reconciliation",
    name: "Run reconciliation",
    description: "Run the AI reconciliation agent, pause for human review, then mark reconciliation complete.",
    icon: "Scale",
    triggerType: "board_created",
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

  // ─── Reports ──────────────────────────────────────────────────────────

  {
    id: "generate-report",
    name: "Generate report",
    description: "Automatically generate a summary report — P&L, balance sheet, or any period-end report.",
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
  },

  // ─── AI Agent ─────────────────────────────────────────────────────────

  {
    id: "run-agent",
    name: "Run AI agent",
    description: "Run an AI agent with human review before finalizing. Use for any agent task — categorization, analysis, data processing.",
    icon: "Bot",
    triggerType: "board_created",
    defaultConditions: {},
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

  // ─── Multi-step Workflows ─────────────────────────────────────────────
  // End-to-end processes chaining multiple actions with approval gates.

  {
    id: "collect-then-reconcile",
    name: "Collect data, then reconcile",
    description: "Send data requests, wait for approval that all data is in, then run reconciliation with review.",
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
        approvalMessage: "Review reconciliation results before completing.",
        timeoutHours: 72,
      },
      {
        type: "action",
        label: "Complete reconciliation",
        actionType: "complete_reconciliation",
        actionParams: {},
      },
    ],
    category: "requests",
  },
  {
    id: "reconcile-then-report",
    name: "Reconcile, then generate report",
    description: "Run reconciliation with human review, then automatically generate a summary report.",
    icon: "Workflow",
    triggerType: "board_created",
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
  {
    id: "full-period-close",
    name: "Full period close",
    description: "End-to-end period close: collect data, reconcile with review, then generate reports — all in one workflow.",
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
        label: "Complete reconciliation",
        actionType: "complete_reconciliation",
        actionParams: {},
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
    description: "Build a custom automation from scratch — pick your own trigger, steps, and configuration.",
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

import type { AutomationTemplate } from "./types"

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  // ─── Data Collection ──────────────────────────────────────────────────
  // Send requests or forms to collect data. Users configure trigger,
  // recipients, approvals, and additional steps in the wizard.

  {
    id: "send-requests",
    name: "Send data requests",
    description: "Collect documents, files, or information from contacts, groups, or database recipients.",
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
    description: "Send forms for data intake — onboarding, surveys, questionnaires, or any structured collection.",
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

  // ─── Reconciliation ───────────────────────────────────────────────────

  {
    id: "run-reconciliation",
    name: "Run reconciliation",
    description: "Run the AI reconciliation agent to match and reconcile data across sources.",
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
    description: "Generate a summary report — P&L, balance sheet, or any period-end report.",
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

  // ─── Custom ───────────────────────────────────────────────────────────

  {
    id: "custom",
    name: "Custom agent",
    description: "Build your own agent with any combination of actions, approvals, and steps.",
    icon: "Wrench",
    triggerType: "board_created",
    defaultConditions: {},
    defaultSteps: [],
    category: "requests",
  },
]

/** Get a template by its ID */
export function getTemplate(id: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find((t) => t.id === id)
}

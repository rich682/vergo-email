/**
 * Centralized Feature Flags
 * 
 * Environment Variables:
 * - NEXT_PUBLIC_QUEST_UI: Enables Quest UI (client + server visible)
 * - QUEST_AI_INTERPRETER: Enables AI interpretation endpoint (server only)
 * - QUEST_STANDING: Enables standing/recurring quests (server only)
 * - NEXT_PUBLIC_JOBS_UI: Enables Jobs UI for task-centric workflows (client + server visible)
 * - NEXT_PUBLIC_ITEM_SEND_REQUEST: Enables in-modal Send Request flow on Item pages (client + server visible)
 */

// Log feature flags at boot (server-side only)
if (typeof window === "undefined") {
  console.log("Feature flags at boot:", {
    NEXT_PUBLIC_QUEST_UI: process.env.NEXT_PUBLIC_QUEST_UI,
    QUEST_AI_INTERPRETER: process.env.QUEST_AI_INTERPRETER,
    QUEST_STANDING: process.env.QUEST_STANDING,
    NEXT_PUBLIC_JOBS_UI: process.env.NEXT_PUBLIC_JOBS_UI,
    NEXT_PUBLIC_ITEM_SEND_REQUEST: process.env.NEXT_PUBLIC_ITEM_SEND_REQUEST,
  })
}

/**
 * Check if Quest UI is enabled
 * Works on both client and server
 */
export function isQuestUIEnabled(): boolean {
  return process.env.NEXT_PUBLIC_QUEST_UI === "true"
}

/**
 * Check if Quest AI Interpreter is enabled
 * Server-only flag
 */
export function isQuestInterpreterEnabled(): boolean {
  return process.env.QUEST_AI_INTERPRETER === "true"
}

/**
 * Check if Standing (recurring) Quests are enabled
 * Server-only flag
 */
export function isStandingQuestsEnabled(): boolean {
  return process.env.QUEST_STANDING === "true"
}

/**
 * Check if Jobs UI is enabled
 * Works on both client and server
 */
export function isJobsUIEnabled(): boolean {
  return process.env.NEXT_PUBLIC_JOBS_UI === "true"
}

/**
 * Check if Item Send Request modal is enabled
 * When true, "Send Request" on Item pages opens in-modal flow
 * When false, navigates to existing Quest flow
 * Works on both client and server
 */
export function isItemSendRequestEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ITEM_SEND_REQUEST === "true"
}

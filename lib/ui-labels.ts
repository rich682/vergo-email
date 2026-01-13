/**
 * Centralized UI Labels
 * 
 * Single source of truth for user-facing terminology.
 * Internal model names (Job, Task, EmailDraft) remain unchanged.
 * Only UI copy uses these labels.
 * 
 * Terminology mapping:
 * - "Job" (internal) → "Item" (UI)
 * - "Jobs" (internal) → "Checklist" (UI for list/nav)
 */

export const UI_LABELS = {
  // Navigation
  jobsNavLabel: "Checklist",
  
  // Singular/Plural
  jobSingular: "Item",
  jobPlural: "Items",
  
  // Actions
  createJob: "Create Item",
  newJob: "New Item",
  
  // Filters
  allJobs: "All Items",
  myJobs: "My Items",
  
  // Page titles
  jobsPageTitle: "Checklist",
  jobsPageSubtitle: "Manage your client work and track progress across requests",
  jobDetailTitle: "Item Details",
  
  // Create modal
  createJobModalTitle: "Create New Item",
  jobNameLabel: "Item Name",
  jobNamePlaceholder: "e.g., Tax Planning - Year End 2024",
  jobDescriptionLabel: "Description (optional)",
  jobDescriptionPlaceholder: "Brief description of the work",
  
  // Status labels (keep same, just for reference)
  statusActive: "Active",
  statusWaiting: "Waiting",
  statusCompleted: "Completed",
  statusArchived: "Archived",
  
  // New Request modal
  addToExistingJob: "or add to an item",
  createNewJob: "Create New Item",
  createNewJobDescription: "Start a new item and add requests",
  quickRequest: "Quick Request",
  quickRequestDescription: "Create a standalone request without an item",
  searchJobs: "Search items...",
  noActiveJobs: "No active items",
  noJobsMatchSearch: "No items match your search",
} as const

export type UILabels = typeof UI_LABELS

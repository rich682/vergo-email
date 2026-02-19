/**
 * Centralized UI Labels
 * 
 * Single source of truth for user-facing terminology.
 * Internal model names (Job, Task, EmailDraft) remain unchanged.
 * Only UI copy uses these labels.
 * 
 * Terminology mapping:
 * - "Job" (internal) → "Task" (UI)
 * - "Jobs" (internal) → "Tasks" (UI for list/nav)
 */

export const UI_LABELS = {
  // Navigation
  jobsNavLabel: "Book Close",
  
  // Singular/Plural
  jobSingular: "Task",
  jobPlural: "Tasks",
  
  // Actions
  createJob: "Create Task",
  newJob: "New Task",
  
  // Filters
  allJobs: "All Tasks",
  myJobs: "My Tasks",
  
  // Page titles
  jobsPageTitle: "Tasks",
  jobsPageSubtitle: "Manage your client work and track progress across requests",
  jobDetailTitle: "Task Details",
  
  // Create modal
  createJobModalTitle: "Create New Task",
  jobNameLabel: "Task Name",
  jobNamePlaceholder: "e.g., Tax Planning - Year End 2024",
  jobDescriptionLabel: "Description (optional)",
  jobDescriptionPlaceholder: "Brief description of the work",
  
  // Status labels (keep same, just for reference)
  statusActive: "Active",
  statusWaiting: "Waiting",
  statusCompleted: "Completed",
  statusArchived: "Archived",
  
  // New Request modal
  addToExistingJob: "or add to a task",
  createNewJob: "Create New Task",
  createNewJobDescription: "Start a new task and add requests",
  quickRequest: "Quick Request",
  quickRequestDescription: "Create a standalone request without a task",
  searchJobs: "Search tasks...",
  noActiveJobs: "No active tasks",
  noJobsMatchSearch: "No tasks match your search",
} as const

export type UILabels = typeof UI_LABELS

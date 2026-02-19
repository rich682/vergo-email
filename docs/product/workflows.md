# Workflows Reference

**Version**: 2.0
**Last Updated**: February 19, 2026
**Purpose**: User-facing guide to all application workflows
**Taxonomy**: Domain-Driven Model (see `workflow-taxonomy.md` v3.0)

---

## Quick Reference

| Domain | What You Can Do | Entry Points |
|--------|-----------------|--------------|
| **DOM-01: Identity & Org** | Sign up, sign in, reset password, manage team, configure roles | `/signup`, `/auth/*`, `/dashboard/settings` |
| **DOM-02: Planning & Work** | Create boards/jobs, track progress, manage contacts, collect evidence | `/dashboard/boards`, `/dashboard/jobs`, `/dashboard/contacts` |
| **DOM-03: Outreach** | Send requests, personalize emails, manage forms, use templates | `/dashboard/jobs/[id]`, `/dashboard/forms` |
| **DOM-04: Inbound Review** | View inbox, track responses, review replies, override risk | `/dashboard/inbox`, `/dashboard/requests` |
| **DOM-05: Data Intelligence** | Create databases, build reports, run reconciliations, AI analysis | `/dashboard/databases`, `/dashboard/reports`, `/dashboard/reconciliations` |
| **DOM-06: Automation** | Configure agents, create automations, view system processes | `/dashboard/agents`, `/dashboard/automations` |
| **DOM-07: Integrations** | Connect Gmail/Microsoft, manage email accounts, accounting sync | `/dashboard/settings/integrations` |
| **DOM-08: Platform Ops** | Admin debug, notifications, system health | Admin dashboard |

---

## DOM-01: Identity & Organization

### WF-01.01: Sign Up / Registration

**Goal**: Create a new account and organization

**Steps**:
1. Navigate to `/signup`
2. Enter company name, your name, email, and password
3. Submit the form
4. Check email for verification link
5. Click link to verify your account

**APIs Used**: `POST /api/auth/signup`

---

### WF-01.02: Sign In / Sign Out

**Goal**: Access your dashboard

**Steps**:
1. Navigate to `/auth/signin`
2. Enter email and password
3. Click "Sign In"
4. You'll be redirected to `/dashboard/jobs`

To sign out: Click your avatar in the header, select "Sign Out"

**APIs Used**: `POST /api/auth/[...nextauth]`

---

### WF-01.03: Password Reset

**Goal**: Recover access to your account

**Steps**:
1. Navigate to `/auth/forgot-password`
2. Enter your email address
3. Check your inbox for the reset link
4. Click the link, enter a new password
5. Sign in with your new password

**APIs Used**: `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`

---

### WF-01.04: Accept Team Invite

**Goal**: Join an existing organization

**Steps**:
1. Receive invitation email from a team member
2. Click the invite link in the email
3. If new user: Create your account
4. If existing user: Confirm joining the organization
5. You'll be added to the team

**APIs Used**: `GET/POST /api/auth/accept-invite`

---

### WF-01.05: Manage User Profile

**Goal**: Update your personal information and email signature

**Steps**:
1. Click your avatar in the header
2. Select "Profile" or navigate to `/dashboard/profile`
3. Update your name, email, or other details
4. Optionally configure your email signature
5. Save changes

**APIs Used**: `GET/PATCH /api/user/profile`, `GET/PUT /api/user/signature`

---

### WF-01.06: Onboarding Checklist

**Goal**: Complete setup steps for new users

**Steps**:
1. After first sign-in, you'll see an onboarding checklist
2. Complete each step: connect email, invite team, create first board
3. Check off completed items
4. Dismiss when finished

**APIs Used**: `GET/POST /api/user/onboarding`

---

### WF-01.07: Team Management

**Goal**: Manage team members in your organization

**Steps**:
1. Navigate to `/dashboard/settings/team`
2. View current team members and their roles
3. To invite: Click "Invite Team Member", enter email and role
4. To edit: Click a team member row, change role
5. To remove: Click remove icon and confirm

**APIs Used**: `GET /api/org/team`, `GET/POST /api/org/users`, `GET/PATCH/DELETE /api/org/users/[id]`

---

### WF-01.08: Role Permissions Configuration

**Goal**: Configure what each role can do

**Steps**:
1. Navigate to `/dashboard/settings/role-permissions`
2. View permission categories (contacts, tasks, requests, etc.)
3. Toggle individual action permissions per role
4. Changes save automatically
5. Team members see updated permissions on next page load

**APIs Used**: `GET/PUT /api/org/role-permissions`

---

### WF-01.09: Organization Settings

**Goal**: Configure organization-level settings

**Steps**:
1. Navigate to `/dashboard/settings`
2. Update organization name, timezone, or fiscal year
3. Configure accounting calendar (optional)
4. Manage custom contact types (optional)
5. Save changes

**APIs Used**: `GET/PUT /api/org/settings`, `GET/PUT /api/org/accounting-calendar`, `POST/DELETE /api/contacts/custom-types`

---

## DOM-02: Planning & Work Execution

### WF-02.01: Create Board

**Goal**: Create a new board to organize jobs by period

**Steps**:
1. Navigate to `/dashboard/boards`
2. Click "New Board" button
3. Enter board name and optional dates
4. Click "Create"

**APIs Used**: `POST /api/boards`

---

### WF-02.02: Edit Board Settings

**Goal**: Modify board configuration

**Steps**:
1. Navigate to `/dashboard/boards`
2. Click on a board row to open it
3. Click the edit icon or "Settings"
4. Modify name, dates, or other settings
5. Save changes

**APIs Used**: `PATCH /api/boards/[id]`

---

### WF-02.03: View Board with Jobs

**Goal**: See all jobs assigned to a board

**Steps**:
1. Navigate to `/dashboard/jobs`
2. Select a board from the dropdown filter
3. View the list of jobs in that board

**APIs Used**: `GET /api/boards/[id]`, `GET /api/task-instances`

---

### WF-02.04: Assign Board Collaborators

**Goal**: Add team members to collaborate on a board

**Steps**:
1. Navigate to `/dashboard/boards`
2. Click on a board
3. Go to "Team" or "Collaborators" section
4. Add team members by email or name
5. Save changes

**APIs Used**: `GET /api/boards/team-members`

---

### WF-02.05: Set Board Cadence / Periods

**Goal**: Configure a recurring board schedule

**Steps**:
1. Navigate to `/dashboard/boards`
2. Click on a board to open settings
3. Set cadence (monthly, quarterly, etc.)
4. Configure period start/end dates
5. Save — future boards will auto-create on the schedule

**APIs Used**: `PATCH /api/boards/[id]`

---

### WF-02.06: Mark Board Complete

**Goal**: Finalize a board period

**Steps**:
1. Navigate to `/dashboard/boards`
2. Click on the board you want to complete
3. Click "Mark Complete" button
4. Confirm the action
5. System captures a close summary and, if cadence is set, creates the next period's board

**APIs Used**: `PATCH /api/boards/[id]` (status=COMPLETE)

**Note**: Board completion triggers WF-06.12 (auto-create next period board) and WF-03.04 (draft requests copied from prior period).

---

### WF-02.07: Archive / Restore Board

**Goal**: Hide old boards or bring them back

**Steps**:

To Archive:
1. Navigate to `/dashboard/boards`
2. Click the archive icon on a board row
3. Board moves to archived view

To Restore:
1. Toggle to show archived boards
2. Click restore icon

**APIs Used**: `PATCH /api/boards/[id]`

---

### WF-02.08: Delete Board

**Goal**: Permanently remove a board

**Steps**:
1. Navigate to `/dashboard/boards`
2. Click the delete icon on a board row
3. Confirm deletion

**Warning**: This is permanent. All associated data may be affected.

**APIs Used**: `DELETE /api/boards/[id]`

---

### WF-02.09: View Board Close Summary

**Goal**: Review the AI-generated close retrospective for a completed board

**Steps**:
1. Navigate to `/dashboard/boards`
2. Click on a completed board
3. View the close summary section with AI analysis

**APIs Used**: `GET /api/boards/[id]/close-summary`

---

### WF-02.10: Close Speed Analytics

**Goal**: See close-speed metrics and AI board summary

**Steps**:
1. Navigate to `/dashboard/boards`
2. Click on a board
3. View close-speed metric and AI-generated summary

**APIs Used**: `GET /api/boards/[id]/ai-summary`

---

### WF-02.11: Create Job

**Goal**: Create a job for tracking work and requests

**Steps**:
1. Navigate to `/dashboard/jobs`
2. Click "New Job" button
3. Enter job name and description
4. Select owner and due date
5. Assign to a board (optional)
6. Click "Create"

**APIs Used**: `POST /api/task-instances`

---

### WF-02.12: Archive / Restore Job

**Goal**: Archive completed jobs or restore them

**Steps**:

To Archive:
1. Navigate to `/dashboard/jobs/[id]`
2. Click the archive action
3. Job moves to archived state

To Restore:
1. Filter to show archived jobs
2. Click restore action on the job

**APIs Used**: `PATCH /api/task-instances/[id]`

---

### WF-02.13: Delete Job

**Goal**: Permanently remove a job

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Click "Delete" action
3. Confirm deletion

**APIs Used**: `DELETE /api/task-instances/[id]`

---

### WF-02.14: Manage Job Collaborators

**Goal**: Add internal team members to a job

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Go to "Collaborators" section
3. Click "Add Collaborator"
4. Select team members
5. Save

**APIs Used**: `GET/POST/DELETE /api/task-instances/[id]/collaborators`

---

### WF-02.15: Assign / Change Job Owner

**Goal**: Transfer job ownership to another team member

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Click on the current owner
3. Select a new owner from the dropdown
4. Confirm change

**APIs Used**: `PATCH /api/task-instances/[id]`

---

### WF-02.16: Set / Manage Job Deadlines

**Goal**: Set or update due dates for a job

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Click the due date field
3. Select a new date
4. Save

**APIs Used**: `PATCH /api/task-instances/[id]`

---

### WF-02.17: Manage Job Attachments

**Goal**: Upload and manage files attached to a job

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Go to "Attachments" section
3. Click "Upload" to add files
4. View, download, or remove existing attachments

**APIs Used**: `GET/POST /api/task-instances/[id]/attachments`

---

### WF-02.18: Job Activity & Comments

**Goal**: View job history and add comments

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Click "Activity" tab
3. View timeline of changes
4. Add comments at the bottom

**APIs Used**: `GET /api/task-instances/[id]/timeline`, `GET/POST/DELETE /api/task-instances/[id]/comments`

---

### WF-02.19: Job Status & Lifecycle

**Goal**: Change job status (draft, active, complete)

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Click the status dropdown
3. Select new status
4. Confirm if prompted

**APIs Used**: `PATCH /api/task-instances/[id]`

---

### WF-02.20: Evidence Collection & Review

**Goal**: Upload, review, approve/reject, and export evidence files

**Steps**:

Upload Evidence:
1. Navigate to `/dashboard/jobs/[id]`
2. Click "Collection" tab
3. Click "Upload File" button
4. Select files to upload

Review & Approve:
1. Click on an evidence item
2. Preview the file
3. Click "Approve" or "Reject"

Bulk Actions:
1. Select multiple items using checkboxes
2. Click bulk action button (approve/reject/delete)
3. Confirm action

Export:
1. Click "Export All" button
2. CSV file downloads with evidence metadata

**APIs Used**: `GET/POST /api/task-instances/[id]/collection`, `PATCH/DELETE .../[itemId]`, `POST .../bulk`, `GET .../download`, `GET .../export`

---

### WF-02.21: Contact Management

**Goal**: Create, edit, import, and group contacts

**Steps**:

Create / Edit:
1. Navigate to `/dashboard/contacts`
2. Click "Add Contact" or click existing contact
3. Enter/edit name, email, company
4. Save

Import from CSV:
1. Navigate to `/dashboard/contacts`
2. Click "Import" button
3. Download template (optional)
4. Upload your CSV file
5. Map columns
6. Confirm import

Group Contacts:
1. Click "Groups" tab
2. Click "New Group"
3. Name the group
4. Add contacts to the group

**APIs Used**: `GET/POST /api/entities`, `PATCH/DELETE /api/entities/[id]`, `POST /api/entities/bulk`, `POST /api/entities/import`, `GET/POST /api/groups`, `PATCH/DELETE /api/groups/[id]`

---

### WF-02.22: Bulk Job Import & AI Generate

**Goal**: Import jobs in bulk or use AI to auto-generate jobs

**Steps**:

Bulk Import:
1. Navigate to `/dashboard/jobs`
2. Click "Import" or "Bulk Import"
3. Upload a CSV of jobs
4. Map columns and confirm

AI Generate:
1. Navigate to `/dashboard/jobs`
2. Click "AI Generate"
3. Describe the jobs you need
4. Review AI suggestions
5. Confirm to create

**APIs Used**: `POST /api/task-instances/bulk-import`, `POST /api/task-instances/ai-generate`

---

### WF-02.23: Job AI Summary

**Goal**: Get an AI summary of job or request status

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Click "AI Summary" button
3. View the AI-generated summary of job progress and request status

**APIs Used**: `POST /api/task-instances/[id]/ai-summary`, `POST /api/task-instances/ai-summary`

---

## DOM-03: Outreach & Data Collection

### WF-03.01: Send Email Request

**Goal**: Send request emails to contacts

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Click "Send Request" button
3. Choose request type (Standard, Data Personalization, or Form)
4. Search and select recipients (see WF-03.06)
5. Generate or write email draft
6. Review the preview
7. Configure reminders (optional, see WF-03.03)
8. Click "Send"

**APIs Used**: `GET /api/task-instances/[id]/request/draft`, `POST .../refine`

---

### WF-03.02: Configure Request Personalization

**Goal**: Customize emails with recipient-specific data

**Steps**:
1. During Send Request flow (WF-03.01)
2. Select "Data Personalization" mode
3. Upload dataset with recipient columns
4. Map columns to email placeholders
5. Preview personalized emails
6. Send

**APIs Used**: `GET/PATCH /api/task-instances/[id]/request/dataset`, `POST .../upload`, `GET/POST .../preview`, `POST .../send`

---

### WF-03.03: Configure Request Reminders

**Goal**: Set up automatic follow-up reminders

**Steps**:
1. During Send Request flow (WF-03.01)
2. Enable "Reminders"
3. Set reminder frequency (e.g., every 3 days)
4. Set maximum reminders
5. Preview reminder templates
6. Send

**APIs Used**: `POST /api/task-instances/[id]/request/reminder-preview`

---

### WF-03.04: Review & Send Draft Requests

**Goal**: Review requests copied from a prior period before sending

**Context**: When a board completes (WF-02.06) and auto-creates the next period, requests from the prior period are copied as drafts. These drafts require user review.

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Look for amber "N draft(s) to review" badge in the job header (next to status)
3. Click the badge to open the Draft Request Review modal
4. Review the draft content (subject, body, recipient)
5. Choose action:
   - **Edit**: Modify subject, body, or recipient, then save (copy-on-write preserves original)
   - **Send**: Verify content, optionally approve reminders, click "Send" (sets `isDraft = false`)
   - **Delete**: Remove unwanted draft permanently

**APIs Used**: `GET/POST/DELETE /api/task-instances/[id]/requests`

---

### WF-03.05: Manage Request Templates

**Goal**: Create and manage reusable email request templates

**Steps**:
1. Navigate to the Send Request flow or template management area
2. Create a new template with subject and body
3. Optionally mark as organization-wide
4. Use templates when composing requests

**APIs Used**: `GET/POST /api/request-templates`, `GET/PATCH/DELETE /api/request-templates/[id]`

---

### WF-03.06: Search / Select Recipients

**Goal**: Find and select recipients when sending requests

**Steps**:
1. During Send Request flow (WF-03.01)
2. Type in the recipient search box
3. Results appear as you type (contacts, groups)
4. Click to add a recipient

**APIs Used**: `GET /api/recipients/search`, `GET /api/recipients/all`

---

### WF-03.07: Quest Execution

**Goal**: Create and execute quests (AI-assisted batch outreach)

**Steps**:
1. Navigate to a job or create a new quest
2. Describe what you need to collect
3. AI generates personalized outreach for multiple recipients
4. Review generated messages
5. Execute the quest to send all messages

**APIs Used**: `GET/POST /api/quests`, `POST /api/quests/[id]/execute`, `POST /api/quests/[id]/generate`, `POST /api/quests/standing`

---

### WF-03.08: Create / Edit Form

**Goal**: Create or modify a form template for data collection

**Steps**:
1. Navigate to `/dashboard/forms`
2. Click "New Form" or select existing form
3. Use the form builder to add fields (text, number, date, file upload, etc.)
4. Configure form settings (title, description, deadline)
5. Save the form

**APIs Used**: `GET/POST /api/forms`, `GET/PATCH/DELETE /api/forms/[id]`

---

### WF-03.09: Send Form Request

**Goal**: Send a form link to a recipient

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Select "Form" as request type
3. Choose the form to send
4. Select recipient
5. Send — recipient receives a link to complete the form

**APIs Used**: `GET/POST /api/task-instances/[id]/form-requests`, `GET /api/form-requests/[id]/request`

---

### WF-03.10: Submit Form Response

**Goal**: Recipient completes and submits the form (external user flow)

**Steps**:
1. Recipient clicks the form link in email
2. Form loads at `/forms/[requestId]`
3. Recipient fills in all required fields
4. Optionally attaches files
5. Clicks "Submit"

**APIs Used**: `GET/POST /api/form-requests/token/[token]`, `POST /api/form-requests/[id]/submit`, `GET/POST/DELETE /api/form-requests/[id]/attachments`

---

### WF-03.11: Remind Form Recipient

**Goal**: Send a reminder to a recipient who hasn't completed the form

**Steps**:
1. Navigate to the job with the pending form request
2. Click "Remind" on the form request row
3. Reminder email is sent to the recipient

**APIs Used**: `POST /api/form-requests/[id]/remind`

---

### WF-03.12: Manage Form Viewers

**Goal**: Control who can view form responses

**Steps**:
1. Navigate to `/dashboard/forms/[id]`
2. Go to "Viewers" or "Permissions" section
3. Add or remove team members who can view submissions
4. Save

**APIs Used**: `GET/PUT /api/forms/[id]/viewers`

---

## DOM-04: Inbound Review & Resolution

### WF-04.01: View Inbox

**Goal**: View incoming messages and unread counts

**Steps**:
1. Navigate to `/dashboard/inbox`
2. View list of incoming messages
3. Unread count appears in the sidebar badge
4. Click a message to view details

**APIs Used**: `GET /api/inbox`, `GET /api/inbox/count`

---

### WF-04.02: Track Request Status

**Goal**: Monitor response status and risk levels

**Steps**:
1. Navigate to `/dashboard/requests`
2. View request list with status indicators
3. Click a request to expand details
4. View message thread
5. See risk indicator (GREEN/YELLOW/RED)

**APIs Used**: `GET /api/requests`, `GET /api/requests/detail/[id]`, `GET .../messages`

---

### WF-04.03: Cancel / Resend Requests

**Goal**: Cancel a pending request or resend a failed one

**Steps**:
1. Navigate to `/dashboard/requests`
2. Click on the request
3. Click "Cancel" to abort or "Resend" to retry

**APIs Used**: `POST /api/requests/detail/[id]/retry`, `PATCH /api/requests/detail/[id]`

---

### WF-04.04: Mark Request Read / Unread

**Goal**: Mark requests as read or unread

**Steps**:
1. Navigate to `/dashboard/requests`
2. Click on a request
3. Use the mark read/unread toggle

**APIs Used**: `POST /api/requests/detail/[id]/mark-read`

---

### WF-04.05: Manually Override Request Risk

**Goal**: Manually adjust the AI-assigned risk classification

**Steps**:
1. Navigate to `/dashboard/requests`
2. Click on a request to view details
3. Click the risk indicator
4. Select a new risk level (GREEN/YELLOW/RED)
5. Save

**APIs Used**: `PUT /api/requests/detail/[id]/risk`

---

### WF-04.06: Reply Review

**Goal**: Review incoming replies with AI assistance

**Steps**:
1. Click on a reply notification or navigate from Requests
2. Navigate to `/dashboard/review/[messageId]`
3. View the reply content on the left panel
4. See AI analysis and recommendations on the right panel
5. Review AI classification and suggested actions

**APIs Used**: `GET/PATCH /api/review/[messageId]`, `POST /api/review/analyze`

---

### WF-04.07: Send Reply

**Goal**: Compose and send a reply to a request response

**Steps**:
1. From the Reply Review page (WF-04.06)
2. Click "Reply" to open the compose area
3. Draft your response (or use AI-generated draft)
4. Review the message
5. Click "Send"

**APIs Used**: `POST /api/review/draft-reply`, `POST /api/requests/detail/[id]/reply`, `POST .../reply-draft`

---

### WF-04.08: Accept AI Suggestion

**Goal**: Accept an AI-recommended action on a request

**Steps**:
1. From the Reply Review page (WF-04.06) or request detail
2. Review the AI suggestion
3. Click "Accept" to apply the recommended action
4. Request status updates automatically

**APIs Used**: `POST /api/requests/[id]/accept-suggestion`

---

## DOM-05: Data Intelligence

### WF-05.01: Create Database

**Goal**: Create a new database with schema definition

**Steps**:
1. Navigate to `/dashboard/databases`
2. Click "New Database"
3. Enter database name and description
4. Define columns (name, type, constraints)
5. Set identifier column for matching
6. Click "Create"

**APIs Used**: `POST /api/databases`

---

### WF-05.02: Edit Database Schema

**Goal**: Modify database columns, types, or identifiers

**Steps**:
1. Navigate to `/dashboard/databases/[id]`
2. Click "Schema" or "Edit Schema"
3. Add, remove, or modify columns
4. Update column types or constraints
5. Save changes

**APIs Used**: `PATCH /api/databases/[id]/schema`

---

### WF-05.03: Import Database Rows

**Goal**: Upload CSV/Excel data to append to a database

**Steps**:
1. Navigate to `/dashboard/databases/[id]`
2. Click "Import" button
3. Upload a CSV or Excel file
4. Preview the import — map file columns to database columns
5. Review row count and any warnings
6. Confirm import

**APIs Used**: `POST /api/databases/[id]/import/preview`, `POST /api/databases/[id]/import`

---

### WF-05.04: Export Database Data

**Goal**: Export all database rows to Excel

**Steps**:
1. Navigate to `/dashboard/databases/[id]`
2. Click "Export" button
3. Excel file downloads with all rows

To get a blank template: Click "Download Template"

**APIs Used**: `GET /api/databases/[id]/export.xlsx`, `GET /api/databases/[id]/template.xlsx`

---

### WF-05.05: Delete Database

**Goal**: Permanently remove a database

**Steps**:
1. Navigate to `/dashboard/databases/[id]`
2. Click "Delete" action
3. Confirm deletion

**Warning**: This removes all rows and schema permanently.

**APIs Used**: `DELETE /api/databases/[id]`

---

### WF-05.06: Create Report Definition

**Goal**: Create a report linked to a database

**Steps**:
1. Navigate to `/dashboard/reports`
2. Click "New Report"
3. Select the source database
4. Enter report name
5. Click "Create"

**APIs Used**: `POST /api/reports`

---

### WF-05.07: Configure & Preview Report

**Goal**: Configure columns, layout, metrics, filters, and preview

**Steps**:
1. Navigate to `/dashboard/reports/[id]`
2. Select columns to include
3. Configure layout (grouping, sorting)
4. Add metrics or calculated fields
5. Set filters
6. Click "Preview" to see the output

**APIs Used**: `PATCH /api/reports/[id]`, `GET/POST /api/reports/[id]/preview`, `GET /api/reports/[id]/filter-properties`

---

### WF-05.08: Generate & View Report

**Goal**: Create a fixed report snapshot and view it

**Steps**:
1. Navigate to `/dashboard/reports/[id]`
2. Click "Generate" to create a snapshot
3. View the generated report with frozen data
4. Navigate between generated report versions

**APIs Used**: `POST /api/generated-reports`, `GET /api/generated-reports/[id]`, `POST /api/generated-reports/ensure-for-task`

---

### WF-05.09: Export Report

**Goal**: Export a generated report to Excel

**Steps**:
1. Navigate to a generated report
2. Click "Export" button
3. Excel file downloads

**APIs Used**: `GET /api/generated-reports/[id]/export`

---

### WF-05.10: AI Report Insights

**Goal**: Get AI-powered analysis of a generated report

**Steps**:
1. Navigate to a generated report
2. Click "AI Insights" or "Analyze"
3. AI processes the report data
4. View insights, trends, and recommendations

**APIs Used**: `POST /api/reports/[id]/insights`, `GET/POST /api/generated-reports/[id]/insights`

---

### WF-05.11: Reconciliation Configuration

**Goal**: Create and configure a reconciliation

**Steps**:
1. Navigate to `/dashboard/reconciliations`
2. Click "New Reconciliation"
3. Name the reconciliation
4. Select two data sources to compare
5. Configure matching rules (columns to compare, tolerances)
6. Optionally manage viewers
7. Save

**APIs Used**: `GET/POST /api/reconciliations`, `GET/PATCH/DELETE /api/reconciliations/[configId]`, `GET/PUT .../viewers`

---

### WF-05.12: Reconciliation Execution

**Goal**: Run matching, review exceptions, and complete a reconciliation

**Steps**:
1. Navigate to `/dashboard/reconciliations/[configId]`
2. Start a new run or open an existing one
3. Upload data files or load from connected databases
4. Click "Match" to run the matching algorithm
5. Review matched and unmatched items
6. Accept matches or resolve exceptions
7. Mark the run as complete

**APIs Used**: `GET/POST /api/reconciliations/[configId]/runs`, `GET .../[runId]`, `POST .../upload`, `POST .../load-database`, `POST .../match`, `POST .../accept-match`, `PATCH .../exceptions`, `POST .../complete`

---

### WF-05.13: Reconciliation AI Analysis

**Goal**: Get AI suggestions for reconciliation mapping and analysis

**Steps**:
1. During reconciliation configuration or execution
2. Click "AI Analyze" or "Suggest Mappings"
3. AI reviews the data sources and suggests column mappings
4. Review and accept suggestions

**APIs Used**: `POST /api/reconciliations/analyze`, `POST /api/reconciliations/suggest-mappings`

---

### WF-05.14: Analysis Conversations

**Goal**: Start AI conversations and query data with natural language

**Steps**:
1. Navigate to `/dashboard/analysis`
2. Click "New Conversation" or select existing
3. Type a question about your data in natural language
4. AI queries your databases and returns results
5. Continue the conversation with follow-up questions

**APIs Used**: `GET/POST /api/analysis/conversations`, `GET/DELETE /api/analysis/conversations/[id]`, `POST .../[id]/messages`

---

## DOM-06: Automation & Agents

### WF-06.01: Create / Edit Agent

**Goal**: Create or configure an AI agent

**Steps**:
1. Navigate to `/dashboard/agents`
2. Click "New Agent" or select existing
3. Configure agent name, description, and instructions
4. Set trigger conditions and allowed actions
5. Save

**APIs Used**: `GET/POST /api/agents`, `GET/PATCH/DELETE /api/agents/[agentId]`

---

### WF-06.02: Execute Agent

**Goal**: Trigger an agent execution

**Steps**:
1. Navigate to `/dashboard/agents/[id]`
2. Click "Execute" or "Run Now"
3. Optionally provide input parameters
4. Agent begins executing

**APIs Used**: `POST /api/agents/[agentId]/execute`

---

### WF-06.03: View Agent Executions

**Goal**: View execution history and status

**Steps**:
1. Navigate to `/dashboard/agents/[id]`
2. View the executions list
3. Click an execution to see details and status
4. View step-by-step execution log

**APIs Used**: `GET /api/agents/[agentId]/executions`, `GET .../[executionId]`, `GET .../status`

---

### WF-06.04: Cancel Agent Execution

**Goal**: Cancel a running agent execution

**Steps**:
1. Navigate to the running execution
2. Click "Cancel"
3. Confirm cancellation

**APIs Used**: `POST /api/agents/[agentId]/executions/[executionId]/cancel`

---

### WF-06.05: Agent Memory & Metrics

**Goal**: View agent memory and performance metrics

**Steps**:
1. Navigate to `/dashboard/agents/[id]`
2. View the "Memory" tab for retained context
3. View the "Metrics" tab for performance data

**APIs Used**: `GET /api/agents/[agentId]/memory`, `GET /api/agents/[agentId]/metrics`

---

### WF-06.06: Agent Execution Feedback

**Goal**: Provide feedback on agent execution results

**Steps**:
1. Navigate to a completed execution
2. Review the results
3. Click thumbs up/down or provide written feedback
4. Feedback improves future executions

**APIs Used**: `POST /api/agents/[agentId]/executions/[executionId]/feedback`

---

### WF-06.07: Create / Edit Automation Rule

**Goal**: Create or modify automation rules

**Steps**:
1. Navigate to `/dashboard/automations`
2. Click "New Automation" or select existing
3. Define trigger conditions (time-based, event-based)
4. Configure actions to execute
5. Set any approval requirements
6. Save

**APIs Used**: `GET/POST /api/automation-rules`, `GET/PATCH/DELETE /api/automation-rules/[id]`

---

### WF-06.08: Run Automation

**Goal**: Manually trigger or view auto-triggered automation runs

**Steps**:
1. Navigate to `/dashboard/automations/[id]`
2. Click "Run Now" for manual trigger
3. Or wait for the automation to trigger automatically
4. View run progress

**APIs Used**: `POST /api/automation-rules/[id]/run`

---

### WF-06.09: View Workflow Runs

**Goal**: View run history, details, and approve pending runs

**Steps**:
1. Navigate to `/dashboard/automations/[id]/runs/[runId]`
2. View step-by-step execution details
3. For pending runs: Review and click "Approve" to continue
4. View run status and any errors

**APIs Used**: `GET /api/workflow-runs`, `GET /api/workflow-runs/[id]`, `POST /api/workflow-runs/[id]/approve`

---

### WF-06.10: Email Sync (System)

**What it does**: Syncs new emails from connected Gmail and Microsoft accounts every minute.

**Trigger**: Inngest cron job (`sync-gmail-accounts`, `sync-microsoft-accounts`)

**Note**: No user action required. Runs automatically.

---

### WF-06.11: Message Classification & Summarization (System)

**What it does**: When a reply is received, AI classifies it (response type, risk level) and generates task summaries.

**Trigger**: Inngest event on new message (`classify-message`, `summarize-task`)

**Note**: No user action required. Results visible in WF-04.02 and WF-04.06.

---

### WF-06.12: Reminder & Queue Processing (System)

**What it does**: Sends scheduled reminder emails for non-responsive requests, processes rate-limited email queue, executes standing quests, auto-creates period boards, and runs workflow schedules.

**Trigger**: Inngest cron jobs (`reminder/send-due`, `process-email-queue`, `quest/execute-standing`, `auto-create-period-boards`, `workflow-scheduler`, `workflow-run`, `workflow-trigger-dispatcher`)

**Note**: No user action required. Reminder configuration is set during WF-03.03.

---

## DOM-07: Integrations & Delivery Channels

### WF-07.01: Connect Email Account - Gmail

**Goal**: Connect your Gmail account for sending/receiving

**Steps**:
1. Navigate to `/dashboard/settings/integrations`
2. Click "Connect Gmail"
3. Complete Google OAuth flow
4. Grant required permissions
5. Account appears in connected accounts list

**APIs Used**: `GET /api/oauth/gmail`, `GET /api/oauth/gmail/callback`

---

### WF-07.02: Connect Email Account - Microsoft

**Goal**: Connect your Microsoft 365 account

**Steps**:
1. Navigate to `/dashboard/settings/integrations`
2. Click "Connect Microsoft"
3. Complete Microsoft OAuth flow
4. Grant required permissions
5. Account appears in connected accounts list

**APIs Used**: `GET /api/oauth/microsoft`, `GET /api/oauth/microsoft/callback`

---

### WF-07.03: Manage Email Senders

**Goal**: View connected email accounts and disconnect if needed

**Steps**:
1. Navigate to `/dashboard/settings/integrations`
2. View list of connected email accounts
3. To disconnect: Click "Disconnect" on an account
4. Confirm the action

**APIs Used**: `GET /api/email-accounts`, `DELETE /api/email-accounts/[id]`

---

### WF-07.04: Accounting Integration

**Goal**: Connect, configure, and sync your accounting system

**Steps**:
1. Navigate to `/dashboard/settings/accounting`
2. Click "Connect" to start the linking flow
3. Select your accounting provider
4. Complete the OAuth/linking flow
5. Configure sync settings (which data to import, mapping)
6. Click "Sync" to pull initial data
7. View sync status and data sources

To disconnect: Click "Disconnect" and confirm.

**APIs Used**: `POST /api/integrations/accounting/link-token`, `POST .../connect`, `DELETE .../disconnect`, `GET .../status`, `PUT .../config`, `POST .../sync`, `GET .../sources`, `POST .../preview`

---

### WF-07.05: Webhook & Tracking (System)

**What it does**: Receives Gmail push notification webhooks and tracks email open events via tracking pixels.

**Trigger**: External (Gmail push, email client loading tracking pixel)

**APIs Used**: `POST /api/webhooks/gmail`, `GET /api/tracking/[token]`

**Note**: No user action required. These are system-level endpoints.

---

## DOM-08: Platform Ops & Internal

> These workflows are for system administrators and internal operations. Most users will not interact with these directly.

### WF-08.01: Admin Debug & Diagnostics

**Goal**: Debug accounts, messages, sync issues, collection, and blob storage

**Who**: System administrators only

**Entry Point**: Admin dashboard

**APIs Used**: `GET/POST /api/admin/debug-accounts`, `GET /api/admin/debug-blob`, `GET /api/admin/debug-collection`, `GET /api/admin/debug-email-sync`, `GET/POST /api/admin/debug-messages`, `GET /api/admin/debug/[taskId]`

---

### WF-08.02: Admin Backfill & Migration

**Goal**: Run data backfills and schema migrations

**Who**: System administrators only

**APIs Used**: `GET /api/admin/backfill-file-urls`, `POST /api/admin/backfill-completion`, `POST /api/admin/backfill-risk`, `POST /api/admin/migrate`

---

### WF-08.03: Admin Data Cleanup

**Goal**: Clean up orphan data, remove users, force sync

**Who**: System administrators only

**APIs Used**: `POST /api/admin/cleanup-requests`, `DELETE /api/admin/delete-user`, `POST /api/admin/sync-emails`, `POST /api/admin/sync-gmail-now`, `POST /api/admin/reminders/run-once`

---

### WF-08.04: System Health & Monitoring

**Goal**: Monitor system health, pipeline status, and AI metrics

**Who**: System administrators only

**APIs Used**: `GET /api/admin/health-check`, `GET /api/admin/pipeline-status`, `GET /api/admin/check-replies`, `POST /api/errors/report`, `GET /api/internal/ai-metrics/agreement`, `POST /api/inngest`

---

### WF-08.05: Notifications

**Goal**: Deliver and manage in-app notifications

**Steps**:
1. Notifications appear in the bell icon in the header
2. Click to view notification list
3. Click a notification to navigate to the relevant item
4. Notifications auto-mark as read when viewed

**APIs Used**: `GET/PATCH /api/notifications`, `PATCH /api/notifications/[id]`, `GET /api/notifications/count`

---

## Workflow Status Legend

| Status | Meaning |
|--------|---------|
| GREEN | Fully functional, all features working |
| YELLOW | Working but has known limitations or missing features |
| RED | Broken or blocked, needs immediate attention |

---

## Cross-References

- **Taxonomy details**: See `workflow-taxonomy.md` for complete domain definitions, route families, and legacy crosswalk
- **API contracts**: See `frontend-backend-contract.md` for route-level inventory with evidence
- **Legacy IDs**: The crosswalk table in `workflow-taxonomy.md` maps all old PWF-XX / WF-XXy IDs to new DOM-XX / WF-XX.YY IDs

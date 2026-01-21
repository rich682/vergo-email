# Workflows Reference

**Version**: 1.0  
**Last Updated**: January 21, 2026  
**Purpose**: User-facing guide to all application workflows

---

## Quick Reference

| Area | What You Can Do | Entry Point |
|------|-----------------|-------------|
| **Authentication** | Sign up, sign in, reset password, accept invites | `/signup`, `/auth/*` |
| **Boards** | Create periods, organize jobs, mark complete | `/dashboard/boards` |
| **Jobs** | Create tasks, import data, track progress | `/dashboard/jobs` |
| **Requests** | Send emails, track responses, review replies | `/dashboard/jobs/[id]`, `/dashboard/requests` |
| **Evidence** | Collect, review, approve, export files | `/dashboard/jobs/[id]` (Collection tab) |
| **Contacts** | Manage contacts, create groups, import CSV | `/dashboard/contacts` |
| **Settings** | Connect email accounts, manage team | `/dashboard/settings` |

---

## PWF-01: Authentication & Onboarding

### WF-01a: Sign Up / Registration

**Goal**: Create a new account and organization

**Steps**:
1. Navigate to `/signup`
2. Enter company name, your name, email, and password
3. Submit the form
4. Check email for verification link
5. Click link to verify your account

**APIs Used**: `POST /api/auth/signup`

---

### WF-01b: Sign In / Sign Out

**Goal**: Access your dashboard

**Steps**:
1. Navigate to `/auth/signin`
2. Enter email and password
3. Click "Sign In"
4. You'll be redirected to `/dashboard/jobs`

To sign out: Click your avatar in the header, select "Sign Out"

**APIs Used**: `POST /api/auth/[...nextauth]`

---

### WF-01c: Password Reset

**Goal**: Recover access to your account

**Steps**:
1. Navigate to `/auth/forgot-password`
2. Enter your email address
3. Check your inbox for the reset link
4. Click the link, enter a new password
5. Sign in with your new password

**APIs Used**: `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`

---

### WF-01d: Accept Team Invite

**Goal**: Join an existing organization

**Steps**:
1. Receive invitation email from a team member
2. Click the invite link in the email
3. If new user: Create your account
4. If existing user: Confirm joining the organization
5. You'll be added to the team

**APIs Used**: `GET/POST /api/auth/accept-invite`

---

## PWF-02: Board Management

### WF-02a: Create Board

**Goal**: Create a new period/board to organize jobs

**Steps**:
1. Navigate to `/dashboard/boards`
2. Click "New Board" button
3. Enter board name and optional dates
4. Click "Create"

**APIs Used**: `POST /api/boards`

---

### WF-02b: Edit Board Settings

**Goal**: Modify board configuration

**Steps**:
1. Navigate to `/dashboard/boards`
2. Click on a board row to open it
3. Click the edit icon or "Settings"
4. Modify name, dates, or other settings
5. Save changes

**APIs Used**: `PATCH /api/boards/[id]`

---

### WF-02c: View Board with Jobs

**Goal**: See all jobs assigned to a board

**Steps**:
1. Navigate to `/dashboard/jobs`
2. Select a board from the dropdown filter
3. View the list of jobs in that board

**APIs Used**: `GET /api/boards/[id]`, `GET /api/task-instances`

---

### WF-02d: Assign Board Collaborators

**Goal**: Add team members to collaborate on a board

**Steps**:
1. Navigate to `/dashboard/boards`
2. Click on a board
3. Go to "Team" or "Collaborators" section
4. Add team members by email or name
5. Save changes

**APIs Used**: `POST /api/boards/team-members`

---

### WF-02f: Mark Board Complete

**Goal**: Finalize a board and create snapshots for comparison

**Steps**:
1. Navigate to `/dashboard/boards`
2. Click on the board you want to complete
3. Click "Mark Complete" button
4. Confirm the action
5. All jobs are snapshotted for period comparison

**Important**: This enables the Compare Periods feature for table jobs

**APIs Used**: `PATCH /api/boards/[id]` (status=COMPLETE)

---

### WF-02g: Archive / Restore Board

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

## PWF-03: Job Lifecycle

### WF-03a: Create Generic Job

**Goal**: Create a standard job for tracking requests

**Steps**:
1. Navigate to `/dashboard/jobs`
2. Click "New Job" button
3. Select "Generic" type
4. Enter job name and description
5. Assign to a board
6. Click "Create"

**APIs Used**: `POST /api/task-instances`

---

### WF-03b: Create Table Job

**Goal**: Create a table-type job with structured data

**Status**: YELLOW (Schema wizard not fully integrated)

**Steps**:
1. Navigate to `/dashboard/jobs`
2. Click "New Job" button
3. Select "Table" type
4. Enter job name
5. Assign to a board
6. Click "Create"
7. Go to job detail, Data tab
8. Define your schema columns
9. Import data via CSV

**APIs Used**: `POST /api/task-instances`, `PATCH /api/task-lineages/[id]/schema`

---

### WF-03c: Create Reconciliation Job

**Goal**: Create a reconciliation job for matching data sets

**Status**: YELLOW (Matching logic not automated)

**Steps**:
1. Navigate to `/dashboard/jobs`
2. Click "New Job" button
3. Select "Reconciliation" type
4. Enter job name
5. Upload reconciliation files
6. Review matching results

**APIs Used**: `POST /api/task-instances`, `POST /api/task-instances/[id]/reconciliations`

---

### WF-03d: Import / Edit Table Data

**Goal**: Import CSV data and edit table cells

**Steps**:
1. Navigate to `/dashboard/jobs/[id]` (Table job)
2. Click "Data" tab
3. Click "Import" button
4. Select your CSV file
5. Preview the import, confirm column mapping
6. Click "Confirm Import"
7. Edit cells directly in the table

**APIs Used**: `POST /api/task-instances/[id]/table/import`, `PATCH /api/task-instances/[id]/table/cell`

---

### WF-03e: Compare Periods / Variance

**Goal**: Compare current period with prior snapshots

**Prerequisite**: Prior board must be marked Complete

**Steps**:
1. Navigate to `/dashboard/jobs/[id]` (Table job)
2. Click "Compare" tab
3. If no prior snapshot: You'll see guidance to mark prior board complete
4. If snapshot exists: View variance with ADDED/CHANGED/REMOVED indicators

**APIs Used**: `GET /api/task-instances/[id]/table/compare`

---

## PWF-04: Job Collaboration & Governance

### WF-04a: Manage Job Stakeholders

**Goal**: Assign external contacts as stakeholders

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Go to "Stakeholders" section
3. Click "Add Stakeholder"
4. Search and select contacts
5. Save

**APIs Used**: `POST /api/task-instances/[id]/stakeholders`

---

### WF-04b: Manage Job Collaborators

**Goal**: Add internal team members to a job

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Go to "Collaborators" section
3. Click "Add Collaborator"
4. Select team members
5. Save

**APIs Used**: `GET/POST/DELETE /api/task-instances/[id]/collaborators`

---

### WF-04g: Job Activity & Comments

**Goal**: View job history and add comments

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Click "Activity" tab
3. View timeline of changes
4. Add comments at the bottom

**APIs Used**: `GET /api/task-instances/[id]/timeline`, `POST /api/task-instances/[id]/comments`

---

## PWF-05: Requests & Communication

### WF-05a: Send Email Request

**Goal**: Send request emails to contacts

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Click "Send Request" button
3. Select recipients from stakeholders
4. Generate or write email draft
5. Review the preview
6. Configure reminders (optional)
7. Click "Send"

**APIs Used**: `POST /api/task-instances/[id]/request/draft`, `POST /api/quests/[id]/execute`

---

### WF-05b: Configure Request Personalization

**Goal**: Customize emails with recipient-specific data

**Steps**:
1. During Send Request flow
2. Select "Data Personalization" mode
3. Upload dataset with recipient columns
4. Map columns to email placeholders
5. Preview personalized emails
6. Send

**APIs Used**: `POST /api/task-instances/[id]/request/dataset/*`

---

### WF-05c: Configure Request Reminders

**Goal**: Set up automatic follow-up reminders

**Steps**:
1. During Send Request flow
2. Enable "Reminders"
3. Set reminder frequency (e.g., every 3 days)
4. Set maximum reminders
5. Preview reminder templates
6. Send

**APIs Used**: Part of request draft configuration

---

### WF-05e: Track Request Status

**Goal**: Monitor response status and risk levels

**Steps**:
1. Navigate to `/dashboard/requests`
2. View request list with status indicators
3. Click a request to expand details
4. View message thread
5. See risk indicator (GREEN/YELLOW/RED)

**APIs Used**: `GET /api/requests/detail/[id]`, `GET /api/requests/detail/[id]/messages`

---

### WF-05h: Reply Review

**Goal**: Review incoming replies with AI assistance

**Steps**:
1. Click on a reply notification or navigate from Requests
2. View the reply content on the left
3. See AI analysis and recommendations on the right
4. Draft a response
5. Send reply

**APIs Used**: `GET /api/review/[messageId]`, `POST /api/review/analyze`, `POST /api/requests/detail/[id]/reply`

---

## PWF-06: Evidence Collection

### WF-06a: Upload Evidence

**Goal**: Manually upload evidence files

**Steps**:
1. Navigate to `/dashboard/jobs/[id]`
2. Click "Collection" tab
3. Click "Upload File" button
4. Select files to upload
5. Files appear in collection

**APIs Used**: `POST /api/task-instances/[id]/collection`

---

### WF-06b: Review / Approve Evidence

**Goal**: Review and approve collected evidence

**Steps**:
1. Navigate to Collection tab
2. Click on an evidence item
3. Preview the file
4. Click "Approve" or "Reject"

**APIs Used**: `PATCH /api/task-instances/[id]/collection/[itemId]`

---

### WF-06c: Bulk Evidence Actions

**Goal**: Approve/reject/delete multiple items at once

**Steps**:
1. Navigate to Collection tab
2. Select multiple items using checkboxes
3. Click bulk action button (approve/reject/delete)
4. Confirm action

**APIs Used**: `POST /api/task-instances/[id]/collection/bulk`

---

### WF-06d: Export Evidence

**Goal**: Export all collected evidence

**Steps**:
1. Navigate to Collection tab
2. Click "Export All" button
3. CSV file downloads with evidence metadata

**APIs Used**: `GET /api/task-instances/[id]/collection/export`

---

## PWF-07: Contact Management

### WF-07a: Create / Edit Contact

**Goal**: Create or update contact information

**Steps**:
1. Navigate to `/dashboard/contacts`
2. Click "Add Contact" or click existing contact
3. Enter/edit name, email, company
4. Save

**APIs Used**: `POST /api/entities`, `PATCH /api/entities/[id]`

---

### WF-07b: Import Contacts

**Goal**: Bulk import contacts from CSV

**Steps**:
1. Navigate to `/dashboard/contacts`
2. Click "Import" button
3. Download template (optional)
4. Upload your CSV file
5. Map columns
6. Confirm import

**APIs Used**: `POST /api/entities/import`

---

### WF-07c: Group Contacts

**Goal**: Organize contacts into groups

**Steps**:
1. Navigate to `/dashboard/contacts`
2. Click "Groups" tab
3. Click "New Group"
4. Name the group
5. Add contacts to the group

**APIs Used**: `POST /api/groups`, `POST /api/groups/[id]/members`

---

### WF-07f: Search / Select Contacts for Requests

**Goal**: Find and select recipients when sending requests

**Steps**:
1. During Send Request flow
2. Type in the recipient search box
3. Results appear as you type
4. Click to add a recipient

**APIs Used**: `GET /api/recipients/search`

---

## PWF-08: Email Account Management

### WF-08a: Connect Email Account - Gmail

**Goal**: Connect your Gmail account for sending/receiving

**Steps**:
1. Navigate to `/dashboard/settings/team`
2. Click "Connect Gmail"
3. Complete Google OAuth flow
4. Grant required permissions
5. Account appears in list

**APIs Used**: `GET /api/oauth/gmail`, `GET /api/oauth/gmail/callback`

---

### WF-08b: Connect Email Account - Microsoft

**Goal**: Connect your Microsoft 365 account

**Steps**:
1. Navigate to `/dashboard/settings/team`
2. Click "Connect Microsoft"
3. Complete Microsoft OAuth flow
4. Grant required permissions
5. Account appears in list

**APIs Used**: `GET /api/oauth/microsoft`, `GET /api/oauth/microsoft/callback`

---

## PWF-09: System Automation

These workflows run automatically without user action.

### WF-09a: Email Sync

**What it does**: Syncs new emails from connected Gmail/Microsoft accounts every 5 minutes.

**Trigger**: Inngest cron job

---

### WF-09b: Message Classification

**What it does**: When a reply is received, AI classifies it and updates request status/risk.

**Trigger**: Inngest event on new message

---

### WF-09c: Reminder Sending

**What it does**: Sends scheduled reminder emails for non-responsive requests.

**Trigger**: Inngest cron job (hourly)

---

### WF-09d: Email Queue Processing

**What it does**: Processes rate-limited emails when quotas allow.

**Trigger**: Inngest cron job (every minute)

---

## Workflow Status Legend

| Status | Meaning |
|--------|---------|
| GREEN | Fully functional, all features working |
| YELLOW | Working but has known limitations or missing features |
| RED | Broken or blocked, needs immediate attention |

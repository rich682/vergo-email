/**
 * Seed script for Review Hub test data
 * Run with: npx tsx scripts/seed-review-hub.ts
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const ORG_ID = "cmli520hm0009l34d9hqfnalr"
const USER_ID = "cmlzcimpc0001trii9h9bpxph"
const BOARD_ID = "cmlsuvn120013nwfzmqyzmn0m" // September 2026
const BOARD_2_ID = "cmmji7w6o000hr65vaidxxmt5" // September 2025

async function main() {
  console.log("🌱 Seeding Review Hub test data...\n")

  // ── 1. Enable reviewHub feature flag ──────────────────────────────────────
  const org = await prisma.organization.findUnique({
    where: { id: ORG_ID },
    select: { features: true },
  })
  const features = (org?.features as Record<string, any>) || {}
  if (!features.reviewHub) {
    await prisma.organization.update({
      where: { id: ORG_ID },
      data: {
        features: { ...features, reviewHub: true },
      },
    })
    console.log("✅ Enabled reviewHub feature flag")
  } else {
    console.log("⏭️  reviewHub feature flag already enabled")
  }

  // ── 2. Add review permission keys ─────────────────────────────────────────
  const updatedOrg = await prisma.organization.findUnique({
    where: { id: ORG_ID },
    select: { features: true },
  })
  const updatedFeatures = (updatedOrg?.features as Record<string, any>) || {}
  const rolePerms = updatedFeatures.roleActionPermissions || {}
  const managerPerms = rolePerms.MANAGER || {}
  const memberPerms = rolePerms.MEMBER || {}

  if (!managerPerms["review:view"]) {
    managerPerms["review:view"] = true
    managerPerms["review:manage"] = true
    memberPerms["review:view"] = false
    memberPerms["review:manage"] = false
    await prisma.organization.update({
      where: { id: ORG_ID },
      data: {
        features: {
          ...updatedFeatures,
          roleActionPermissions: {
            ...rolePerms,
            MANAGER: managerPerms,
            MEMBER: memberPerms,
          },
        },
      },
    })
    console.log("✅ Added review permission keys to role permissions")
  }

  // ── 3. Create AutomationRules for agent outputs ───────────────────────────
  // We need automation rules to link WorkflowRuns to
  const existingRule = await prisma.automationRule.findFirst({
    where: { organizationId: ORG_ID, name: "Doug PNL Review Agent" },
  })

  // Create additional automation rules for variety
  const rules = await Promise.all([
    prisma.automationRule.upsert({
      where: { id: "seed_rule_coi_request" },
      update: {},
      create: {
        id: "seed_rule_coi_request",
        organizationId: ORG_ID,
        name: "COI Request Automation",
        trigger: "board_created",
        conditions: {},
        actions: { version: 1, steps: [] },
        taskType: "request",
        createdById: USER_ID,
      },
    }),
    prisma.automationRule.upsert({
      where: { id: "seed_rule_recon" },
      update: {},
      create: {
        id: "seed_rule_recon",
        organizationId: ORG_ID,
        name: "Chase Checking Reconciliation",
        trigger: "board_created",
        conditions: {},
        actions: { version: 1, steps: [] },
        taskType: "reconciliation",
        createdById: USER_ID,
      },
    }),
    prisma.automationRule.upsert({
      where: { id: "seed_rule_report" },
      update: {},
      create: {
        id: "seed_rule_report",
        organizationId: ORG_ID,
        name: "Monthly Revenue Report",
        trigger: "board_created",
        conditions: {},
        actions: { version: 1, steps: [] },
        taskType: "report",
        createdById: USER_ID,
      },
    }),
    prisma.automationRule.upsert({
      where: { id: "seed_rule_form" },
      update: {},
      create: {
        id: "seed_rule_form",
        organizationId: ORG_ID,
        name: "Change Order Form Distribution",
        trigger: "board_created",
        conditions: {},
        actions: { version: 1, steps: [] },
        taskType: "form",
        createdById: USER_ID,
      },
    }),
    prisma.automationRule.upsert({
      where: { id: "seed_rule_analysis" },
      update: {},
      create: {
        id: "seed_rule_analysis",
        organizationId: ORG_ID,
        name: "Expense Analysis",
        trigger: "board_created",
        conditions: {},
        actions: { version: 1, steps: [] },
        taskType: "analysis",
        createdById: USER_ID,
      },
    }),
  ])
  console.log(`✅ Created/verified ${rules.length} automation rules`)

  // ── 4. Create WorkflowRuns (Agent Outputs) ────────────────────────────────
  const now = new Date()
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000)

  const workflowRuns = await Promise.all([
    // COI Request — 14 requests sent
    prisma.workflowRun.upsert({
      where: { id: "seed_run_coi" },
      update: {},
      create: {
        id: "seed_run_coi",
        automationRuleId: "seed_rule_coi_request",
        organizationId: ORG_ID,
        status: "COMPLETED",
        completedAt: hoursAgo(2),
        startedAt: hoursAgo(2.1),
        triggerContext: { boardId: BOARD_ID, taskInstanceId: "cmmjiq4p800ahimzefl1f4t9h" },
        stepResults: Array.from({ length: 14 }, (_, i) => ({
          stepId: `step_${i}`,
          outcome: "success",
          data: { targetType: "request", targetId: `req_${i}`, recipientEmail: `vendor${i}@example.com` },
          completedAt: hoursAgo(2).toISOString(),
        })),
        triggeredBy: "system",
      },
    }),
    // Chase Recon — 3 exceptions, $412 variance
    prisma.workflowRun.upsert({
      where: { id: "seed_run_recon" },
      update: {},
      create: {
        id: "seed_run_recon",
        automationRuleId: "seed_rule_recon",
        organizationId: ORG_ID,
        status: "COMPLETED",
        completedAt: hoursAgo(4),
        startedAt: hoursAgo(4.2),
        triggerContext: { boardId: BOARD_ID },
        stepResults: [
          {
            stepId: "run_recon",
            outcome: "success",
            data: {
              targetType: "reconciliation_run",
              targetId: "recon_run_123",
              configId: "recon_config_chase",
              exceptionCount: 3,
              variance: -412.50,
              matchRate: 97.2,
            },
            completedAt: hoursAgo(4).toISOString(),
          },
        ],
        triggeredBy: "system",
      },
    }),
    // Monthly Report
    prisma.workflowRun.upsert({
      where: { id: "seed_run_report" },
      update: {},
      create: {
        id: "seed_run_report",
        automationRuleId: "seed_rule_report",
        organizationId: ORG_ID,
        status: "COMPLETED",
        completedAt: hoursAgo(6),
        startedAt: hoursAgo(6.1),
        triggerContext: { boardId: BOARD_ID },
        stepResults: [
          {
            stepId: "generate_report",
            outcome: "success",
            data: { targetType: "report", targetId: "report_monthly_rev" },
            completedAt: hoursAgo(6).toISOString(),
          },
        ],
        triggeredBy: "system",
      },
    }),
    // Change Order Forms — 8 sent
    prisma.workflowRun.upsert({
      where: { id: "seed_run_form" },
      update: {},
      create: {
        id: "seed_run_form",
        automationRuleId: "seed_rule_form",
        organizationId: ORG_ID,
        status: "COMPLETED",
        completedAt: hoursAgo(8),
        startedAt: hoursAgo(8.1),
        triggerContext: { boardId: BOARD_2_ID, taskInstanceId: "cmmjiq4p800ahimzefl1f4t9h" },
        stepResults: Array.from({ length: 8 }, (_, i) => ({
          stepId: `step_${i}`,
          outcome: "success",
          data: { targetType: "form_request", targetId: `form_req_${i}` },
          completedAt: hoursAgo(8).toISOString(),
        })),
        triggeredBy: "system",
      },
    }),
    // Expense Analysis
    prisma.workflowRun.upsert({
      where: { id: "seed_run_analysis" },
      update: {},
      create: {
        id: "seed_run_analysis",
        automationRuleId: "seed_rule_analysis",
        organizationId: ORG_ID,
        status: "COMPLETED",
        completedAt: hoursAgo(12),
        startedAt: hoursAgo(12.1),
        triggerContext: { boardId: BOARD_ID },
        stepResults: [
          {
            stepId: "run_analysis",
            outcome: "success",
            data: { targetType: "analysis", targetId: "analysis_expense_jan" },
            completedAt: hoursAgo(12).toISOString(),
          },
        ],
        triggeredBy: "system",
      },
    }),
  ])
  console.log(`✅ Created ${workflowRuns.length} workflow runs (agent outputs)`)

  // ── 5. Create Requests + Messages (Email Replies) ─────────────────────────
  // Need Requests first, then Messages
  const taskInstanceId = "cmmniqyan0001slwz8r4g06ag" // COGs Review with Josh
  const entities = [
    { id: "cmli520in000fl34dzh2eyqeu", name: "Tyler Steffen", email: "tsteffen@tmgcm.com" },
    { id: "cmmnktfky0002lbbcktk2znq3", name: "Heidi Musselman", email: "hmusselman@tmgcm.com" },
    { id: "cmmnl11520003s9ldfj34q95w", name: "Mike Goins", email: "mgoins@tmgcm.com" },
    { id: "cmmnltmhe0006lbbcalxuudzz", name: "Josh Thomas", email: "jthomas@tmgcm.com" },
  ]

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]
    const requestId = `seed_request_${i}`
    const messageId = `seed_message_${i}`

    await prisma.request.upsert({
      where: { id: requestId },
      update: {},
      create: {
        id: requestId,
        organizationId: ORG_ID,
        taskInstanceId,
        entityId: entity.id,
        campaignName: i < 2 ? "W-9 Collection" : "COI Collection",
        campaignType: i < 2 ? "W9" : "COI",
        status: "REPLIED",
        threadId: `seed_thread_${i}`,
        replyToEmail: "requests@tmgcm.com",
        riskLevel: i === 0 ? "high" : i === 1 ? "medium" : "low",
        completionPercentage: i === 0 ? 30 : i === 1 ? 70 : 100,
      },
    })

    const classifications = ["DATA", "QUESTION", "ACKNOWLEDGMENT", "DATA"]
    const subjects = [
      "Re: W-9 Request - TMG Construction",
      "Re: W-9 Request - TMG Construction",
      "Re: COI Request - Insurance Certificate",
      "Re: COI Request - Annual Renewal",
    ]

    await prisma.message.upsert({
      where: { id: messageId },
      update: {},
      create: {
        id: messageId,
        requestId,
        entityId: entity.id,
        direction: "INBOUND",
        channel: "EMAIL",
        subject: subjects[i],
        body: `Hi, here is the requested document. Please let me know if you need anything else. Best, ${entity.name}`,
        fromAddress: entity.email,
        toAddress: "requests@tmgcm.com",
        aiClassification: classifications[i],
        aiReasoning: "Contact provided the requested document",
        isAutoReply: false,
        reviewStatus: "UNREVIEWED",
        createdAt: hoursAgo(3 + i * 2),
      },
    })
  }
  console.log(`✅ Created ${entities.length} requests + inbound messages (email replies)`)

  // ── 6. Create FormRequests (Form Submissions) ─────────────────────────────
  const formDefId = "cmm9fnbjl00011xxu2ye0g8oe" // Change Order request

  for (let i = 0; i < 3; i++) {
    const entity = entities[i]
    await prisma.formRequest.upsert({
      where: { id: `seed_form_request_${i}` },
      update: {},
      create: {
        id: `seed_form_request_${i}`,
        organizationId: ORG_ID,
        taskInstanceId,
        formDefinitionId: formDefId,
        recipientEntityId: entity.id,
        status: "SUBMITTED",
        submittedAt: hoursAgo(5 + i * 3),
        responseData: {
          changeOrderNumber: `CO-2026-${100 + i}`,
          amount: 15000 + i * 5000,
          description: `Subcontractor change order for Phase ${i + 1}`,
        },
        accessToken: `seed_token_${i}_${Date.now()}`,
      },
    })
  }
  console.log(`✅ Created 3 form submissions`)

  // ── 7. Create CollectedItems (Evidence) ───────────────────────────────────
  const evidenceItems = [
    {
      id: "seed_evidence_1",
      filename: "Insurance_Certificate_2026.pdf",
      mimeType: "application/pdf",
      submittedBy: "tsteffen@tmgcm.com",
      submittedByName: "Tyler Steffen",
      source: "EMAIL_REPLY" as const,
      fileSize: 245_000,
      hoursAgoVal: 5,
    },
    {
      id: "seed_evidence_2",
      filename: "W9_AcmeCorp_2026.pdf",
      mimeType: "application/pdf",
      submittedBy: "hmusselman@tmgcm.com",
      submittedByName: "Heidi Musselman",
      source: "EMAIL_REPLY" as const,
      fileSize: 128_000,
      hoursAgoVal: 7,
    },
    {
      id: "seed_evidence_3",
      filename: "Signed_Change_Order_CO-2026-101.pdf",
      mimeType: "application/pdf",
      submittedBy: "mgoins@tmgcm.com",
      submittedByName: "Mike Goins",
      source: "FORM_SUBMISSION" as const,
      fileSize: 312_000,
      hoursAgoVal: 10,
    },
  ]

  for (const item of evidenceItems) {
    await prisma.collectedItem.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        organizationId: ORG_ID,
        taskInstanceId,
        filename: item.filename,
        fileKey: `evidence/${item.id}/${item.filename}`,
        fileUrl: `https://example.com/files/${item.filename}`,
        fileSize: item.fileSize,
        mimeType: item.mimeType,
        source: item.source,
        submittedBy: item.submittedBy,
        submittedByName: item.submittedByName,
        receivedAt: hoursAgo(item.hoursAgoVal),
        status: "UNREVIEWED",
        createdAt: hoursAgo(item.hoursAgoVal),
      },
    })
  }
  console.log(`✅ Created ${evidenceItems.length} collected items (evidence)`)

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n🎉 Seed complete! Review Hub should now show:")
  console.log("   • 5 agent outputs (COI requests, recon, report, forms, analysis)")
  console.log("   • 4 email replies (W-9 and COI responses)")
  console.log("   • 3 form submissions (Change Order requests)")
  console.log("   • 3 evidence items (PDF documents)")
  console.log("   Total: 15 items\n")

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error("❌ Seed failed:", e)
  await prisma.$disconnect()
  process.exit(1)
})

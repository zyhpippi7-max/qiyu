import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  ownerUserId: integer("owner_user_id").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const workspaceMembers = sqliteTable("workspace_members", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const productRecords = sqliteTable("product_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().default(0),
  module: text("module").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("draft"),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const automationDevices = sqliteTable("automation_devices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().default(0),
  deviceId: text("device_id").notNull().unique(),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  version: text("version").notNull().default("0.1.0"),
  token: text("token").notNull(),
  status: text("status").notNull().default("offline"),
  capabilities: text("capabilities").notNull().default("[]"),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("automation_devices_workspace_seen_idx").on(table.workspaceId, table.lastSeenAt),
]);

export const automationPairingCodes = sqliteTable("automation_pairing_codes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull(),
  codeHash: text("code_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const automationJobs = sqliteTable("automation_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().default(0),
  deviceId: text("device_id"),
  type: text("type").notNull(),
  payload: text("payload").notNull().default("{}"),
  status: text("status").notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  result: text("result").notNull().default("{}"),
  error: text("error").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  claimedAt: text("claimed_at"),
  finishedAt: text("finished_at"),
}, (table) => [
  index("automation_jobs_workspace_claim_idx").on(table.workspaceId, table.status, table.deviceId, table.createdAt),
]);

export const workflowRuns = sqliteTable("workflow_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().default(0),
  workflowId: integer("workflow_id").notNull(),
  triggerType: text("trigger_type").notNull(),
  actionType: text("action_type").notNull(),
  status: text("status").notNull().default("queued"),
  deviceId: text("device_id"),
  automationJobId: integer("automation_job_id"),
  attempt: integer("attempt").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  dedupeKey: text("dedupe_key"),
  payload: text("payload").notNull().default("{}"),
  result: text("result").notNull().default("{}"),
  error: text("error").notNull().default(""),
  scheduledFor: text("scheduled_for").notNull().default(sql`CURRENT_TIMESTAMP`),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("workflow_runs_workspace_workflow_created_idx").on(table.workspaceId, table.workflowId, table.createdAt),
  index("workflow_runs_workspace_status_scheduled_idx").on(table.workspaceId, table.status, table.scheduledFor),
  uniqueIndex("workflow_runs_automation_job_unique").on(table.automationJobId),
  uniqueIndex("workflow_runs_workspace_workflow_dedupe_unique").on(table.workspaceId, table.workflowId, table.dedupeKey),
]);

export const aiEmployeeRuns = sqliteTable("ai_employee_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().default(0),
  employeeId: integer("employee_id").notNull(),
  triggerType: text("trigger_type").notNull(),
  status: text("status").notNull().default("queued"),
  attempt: integer("attempt").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  dedupeKey: text("dedupe_key"),
  payload: text("payload").notNull().default("{}"),
  result: text("result").notNull().default("{}"),
  error: text("error").notNull().default(""),
  scheduledFor: text("scheduled_for").notNull().default(sql`CURRENT_TIMESTAMP`),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("ai_employee_runs_workspace_employee_created_idx").on(table.workspaceId, table.employeeId, table.createdAt),
  index("ai_employee_runs_workspace_status_scheduled_idx").on(table.workspaceId, table.status, table.scheduledFor),
  uniqueIndex("ai_employee_runs_workspace_employee_dedupe_unique").on(table.workspaceId, table.employeeId, table.dedupeKey),
]);

export const privateContacts = sqliteTable("private_contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().default(0),
  name: text("name").notNull(),
  remark: text("remark").notNull().default(""),
  source: text("source").notNull().default("manual"),
  status: text("status").notNull().default("active"),
  lastContactAt: text("last_contact_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const privateTags = sqliteTable("private_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().default(0),
  name: text("name").notNull(),
  color: text("color").notNull().default("#7657e5"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("private_tags_workspace_name_unique").on(table.workspaceId, table.name),
]);

export const privateContactTags = sqliteTable("private_contact_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contactId: integer("contact_id").notNull(),
  tagId: integer("tag_id").notNull(),
});

export const privatePlans = sqliteTable("private_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().default(0),
  module: text("module").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  targetMode: text("target_mode").notNull().default("contacts"),
  targetValue: text("target_value").notNull().default("[]"),
  settings: text("settings").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const privatePlanSteps = sqliteTable("private_plan_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planId: integer("plan_id").notNull(),
  stepOrder: integer("step_order").notNull(),
  action: text("action").notNull().default("message"),
  delayMinutes: integer("delay_minutes").notNull().default(0),
  content: text("content").notNull().default(""),
  settings: text("settings").notNull().default("{}"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

export const privateRuns = sqliteTable("private_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().default(0),
  planId: integer("plan_id").notNull(),
  contactId: integer("contact_id"),
  deviceId: text("device_id"),
  status: text("status").notNull().default("scheduled"),
  currentStep: integer("current_step").notNull().default(1),
  nextRunAt: text("next_run_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  error: text("error").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  finishedAt: text("finished_at"),
});

export const acquisitionTasks = sqliteTable("acquisition_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().default(0),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  status: text("status").notNull().default("draft"),
  sourceType: text("source_type").notNull().default("keyword_search"),
  target: text("target").notNull().default(""),
  keywords: text("keywords").notNull().default("[]"),
  excludeKeywords: text("exclude_keywords").notNull().default("[]"),
  settings: text("settings").notNull().default("{}"),
  deviceId: text("device_id"),
  lastRunAt: text("last_run_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const acquisitionLeads = sqliteTable("acquisition_leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().default(0),
  taskId: integer("task_id"),
  platform: text("platform").notNull(),
  nickname: text("nickname").notNull(),
  platformId: text("platform_id").notNull().default(""),
  profileUrl: text("profile_url").notNull().default(""),
  sourceUrl: text("source_url").notNull().default(""),
  sourceText: text("source_text").notNull().default(""),
  matchedKeywords: text("matched_keywords").notNull().default("[]"),
  score: integer("score").notNull().default(0),
  status: text("status").notNull().default("new"),
  notes: text("notes").notNull().default(""),
  convertedContactId: integer("converted_contact_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const agentChatConversations = sqliteTable("agent_chat_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().default(0),
  title: text("title").notNull().default("新对话"),
  expertId: text("expert_id").notNull().default(""),
  expertName: text("expert_name").notNull().default("通用业务助手"),
  modelTier: text("model_tier").notNull().default("smart"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("agent_chat_conversations_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
]);

export const agentChatMessages = sqliteTable("agent_chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: integer("workspace_id").notNull().default(0),
  conversationId: integer("conversation_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("agent_chat_messages_workspace_conversation_created_idx").on(table.workspaceId, table.conversationId, table.createdAt),
]);

export const membershipPlans = sqliteTable("membership_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceCents: integer("price_cents").notNull().default(0),
  durationDays: integer("duration_days").notNull().default(30),
  deviceLimit: integer("device_limit").notNull().default(1),
  aiCredits: integer("ai_credits").notNull().default(0),
  features: text("features").notNull().default("[]"),
  status: text("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  phone: text("phone").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("member"),
  membershipPlanId: integer("membership_plan_id"),
  membershipExpiresAt: text("membership_expires_at"),
  status: text("status").notNull().default("active"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

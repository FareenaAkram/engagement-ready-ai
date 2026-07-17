import { z } from 'zod';

const envSchema = z.object({
  // App base URL — used to build ICA callback links
  APP_BASE_URL: z.string().optional(),
  // Shared-secret passcode gate — set this to require a passcode before the
  // app is usable. When unset, the app runs with no authentication at all
  // (fine for isolated local dev, never for anything reachable over a public
  // tunnel or the internet).
  APP_PASSCODE: z.string().optional(),
  // Encrypts .next/tmp/workflow-state.json at rest (AES-256-GCM) when set.
  // Also doubles as integrity verification — GCM's auth tag makes tampering
  // or corruption detectable on read. Leave unset to keep today's plain-JSON
  // behavior (fine for isolated local dev only).
  STATE_ENCRYPTION_KEY: z.string().optional(),
  // Second, higher-privilege passcode required specifically for final
  // engagement approval (DASC SR-AC-5 — lightweight interim RBAC: the one
  // irreversible, real-delivery-triggering action gets its own gate,
  // distinct from the general session passcode). Leave unset to skip this
  // extra check (today's behavior — anyone with a session can approve).
  APPROVAL_PASSCODE: z.string().optional(),
  // Stakeholder directory — real people per role, used to notify via ICA
  STAKEHOLDER_CONSULTANT_NAME: z.string().optional(),
  STAKEHOLDER_CONSULTANT_EMAIL: z.string().optional(),
  STAKEHOLDER_ARCHITECT_NAME: z.string().optional(),
  STAKEHOLDER_ARCHITECT_EMAIL: z.string().optional(),
  STAKEHOLDER_PARTNER_NAME: z.string().optional(),
  STAKEHOLDER_PARTNER_EMAIL: z.string().optional(),
  STAKEHOLDER_CLIENT_NAME: z.string().optional(),
  STAKEHOLDER_CLIENT_EMAIL: z.string().optional(),
  WATSONX_API_KEY: z.string().optional(),
  WATSONX_PROJECT_ID: z.string().optional(),
  WATSONX_URL: z.string().optional(),
  WATSONX_MODEL_ID: z.string().optional(),
  // watsonx Orchestrate — task dispatch
  ORCHESTRATE_API_KEY: z.string().optional(),
  ORCHESTRATE_URL: z.string().optional(),
  ORCHESTRATE_AGENT_ID: z.string().optional(),
  // IBM Consulting Advantage — Agentic App
  // ICA_AGENTIC_APP_ID  = 92690bf8-bb58-4b1e-9241-f8af02aa89ce
  // ICA_AGENT_ID        = cb3308a4-ddc7-422b-802b-26c04d6b6636  (agent registry)
  // ICA_MCP_GATEWAY_ID  = 119469ecd338485da6333819e0030eaf
  // ICA_AGENTIC_APP_URL = Agentic App MCP server base URL (without /mcp)
  ICA_AGENTIC_APP_ID: z.string().optional(),
  ICA_AGENT_ID: z.string().optional(),
  ICA_MCP_GATEWAY_ID: z.string().optional(),
  ICA_AGENTIC_APP_URL: z.string().optional(),
  // ICA_LANGFLOW_URL    = Langflow base URL (https://langflow.servicesessentials.ibm.com)
  // ICA_LANGFLOW_FLOW_ID_NOTIFY = Flow ID for notify-and-collect-acknowledgements workflow
  // ICA_LANGFLOW_FLOW_ID_ASSETS = Flow ID for generate-ica-assets workflow
  // ICA_LANGFLOW_API_KEY = API key generated from Langflow Share → API access
  ICA_LANGFLOW_URL: z.string().optional(),
  ICA_LANGFLOW_FLOW_ID_NOTIFY: z.string().optional(),
  ICA_LANGFLOW_FLOW_ID_ASSETS: z.string().optional(),
  ICA_LANGFLOW_API_KEY: z.string().optional(),
  // ICA_LANGFLOW_MCP_URL/_API_KEY = the project exposed as a real MCP server
  // (Workflow -> Share -> MCP Server -> Generate API key). Preferred over the
  // REST run-endpoint above per IBM's guidance — same underlying flows,
  // exposed as MCP tools notify_assignees / generate_ica_assets.
  ICA_LANGFLOW_MCP_URL: z.string().optional(),
  ICA_LANGFLOW_MCP_API_KEY: z.string().optional(),
  // IBM Consulting Advantage — legacy MCP server integration
  // ICA_MCP_KEY    = ak_ key from ICA Settings (Cline/VS Code only — kept for /health probe)
  // ICA_BEARER     = Authorization: Bearer token from .bob/mcp.json ica-gateway entry
  // ICA_MCP_URL    = gateway base URL (without /mcp)
  ICA_MCP_KEY: z.string().optional(),
  ICA_MCP_URL: z.string().optional(),
  ICA_BEARER: z.string().optional(),
  // ICA_A2A_KEY = Agent Studio API key — the Bearer token for the A2A endpoint
  // Generate at: https://agentstudio.servicesessentials.ibm.com → Settings → API Keys
  ICA_A2A_KEY: z.string().optional(),
  // ICA_AGENT_API_ENABLED = set to "true" to enable the ICA Agent API task assignment flow
  // When enabled, HITL accept triggers ICA to assign tasks + send emails + create Jira tickets
  ICA_AGENT_API_ENABLED: z.string().optional(),
  // Context Studio — ontology/governance validation
  // CONTEXT_STUDIO_API_KEY    = x-api-key header (JWT bound to ctx_69dbd815ec49)
  // CONTEXT_STUDIO_BEARER     = Authorization: Bearer header (MCP gateway JWT)
  // CONTEXT_STUDIO_URL        = MCP gateway URL (servicesessentials.ibm.com)
  // CONTEXT_STUDIO_CTX_ID     = ctx_69dbd815ec49
  CONTEXT_STUDIO_API_KEY: z.string().optional(),
  CONTEXT_STUDIO_BEARER: z.string().optional(),
  CONTEXT_STUDIO_URL: z.string().optional(),
  CONTEXT_STUDIO_CTX_ID: z.string().optional(),
  // Jira Cloud
  JIRA_BASE_URL: z.string().optional(),
  JIRA_EMAIL: z.string().optional(),
  JIRA_API_TOKEN: z.string().optional(),
  JIRA_PROJECT_KEY: z.string().optional(),
  // Slack — incoming webhook (one-way summary posts)
  SLACK_WEBHOOK_URL: z.string().optional(),
  // Slack — Bot Token + Signing Secret (interactive "Mark Done" buttons on task cards)
  // SLACK_BOT_TOKEN      = xoxb-... from the Slack App's OAuth & Permissions page
  //                        (needs chat:write, im:write, users:read.email scopes)
  // SLACK_SIGNING_SECRET = from the Slack App's Basic Information page
  //                        (verifies POST /api/slack/actions requests are really from Slack)
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  // Email
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.string().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_DEFAULT_RECIPIENT: z.string().optional(),
});

const parsedEnv = envSchema.parse({
  APP_BASE_URL: process.env.APP_BASE_URL,
  APP_PASSCODE: process.env.APP_PASSCODE,
  STATE_ENCRYPTION_KEY: process.env.STATE_ENCRYPTION_KEY,
  APPROVAL_PASSCODE: process.env.APPROVAL_PASSCODE,
  STAKEHOLDER_CONSULTANT_NAME: process.env.STAKEHOLDER_CONSULTANT_NAME,
  STAKEHOLDER_CONSULTANT_EMAIL: process.env.STAKEHOLDER_CONSULTANT_EMAIL,
  STAKEHOLDER_ARCHITECT_NAME: process.env.STAKEHOLDER_ARCHITECT_NAME,
  STAKEHOLDER_ARCHITECT_EMAIL: process.env.STAKEHOLDER_ARCHITECT_EMAIL,
  STAKEHOLDER_PARTNER_NAME: process.env.STAKEHOLDER_PARTNER_NAME,
  STAKEHOLDER_PARTNER_EMAIL: process.env.STAKEHOLDER_PARTNER_EMAIL,
  STAKEHOLDER_CLIENT_NAME: process.env.STAKEHOLDER_CLIENT_NAME,
  STAKEHOLDER_CLIENT_EMAIL: process.env.STAKEHOLDER_CLIENT_EMAIL,
  WATSONX_API_KEY: process.env.WATSONX_API_KEY,
  WATSONX_PROJECT_ID: process.env.WATSONX_PROJECT_ID,
  WATSONX_URL: process.env.WATSONX_URL,
  WATSONX_MODEL_ID: process.env.WATSONX_MODEL_ID,
  ORCHESTRATE_API_KEY: process.env.ORCHESTRATE_API_KEY,
  ORCHESTRATE_URL: process.env.ORCHESTRATE_URL,
  ORCHESTRATE_AGENT_ID: process.env.ORCHESTRATE_AGENT_ID,
  ICA_AGENTIC_APP_ID: process.env.ICA_AGENTIC_APP_ID,
  ICA_AGENT_ID: process.env.ICA_AGENT_ID,
  ICA_MCP_GATEWAY_ID: process.env.ICA_MCP_GATEWAY_ID,
  ICA_AGENTIC_APP_URL: process.env.ICA_AGENTIC_APP_URL,
  ICA_LANGFLOW_URL: process.env.ICA_LANGFLOW_URL,
  ICA_LANGFLOW_FLOW_ID_NOTIFY: process.env.ICA_LANGFLOW_FLOW_ID_NOTIFY,
  ICA_LANGFLOW_FLOW_ID_ASSETS: process.env.ICA_LANGFLOW_FLOW_ID_ASSETS,
  ICA_LANGFLOW_API_KEY: process.env.ICA_LANGFLOW_API_KEY,
  ICA_LANGFLOW_MCP_URL: process.env.ICA_LANGFLOW_MCP_URL,
  ICA_LANGFLOW_MCP_API_KEY: process.env.ICA_LANGFLOW_MCP_API_KEY,
  ICA_MCP_KEY: process.env.ICA_MCP_KEY,
  ICA_MCP_URL: process.env.ICA_MCP_URL,
  ICA_BEARER: process.env.ICA_BEARER,
  ICA_A2A_KEY: process.env.ICA_A2A_KEY,
  ICA_AGENT_API_ENABLED: process.env.ICA_AGENT_API_ENABLED,
  CONTEXT_STUDIO_API_KEY: process.env.CONTEXT_STUDIO_API_KEY,
  CONTEXT_STUDIO_BEARER: process.env.CONTEXT_STUDIO_BEARER,
  CONTEXT_STUDIO_URL: process.env.CONTEXT_STUDIO_URL,
  CONTEXT_STUDIO_CTX_ID: process.env.CONTEXT_STUDIO_CTX_ID,
  JIRA_BASE_URL: process.env.JIRA_BASE_URL,
  JIRA_EMAIL: process.env.JIRA_EMAIL,
  JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
  JIRA_PROJECT_KEY: process.env.JIRA_PROJECT_KEY,
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
  SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
  EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST,
  EMAIL_SMTP_PORT: process.env.EMAIL_SMTP_PORT,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM,
  EMAIL_DEFAULT_RECIPIENT: process.env.EMAIL_DEFAULT_RECIPIENT,
});

export const appEnv = {
  appBaseUrl: parsedEnv.APP_BASE_URL ?? 'http://localhost:3000',
  appPasscode: parsedEnv.APP_PASSCODE,
  stateEncryptionKey: parsedEnv.STATE_ENCRYPTION_KEY,
  approvalPasscode: parsedEnv.APPROVAL_PASSCODE,
  // Stakeholder directory defaults — override in .env.local with real names+emails
  stakeholderConsultantName: parsedEnv.STAKEHOLDER_CONSULTANT_NAME ?? 'Lead Consultant',
  stakeholderConsultantEmail: parsedEnv.STAKEHOLDER_CONSULTANT_EMAIL ?? '',
  stakeholderArchitectName: parsedEnv.STAKEHOLDER_ARCHITECT_NAME ?? 'Solution Architect',
  stakeholderArchitectEmail: parsedEnv.STAKEHOLDER_ARCHITECT_EMAIL ?? '',
  stakeholderPartnerName: parsedEnv.STAKEHOLDER_PARTNER_NAME ?? 'IBM Partner',
  stakeholderPartnerEmail: parsedEnv.STAKEHOLDER_PARTNER_EMAIL ?? '',
  stakeholderClientName: parsedEnv.STAKEHOLDER_CLIENT_NAME ?? 'Client Contact',
  stakeholderClientEmail: parsedEnv.STAKEHOLDER_CLIENT_EMAIL ?? '',
  watsonxApiKey: parsedEnv.WATSONX_API_KEY,
  watsonxProjectId: parsedEnv.WATSONX_PROJECT_ID,
  watsonxUrl: parsedEnv.WATSONX_URL ?? 'https://us-south.ml.cloud.ibm.com',
  watsonxModelId: parsedEnv.WATSONX_MODEL_ID ?? 'ibm/granite-3-8b-instruct',
  orchestrateApiKey: parsedEnv.ORCHESTRATE_API_KEY,
  orchestrateUrl: parsedEnv.ORCHESTRATE_URL,
  orchestrateAgentId: parsedEnv.ORCHESTRATE_AGENT_ID,
  // ICA Agentic App — live identifiers from ICA
  icaAgenticAppId: parsedEnv.ICA_AGENTIC_APP_ID ?? '92690bf8-bb58-4b1e-9241-f8af02aa89ce',
  icaAgentId: parsedEnv.ICA_AGENT_ID ?? 'cb3308a4-ddc7-422b-802b-26c04d6b6636',
  icaMcpGatewayId: parsedEnv.ICA_MCP_GATEWAY_ID ?? '119469ecd338485da6333819e0030eaf',
  icaAgenticAppUrl: parsedEnv.ICA_AGENTIC_APP_URL
    ?? 'https://agentstudio.servicesessentials.ibm.com/servers/69e96cd3e35e42c2810673c44bf3a346',
  icaLangflowUrl: parsedEnv.ICA_LANGFLOW_URL ?? 'https://langflow.servicesessentials.ibm.com',
  icaLangflowFlowIdNotify: parsedEnv.ICA_LANGFLOW_FLOW_ID_NOTIFY,
  icaLangflowFlowIdAssets: parsedEnv.ICA_LANGFLOW_FLOW_ID_ASSETS,
  icaLangflowApiKey: parsedEnv.ICA_LANGFLOW_API_KEY,
  icaLangflowMcpUrl: parsedEnv.ICA_LANGFLOW_MCP_URL,
  icaLangflowMcpApiKey: parsedEnv.ICA_LANGFLOW_MCP_API_KEY,
  icaMcpKey: parsedEnv.ICA_MCP_KEY,
  icaMcpUrl: parsedEnv.ICA_MCP_URL,
  icaBearer: parsedEnv.ICA_BEARER,
  icaA2aKey: parsedEnv.ICA_A2A_KEY,
  icaAgentApiEnabled: parsedEnv.ICA_AGENT_API_ENABLED === 'true',
  // Context Studio — governs ontology validation during pipeline
  contextStudioApiKey: parsedEnv.CONTEXT_STUDIO_API_KEY,
  contextStudioBearer: parsedEnv.CONTEXT_STUDIO_BEARER,
  contextStudioUrl: parsedEnv.CONTEXT_STUDIO_URL
    ?? 'https://servicesessentials.ibm.com/mcp-gateway/service/gateway/servers/8ccdd203bdee4014b08e82eedb6046e2/mcp',
  contextStudioCtxId: parsedEnv.CONTEXT_STUDIO_CTX_ID ?? 'ctx_69dbd815ec49',
  jiraBaseUrl: parsedEnv.JIRA_BASE_URL,
  jiraEmail: parsedEnv.JIRA_EMAIL,
  jiraApiToken: parsedEnv.JIRA_API_TOKEN,
  jiraProjectKey: parsedEnv.JIRA_PROJECT_KEY ?? 'ERA',
  slackWebhookUrl: parsedEnv.SLACK_WEBHOOK_URL,
  slackBotToken: parsedEnv.SLACK_BOT_TOKEN,
  slackSigningSecret: parsedEnv.SLACK_SIGNING_SECRET,
  emailSmtpHost: parsedEnv.EMAIL_SMTP_HOST,
  emailSmtpPort: Number(parsedEnv.EMAIL_SMTP_PORT ?? '587'),
  emailUser: parsedEnv.EMAIL_USER,
  emailPass: parsedEnv.EMAIL_PASS,
  emailFrom: parsedEnv.EMAIL_FROM,
  emailDefaultRecipient: parsedEnv.EMAIL_DEFAULT_RECIPIENT,
};

/** Returns true when a passcode gate is configured — false means the app is wide open */
export function hasAuthConfig() {
  return Boolean(appEnv.appPasscode && appEnv.appPasscode.length >= 6);
}

/** Returns true when a second, higher-privilege passcode gates final approval */
export function hasApprovalPasscodeConfig() {
  return Boolean(appEnv.approvalPasscode && appEnv.approvalPasscode.length >= 6);
}

export function hasWatsonxConfig() {
  return Boolean(appEnv.watsonxApiKey && appEnv.watsonxProjectId && appEnv.watsonxUrl);
}

export function hasOrchestrateConfig() {
  return Boolean(appEnv.orchestrateApiKey && appEnv.orchestrateUrl);
}

/** Returns true when the Agent Studio A2A key is set (not a placeholder) */
export function hasICAAgenticConfig() {
  const k = appEnv.icaA2aKey;
  return Boolean(k && k !== 'your-agent-studio-api-key-here' && k.length > 8);
}

/**
 * Returns true when ICA Agent API is available for task assignment and delivery.
 * Requires ICA_A2A_KEY (the A2A bearer token from Agentic App Studio Lab).
 */
export function hasICAAgentApiConfig() {
  return hasICAAgenticConfig();
}

/** Returns true when both the MCP key AND the MCP URL are set */
export function hasICAConfig() {
  return Boolean(appEnv.icaMcpKey && appEnv.icaMcpUrl);
}

export function hasJiraConfig() {
  return Boolean(appEnv.jiraBaseUrl && appEnv.jiraEmail && appEnv.jiraApiToken);
}

export function hasSlackConfig() {
  return Boolean(appEnv.slackWebhookUrl);
}

/** Returns true when Slack is configured for interactive "Mark Done" task cards (bot token + signing secret) */
export function hasSlackBotConfig() {
  return Boolean(appEnv.slackBotToken && appEnv.slackSigningSecret);
}

export function hasEmailConfig() {
  return Boolean(appEnv.emailSmtpHost && appEnv.emailUser && appEnv.emailPass);
}

/** Returns true when the Context Studio API key is set — enables governance/ontology validation */
export function hasContextStudioConfig() {
  return Boolean(appEnv.contextStudioApiKey);
}

/**
 * Returns true when both Langflow workflow flow IDs and the Langflow API key are set.
 * Required for ICA to actually EXECUTE workflows (notify + generate assets).
 * Get these from ICA Agent Studio → Workflows → Share → API access.
 */
export function hasLangflowConfig() {
  return Boolean(
    appEnv.icaLangflowApiKey &&
    (appEnv.icaLangflowFlowIdNotify || appEnv.icaLangflowFlowIdAssets),
  );
}

/**
 * Returns true when the Langflow project's real MCP server is configured
 * (Workflow -> Share -> MCP Server -> Generate API key). Preferred over
 * hasLangflowConfig()'s REST run-endpoint when both are set.
 */
export function hasLangflowMcpConfig() {
  return Boolean(appEnv.icaLangflowMcpUrl && appEnv.icaLangflowMcpApiKey);
}

type Copy = [string, string];

export type OAuthProviderSetup = {
  key: string;
  appType: string;
  action: Copy;
  actionURL: string;
  documentationURL: string;
  steps: Copy[];
  vendorConfirmationRequired?: boolean;
};

const google = (key: string, service: string, api: string, documentationURL: string): OAuthProviderSetup => ({
  key,
  appType: "OAuth client ID · Web application",
  action: ["เปิด Google Auth Platform", "Open Google Auth Platform"],
  actionURL: "https://console.cloud.google.com/auth/clients",
  documentationURL,
  steps: [
    ["เลือกโครงการของ ORCA ตั้งชื่อแอปและหน้าขอสิทธิ์เป็น ORCA แล้วสร้าง OAuth client ID ชนิด Web application", "Choose the ORCA project, set the app and consent-screen name to ORCA, and create an OAuth client ID for a Web application."],
    ["เพิ่ม Callback URL ด้านล่างใน Authorized redirect URIs แล้วคัดลอก Client ID และ Client Secret มาที่นี่", "Add the Callback URL below to Authorized redirect URIs, then copy the Client ID and Client Secret here."],
    [`เปิด ${api} ในโครงการที่จะใช้งาน และให้สมาชิกมีสิทธิ์ MCP Tool User กับสิทธิ์ ${service} เฉพาะงานที่ต้องใช้`, `Enable ${api} in the target project. Grant members MCP Tool User and only the ${service} permissions their work needs.`],
  ],
});

// Provider actions are fixed official links. Never derive them from a display
// name or carry credentials to a provider URL. Reviewed 2026-09-21.
const providers: Record<string, OAuthProviderSetup> = {
  slack: {
    key: "slack", appType: "Slack App · MCP enabled",
    action: ["เปิดหน้าตั้งค่า Slack App", "Open Slack app settings"],
    actionURL: "https://api.slack.com/apps",
    documentationURL: "https://docs.slack.dev/ai/slack-mcp-server/",
    steps: [
      ["สร้างแอป ORCA ใน Slack Workspace ที่จะใช้ ปุ่มสร้างแอปใส่ Callback URL และสิทธิ์อ่านช่องสาธารณะให้แล้ว", "Create ORCA in the Slack workspace you will use. The create-app button includes the callback and public-channel read scopes."],
      ["กด Install App เพื่อติดตั้งใน Workspace แล้วนำ Client ID และ Client Secret จาก Basic Information มาใส่ด้านล่าง", "Use Install App to install into your workspace, then enter the Client ID and Client Secret from Basic Information below."],
      ["แอปภายในใช้กับ Workspace ขององค์กรเอง การให้ลูกค้าองค์กรอื่นใช้งานต้องผ่านข้อกำหนดเผยแพร่แอปของ Slack", "Use an internal app for your own organization's workspace. Distribution to other organizations must meet Slack's app publishing requirements."],
    ],
  },
  asana: {
    key: "asana", appType: "MCP app",
    action: ["เปิด Asana Developer Console", "Open Asana Developer Console"],
    actionURL: "https://app.asana.com/0/my-apps",
    documentationURL: "https://developers.asana.com/docs/integrating-with-asanas-mcp-server",
    steps: [
      ["เลือก Create new app ตั้งชื่อ ORCA และเลือกประเภท MCP app", "Choose Create new app, name it ORCA, and select MCP app."],
      ["เพิ่ม Callback URL ด้านล่างใน OAuth แล้วเลือก Workspace ที่ใช้ได้ใน Manage distribution", "Add the Callback URL below in OAuth, then select the permitted workspaces in Manage distribution."],
      ["คัดลอก Client ID และ Client secret ของ MCP app มาใส่ที่นี่", "Copy the MCP app's Client ID and Client secret here."],
    ],
  },
  box: {
    key: "box", appType: "Box MCP server · Integration Credentials",
    action: ["เปิดวิธีตั้งค่า Box MCP", "Open Box MCP setup"],
    actionURL: "https://developer.box.com/guides/box-mcp/setup",
    documentationURL: "https://developer.box.com/guides/box-mcp/setup",
    steps: [
      ["ให้ผู้ดูแล Box เปิด Admin Console → Integrations และเปิดใช้ Box MCP server", "As a Box admin, open Admin Console → Integrations and enable Box MCP server."],
      ["เลือก Configure → Add Integration Credentials ตั้งชื่อ ORCA และเพิ่ม Callback URL ด้านล่าง", "Choose Configure → Add Integration Credentials, name it ORCA, and add the Callback URL below."],
      ["เลือก Access Scopes ที่ต้องใช้ แล้วนำ Client ID และ Client Secret มาใส่ที่นี่ สิทธิ์ docgen.readwrite ต้องใช้ Enterprise Advanced", "Select the required Access Scopes, then enter the Client ID and Client Secret here. docgen.readwrite requires Enterprise Advanced."],
    ],
  },
  docusign: {
    key: "docusign", appType: "Integration Key · Authorization Code Grant",
    action: ["เปิดวิธีตั้งค่า Docusign", "Open Docusign setup"],
    actionURL: "https://developers.docusign.com/platform/configure-app/",
    documentationURL: "https://www.docusign.com/blog/developers/claude-docusign-mcp-connector-guide",
    steps: [
      ["สร้าง Integration Key ชื่อ ORCA ใน Apps and Keys เลือก Authorization Code Grant แล้วเพิ่ม Callback URL ด้านล่าง", "Create an ORCA Integration Key in Apps and Keys, select Authorization Code Grant, and add the Callback URL below."],
      ["สร้าง Secret Key แล้วนำ Integration Key มาใส่ช่อง Client ID และ Secret Key มาใส่ช่อง Client Secret", "Create a Secret Key. Enter the Integration Key as Client ID and the Secret Key as Client Secret."],
      ["ใช้คีย์ให้ตรงกับเซิร์ฟเวอร์: บัญชีนักพัฒนาใช้ mcp-d.docusign.com ส่วนรายการนี้บน mcp.docusign.com ต้องใช้แอปที่เปิดใช้ใน production", "Match credentials to the server: developer accounts use mcp-d.docusign.com; this mcp.docusign.com entry requires a production-enabled integration."],
    ],
  },
  hubspot: {
    key: "hubspot", appType: "MCP connector",
    action: ["เปิด HubSpot MCP Connectors", "Open HubSpot MCP Connectors"],
    actionURL: "https://app.hubspot.com/l/mcp-auth-apps/",
    documentationURL: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server",
    steps: [
      ["เปิด Development → MCP Connectors → Create MCP connector แล้วตั้งชื่อ ORCA", "Open Development → MCP Connectors → Create MCP connector and name it ORCA."],
      ["ใส่ Callback URL ด้านล่างใน Redirect URL แล้วสร้าง connector", "Enter the Callback URL below as Redirect URL and create the connector."],
      ["นำ Client ID และ Client secret จากหน้ารายละเอียดมาใส่ที่นี่ สมาชิกจะเลือกบัญชี HubSpot และอนุญาตสิทธิ์ตอนเชื่อม", "Enter the Client ID and Client secret from its details here. Members choose their HubSpot account and grant permissions when connecting."],
    ],
  },
  salesforce: {
    key: "salesforce", appType: "External Client App",
    action: ["เปิดวิธีตั้งค่า Salesforce", "Open Salesforce setup"],
    actionURL: "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/create-external-client-app.html",
    documentationURL: "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/create-external-client-app.html",
    steps: [
      ["ในองค์กร Salesforce เปิด Setup → External Client App Manager → New External Client App และตั้งชื่อ ORCA", "In your Salesforce org, open Setup → External Client App Manager → New External Client App and name it ORCA."],
      ["เปิด OAuth ใส่ Callback URL ด้านล่าง เลือก mcp_api และ refresh_token แล้วตั้งค่า JWT/ความปลอดภัยตามคู่มือ Hosted MCP", "Enable OAuth, add the Callback URL below, select mcp_api and refresh_token, and follow the Hosted MCP guide for JWT and security settings."],
      ["นำ Consumer Key และ Consumer Secret มาใส่ที่นี่ แล้วระบุเซิร์ฟเวอร์ขององค์กรในขั้นตอนเชื่อมบัญชี แอปใหม่อาจใช้เวลาเปิดใช้งานถึง 30 นาที", "Enter the Consumer Key and Consumer Secret here, then provide the org's server during account setup. A new app can take up to 30 minutes to activate."],
    ],
  },
  snowflake: {
    key: "snowflake", appType: "OAuth Security Integration · Confidential client",
    action: ["เปิดวิธีตั้งค่า Snowflake", "Open Snowflake setup"],
    actionURL: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp",
    documentationURL: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp",
    steps: [
      ["ให้ผู้ดูแลสร้าง OAuth security integration ชนิด CUSTOM / CONFIDENTIAL แล้วกำหนด Callback URL ด้านล่าง", "Have your admin create a CUSTOM / CONFIDENTIAL OAuth security integration with the Callback URL below."],
      ["ใช้ Client ID และ Client Secret ของ integration นี้ จำกัด role ให้ตรงกับงานและให้สิทธิ์ MCP server กับเครื่องมือที่จะใช้", "Use that integration's Client ID and Client Secret. Limit the role to the intended work and grant access to the MCP server and its tools."],
      ["เตรียม URL ที่มี account, database, schema และชื่อ MCP server หากองค์กรใช้ External OAuth ให้ทำตามขั้นตอนของผู้ให้บริการ identity ในคู่มือ", "Prepare the account, database, schema and MCP server URL. If your org uses External OAuth, follow the identity-provider setup in the guide."],
    ],
  },
  "github-enterprise": {
    key: "github-enterprise", appType: "GitHub OAuth App / GitHub App",
    action: ["เปิดวิธีตั้งค่า GitHub Enterprise", "Open GitHub Enterprise setup"],
    actionURL: "https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/enterprise-configuration",
    documentationURL: "https://github.com/github/github-mcp-server/blob/main/docs/policies-and-governance.md",
    steps: [
      ["รายการนี้ใช้กับ GitHub Enterprise Cloud ที่มี data residency ให้ผู้ดูแลยืนยันโดเมนขององค์กรและเปิดใช้งาน MCP ตามคู่มือ", "This entry is for GitHub Enterprise Cloud with data residency. Have your admin confirm the enterprise domain and enable MCP using the guide."],
      ["ลงทะเบียน ORCA เป็น OAuth App หรือ GitHub App บนองค์กรนั้น และใส่ Callback URL ด้านล่าง", "Register ORCA as an OAuth App or GitHub App for that enterprise and add the Callback URL below."],
      ["นำ Client ID และ Client Secret มาใส่ที่นี่ แล้วให้ผู้ดูแลอนุมัติแอปหากนโยบายองค์กรกำหนด", "Enter its Client ID and Client Secret here, and request org approval if required by policy."],
    ],
  },
  zoom: {
    key: "zoom", appType: "General app",
    action: ["เปิด Zoom App Marketplace", "Open Zoom App Marketplace"],
    actionURL: "https://marketplace.zoom.us/",
    documentationURL: "https://developers.zoom.us/docs/mcp/servers/connect-to-zoom-mcp-servers/",
    steps: [
      ["เข้าสู่ Zoom Marketplace ด้วยบัญชี admin/developer เลือก Develop → Build app → General app แล้วตั้งชื่อ ORCA", "Sign in to Zoom Marketplace as an admin or developer. Choose Develop → Build app → General app and name it ORCA."],
      ["ใส่ Callback URL ด้านล่าง และเลือก scopes ตามเครื่องมือและผลิตภัณฑ์ Zoom ที่จะใช้", "Add the Callback URL below and select scopes for the Zoom tools and products you will use."],
      ["นำ Client ID และ Client Secret มาใส่ที่นี่ สมาชิกต้องมีไลเซนส์ของผลิตภัณฑ์นั้น ตรวจสอบ URL ของ MCP ตามคู่มือผลิตภัณฑ์ด้วย", "Enter the Client ID and Client Secret here. Members need the relevant product licenses; also check the product's MCP endpoint in the guide."],
    ],
  },
  dropbox: {
    key: "dropbox", appType: "Dropbox app · provider review",
    action: ["ตรวจสอบวิธีเชื่อม Dropbox", "Review Dropbox connection setup"],
    actionURL: "https://help.dropbox.com/integrations/connect-dropbox-mcp-server",
    documentationURL: "https://help.dropbox.com/integrations/connect-dropbox-mcp-server",
    steps: [
      ["รายการเดิมนี้ใช้ปลายทางสำหรับ Claude ผู้ดูแล ORCA ต้องตรวจวิธีย้ายไปปลายทาง MCP ปัจจุบันก่อนเปิดให้เชื่อมใหม่", "This legacy entry uses a Claude-specific endpoint. ORCA's administrator must review migration to the current MCP endpoint before enabling new connections."],
      ["Dropbox เปิดลงทะเบียนอัตโนมัติให้เฉพาะ client ที่เชื่อถือ ส่วน client อื่นต้องตั้งค่า Dropbox app ตามคู่มือ", "Dropbox offers automatic registration only to trusted clients. Other clients need a Dropbox app configured using the guide."],
    ],
  },
  harvey: {
    key: "harvey", appType: "Harvey MCP · vendor confirmation",
    action: ["ตรวจสอบการรองรับกับ Harvey", "Check support with Harvey"],
    actionURL: "https://developers.harvey.ai/guides/harvey_mcp",
    documentationURL: "https://developers.harvey.ai/guides/harvey_mcp",
    vendorConfirmationRequired: true,
    steps: [
      ["ให้ผู้ดูแลบัญชีติดต่อ Harvey เพื่อเปิดใช้ MCP และยืนยันว่าอนุญาตให้ ORCA เป็น client ได้", "Ask your account administrator to contact Harvey to enable MCP and confirm that ORCA can register as a client."],
      ["ขอขั้นตอนลงทะเบียน ORCA และการตั้งค่า OAuth จาก Harvey ก่อน คู่มือสาธารณะยังไม่ระบุวิธีลงทะเบียน custom client", "Obtain ORCA registration and OAuth setup instructions from Harvey first. The public guide does not document custom-client registration."],
    ],
  },
  bigquery: google("bigquery", "BigQuery", "BigQuery API", "https://docs.cloud.google.com/bigquery/docs/use-bigquery-mcp"),
  "cloud-run": google("cloud-run", "Cloud Run", "Cloud Run Admin API", "https://docs.cloud.google.com/run/docs/use-cloud-run-mcp"),
  compute: google("compute", "Compute Engine", "Compute Engine API", "https://docs.cloud.google.com/compute/docs/use-compute-engine-mcp"),
};

const hostProviders: Record<string, string> = {
  "mcp.slack.com": "slack",
  "mcp.asana.com": "asana",
  "mcp.box.com": "box",
  "mcp.docusign.com": "docusign",
  "mcp.hubspot.com": "hubspot",
  "mcp.zoom.us": "zoom",
  "api.harvey.ai": "harvey",
  "bigquery.googleapis.com": "bigquery",
  "run.googleapis.com": "cloud-run",
  "compute.googleapis.com": "compute",
};

// These entries need an org-specific URL, so no endpoint host exists yet.
const tenantProviders: Record<string, string> = {
  "default-dropbox-8dc6ea2b": "dropbox",
  "default-salesforce-f032ecc7": "salesforce",
  "default-snowflake-823eb1a7": "snowflake",
  "default-github-enterprise-cloud-c720e58d": "github-enterprise",
};

const managedGoogleAPIs: Record<string, string> = {
  'google-drive': 'Google Drive API', gmail: 'Gmail API',
  'google-calendar': 'Google Calendar API', 'google-docs': 'Google Docs API',
  'google-sheets': 'Google Sheets API', 'google-search-console': 'Google Search Console API',
};
const managedMicrosoftScopes: Record<string, string> = {
  'microsoft-outlook': 'Mail.Read', 'microsoft-calendar': 'Calendars.ReadBasic',
  'microsoft-contacts': 'Contacts.Read', 'microsoft-onedrive': 'Files.Read',
  'microsoft-excel': 'Files.ReadWrite', 'microsoft-word': 'Files.Read',
};

function managedOAuthSetup(sourceID: string, provider?: string): OAuthProviderSetup | undefined {
  // Only canonical sources carrying backend-issued managed metadata get operator instructions.
  if (!provider || sourceID !== `default-orca-managed-${provider}`) return undefined;
  const api = managedGoogleAPIs[provider];
  if (api) return {
    key: `managed-${provider}`, appType: 'OAuth client ID · Web application',
    action: ['เปิด Google Auth Platform', 'Open Google Auth Platform'],
    actionURL: 'https://console.cloud.google.com/auth/clients',
    documentationURL: 'https://developers.google.com/identity/protocols/oauth2/web-server',
    steps: [
      ['ใช้ OAuth app ของ ORCA ในโครงการ Google Cloud และตั้งค่า Branding เป็น ORCA', 'Use the ORCA OAuth app in its Google Cloud project and set Branding to ORCA.'],
      [`เปิด ${api} และเพิ่มสิทธิ์ที่ตัวเชื่อมต้องใช้ใน Data Access หากแอปยังเป็น Testing ให้เพิ่มบัญชีทดสอบใน Audience`, `Enable ${api} and add the connector scopes in Data Access. While the app is in Testing, add the test accounts in Audience.`],
      ['เพิ่ม Callback URL ด้านล่างใน OAuth client ชนิด Web application แล้วใส่ Client ID และ Client Secret ของแอปนั้น', 'Add the Callback URL below to the Web application OAuth client, then enter that app’s Client ID and Client Secret.'],
    ],
  };
  const scope = managedMicrosoftScopes[provider];
  if (!scope) return undefined;
  return {
    key: `managed-${provider}`, appType: 'Microsoft Entra · Web application',
    action: ['เปิด Microsoft Entra', 'Open Microsoft Entra'],
    actionURL: 'https://entra.microsoft.com/',
    documentationURL: 'https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app',
    steps: [
      ['เปิด App registrations สร้างหรือเลือกแอป ORCA และกำหนด Supported account types ให้ตรงกับบัญชีลูกค้าที่จะรองรับ', 'In App registrations, create or select ORCA and choose Supported account types for the customer accounts you will support.'],
      ['เพิ่ม Callback URL ด้านล่างเป็น Web redirect URI แล้วใส่ Application (client) ID และค่าจาก Certificates & secrets', 'Add the Callback URL below as a Web redirect URI, then enter the Application (client) ID and the value from Certificates & secrets.'],
      [`เพิ่ม Microsoft Graph แบบ Delegated permission: ${scope} และอนุมัติโดยผู้ดูแลหากนโยบายองค์กรกำหนด`, `Add the Microsoft Graph delegated permission ${scope}. Request administrator consent when the organization requires it.`],
      ...(provider === 'microsoft-excel' ? [[
        'Excel API ต้องใช้ Files.ReadWrite แม้เครื่องมือ ORCA ชุดนี้ใช้เฉพาะการอ่าน',
        'The Excel API requires Files.ReadWrite even though this ORCA tool set only reads data.',
      ] as Copy] : []),
    ],
  };
}

export function oauthProviderSetup(sourceID: string, endpointHost: string, managedProvider?: string): OAuthProviderSetup | undefined {
  const managed = managedOAuthSetup(sourceID, managedProvider);
  if (managed) return managed;
  const key = hostProviders[endpointHost.toLowerCase()] || tenantProviders[sourceID];
  return key ? providers[key] : undefined;
}

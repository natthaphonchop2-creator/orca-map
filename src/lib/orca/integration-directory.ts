// Official-provider setup references. Guide entries are deliberately not MCP
// candidates: they cannot provision accounts or be selected in a Gateway.
import { socialIntegrationReferences } from './social-integration-references';
export type LocalizedCopy = readonly [th: string, en: string];
export interface IntegrationReference {
  id: string;
  name: string;
  protocol: 'MCP' | 'API';
  categoryId: 'communication' | 'social-media' | 'ecommerce' | 'cloud-infrastructure';
  icon: string;
  authMethods: ('oauth' | 'secrets' | 'none')[];
  description: LocalizedCopy;
  requirements: LocalizedCopy[];
  scope: LocalizedCopy;
  docs: { label: string; url: string }[];
  aliases: string[];
  guideOnly?: boolean;
  checkedOn: string;
}

const checkedOn = '2026-09-20';
export const integrationReferences: IntegrationReference[] = [
  ...socialIntegrationReferences,
  {
    id: 'default-orca-oracle-ords', name: 'Oracle ORDS MCP', protocol: 'MCP',
    categoryId: 'cloud-infrastructure', icon: '/orca/tools/oracle.svg', authMethods: ['oauth'], checkedOn,
    description: ["ให้ AI ค้นข้อมูลในฐานข้อมูล Oracle ขององค์กร", "Let AI find information in your organization’s Oracle database."],
    requirements: [
      ['ผู้ดูแลเตรียม ORDS 26.2 ขึ้นไป พร้อมเปิด MCP และกำหนดสิทธิ์ฐานข้อมูล', 'An administrator enables MCP in ORDS 26.2 or later and configures database access.'],
      ['ใช้ URL /mcp ขององค์กร และตั้งค่า OAuth/JWT กับผู้ให้บริการยืนยันตัวตน', 'Use your organization’s /mcp URL and configure OAuth/JWT with its identity provider.'],
    ],
    scope: ["ผู้ดูแลเลือกฐานข้อมูลและงานที่อนุญาตไว้ก่อน จากนั้นทีมจึงเรียกใช้งานผ่าน ORCA ได้", "Your administrator chooses the databases and allowed operations before your team uses them through ORCA."],
    docs: [{ label: 'Oracle MCP', url: 'https://www.oracle.com/mcp/' }], aliases: ['Oracle Database', 'ออราเคิล', 'ฐานข้อมูล', 'SQL'],
  },
  {
    id: 'default-orca-oci-database-tools', name: 'Oracle OCI Database Tools MCP', protocol: 'MCP',
    categoryId: 'cloud-infrastructure', icon: '/orca/tools/oracle.svg', authMethods: ['oauth', 'secrets'], checkedOn,
    description: ["ให้ AI เรียกข้อมูลและรายงานจาก Oracle Cloud", "Let AI retrieve data and reports from Oracle Cloud."],
    requirements: [
      ['เตรียม Database Tools connection และสิทธิ์ OCI IAM แล้วคัดลอก Server URL จาก Console', 'Prepare a Database Tools connection and OCI IAM permissions, then copy its Server URL from the console.'],
      ['ใช้ OAuth ของ OCI หรือ Personal Access Token ตามการตั้งค่าขององค์กร', 'Use OCI OAuth or a Personal Access Token according to your organization’s configuration.'],
    ],
    scope: ["เชื่อมได้เมื่อองค์กรมีบริการ Database Tools บน Oracle Cloud และผู้ดูแลเปิดสิทธิ์ให้ใช้งานแล้ว", "Your organization needs Oracle Cloud Database Tools with access enabled by its administrator."],
    docs: [{ label: 'Oracle Database Tools', url: 'https://docs.oracle.com/en-us/iaas/database-tools/doc/connecting-mcp-server.html' }], aliases: ['Oracle', 'OCI', 'cloud', 'database'],
  },
  {
    id: 'guide-line-bot-mcp', name: 'LINE Bot MCP', protocol: 'MCP', guideOnly: true,
    categoryId: 'communication', icon: '/orca/tools/line.png', authMethods: ['secrets'], checkedOn,
    description: ["ส่งข้อความและจัดการ LINE OA ผ่าน MCP ของ LINE", "Send messages and manage LINE Official Accounts through LINE’s MCP server."],
    requirements: [
      ['เปิด Messaging API สำหรับ LINE Official Account และออก Channel access token', 'Enable the Messaging API for your LINE Official Account and issue a channel access token.'],
      ['ติดตั้ง @line/line-bot-mcp-server ด้วย Node.js 22 ขึ้นไป ตัวทางการทำงานผ่าน stdio', 'Install @line/line-bot-mcp-server on Node.js 22 or later. The official server uses stdio.'],
      ['ก่อนใช้กับ ORCA รุ่นนี้ ผู้ดูแลต้องจัดทำตัวเชื่อม HTTP MCP ที่เก็บ token แยกบัญชีและควบคุมสิทธิ์', 'This ORCA release requires an administrator-managed HTTP MCP bridge with per-account credentials and access control.'],
    ],
    scope: ["ทีมไอทีต้องเปิดใช้ MCP ของ LINE ก่อน แล้วนำลิงก์มาเพิ่มใน ORCA ใช้ได้กับ LINE OA ของธุรกิจ", "Your IT team needs to run the LINE MCP server first, then add its URL to ORCA. This works with business LINE Official Accounts."],
    docs: [{ label: 'LINE Developers Thailand', url: 'https://linedevth.line.me/th/knowledge-api/mcp' }, { label: 'LINE Bot MCP · GitHub', url: 'https://github.com/line/line-bot-mcp-server' }], aliases: ['ไลน์', 'LINE OA', 'Messaging', 'ข้อความ', 'chat'],
  },
  {
    id: 'guide-line-messaging-api', name: 'LINE Messaging API', protocol: 'API', guideOnly: true,
    categoryId: 'communication', icon: '/orca/tools/line.png', authMethods: ['secrets'], checkedOn,
    description: ["อ่านข้อมูลบัญชี LINE OA และตรวจโควตาข้อความ", "Read your LINE Official Account details and check message quotas."],
    requirements: [
      ['เปิด Messaging API ในบัญชี LINE OA แล้วออก Channel access token จาก LINE Developers', 'Enable the Messaging API for your LINE Official Account and issue a channel access token in LINE Developers.'],
      ['นำรหัสนี้มากรอกใน ORCA เพื่ออ่านข้อมูลบอต โควตาข้อความรายเดือน และจำนวนข้อความที่ใช้แล้ว', 'Enter that token in ORCA to read bot details, the monthly message quota, and messages used.'],
      ['การเชื่อมต่อนี้ไม่ต้องตั้งค่ารับข้อความเข้า เพราะยังไม่มีเครื่องมือรับหรือส่งข้อความ', 'This connection needs no incoming-message webhook because receiving and sending messages are not included.'],
    ],
    scope: ["ใช้กับ LINE OA ของธุรกิจ การเชื่อมนี้อ่านข้อมูลเท่านั้นและไม่ส่งข้อความหาลูกค้า", "For business LINE Official Accounts. This connection reads information without sending messages to customers."],
    docs: [{ label: 'LINE Messaging API', url: 'https://developers.line.biz/en/docs/messaging-api/overview/' }], aliases: ['ไลน์', 'LINE OA', 'webhook', 'chat'],
  },
  {
    id: 'guide-shopee-seller-api', name: 'Shopee Seller API', protocol: 'API', guideOnly: true,
    categoryId: 'ecommerce', icon: '/orca/catalog/shopee.svg', authMethods: ['secrets'], checkedOn,
    description: ["เชื่อมข้อมูลสินค้าและคำสั่งซื้อจากร้าน Shopee", "Connect product and order data from a Shopee store."],
    requirements: [
      ['เตรียมแอปบน Shopee Open Platform, Partner ID และ Partner Key แล้วให้ผู้ขายอนุญาตร้านที่ต้องการ', 'Prepare a Shopee Open Platform app, Partner ID, and Partner Key, then obtain seller authorization for the store.'],
      ['ต้องพัฒนา ORCA API adapter สำหรับลงลายเซ็นคำขอ จัดการ token และสิทธิ์ API ตามแอปที่ Shopee อนุมัติ', 'An ORCA API adapter must handle request signatures, tokens, and the API permissions approved for the app.'],
    ],
    scope: ["เจ้าของร้านต้องอนุญาตให้แอปเข้าถึงข้อมูลก่อน จึงจะนำข้อมูลร้านมาใช้กับงานของทีมได้", "The store owner must authorize the app before store data can be used in your team’s workflows."],
    docs: [{ label: 'Shopee Open Platform', url: 'https://open.shopee.com/developer-guide' }, { label: 'Shopee API v2', url: 'https://open.shopee.com/documents/v2/api-reference' }], aliases: ['ช้อปปี้', 'Shopee', 'ร้านค้า', 'orders', 'inventory'],
  },
  {
    id: 'guide-lazada-seller-api', name: 'Lazada Seller API', protocol: 'API', guideOnly: true,
    categoryId: 'ecommerce', icon: '/orca/catalog/lazada.ico', authMethods: ['oauth', 'secrets'], checkedOn,
    description: ["เชื่อมข้อมูลสินค้าและคำสั่งซื้อจากร้าน Lazada", "Connect product and order data from a Lazada store."],
    requirements: [
      ['ลงทะเบียนนักพัฒนาและสร้างแอป พร้อม App Key, App Secret และ callback URL', 'Register a developer account and an app with an App Key, App Secret, and callback URL.'],
      ['ผู้ขายอนุญาตผ่าน Lazada; แอปบางประเภทต้องเพิ่มร้านใน whitelist หรือสมัครบริการผ่าน Service Marketplace', 'Sellers authorize through Lazada. Some app categories require a seller allowlist or a Service Marketplace subscription.'],
      ['ต้องติดตั้ง ORCA API adapter ที่จัดการ OAuth token และลายเซ็นคำขอ', 'Deploy an ORCA API adapter that manages OAuth tokens and request signatures.'],
    ],
    scope: ["ใช้กับร้านที่เจ้าของอนุญาต โดยข้อมูลที่เข้าถึงได้ขึ้นกับสิทธิ์ที่ Lazada ให้กับแอป", "Works with authorized stores. Available data depends on the permissions Lazada grants to the app."],
    docs: [{ label: 'Lazada · Getting started', url: 'https://open.lazada.com/apps/doc/doc?docId=108130&nodeId=10533' }, { label: 'Seller authorization', url: 'https://open.lazada.com/apps/doc/doc?docId=108260&nodeId=10533' }], aliases: ['ลาซาด้า', 'Lazada', 'ร้านค้า', 'orders', 'fulfillment'],
  },
  {
    id: 'guide-tiktok-shop-api', name: 'TikTok Shop API', protocol: 'API', guideOnly: true,
    categoryId: 'ecommerce', icon: '/orca/catalog/tiktok.svg', authMethods: ['oauth', 'secrets'], checkedOn,
    description: ["เชื่อมข้อมูลสินค้าและคำสั่งซื้อจาก TikTok Shop", "Connect product and order data from TikTok Shop."],
    requirements: [
      ['สร้างแอปหรือบริการใน TikTok Shop Partner Center และเตรียม App Key, App Secret, Redirect URL และสิทธิ์ API', 'Create an app or service in TikTok Shop Partner Center with an App Key, App Secret, redirect URL, and API permissions.'],
      ['ใช้ลิงก์อนุญาตของผู้ขายสำหรับภูมิภาคของร้าน แล้วติดตั้ง ORCA API adapter เพื่อจัดการ token และคำขอที่ลงลายเซ็น', 'Use the seller authorization link for the store’s region, then deploy an ORCA API adapter for tokens and signed requests.'],
    ],
    scope: ["ใช้บัญชีผู้ขายเพื่ออนุญาตร้านค้าที่ต้องการเชื่อม งานโฆษณาและการโพสต์วิดีโอตั้งค่าแยกกัน", "The seller authorizes the stores to connect. Advertising and video publishing are configured separately."],
    docs: [{ label: 'TikTok Shop · Seller authorization', url: 'https://partner.tiktokshop.com/doc/page/63fd743c715d622a338c4e5a' }, { label: 'API versions and endpoints', url: 'https://partner.tiktokshop.com/docv2/page/api-versioning' }], aliases: ['ติ๊กต็อก', 'TikTok', 'Tik Tok', 'Tiktok Shop', 'ร้านค้า', 'seller'],
  },
  {
    id: 'guide-shopify-storefront-mcp', name: 'Shopify Storefront UCP MCP', protocol: 'MCP', guideOnly: true,
    categoryId: 'ecommerce', icon: '/orca/catalog/shopify.svg', authMethods: ['none'], checkedOn,
    description: ['ให้ AI ช่วยเลือกสินค้าและจัดตะกร้าบนหน้าร้าน Shopify', 'Let AI assist with product discovery and shopping carts on a Shopify storefront.'],
    requirements: [
      ['ใช้โดเมนร้านและ endpoint /api/ucp/mcp พร้อม UCP agent profile สำหรับคำขอ', 'Use the store domain and /api/ucp/mcp endpoint with a UCP agent profile in requests.'],
      ['การจัดตะกร้าไม่ต้องใช้ token; ผู้ดูแลต้องเตรียมและทดสอบการเชื่อม UCP กับ ORCA ก่อน', 'Cart tools accept requests without a token. An administrator must configure and test UCP integration with ORCA first.'],
    ],
    scope: ["เหมาะกับผู้ช่วยเลือกซื้อสินค้าให้ลูกค้า หากต้องการจัดการข้อมูลหลังบ้านของร้าน ให้ใช้ Shopify Admin API", "For customer shopping assistants. Use Shopify Admin API for merchant administration data."],
    docs: [{ label: 'Shopify · Cart MCP', url: 'https://shopify.dev/docs/agents/carts-and-checkout/cart-mcp' }, { label: 'Storefront MCP migration', url: 'https://shopify.dev/changelog/storefront-mcp-cart-tools-are-being-deprecated-in-favour-of-ucp-cart-mcp' }], aliases: ['Shopify', 'ช้อปปิฟาย', 'UCP', 'cart', 'catalog', 'หน้าร้าน'],
  },
  {
    id: 'guide-shopify-admin-api', name: 'Shopify Admin API', protocol: 'API', guideOnly: true,
    categoryId: 'ecommerce', icon: '/orca/catalog/shopify.svg', authMethods: ['oauth'], checkedOn,
    description: ['จัดการสินค้า คำสั่งซื้อ และข้อมูลหลังบ้านของร้าน Shopify', 'Work with Shopify products, orders, and merchant administration data.'],
    requirements: [
      ['สร้างแอป Shopify พร้อม scopes และ callback URL แล้วให้ผู้ดูแลร้านติดตั้งและอนุญาต', 'Create a Shopify app with scopes and a callback URL, then have the merchant install and authorize it.'],
      ['ต้องติดตั้ง ORCA API adapter สำหรับ GraphQL Admin API และการต่ออายุ access token', 'Deploy an ORCA API adapter for the GraphQL Admin API and access-token renewal.'],
    ],
    scope: ["เจ้าของร้านเลือกให้แอปอ่านหรือแก้ข้อมูลส่วนใดได้ การเข้าถึงข้อมูลลูกค้าต้องได้รับสิทธิ์เพิ่มเติม", "The merchant controls which data the app may read or change. Customer information requires additional permissions."],
    docs: [{ label: 'Shopify · Admin GraphQL API', url: 'https://shopify.dev/docs/api/admin-graphql/latest' }, { label: 'App authentication', url: 'https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps' }], aliases: ['Shopify', 'ช้อปปิฟาย', 'inventory', 'orders', 'seller', 'GraphQL'],
  },
  {
    id: 'guide-woocommerce-mcp', name: 'WooCommerce MCP', protocol: 'MCP', guideOnly: true,
    categoryId: 'ecommerce', icon: '/orca/catalog/woocommerce.svg', authMethods: ['secrets'], checkedOn,
    description: ["เชื่อมงานร้าน WooCommerce ให้ AI เรียกใช้ผ่าน MCP", "Connect WooCommerce store tasks to AI through MCP."],
    requirements: [
      ['ผู้ดูแลเปิดฟีเจอร์ MCP Developer Preview และเตรียม WordPress Abilities API กับ MCP Adapter', 'An administrator enables the MCP developer preview and prepares the WordPress Abilities API and MCP Adapter.'],
      ['ใช้ HTTPS พร้อมชื่อผู้ใช้ WordPress และ Application Password ที่สร้างแยกสำหรับการเชื่อม', 'Use HTTPS with a WordPress username and a dedicated Application Password.'],
      ['ใช้ /wp-json/mcp/mcp-adapter-default-server และตั้งค่าตัวเชื่อม ORCA ก่อนเริ่มใช้งาน', 'Configure the ORCA connection with /wp-json/mcp/mcp-adapter-default-server before use.'],
    ],
    scope: ["ผู้ดูแลเว็บไซต์ต้องเปิด MCP และสร้างรหัสสำหรับการเชื่อมต่อก่อน บริการนี้ยังอยู่ในรุ่นทดลอง", "Your website administrator must enable MCP and create connection credentials first. This service is still in developer preview."],
    docs: [{ label: 'WooCommerce · MCP integration', url: 'https://developer.woocommerce.com/docs/features/mcp/' }], aliases: ['WooCommerce', 'WordPress', 'Woo', 'วูคอมเมิร์ซ', 'ร้านค้า'],
  },
  {
    id: 'guide-woocommerce-rest-api', name: 'WooCommerce REST API', protocol: 'API', guideOnly: true,
    categoryId: 'ecommerce', icon: '/orca/catalog/woocommerce.svg', authMethods: ['secrets'], checkedOn,
    description: ["เชื่อมข้อมูลสินค้า สต็อก และคำสั่งซื้อจาก WooCommerce", "Connect products, stock, and orders from WooCommerce."],
    requirements: [
      ['สร้าง Consumer Key และ Consumer Secret ให้ผู้ใช้ WordPress พร้อมเลือกสิทธิ์อ่านหรือเขียน', 'Create a Consumer Key and Consumer Secret for a WordPress user and select read or write permissions.'],
      ['เว็บไซต์ต้องใช้ HTTPS และต้องติดตั้ง ORCA API adapter สำหรับ WooCommerce REST API', 'The site must use HTTPS, and an ORCA API adapter for WooCommerce REST API must be deployed.'],
    ],
    scope: ["ผู้ดูแลร้านออกกุญแจ API และเลือกสิทธิ์อ่านหรือแก้ไขข้อมูลของร้านได้", "The store administrator creates an API key and selects read or write access to store data."],
    docs: [{ label: 'WooCommerce · REST authentication', url: 'https://developer.woocommerce.com/docs/apis/rest-api/authentication' }], aliases: ['WooCommerce', 'WordPress', 'Woo', 'stock', 'orders'],
  },
  {
    id: 'guide-bigcommerce-storefront-mcp', name: 'BigCommerce Storefront MCP', protocol: 'MCP', guideOnly: true,
    categoryId: 'ecommerce', icon: '/orca/catalog/bigcommerce.svg', authMethods: ['none'], checkedOn,
    description: ['ให้ AI ค้นสินค้า จัดตะกร้า และส่งต่อไปชำระเงินบนหน้าร้าน', 'Let AI find products, manage a cart, and hand off to storefront checkout.'],
    requirements: [
      ['เจ้าของร้านเปิด MCP Integration รุ่น Beta ใน Settings → Early access และคัดลอก URL ของหน้าร้านนั้น', 'The store owner enables the MCP Integration beta in Settings → Early access and copies that storefront’s URL.'],
      ['เริ่มจาก guest shopping; หากใช้บัญชีลูกค้าหรือ B2B ต้องเชื่อม Storefront Session Sync เพิ่ม', 'Start with guest shopping. Logged-in customer and B2B flows require Storefront Session Sync.'],
    ],
    scope: ["ใช้สำหรับช่วยลูกค้าเลือกซื้อสินค้า ผู้ดูแลร้านต้องเปิด MCP ในการตั้งค่าหน้าร้านก่อน", "For customer shopping assistance. The store administrator must first enable MCP in storefront settings."],
    docs: [{ label: 'BigCommerce · Storefront MCP', url: 'https://docs.bigcommerce.com/developer/api-reference/mcp/overview' }], aliases: ['BigCommerce', 'Big Commerce', 'storefront', 'cart', 'B2B', 'หน้าร้าน'],
  },
  {
    id: 'guide-bigcommerce-admin-api', name: 'BigCommerce Admin API', protocol: 'API', guideOnly: true,
    categoryId: 'ecommerce', icon: '/orca/catalog/bigcommerce.svg', authMethods: ['oauth', 'secrets'], checkedOn,
    description: ["เชื่อมสินค้า คำสั่งซื้อ และข้อมูลหลังบ้าน BigCommerce", "Connect BigCommerce products, orders, and store administration data."],
    requirements: [
      ['ใช้ API account ของร้าน หรือสร้างแอป OAuth ให้ผู้ดูแลร้านติดตั้งตาม scopes ที่ต้องการ', 'Use a store-level API account or create an OAuth app that the merchant installs with the required scopes.'],
      ['เตรียม Store Hash และ access token แล้วติดตั้ง ORCA API adapter', 'Prepare the store hash and access token, then deploy an ORCA API adapter.'],
    ],
    scope: ["ผู้ดูแลร้านเป็นผู้เลือกข้อมูลที่แอปอ่านหรือแก้ไขได้ ก่อนนำไปใช้ในงานของทีม", "The store administrator chooses what the app may read or change before it is used by your team."],
    docs: [{ label: 'BigCommerce · API accounts', url: 'https://docs.bigcommerce.com/developer/docs/overview/api-fundamentals/api-accounts' }, { label: 'OAuth app authorization', url: 'https://docs.bigcommerce.com/developer/docs/integrations/apps/guide/auth' }], aliases: ['BigCommerce', 'Big Commerce', 'orders', 'inventory', 'seller'],
  },
  {
    id: 'guide-amazon-selling-partner-api', name: 'Amazon Selling Partner API', protocol: 'API', guideOnly: true,
    categoryId: 'ecommerce', icon: '/orca/catalog/amazon.svg', authMethods: ['oauth', 'secrets'], checkedOn,
    description: ["เชื่อมข้อมูลร้านค้าและงานขายบน Amazon", "Connect Amazon store data and sales workflows."],
    requirements: [
      ['ลงทะเบียนนักพัฒนาและแอป SP-API พร้อม role ที่จำเป็น แล้วให้ Selling Partner อนุญาตแอป', 'Register an SP-API developer and app with the required roles, then obtain selling-partner authorization.'],
      ['เตรียม Login with Amazon และติดตั้ง ORCA API adapter; ข้อมูลส่วนบุคคลบางรายการต้องใช้ Restricted Data Token', 'Configure Login with Amazon and deploy an ORCA API adapter. Some personal-data operations require a Restricted Data Token.'],
    ],
    scope: ["ใช้บัญชีผู้ขายหรือคู่ค้าของ Amazon ที่อนุญาตแอปให้เข้าถึงข้อมูลร้านแล้ว", "Requires an Amazon seller or vendor account that has authorized access to its store data."],
    docs: [{ label: 'Amazon · SP-API onboarding', url: 'https://developer-docs.amazon.com/sp-api/docs/onboarding-overview' }, { label: 'Connect to SP-API', url: 'https://developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api' }], aliases: ['Amazon', 'อเมซอน', 'SP-API', 'Seller Central', 'FBA', 'Vendor'],
  },
  {
    id: 'guide-amazon-data-kiosk-mcp', name: 'Amazon Data Kiosk MCP', protocol: 'MCP', guideOnly: true,
    categoryId: 'ecommerce', icon: '/orca/catalog/amazon.svg', authMethods: ['secrets'], checkedOn,
    description: ["ค้นข้อมูลยอดขายและสถิติร้านค้าบน Amazon", "Find Amazon sales data and store statistics."],
    requirements: [
      ['ต้องมี Seller Central หรือ Vendor Central ที่ใช้ Data Kiosk ได้ พร้อม SP-API Client ID, Client Secret และ Refresh Token', 'Requires Data Kiosk access in Seller Central or Vendor Central plus an SP-API client ID, client secret, and refresh token.'],
      ['ติดตั้งตัวอย่าง local MCP จาก repository ของ Amazon; ต้องจัดทำ runtime ที่เหมาะกับ ORCA และทดสอบก่อนใช้งาน', 'Install the local MCP sample from Amazon’s repository, then prepare and test a suitable ORCA runtime.'],
    ],
    scope: ["Amazon ให้โค้ดตัวอย่างสำหรับทีมไอทีนำไปติดตั้ง ต้องเปิดใช้งานและทดสอบก่อนเพิ่มใน ORCA", "Amazon provides sample code for your IT team to host. It must be installed and tested before being added to ORCA."],
    docs: [{ label: 'Amazon · Data Kiosk MCP sample', url: 'https://github.com/amzn/selling-partner-api-samples/tree/main/use-cases/amazon-data-kiosk-mcp-server' }], aliases: ['Amazon', 'SP-API', 'Data Kiosk', 'analytics', 'ยอดขาย'],
  },
  {
    id: 'guide-ebay-sell-api', name: 'eBay Sell API', protocol: 'API', guideOnly: true,
    categoryId: 'ecommerce', icon: '/orca/catalog/ebay.svg', authMethods: ['oauth'], checkedOn,
    description: ['เชื่อมรายการขาย สินค้าคงเหลือ และออร์เดอร์ของผู้ขาย eBay', 'Integrate eBay seller listings, inventory, and orders.'],
    requirements: [
      ['สมัคร eBay Developers Program สร้าง keyset และ callback RuName พร้อม OAuth scopes', 'Join the eBay Developers Program and create a keyset, callback RuName, and OAuth scopes.'],
      ['ให้ผู้ขายอนุญาตผ่าน OAuth เพื่อออก User access token แล้วติดตั้ง ORCA API adapter', 'Obtain seller consent through OAuth for a user access token, then deploy an ORCA API adapter.'],
    ],
    scope: ["เจ้าของบัญชีผู้ขายต้องอนุญาตให้แอปเข้าถึงร้าน และเลือกข้อมูลที่ให้ทีมใช้งานได้", "The seller must authorize store access and choose which data the team can use."],
    docs: [{ label: 'eBay · Selling integration', url: 'https://developer.ebay.com/api-docs/sell/static/selling-ig-landing.html' }, { label: 'OAuth authorization', url: 'https://developer.ebay.com/develop/guides/sell/authorization' }], aliases: ['eBay', 'อีเบย์', 'listing', 'seller', 'inventory', 'orders'],
  },
  {
    id: 'guide-etsy-open-api', name: 'Etsy Open API', protocol: 'API', guideOnly: true,
    categoryId: 'ecommerce', icon: '/orca/catalog/etsy.svg', authMethods: ['oauth', 'secrets'], checkedOn,
    description: ['เชื่อมข้อมูลร้าน รายการสินค้า และคำสั่งซื้อของผู้ขาย Etsy', 'Integrate Etsy shop data, listings, and seller orders.'],
    requirements: [
      ['ลงทะเบียนแอป Etsy พร้อม API key และใช้ OAuth พร้อม PKCE สำหรับข้อมูลส่วนตัวหรือการแก้ไข', 'Register an Etsy app with API credentials and use OAuth with PKCE for private data or write operations.'],
      ['ร้านของตนเองใช้ Seller App; หากให้หลายร้านใช้ในเชิงพาณิชย์ต้องขอ Commercial Access และติดตั้ง ORCA API adapter', 'Use a Seller App for your own shop. Broader commercial use requires Commercial Access and a deployed ORCA API adapter.'],
    ],
    scope: ["ให้เจ้าของร้าน Etsy อนุญาตบัญชีที่ต้องการเชื่อมก่อน การให้บริการหลายร้านต้องขอสิทธิ์จาก Etsy เพิ่มเติม", "The Etsy store owner first authorizes the account to connect. Serving multiple stores requires additional Etsy approval."],
    docs: [{ label: 'Etsy · Developer access', url: 'https://developers.etsy.com/documentation/' }, { label: 'OAuth and API authentication', url: 'https://developers.etsy.com/documentation/essentials/authentication/' }], aliases: ['Etsy', 'เอ็ตซี่', 'handmade', 'listing', 'orders', 'ร้านค้า'],
  },
];

export function integrationReference(id: string) {
  return integrationReferences.find((entry) => entry.id === id);
}

export function integrationPresentation(name: string) {
  const entry = integrationReferences.find((entry) => entry.name === name);
  if (!entry) return undefined;
  return {
    categoryId: entry.categoryId,
    descriptionTh: entry.description[0], descriptionEn: entry.description[1],
    icon: entry.icon, aliases: entry.aliases,
  };
}

/** Merge only explanatory guides; executable sources must come from the API. */
export function integrationGuideSources() {
  return integrationReferences.filter((entry) => entry.guideOnly).map((entry) => ({
    id: entry.id, name: entry.name, description: entry.description[1],
    protocol: entry.protocol, guideOnly: true, authMethods: [...entry.authMethods],
  }));
}

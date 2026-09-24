import type { IntegrationReference } from './integration-directory';

const checkedOn = '2026-09-20';
export const socialIntegrationReferences: IntegrationReference[] = [
  {
    id: 'default-orca-meta-social-technologies', name: 'Facebook / Meta Developer Tools', protocol: 'MCP',
    categoryId: 'social-media', icon: '/orca/catalog/facebook.svg', authMethods: ['oauth'], checkedOn,
    description: ["ช่วยทีมไอทีจัดการแอป Meta และติดตามการอนุมัติแอป", "Help your IT team manage Meta apps and track app approval."],
    requirements: [
      ['ใช้บัญชี Meta Developer ที่มีสิทธิ์ในแอป แล้วอนุญาตการเข้าถึงด้วยการลงชื่อเข้าใช้ (OAuth)', 'Use a Meta Developer account with access to the app and authorize through OAuth.'],
      ['บริการนี้อยู่ในช่วงทดสอบ (Beta) และเปิดให้เฉพาะไคลเอนต์ MCP ที่ Meta อนุมัติ ตรวจสอบว่า ORCA ได้รับอนุมัติแล้วก่อนเชื่อมต่อ', 'This beta restricts access to Meta-approved MCP clients. Confirm ORCA is approved before connecting.'],
    ],
    scope: ["สำหรับทีมพัฒนาแอป Meta ปัจจุบัน Meta ยังต้องอนุมัติ ORCA ก่อนใช้งาน หากต้องการข้อมูลเพจ ให้เลือก Facebook Pages API", "For Meta app development teams. ORCA still requires Meta approval. Choose Facebook Pages API for Page data."],
    docs: [{ label: 'Meta Social Technologies MCP', url: 'https://developers.facebook.com/documentation/mcp/devtools-mcp' }], aliases: ['Facebook', 'Meta', 'เฟซบุ๊ก', 'developer', 'webhook'],
  },
  {
    id: 'default-orca-tiktok-ads', name: 'TikTok Ads', protocol: 'MCP',
    categoryId: 'social-media', icon: '/orca/catalog/tiktok.svg', authMethods: ['oauth'], checkedOn,
    description: ["ให้ AI ช่วยทำงานกับบัญชีโฆษณา TikTok", "Let AI work with your TikTok advertising account."],
    requirements: [
      ['ใช้บัญชี TikTok for Business ที่เข้าถึงบัญชีโฆษณาที่ต้องการ', 'Use a TikTok for Business account with access to the intended advertiser accounts.'],
      ['อนุญาตการเข้าถึงด้วยการลงชื่อเข้าใช้ (OAuth) แล้วเลือกเฉพาะเครื่องมือที่ทีมจะใช้งาน', 'Authorize through OAuth, then select only the tools your team will use.'],
    ],
    scope: ["เลือกบัญชีโฆษณาที่ทีมมีสิทธิ์ใช้งาน และยืนยันสิทธิ์ใหม่ทุก 30 วัน", "Choose an advertising account your team can access, and renew authorization every 30 days."],
    docs: [{ label: 'TikTok for Business MCP', url: 'https://ads.tiktok.com/resources/help/article/about-tiktok-for-business-mcp-server' }, { label: 'Connection guide', url: 'https://business-api.tiktok.com/portal/docs/how-to-connect-to-tiktok-for-business-mcp-server/v1.3' }], aliases: ['ติ๊กต็อก', 'TikTok', 'ads', 'โฆษณา'],
  },
  {
    id: 'guide-facebook-pages-api', name: 'Facebook Pages API', protocol: 'API', guideOnly: true,
    categoryId: 'social-media', icon: '/orca/catalog/facebook.svg', authMethods: ['secrets'], checkedOn,
    description: ["อ่านข้อมูลและโพสต์จากเพจ Facebook ของธุรกิจ", "Read your business Facebook Page information and posts."],
    requirements: [
      ['ให้ผู้ดูแลเพจออก Page access token พร้อมสิทธิ์อ่านข้อมูลเพจ แล้วเตรียมหมายเลขเพจ (Page ID)', 'Have a Page administrator issue a Page access token with Page read permissions, and prepare the Page ID.'],
      ['กรอกหมายเลขเพจและรหัสเชื่อมต่อใน ORCA แล้วเลือกอ่านข้อมูลเพจหรือโพสต์ล่าสุด 25 รายการ', 'Enter the Page ID and access token in ORCA, then select Page details or the latest 25 posts.'],
      ['หากใช้กับเพจของลูกค้าภายนอก ให้ตรวจสอบข้อกำหนด App Review และ Advanced Access ของ Meta', 'For external customer Pages, check Meta App Review and Advanced Access requirements.'],
    ],
    scope: ["ผู้ดูแลเพจเป็นผู้อนุญาตให้เข้าถึงข้อมูล การเชื่อมนี้อ่านข้อมูลเท่านั้นและไม่เผยแพร่โพสต์", "A Page administrator authorizes access. This connection only reads data and does not publish posts."],
    docs: [{ label: 'Facebook Pages API', url: 'https://developers.facebook.com/documentation/pages-api/overview' }], aliases: ['Facebook', 'Meta', 'เฟซบุ๊ก', 'เพจ', 'โพสต์'],
  },
  {
    id: 'guide-instagram-api', name: 'Instagram API', protocol: 'API', guideOnly: true,
    categoryId: 'social-media', icon: '/orca/catalog/instagram.svg', authMethods: ['secrets'], checkedOn,
    description: ["อ่านข้อมูลบัญชีและโพสต์ Instagram ของธุรกิจ", "Read your business Instagram profile and posts."],
    requirements: [
      ['ใช้บัญชี Instagram แบบธุรกิจหรือครีเอเตอร์ แล้วเตรียมหมายเลขบัญชีและ User access token จาก Instagram Login', 'Use a business or creator Instagram account, and prepare the account ID and user access token from Instagram Login.'],
      ['กรอกหมายเลขบัญชีและรหัสเชื่อมต่อใน ORCA แล้วเลือกอ่านข้อมูลบัญชีหรือโพสต์ล่าสุด 25 รายการ', 'Enter the account ID and access token in ORCA, then select account details or the latest 25 media items.'],
      ['บัญชีลูกค้าภายนอกอาจต้องมี Advanced Access ตามข้อกำหนดของ Meta', 'External customer accounts may require Advanced Access under Meta requirements.'],
    ],
    scope: ["ใช้กับบัญชีธุรกิจหรือครีเอเตอร์ การเชื่อมนี้อ่านข้อมูลเท่านั้นและไม่เผยแพร่โพสต์", "For business or creator accounts. This connection only reads data and does not publish posts."],
    docs: [{ label: 'Instagram API with Instagram Login', url: 'https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login' }, { label: 'Instagram Login setup', url: 'https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login' }], aliases: ['IG', 'อินสตาแกรม', 'Instagram', 'Meta'],
  },
  {
    id: 'guide-tiktok-content-api', name: 'TikTok Content Posting API', protocol: 'API', guideOnly: true,
    categoryId: 'social-media', icon: '/orca/catalog/tiktok.svg', authMethods: ['oauth'], checkedOn,
    description: ["นำวิดีโอและภาพไปเผยแพร่บนบัญชี TikTok ที่อนุญาต", "Publish videos and photos to an authorized TikTok account."],
    requirements: [
      ['ลงทะเบียนแอปใน TikTok Developer เปิดใช้ Content Posting API และขอสิทธิ์ video.publish', 'Register a TikTok Developer app, enable Content Posting API, and request video.publish.'],
      ['เจ้าของบัญชีอนุญาตการเข้าถึงด้วยการลงชื่อเข้าใช้ (OAuth) แอปต้องผ่านการตรวจสอบของ TikTok ก่อนเผยแพร่แบบสาธารณะ', 'The account owner authorizes through OAuth. An app audit is required for public publishing.'],
      ['ต้องพัฒนาตัวเชื่อม API ขององค์กร และให้ผู้ใช้ตรวจสอบเนื้อหาก่อนเผยแพร่', 'Implement an API adapter and provide the required user review before publishing.'],
    ],
    scope: ["เจ้าของบัญชีต้องอนุญาตแอปและตรวจสอบเนื้อหาก่อนเผยแพร่ แอปต้องผ่านการตรวจสอบของ TikTok จึงจะโพสต์แบบสาธารณะได้", "The account owner authorizes the app and reviews content before publishing. Public posts require a TikTok app audit."],
    docs: [{ label: 'TikTok Content Posting API', url: 'https://developers.tiktok.com/doc/content-posting-api-get-started' }, { label: 'Publishing requirements', url: 'https://developers.tiktok.com/doc/content-sharing-guidelines' }], aliases: ['TikTok', 'ติ๊กต็อก', 'วิดีโอ', 'โพสต์'],
  },
];

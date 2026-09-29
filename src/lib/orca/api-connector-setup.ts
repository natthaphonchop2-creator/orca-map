export type SetupCopy = readonly [th: string, en: string];

export interface ApiConnectorFieldCopy {
  label: SetupCopy;
  hint: SetupCopy;
  linkLabel: SetupCopy;
  href: string;
  numeric?: boolean;
}

export interface ApiConnectorSetupCopy {
  name: string;
  summary: SetupCopy;
  result: SetupCopy;
  fields: Record<string, ApiConnectorFieldCopy>;
}

// Match built-in source IDs only. These labels never select a provider or
// alter credentials; the server still validates every configured account.
const connectors: Record<string, ApiConnectorSetupCopy> = {
  'default-orca-api-facebook-pages': {
    name: 'Facebook Pages',
    summary: [
      'เชื่อมต่อเพจที่คุณดูแล เพื่ออ่านข้อมูลเพจและโพสต์ล่าสุดใน ORCA',
      'Connect a Page you manage to read its information and recent posts in ORCA.'
    ],
    result: [
      'Facebook ยืนยันแล้วว่า ORCA อ่านข้อมูลเพจนี้ได้',
      'Facebook confirmed that ORCA can read this Page.'
    ],
    fields: {
      Authorization: {
        label: ['คีย์ของเพจ Facebook', 'Facebook Page key'],
        hint: [
          'คัดลอก Page access token ของเพจนี้จาก Meta คีย์นี้ให้ ORCA อ่านเพจได้ และไม่ใช่รหัสผ่าน Facebook',
          "Copy this Page's Page access token from Meta. It lets ORCA read the Page. Do not enter your Facebook password."
        ],
        linkLabel: ['ดูวิธีหาคีย์ของเพจ', 'How to get the Page key'],
        href: 'https://developers.facebook.com/docs/pages-api/getting-started/'
      },
      FACEBOOK_PAGE_ID: {
        label: ['หมายเลขเพจ Facebook', 'Facebook Page ID'],
        hint: [
          'กรอก Page ID ของเพจเดียวกับคีย์ ซึ่งเป็นตัวเลข ไม่ใช่ชื่อเพจหรือลิงก์ Facebook',
          'Enter the numeric Page ID for the same Page as the key, not the Page name or Facebook URL.'
        ],
        linkLabel: ['ดูวิธีหาหมายเลขเพจ', 'How to find the Page ID'],
        href: 'https://developers.facebook.com/docs/pages-api/getting-started/',
        numeric: true
      }
    }
  },
  'default-orca-api-line-messaging': {
    name: 'LINE Messaging API',
    summary: [
      'เชื่อมต่อ LINE OA ของธุรกิจ เพื่อดูข้อมูลบัญชี โควตา และยอดข้อความที่ใช้ในเดือนนี้',
      'Connect your LINE Official Account to check its profile, message quota, and usage this month.'
    ],
    result: [
      'LINE ยืนยันแล้วว่า ORCA อ่านข้อมูล LINE OA นี้ได้',
      'LINE confirmed that ORCA can read this Official Account.'
    ],
    fields: {
      Authorization: {
        label: ['คีย์ของ LINE OA', 'LINE OA key'],
        hint: [
          'เปิด LINE Developers เลือกช่องทาง Messaging API ของ LINE OA นี้ แล้วคัดลอก Channel access token จากแท็บ Messaging API',
          'Open LINE Developers, choose this Official Account’s Messaging API channel, and copy its Channel access token from the Messaging API tab.'
        ],
        linkLabel: ['เปิด LINE Developers', 'Open LINE Developers'],
        href: 'https://developers.line.biz/console/'
      }
    }
  },
  'default-orca-api-instagram': {
    name: 'Instagram',
    summary: [
      'เชื่อมต่อบัญชี Instagram ประเภทธุรกิจหรือครีเอเตอร์ เพื่อดูข้อมูลบัญชีและโพสต์ล่าสุด',
      'Connect an Instagram Business or Creator account to read its profile and recent posts.'
    ],
    result: [
      'Instagram ยืนยันแล้วว่า ORCA อ่านข้อมูลบัญชีนี้ได้',
      'Instagram confirmed that ORCA can read this account.'
    ],
    fields: {
      Authorization: {
        label: ['คีย์ของ Instagram', 'Instagram key'],
        hint: [
          'ใช้ Instagram User access token จากแอป Meta ที่เชื่อมบัญชีนี้ผ่าน Instagram Login แล้ว ไม่ใช่คีย์ของเพจ Facebook หรือรหัสผ่าน Instagram',
          'Use the Instagram User access token from your Meta app’s Instagram Login connection. Do not enter a Facebook Page token or your Instagram password.'
        ],
        linkLabel: ['ดูวิธีหาคีย์ของ Instagram', 'How to get the Instagram key'],
        href: 'https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login'
      },
      INSTAGRAM_ACCOUNT_ID: {
        label: ['หมายเลขบัญชี Instagram', 'Instagram account ID'],
        hint: [
          'กรอก Instagram User ID ของบัญชีเดียวกับคีย์ ซึ่งเป็นตัวเลขที่ได้รับเมื่อเชื่อม Instagram Login ไม่ใช่ชื่อผู้ใช้ (@username)',
          'Enter the numeric Instagram User ID returned by Instagram Login for the same account as the key, not the @username.'
        ],
        linkLabel: ['ดูวิธีหาหมายเลขบัญชี', 'How to find the account ID'],
        href: 'https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login',
        numeric: true
      }
    }
  }
};

export function apiConnectorSetup(sourceID: string): ApiConnectorSetupCopy | undefined {
  return Object.hasOwn(connectors, sourceID) ? connectors[sourceID] : undefined;
}

const connectionErrors: Record<string, SetupCopy> = {
  'the API token is invalid or expired; replace it and test again': [
    'คีย์นี้ใช้ไม่ได้หรือหมดอายุแล้ว คัดลอกคีย์ใหม่จากบัญชีที่จะเชื่อม แล้วทดสอบอีกครั้ง',
    'This key is invalid or expired. Copy a new key from the account you want to connect and test again.'
  ],
  'this API token cannot read the selected account; check its account ID and permissions': [
    'คีย์นี้อ่านข้อมูลบัญชีที่ระบุไม่ได้ ตรวจว่าหมายเลขบัญชีตรงกับคีย์ และอนุญาตให้อ่านข้อมูลแล้ว',
    'This key cannot read the selected account. Check that the account ID matches the key and that read access was granted.'
  ],
  'the provider is limiting requests; wait and test again': [
    'โปรแกรมนี้จำกัดจำนวนคำขอชั่วคราว รอสักครู่แล้วทดสอบอีกครั้ง',
    'The provider is temporarily limiting requests. Wait a moment and test again.'
  ],
  'enter a valid access token for this account': [
    'กรอกคีย์ของบัญชีที่จะเชื่อม และตรวจว่าคัดลอกมาครบ',
    'Enter the complete key for the account you want to connect.'
  ],
  'enter the numeric account ID, not a username or URL': [
    'กรอกหมายเลขบัญชีเป็นตัวเลข ไม่ใช่ชื่อผู้ใช้หรือลิงก์',
    'Enter the numeric account ID, not a username or URL.'
  ]
};

export function apiConnectorError(message: string): SetupCopy | undefined {
  const exact = Object.keys(connectionErrors).find((key) => message === key || message.endsWith(`: ${key}`));
  return exact ? connectionErrors[exact] : undefined;
}

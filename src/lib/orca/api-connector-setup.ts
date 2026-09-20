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
      'เชื่อมเพจที่คุณดูแล เพื่ออ่านข้อมูลเพจและโพสต์ล่าสุดใน ORCA',
      'Connect a Page you manage to read its information and recent posts in ORCA.'
    ],
    result: [
      'Facebook ยืนยันว่า ORCA อ่านข้อมูลเพจนี้ได้แล้ว ขั้นต่อไปเลือกงานที่อนุญาตให้ทีมใช้',
      'Facebook confirmed that ORCA can read this Page. Next, choose which tasks your team may use.'
    ],
    fields: {
      Authorization: {
        label: ['โทเคนของเพจ Facebook', 'Facebook Page access token'],
        hint: [
          'คัดลอก Page access token ของเพจที่ต้องการเชื่อมจาก Meta โทเคนคือรหัสอนุญาตให้ ORCA เข้าถึงเพจ ไม่ใช่รหัสผ่าน Facebook',
          'Copy the Page access token for this Page from Meta. It authorizes access to the Page; do not enter your Facebook password.'
        ],
        linkLabel: ['ดูวิธีรับโทเคนของเพจ', 'How to get a Page access token'],
        href: 'https://developers.facebook.com/docs/pages-api/getting-started/'
      },
      FACEBOOK_PAGE_ID: {
        label: ['หมายเลขเพจ Facebook', 'Facebook Page ID'],
        hint: [
          'ใส่ Page ID ของเพจเดียวกับโทเคน เป็นตัวเลข ไม่ใช่ชื่อเพจหรือลิงก์ Facebook',
          'Enter the numeric Page ID for the same Page as the token, not the Page name or Facebook URL.'
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
      'เชื่อม LINE OA ของธุรกิจ เพื่อดูข้อมูลบัญชี โควตา และยอดข้อความที่ใช้ในเดือนนี้',
      'Connect your LINE Official Account to check its profile, message quota, and usage this month.'
    ],
    result: [
      'LINE ยืนยันว่า ORCA อ่านข้อมูล LINE OA นี้ได้แล้ว ขั้นต่อไปเลือกงานที่อนุญาตให้ทีมใช้',
      'LINE confirmed that ORCA can read this Official Account. Next, choose which tasks your team may use.'
    ],
    fields: {
      Authorization: {
        label: ['โทเคนของ LINE OA', 'LINE channel access token'],
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
      'เชื่อมบัญชี Instagram ธุรกิจหรือครีเอเตอร์ เพื่อดูข้อมูลบัญชีและโพสต์ล่าสุด',
      'Connect an Instagram Business or Creator account to read its profile and recent posts.'
    ],
    result: [
      'Instagram ยืนยันว่า ORCA อ่านข้อมูลบัญชีนี้ได้แล้ว ขั้นต่อไปเลือกงานที่อนุญาตให้ทีมใช้',
      'Instagram confirmed that ORCA can read this account. Next, choose which tasks your team may use.'
    ],
    fields: {
      Authorization: {
        label: ['โทเคนของ Instagram', 'Instagram User access token'],
        hint: [
          'ใช้ Instagram User access token จากแอป Meta ที่เชื่อมบัญชีนี้ผ่าน Instagram Login แล้ว ไม่ใช่โทเคนของเพจ Facebook หรือรหัสผ่าน Instagram',
          'Use the Instagram User access token from your Meta app’s Instagram Login connection. Do not enter a Facebook Page token or your Instagram password.'
        ],
        linkLabel: ['ดูวิธีรับโทเคน Instagram', 'How to get an Instagram access token'],
        href: 'https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login'
      },
      INSTAGRAM_ACCOUNT_ID: {
        label: ['หมายเลขบัญชี Instagram', 'Instagram account ID'],
        hint: [
          'ใส่ Instagram User ID ของบัญชีเดียวกับโทเคน เป็นตัวเลขที่ได้รับเมื่อเชื่อม Instagram Login ไม่ใช่ชื่อ @ผู้ใช้',
          'Enter the numeric Instagram User ID returned by Instagram Login for the same account as the token, not the @username.'
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
    'โทเคนนี้ใช้ไม่ได้หรือหมดอายุแล้ว กรุณาคัดลอกโทเคนใหม่จากบัญชีที่ต้องการเชื่อม แล้วทดสอบอีกครั้ง',
    'This token is invalid or expired. Copy a new token from the account you want to connect and test again.'
  ],
  'this API token cannot read the selected account; check its account ID and permissions': [
    'โทเคนนี้อ่านบัญชีที่ระบุไม่ได้ ตรวจว่าหมายเลขบัญชีตรงกับโทเคน และได้อนุญาตให้อ่านข้อมูลแล้ว',
    'This token cannot read the selected account. Check that the account ID matches the token and that read access was granted.'
  ],
  'the provider is limiting requests; wait and test again': [
    'ผู้ให้บริการให้พักการเรียกข้อมูลชั่วคราว กรุณารอสักครู่แล้วทดสอบอีกครั้ง',
    'The provider is temporarily limiting requests. Wait a moment and test again.'
  ],
  'enter a valid access token for this account': [
    'กรุณาใส่โทเคนของบัญชีที่ต้องการเชื่อม ตรวจว่าได้คัดลอกรหัสมาครบแล้ว',
    'Enter the complete access token for the account you want to connect.'
  ],
  'enter the numeric account ID, not a username or URL': [
    'กรุณาใส่หมายเลขบัญชีเป็นตัวเลข ไม่ใช่ชื่อผู้ใช้หรือลิงก์',
    'Enter the numeric account ID, not a username or URL.'
  ]
};

export function apiConnectorError(message: string): SetupCopy | undefined {
  const exact = Object.keys(connectionErrors).find((key) => message === key || message.endsWith(`: ${key}`));
  return exact ? connectionErrors[exact] : undefined;
}

export type FeatureId =
  | "projects"
  | "user-sources"
  | "secrets"
  | "connected-apps"
  | "user-verification"
  | "contextual-access"
  | "logging-policy"
  | "billing";

export interface FeatureCopy {
  th: string;
  en: string;
}

export interface FeatureDefinition {
  id: FeatureId;
  title: string;
  purpose: FeatureCopy;
  scope: FeatureCopy;
  limitation: FeatureCopy;
}

export const featureRegistry: Record<FeatureId, FeatureDefinition> = {
  projects: {
    id: "projects",
    title: "Projects",
    purpose: {
      th: "จัดกลุ่มการเชื่อมต่อและการตั้งค่าตามโครงการ",
      en: "Organize connections and settings by project.",
    },
    scope: {
      th: "กำหนดขอบเขตทรัพยากรและการเข้าถึงสำหรับแต่ละโครงการ",
      en: "Define the resources and access that belong to each project.",
    },
    limitation: {
      th: "ยังไม่มีการสร้าง เลือก หรือสลับโครงการและองค์กรผ่านหน้านี้",
      en: "Project creation and project or organization switching are not enabled on this page.",
    },
  },
  "user-sources": {
    id: "user-sources",
    title: "User sources",
    purpose: {
      th: "กำหนดแหล่งบัญชีผู้ใช้และผู้ให้บริการเข้าสู่ระบบ",
      en: "Configure sources of user identities and sign-in providers.",
    },
    scope: {
      th: "จัดการแหล่งยืนยันตัวตนที่องค์กรใช้ระบุบัญชีผู้ใช้",
      en: "Manage the identity sources used to identify organization users.",
    },
    limitation: {
      th: "หน้านี้ยังไม่เปิดให้เพิ่มหรือแก้ไขแหล่งผู้ใช้และผู้ให้บริการเข้าสู่ระบบ",
      en: "Adding or changing user sources and sign-in providers is not enabled on this page.",
    },
  },
  secrets: {
    id: "secrets",
    title: "Secrets",
    purpose: {
      th: "จัดการข้อมูลลับที่แอปและบริการใช้เชื่อมต่อกัน",
      en: "Manage secrets used by connected apps and services.",
    },
    scope: {
      th: "ครอบคลุมการจัดเก็บ อัปเดต และยกเลิก API keys, tokens และ client secrets ตามสิทธิ์",
      en: "Store, update and revoke API keys, tokens and client secrets with controlled access.",
    },
    limitation: {
      th: "ยังไม่มีคลัง Secrets หรือการเพิ่ม หมุน และลบข้อมูลลับผ่านหน้านี้",
      en: "A secrets vault and controls to create, rotate or delete secrets are not enabled on this page.",
    },
  },
  "connected-apps": {
    id: "connected-apps",
    title: "Connected apps",
    purpose: {
      th: "ตั้งค่า OAuth providers และ OAuth clients ของแพลตฟอร์ม",
      en: "Configure platform OAuth providers and OAuth clients.",
    },
    scope: {
      th: "จัดการข้อมูล OAuth client สำหรับเชื่อมผู้ให้บริการ การอนุญาตบัญชีของสมาชิกและนโยบายเครื่องมือมีขอบเขตแยกจากการตั้งค่านี้",
      en: "Manage OAuth client configuration for providers. Members’ account grants and tool policies have separate scopes.",
    },
    limitation: {
      th: "ผู้ดูแลตั้ง OAuth client เริ่มต้นสำหรับบางแอปได้แล้ว แต่หน้าจัดการผู้ให้บริการแบบครบยังไม่เปิดใช้งาน",
      en: "Administrators can already perform initial static OAuth client setup for some apps. The full provider administration page is not enabled yet.",
    },
  },
  "user-verification": {
    id: "user-verification",
    title: "User verification",
    purpose: {
      th: "กำหนดวิธียืนยันผู้ใช้ก่อนเข้าถึงแอปและเครื่องมือ",
      en: "Define how users verify their identity before accessing apps and tools.",
    },
    scope: {
      th: "กำหนดข้อกำหนดการยืนยันตัวตนเพิ่มเติมตามการใช้งานขององค์กร",
      en: "Set additional identity verification requirements for organization use.",
    },
    limitation: {
      th: "ยังไม่มีการตั้งค่าวิธียืนยันผู้ใช้หรือข้อกำหนดการยืนยันเพิ่มเติมผ่านหน้านี้",
      en: "Verification methods and additional verification requirements are not configurable on this page yet.",
    },
  },
  "contextual-access": {
    id: "contextual-access",
    title: "Contextual Access",
    purpose: {
      th: "กำหนดเงื่อนไขการเข้าถึงตามบริบทของคำขอ",
      en: "Define access conditions based on the context of a request.",
    },
    scope: {
      th: "เพิ่มเงื่อนไขประกอบการอนุญาตใช้งานแอปและเครื่องมือ",
      en: "Add contextual conditions to app and tool access decisions.",
    },
    limitation: {
      th: "ยังไม่มีตัวแก้ไขหรือการบังคับใช้ contextual policies ผ่านหน้านี้",
      en: "A contextual policy editor and enforcement through this page are not enabled yet.",
    },
  },
  "logging-policy": {
    id: "logging-policy",
    title: "Logging Policy",
    purpose: {
      th: "กำหนดข้อมูลการใช้งานที่บันทึกและระยะเวลาเก็บรักษา",
      en: "Define what usage data is logged and how long it is retained.",
    },
    scope: {
      th: "จัดการข้อกำหนดการบันทึกและเก็บรักษาประวัติการใช้งานขององค์กร",
      en: "Manage organization requirements for logging and retaining usage history.",
    },
    limitation: {
      th: "ประวัติการเรียกและ Audit log ที่มีอยู่ยังดูได้ตามสิทธิ์ แต่หน้านี้ยังไม่เปิดให้ปรับนโยบายการบันทึก",
      en: "Existing execution history and audit logs remain available according to permissions. Logging policies cannot be changed on this page yet.",
    },
  },
  billing: {
    id: "billing",
    title: "Billing",
    purpose: {
      th: "จัดการแพ็กเกจ ค่าบริการ และการชำระเงิน",
      en: "Manage plans, charges and payments.",
    },
    scope: {
      th: "ดูรายละเอียดการเรียกเก็บเงินและจัดการการชำระเงินขององค์กร",
      en: "Review billing details and manage organization payments.",
    },
    limitation: {
      th: "ยังไม่มีการสมัครแพ็กเกจ ใบเรียกเก็บเงิน หรือการชำระเงินผ่านหน้านี้",
      en: "Plan subscriptions, invoices and payments are not enabled on this page.",
    },
  },
};

export function getFeatureDefinition(
  id: string,
): FeatureDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(featureRegistry, id)
    ? featureRegistry[id as FeatureId]
    : undefined;
}

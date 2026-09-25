export type FeatureId =
  | "projects"
  | "user-sources"
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
  title: FeatureCopy;
  purpose: FeatureCopy;
  scope: FeatureCopy;
  limitation: FeatureCopy;
}

export const featureRegistry: Record<FeatureId, FeatureDefinition> = {
  projects: {
    id: "projects",
    title: { th: "โครงการ", en: "Projects" },
    purpose: {
      th: "จัดกลุ่มระบบที่เชื่อมต่อและการตั้งค่าตามโครงการ",
      en: "Organize connected systems and settings by project.",
    },
    scope: {
      th: "กำหนดข้อมูลและสิทธิ์การเข้าถึงของแต่ละโครงการ",
      en: "Define the resources and access for each project.",
    },
    limitation: {
      th: "หน้านี้ยังไม่รองรับการสร้าง เลือก หรือสลับโครงการและองค์กร",
      en: "Creating, selecting or switching projects and organizations is not available on this page yet.",
    },
  },
  "user-sources": {
    id: "user-sources",
    title: { th: "การเข้าสู่ระบบองค์กร", en: "Sign-in sources" },
    purpose: {
      th: "กำหนดผู้ให้บริการเข้าสู่ระบบขององค์กร",
      en: "Configure your organization’s sign-in sources.",
    },
    scope: {
      th: "จัดการผู้ให้บริการยืนยันตัวตนที่องค์กรใช้ระบุบัญชีสมาชิก",
      en: "Manage the identity providers used to identify organization members.",
    },
    limitation: {
      th: "หน้านี้ยังไม่รองรับการเพิ่มหรือแก้ไขผู้ให้บริการเข้าสู่ระบบ",
      en: "Adding or changing sign-in sources is not available on this page yet.",
    },
  },
  "user-verification": {
    id: "user-verification",
    title: { th: "การยืนยันตัวตนผู้ใช้", en: "User verification" },
    purpose: {
      th: "กำหนดวิธียืนยันตัวตนของผู้ใช้ก่อนเข้าถึงระบบและเครื่องมือ",
      en: "Define how users verify their identity before accessing systems and tools.",
    },
    scope: {
      th: "กำหนดข้อกำหนดการยืนยันตัวตนเพิ่มเติมตามการใช้งานขององค์กร",
      en: "Set additional identity verification requirements for your organization.",
    },
    limitation: {
      th: "หน้านี้ยังไม่รองรับการตั้งค่าวิธียืนยันตัวตนหรือข้อกำหนดการยืนยันเพิ่มเติม",
      en: "Verification methods and additional requirements cannot be configured on this page yet.",
    },
  },
  "contextual-access": {
    id: "contextual-access",
    title: { th: "การเข้าถึงตามบริบท", en: "Contextual access" },
    purpose: {
      th: "กำหนดเงื่อนไขการเข้าถึงตามบริบทของคำขอ",
      en: "Define access conditions based on the context of each request.",
    },
    scope: {
      th: "เพิ่มเงื่อนไขประกอบการอนุญาตให้ใช้ระบบและเครื่องมือ",
      en: "Add conditions to system and tool access decisions.",
    },
    limitation: {
      th: "หน้านี้ยังไม่รองรับการกำหนดหรือบังคับใช้เงื่อนไขการเข้าถึงตามบริบท",
      en: "Defining or enforcing contextual access rules is not available on this page yet.",
    },
  },
  "logging-policy": {
    id: "logging-policy",
    title: { th: "นโยบายการเก็บประวัติการใช้งาน", en: "Activity logging policy" },
    purpose: {
      th: "กำหนดข้อมูลการใช้งานที่บันทึกและระยะเวลาเก็บรักษา",
      en: "Define which activity is recorded and how long it is retained.",
    },
    scope: {
      th: "จัดการข้อกำหนดการบันทึกและเก็บรักษาประวัติการใช้งานขององค์กร",
      en: "Manage your organization’s requirements for recording and retaining activity.",
    },
    limitation: {
      th: "ประวัติการใช้งานที่มีอยู่ยังดูได้ตามสิทธิ์ แต่หน้านี้ยังไม่รองรับการปรับนโยบายการบันทึก",
      en: "Existing activity records remain available according to permissions. Logging policies cannot be changed on this page yet.",
    },
  },
  billing: {
    id: "billing",
    title: { th: "การเรียกเก็บเงิน", en: "Billing" },
    purpose: {
      th: "จัดการแพ็กเกจ ค่าบริการ และการชำระเงิน",
      en: "Manage plans, charges and payments.",
    },
    scope: {
      th: "ดูรายละเอียดการเรียกเก็บเงินและจัดการการชำระเงินขององค์กร",
      en: "Review billing details and manage your organization’s payments.",
    },
    limitation: {
      th: "หน้านี้ยังไม่รองรับการสมัครแพ็กเกจ ใบแจ้งหนี้ หรือการชำระเงิน",
      en: "Plan subscriptions, invoices and payments are not available on this page yet.",
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

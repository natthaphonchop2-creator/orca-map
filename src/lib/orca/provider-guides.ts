// Match the provider endpoint, never a user-editable display name.
export function providerGuide(endpointHost: string) {
  switch (endpointHost.toLowerCase()) {
    case "mcp.flowaccount.com":
      return {
        th: "เข้าสู่ระบบ FlowAccount แล้วเลือกบริษัทที่ต้องการเชื่อมต่อ สิทธิ์ใช้งานขึ้นอยู่กับบัญชีของคุณและแพ็กเกจของบริษัท",
        en: "Sign in to FlowAccount and choose the company to connect. Access depends on your account permissions and company plan.",
        href: "https://flowaccount.com/help-center/category/ai-connector-mcp/flowaccount-connector-in-claude",
      };
    case "mcp.peakaccount.com":
      return {
        th: "ใช้ PEAK PRO Plus ขึ้นไป สร้าง User Token ที่ การตั้งค่า → ตั้งค่าเชื่อมต่อระบบภายนอก → เชื่อมต่อแอปพลิเคชันภายนอก → PEAK MCP แล้วนำไปกรอกในหน้าขอสิทธิ์ของ PEAK ที่จะเปิดถัดไป Token แต่ละชุดผูกกับหนึ่งกิจการและหนึ่งผู้ใช้",
        en: "PEAK PRO Plus or above is required. Create a User Token in Settings → External system settings → External application connections → PEAK MCP, then enter it on PEAK's authorization page. Each token belongs to one business and one user.",
        href: "https://wp.peakaccount.com/peak-manual/api-integration/integrate-other-system/what-is-claude-mcp-peak",
      };
    default:
      return undefined;
  }
}

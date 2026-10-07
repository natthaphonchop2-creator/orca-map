// One word per concept, everywhere, in both languages (workspace UX proposal
// §5.2 and the build plan). Screens take their labels from here, so the menu,
// the page title and every button say the same thing.

export type Term = readonly [th: string, en: string];

export const glossary = {
	// Things
	program: ['โปรแกรม', 'program'],
	companyLink: ['ลิงก์ ORCA ของบริษัท', "your company's ORCA link"],
	signIn: ['เข้าสู่ระบบ', 'sign in'],
	key: ['คีย์', 'key'],
	disconnect: ['ตัดการเชื่อมต่อ', 'Disconnect'],
	whatAICanDo: ['สิ่งที่ AI ทำได้', 'What AI can do'],
	connectedAIApps: ['แอป AI ที่เชื่อมอยู่', 'Connected AI apps'],
	readyPrompt: ['คำสั่งสำเร็จรูป', 'Ready-made prompt'],
	companySSO: ['SSO ของบริษัท', 'Company SSO'],
	// Roles
	companyOwner: ['เจ้าของบริษัท', 'Company owner'],
	admin: ['ผู้ดูแล', 'Admin'],
	employee: ['พนักงาน', 'Employee'],
	orcaTeam: ['ทีม ORCA', 'The ORCA team'],
	// Company menu (Owner and Admin)
	home: ['หน้าหลัก', 'Home'],
	programs: ['โปรแกรม', 'Programs'],
	workspaces: ['พื้นที่ทำงาน AI', 'AI workspaces'],
	knowledge: ['คลังความรู้', 'Knowledge'],
	team: ['ทีม', 'Team'],
	oversight: ['ตรวจสอบ', 'Oversight'],
	myRequests: ['คำขอของฉัน', 'My requests'],
	connectMyAI: ['เชื่อม AI ของฉัน', 'Connect my AI'],
	// W0's menu (calm workspace, 2026-10-07): Skills and Workflows stay in English (owner).
	skills: ['Skills', 'Skills'],
	workflows: ['Workflows', 'Workflows'],
	myAI: ['AI ของฉัน', 'My AI'],
	history: ['ประวัติ', 'History'],
	create: ['สร้าง', 'Create'],
	soon: ['เร็วๆ นี้', 'Coming soon'],
	jumpTo: ['ไปที่…', 'Go to…'],
	addProgram: ['เชื่อมโปรแกรม', 'Connect a program'],
	newWorkspace: ['สร้างพื้นที่ทำงาน AI', 'New AI workspace'],
	settings: ['ตั้งค่า', 'Settings'],
	help: ['ช่วยเหลือ', 'Help'],
	myAccount: ['บัญชีของฉัน', 'My account'],
	signOut: ['ออกจากระบบ', 'Sign out'],
	// The pinned button's state line
	aiNotConnected: ['ยังไม่ได้เชื่อม', 'Not connected'],
	aiConnected: ['เชื่อมแล้ว', 'Connected'],
	// Oversight tabs
	waitingApproval: ['รออนุมัติ', 'Waiting'],
	usageHistory: ['ประวัติการใช้งาน', 'Activity'],
	settingsHistory: ['ประวัติการตั้งค่า', 'Settings history'],
	// ประวัติ's tabs (W0)
	usageTab: ['การใช้งาน', 'Usage'],
	settingsTab: ['การตั้งค่า', 'Settings changes'],
	// AI ของฉัน's tabs (W0, Owners and Admins)
	mine: ['ของฉัน', 'Mine'],
	wholeCompany: ['ทั้งบริษัท', 'Whole company'],
	// Team tabs
	members: ['สมาชิก', 'Members'],
	invitations: ['คำเชิญ', 'Invitations'],
	departments: ['แผนก', 'Departments'],
	// Settings tabs
	company: ['บริษัท', 'Company'],
	advanced: ['ขั้นสูง', 'Advanced'],
	// Platform area (the ORCA team only)
	companyMode: ['บริษัท', 'Company'],
	platform: ['แพลตฟอร์ม ORCA', 'ORCA platform'],
	platformOverview: ['ภาพรวมแพลตฟอร์ม', 'Platform overview'],
	customerCompanies: ['บริษัทลูกค้า', 'Customer companies'],
	pilotRequests: ['คำขอทดลองใช้', 'Pilot requests'],
	googleSignIn: ['เข้าสู่ระบบด้วย Google', 'Sign in with Google'],
	programOAuthApps: ['แอป OAuth ของโปรแกรม', 'Program OAuth apps'],
	programCatalog: ['คลังโปรแกรม', 'Program catalog'],
	breakGlass: ['บัญชีฉุกเฉิน', 'Break-glass accounts']
} as const satisfies Record<string, Term>;

export type GlossaryKey = keyof typeof glossary;

/** A term in the current language: `term('programs', t)`. */
export function term(key: GlossaryKey, translate: (th: string, en: string) => string): string {
	const [th, en] = glossary[key];
	return translate(th, en);
}

/** Words the glossary replaced; a screen that still shows one is out of date. */
export const retiredWords: readonly Term[] = [
	['ข้อมูลลับ', 'Secrets'],
	['เจ้าของระบบ', 'Owner'],
	['เชื่อม AI กับ ORCA', 'Connect AI to ORCA'],
	['เพิ่มระบบใหม่', 'Add a system'],
	['ตั้งค่าระบบ', 'Setup'],
	['แม่แบบ', 'Template']
];

// Presentation metadata for catalog candidates; provider availability comes from the backend.
// Category labels and Thai summaries describe the source catalog, not connection readiness.
// Original logo bytes and source/hash receipts: static/orca/catalog/sources.json.
import { integrationPresentation } from './integration-directory';

export const catalogCategories = [
	{ id: 'social-media', th: 'โซเชียลมีเดีย', en: 'Social media' },
	{ id: 'ecommerce', th: 'ร้านค้าและอีคอมเมิร์ซ', en: 'Stores & ecommerce' },
	{
		id: 'productivity',
		th: 'งานและเอกสาร',
		en: 'Work & documents'
	},
	{
		id: 'communication',
		th: 'สื่อสารและประชุม',
		en: 'Communication & meetings'
	},
	{
		id: 'crm-sales',
		th: 'ลูกค้าและงานขาย',
		en: 'CRM & sales'
	},
	{
		id: 'marketing',
		th: 'การตลาด',
		en: 'Marketing'
	},
	{
		id: 'data-analytics',
		th: 'ข้อมูลและวิเคราะห์',
		en: 'Data & analytics'
	},
	{
		id: 'developer-tools',
		th: 'เครื่องมือพัฒนา',
		en: 'Developer tools'
	},
	{
		id: 'cloud-infrastructure',
		th: 'คลาวด์และระบบ',
		en: 'Cloud & infrastructure'
	},
	{
		id: 'design-content',
		th: 'ออกแบบและเนื้อหา',
		en: 'Design & content'
	},
	{
		id: 'accounting',
		th: 'บัญชีและการเงิน',
		en: 'Accounting & finance'
	},
	{
		id: 'finance',
		th: 'การเงินและลงทุน',
		en: 'Finance & investing'
	},
	{
		id: 'research-knowledge',
		th: 'ค้นคว้าและความรู้',
		en: 'Research & knowledge'
	},
	{
		id: 'people',
		th: 'บุคลากรและการเรียนรู้',
		en: 'People & learning'
	},
	{
		id: 'travel-lifestyle',
		th: 'ท่องเที่ยวและไลฟ์สไตล์',
		en: 'Travel & lifestyle'
	}
] as const;

export type CatalogCategoryId = (typeof catalogCategories)[number]['id'];

export interface CatalogPresentation {
	categoryId: CatalogCategoryId;
	descriptionTh: string;
	descriptionEn?: string;
	icon?: string;
	aliases?: string[];
}

export function normalizeCatalogName(name: string): string {
	return name
		.normalize('NFKC')
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '-')
		.replace(/^-+|-+$/g, '');
}

const presentations: Record<string, CatalogPresentation> = {
	flowaccount: {
		categoryId: 'accounting',
		descriptionTh:
			'เชื่อมข้อมูลงานขาย เอกสาร และบัญชีจาก FlowAccount ให้ AI ช่วยทำงาน',
		descriptionEn:
			'Connect sales, documents, and accounting data from FlowAccount to your AI tools.',
		icon: '/orca/tools/flowaccount.svg',
		aliases: [
			'Flow Account',
			'โฟลว์แอคเคาท์',
			'บัญชีไทย',
			'ใบแจ้งหนี้',
			'invoice',
			'Thai accounting',
		],
	},
	peak: {
		categoryId: 'accounting',
		descriptionTh: 'ให้ AI ช่วยจัดการเอกสารและข้อมูลบัญชีของธุรกิจผ่าน PEAK',
		descriptionEn:
			'Work with business documents and accounting data in PEAK through your AI tools.',
		icon: '/orca/tools/peak.svg',
		aliases: [
			'PEAK Account',
			'PeakAccount',
			'พีค',
			'บัญชีไทย',
			'ใบแจ้งหนี้',
			'invoice',
			'Thai accounting',
		],
	},
	'aws-knowledge': {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหาเอกสาร AWS และดูบริการที่เปิดในแต่ละภูมิภาค',
		icon: '/orca/tools/aws.svg',
		aliases: ['Amazon Web Services', 'เอกสารคลาวด์']
	},
	'aws-marketplace': {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'ค้นหาและเปรียบเทียบซอฟต์แวร์กับบริการใน AWS Marketplace',
		icon: '/orca/tools/aws.svg',
		aliases: ['Amazon Web Services', 'ตลาดซอฟต์แวร์']
	},
	adisinsight: {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหาข้อมูลการพัฒนายาและการทดลองทางคลินิก',
		icon: '/orca/catalog/adisinsight.ico',
		aliases: ['ยา', 'คลินิก', 'เภสัชกรรม']
	},
	'adobe-customer-journey-analytics': {
		categoryId: 'data-analytics',
		descriptionTh: 'วิเคราะห์เส้นทางลูกค้าและจัดการรายงานใน Adobe CJA',
		icon: '/orca/catalog/adobe-customer-journey-analytics.svg',
		aliases: ['CJA', 'ลูกค้า', 'Adobe Analytics']
	},
	'adobe-experience-manager': {
		categoryId: 'design-content',
		descriptionTh: 'จัดการเนื้อหาและสื่อดิจิทัลใน Adobe Experience Manager',
		icon: '/orca/catalog/adobe-experience-manager.svg',
		aliases: ['AEM', 'CMS', 'Adobe']
	},
	'adobe-journey-optimizer': {
		categoryId: 'marketing',
		descriptionTh: 'ตรวจสอบเส้นทางลูกค้า แคมเปญ ข้อเสนอ และช่องทางสื่อสาร',
		icon: '/orca/catalog/adobe-journey-optimizer.svg',
		aliases: ['AJO', 'Adobe', 'แคมเปญ']
	},
	'adobe-marketing-agent': {
		categoryId: 'marketing',
		descriptionTh: 'สำรวจกลุ่มเป้าหมาย แคมเปญ และข้อมูลเชิงลึกของลูกค้า',
		icon: '/orca/catalog/adobe-marketing-agent.svg',
		aliases: ['Adobe', 'การตลาด', 'ลูกค้า']
	},
	'adobe-workfront': {
		categoryId: 'productivity',
		descriptionTh: 'ค้นหาและจัดการโครงการ งาน แผนงาน และการอนุมัติ',
		icon: '/orca/catalog/adobe-workfront.svg',
		aliases: ['Adobe', 'โปรเจกต์', 'งานทีม']
	},
	affinity: {
		categoryId: 'crm-sales',
		descriptionTh: 'ค้นหาและจัดการความสัมพันธ์ลูกค้า โอกาสขาย นัดหมาย และบันทึก',
		icon: '/orca/catalog/affinity.png',
		aliases: ['CRM', 'ลูกค้า', 'งานขาย']
	},
	ahrefs: {
		categoryId: 'marketing',
		descriptionTh: 'วิเคราะห์คีย์เวิร์ด ลิงก์ อันดับค้นหา คู่แข่ง และการมองเห็นใน AI',
		icon: '/orca/catalog/ahrefs.ico',
		aliases: ['SEO', 'คีย์เวิร์ด', 'คู่แข่ง']
	},
	airtable: {
		categoryId: 'data-analytics',
		descriptionTh: 'ค้นหา วิเคราะห์ และจัดการข้อมูลในตาราง Airtable',
		icon: '/orca/catalog/airtable.png',
		aliases: ['ฐานข้อมูล', 'ตาราง', 'spreadsheet']
	},
	alltrails: {
		categoryId: 'travel-lifestyle',
		descriptionTh: 'ค้นหาเส้นทางเดินป่า พร้อมดูสภาพเส้นทางและอากาศ',
		icon: '/orca/catalog/alltrails.png',
		aliases: ['เดินป่า', 'แผนที่', 'ท่องเที่ยว']
	},
	'alpha-vantage': {
		categoryId: 'finance',
		descriptionTh: 'ดูราคาตลาด งบการเงิน ออปชัน ตัวชี้วัด และข้อมูลเศรษฐกิจ',
		icon: '/orca/catalog/alpha-vantage.png',
		aliases: ['หุ้น', 'ตลาดทุน', 'เศรษฐกิจ']
	},
	'apollo-io': {
		categoryId: 'crm-sales',
		descriptionTh: 'ค้นหาและเติมข้อมูลผู้มุ่งหวัง พร้อมจัดการลำดับการติดต่อขาย',
		icon: '/orca/catalog/apollo-io.ico',
		aliases: ['Apollo', 'prospecting', 'งานขาย']
	},
	asana: {
		categoryId: 'productivity',
		descriptionTh: 'จัดการงาน โครงการ และภาพรวมโครงการของทีมใน Asana',
		icon: '/orca/catalog/asana.svg',
		aliases: ['โปรเจกต์', 'งานทีม', 'task']
	},
	ashby: {
		categoryId: 'people',
		descriptionTh: 'ค้นหาข้อมูลผู้สมัคร เตรียมสัมภาษณ์ และติดตามขั้นตอนสรรหา',
		icon: '/orca/catalog/ashby.png',
		aliases: ['HR', 'บุคลากร', 'สรรหา']
	},
	atlassian: {
		categoryId: 'productivity',
		descriptionTh: 'จัดการงาน Jira เอกสาร Confluence และบริการใน Compass',
		icon: '/orca/catalog/atlassian.svg',
		aliases: ['Jira', 'Confluence', 'Compass', 'โปรเจกต์']
	},
	attio: {
		categoryId: 'crm-sales',
		descriptionTh: 'จัดการข้อมูลลูกค้า โอกาสขาย งาน นัดหมาย อีเมล และรายงาน',
		icon: '/orca/catalog/attio.ico',
		aliases: ['CRM', 'ลูกค้า', 'งานขาย']
	},
	base44: {
		categoryId: 'developer-tools',
		descriptionTh: 'สร้าง ตรวจสอบ และปรับแต่งโครงการกับระบบหลังบ้านใน Base44',
		icon: '/orca/catalog/base44.ico',
		aliases: ['แอป', 'backend', 'พัฒนา']
	},
	'bigquery-toolbox': {
		categoryId: 'data-analytics',
		descriptionTh: 'สำรวจข้อมูลและเรียกใช้ SQL ใน Google BigQuery',
		icon: '/orca/catalog/google-compute-engine.svg',
		aliases: ['BigQuery MCP', 'BigQuery Toolbox', 'Google Cloud', 'SQL', 'คลังข้อมูล']
	},
	'bigdata-com': {
		categoryId: 'finance',
		descriptionTh: 'ค้นคว้าเอกสารการเงิน ตลาด บริษัท และพอร์ตพร้อมแหล่งอ้างอิง',
		icon: '/orca/catalog/bigdata-com.png',
		aliases: ['Bigdata', 'การลงทุน', 'วิจัย']
	},
	box: {
		categoryId: 'productivity',
		descriptionTh: 'ค้นหา วิเคราะห์ และจัดการเนื้อหากับไฟล์ที่เก็บใน Box',
		icon: '/orca/catalog/box.ico',
		aliases: ['ไฟล์', 'เอกสาร', 'storage']
	},
	brevo: {
		categoryId: 'marketing',
		descriptionTh: 'วิเคราะห์แคมเปญ รายชื่อติดต่อ และกลุ่มเป้าหมายใน Brevo',
		icon: '/orca/catalog/brevo.svg',
		aliases: ['Sendinblue', 'อีเมล', 'การตลาด']
	},
	brighthire: {
		categoryId: 'people',
		descriptionTh: 'ค้นหาและวิเคราะห์บทสัมภาษณ์ บันทึก คะแนน และข้อมูลการจ้างงาน',
		icon: '/orca/catalog/brighthire.webp',
		aliases: ['HR', 'สรรหา', 'สัมภาษณ์']
	},
	calendar: {
		categoryId: 'communication',
		descriptionTh: 'จัดการปฏิทิน Microsoft 365 นัดหมาย การประชุม และผู้เข้าร่วม',
		icon: '/orca/catalog/calendar.svg',
		aliases: ['Microsoft', 'Outlook', 'ปฏิทิน']
	},
	calendly: {
		categoryId: 'communication',
		descriptionTh: 'จัดการเวลาว่าง ประเภทนัดหมาย ลิงก์จอง และรายการจอง',
		icon: '/orca/catalog/calendly.ico',
		aliases: ['นัดหมาย', 'จองเวลา', 'ปฏิทิน']
	},
	canva: {
		categoryId: 'design-content',
		descriptionTh: 'ค้นหา สร้าง แก้ไข และส่งออกงานออกแบบใน Canva',
		icon: '/orca/catalog/canva.ico',
		aliases: ['ดีไซน์', 'สไลด์', 'กราฟิก']
	},
	'carta-crm': {
		categoryId: 'crm-sales',
		descriptionTh: 'จัดการความสัมพันธ์ ดีล บันทึก และรายงานในตลาดเอกชน',
		icon: '/orca/catalog/carta-crm.ico',
		aliases: ['CRM', 'การลงทุน', 'ลูกค้า']
	},
	circle: {
		categoryId: 'communication',
		descriptionTh: 'จัดการและวิเคราะห์ชุมชนออนไลน์ของคุณใน Circle',
		icon: '/orca/catalog/circle.ico',
		aliases: ['community', 'ชุมชน', 'สมาชิก']
	},
	clay: {
		categoryId: 'crm-sales',
		descriptionTh: 'ค้นหาผู้มุ่งหวัง เติมข้อมูลผู้ติดต่อ และศึกษาบริษัทเป้าหมาย',
		icon: '/orca/catalog/clay.png',
		aliases: ['งานขาย', 'ลูกค้า', 'ข้อมูลบริษัท']
	},
	clickup: {
		categoryId: 'productivity',
		descriptionTh: 'จัดการงาน เอกสาร แชต รายการ และเวลาทำงานใน ClickUp',
		icon: '/orca/catalog/clickup.png',
		aliases: ['โปรเจกต์', 'งานทีม', 'task']
	},
	cloudflare: {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'ค้นหาและจัดการบริการผ่าน Cloudflare API ด้วย Code Mode',
		icon: '/orca/catalog/cloudflare.svg',
		aliases: ['CDN', 'DNS', 'Workers', 'คลาวด์']
	},
	'composio-connect': {
		categoryId: 'productivity',
		descriptionTh: 'เข้าถึงเครื่องมือของแอปต่าง ๆ ผ่าน MCP ของ Composio',
		icon: '/orca/catalog/composio-connect.ico',
		aliases: ['automation', 'อัตโนมัติ', 'แอป']
	},
	consensus: {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหางานวิจัยและสังเคราะห์หลักฐานทางวิทยาศาสตร์',
		icon: '/orca/catalog/consensus.ico',
		aliases: ['วิจัย', 'บทความ', 'science']
	},
	contact: {
		categoryId: 'crm-sales',
		descriptionTh: 'ค้นหาและจัดการรายชื่อติดต่อใน Microsoft 365',
		icon: '/orca/catalog/contact.svg',
		aliases: ['Microsoft', 'Outlook', 'contacts', 'ผู้ติดต่อ']
	},
	context7: {
		categoryId: 'developer-tools',
		descriptionTh: 'ค้นหาเอกสารและตัวอย่างโค้ดที่ตรงกับรุ่นของไลบรารี',
		icon: '/orca/catalog/context7.png',
		aliases: ['เอกสาร', 'โค้ด', 'library']
	},
	'cortellis-regulatory-intelligence': {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นคว้าข้อกำหนดและกฎระเบียบด้านวิทยาศาสตร์ชีวภาพทั่วโลก',
		icon: '/orca/catalog/cortellis-regulatory-intelligence.ico',
		aliases: ['Clarivate', 'ยา', 'life sciences']
	},
	courtlistener: {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหาคดี เอกสารศาล ผู้พิพากษา และคำอ้างอิงทางกฎหมายสหรัฐฯ',
		icon: '/orca/catalog/courtlistener.svg',
		aliases: ['กฎหมาย', 'คดี', 'ศาล']
	},
	'crypto-com-market-data': {
		categoryId: 'finance',
		descriptionTh: 'ดูสมุดคำสั่งซื้อขาย รายการซื้อขาย และกราฟแท่งเทียนคริปโต',
		icon: '/orca/catalog/crypto-com-market-data.ico',
		aliases: ['คริปโต', 'cryptocurrency', 'ตลาด']
	},
	daloopa: {
		categoryId: 'finance',
		descriptionTh: 'ค้นหาข้อมูลงบการเงิน ตัวชี้วัด เอกสารบริษัท และราคาหุ้นพร้อมที่มา',
		icon: '/orca/catalog/daloopa.png',
		aliases: ['หุ้น', 'งบการเงิน', 'หลักทรัพย์']
	},
	'databricks-genie-spaces': {
		categoryId: 'data-analytics',
		descriptionTh: 'ถามคำถามเกี่ยวกับข้อมูลและวิเคราะห์ผ่าน Databricks Genie',
		icon: '/orca/catalog/databricks-genie-spaces.svg',
		aliases: ['Databricks', 'BI', 'ข้อมูล']
	},
	'databricks-unity-catalog-functions': {
		categoryId: 'data-analytics',
		descriptionTh: 'เรียกใช้และจัดการฟังก์ชันใน Databricks Unity Catalog',
		icon: '/orca/catalog/databricks-unity-catalog-functions.svg',
		aliases: ['Databricks', 'serverless', 'ข้อมูล']
	},
	'databricks-vector-search': {
		categoryId: 'data-analytics',
		descriptionTh: 'ค้นหาข้อมูลตามความหมายและความคล้ายด้วยดัชนีเวกเตอร์',
		icon: '/orca/catalog/databricks-vector-search.svg',
		aliases: ['Databricks', 'vector', 'RAG']
	},
	datadog: {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'ตรวจสอบข้อมูลการทำงานของระบบและจัดการบริการใน Datadog',
		icon: '/orca/catalog/datadog.svg',
		aliases: ['monitoring', 'logs', 'DevOps']
	},
	deepwiki: {
		categoryId: 'research-knowledge',
		descriptionTh: 'อ่านเอกสารที่ AI สรุปจากโครงการสาธารณะบน GitHub',
		icon: '/orca/catalog/deepwiki.ico',
		aliases: ['GitHub', 'เอกสาร', 'โค้ด']
	},
	descript: {
		categoryId: 'design-content',
		descriptionTh: 'นำเข้า แก้ไข จัดระเบียบ และเผยแพร่งานวิดีโอหรือเสียง',
		icon: '/orca/catalog/descript.svg',
		aliases: ['วิดีโอ', 'เสียง', 'podcast']
	},
	dice: {
		categoryId: 'people',
		descriptionTh: 'ค้นหางานเทคโนโลยีที่เปิดรับด้วยตัวกรองรายละเอียด',
		icon: '/orca/catalog/dice.png',
		aliases: ['งาน', 'สรรหา', 'เทคโนโลยี']
	},
	digitalocean: {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'จัดการบริการคลาวด์ DigitalOcean ด้วยโทเค็นการเข้าถึง',
		icon: '/orca/catalog/digitalocean.svg',
		aliases: ['คลาวด์', 'เซิร์ฟเวอร์', 'DevOps']
	},
	docusign: {
		categoryId: 'productivity',
		descriptionTh: 'ค้นหาข้อตกลงและจัดการชุดเอกสารกับขั้นตอนลงนาม',
		icon: '/orca/catalog/docusign.ico',
		aliases: ['DocuSign', 'ลายเซ็น', 'สัญญา']
	},
	dovetail: {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหางานวิจัยลูกค้าและเรียกดูหลักฐานใน Dovetail',
		icon: '/orca/catalog/dovetail.svg',
		aliases: ['UX research', 'ลูกค้า', 'วิจัย']
	},
	dropbox: {
		categoryId: 'productivity',
		descriptionTh: 'ค้นหา จัดระเบียบ สร้าง และแชร์ไฟล์กับโฟลเดอร์ใน Dropbox',
		icon: '/orca/catalog/dropbox.svg',
		aliases: ['ไฟล์', 'เอกสาร', 'storage']
	},
	dynatrace: {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'ตรวจสอบข้อมูลและผลวิเคราะห์การทำงานของระบบใน Dynatrace',
		icon: '/orca/catalog/dynatrace.svg',
		aliases: ['monitoring', 'DevOps', 'ระบบ']
	},
	egnyte: {
		categoryId: 'productivity',
		descriptionTh: 'ค้นหา เรียกดู และวิเคราะห์เอกสารใน Egnyte ตามสิทธิ์',
		icon: '/orca/catalog/egnyte.png',
		aliases: ['เอกสาร', 'ไฟล์', 'ความรู้']
	},
	elasticsearch: {
		categoryId: 'data-analytics',
		descriptionTh: 'ค้นหาและวิเคราะห์ข้อมูล Elasticsearch ผ่าน Agent Builder',
		icon: '/orca/catalog/elasticsearch.svg',
		aliases: ['Elastic', 'ฐานข้อมูล', 'search']
	},
	elicit: {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหาบทความและจัดทำรายงานทบทวนวรรณกรรมอย่างเป็นระบบ',
		icon: '/orca/catalog/elicit.png',
		aliases: ['วิจัย', 'บทความ', 'literature review']
	},
	'era-context': {
		categoryId: 'finance',
		descriptionTh: 'วิเคราะห์ค่าใช้จ่ายและจัดการข้อมูลการเงินส่วนบุคคลที่เชื่อมไว้',
		icon: '/orca/catalog/era-context.ico',
		aliases: ['การเงินส่วนบุคคล', 'ค่าใช้จ่าย']
	},
	'exa-search': {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหาเว็บและรวบรวมข้อมูลสำหรับงานค้นคว้า',
		icon: '/orca/catalog/exa-search.svg',
		aliases: ['Exa', 'ค้นหาเว็บ', 'วิจัย']
	},
	excalidraw: {
		categoryId: 'design-content',
		descriptionTh: 'สร้างและแก้ไขแผนภาพแบบวาดมือที่โต้ตอบได้',
		icon: '/orca/catalog/excalidraw.ico',
		aliases: ['แผนภาพ', 'whiteboard', 'ดีไซน์']
	},
	excel: {
		categoryId: 'data-analytics',
		descriptionTh: 'จัดการสมุดงาน ชีต ตาราง และข้อมูลใน Microsoft Excel',
		icon: '/orca/catalog/excel.svg',
		aliases: ['Microsoft', 'spreadsheet', 'ตาราง']
	},
	'factset-ai-ready-data': {
		categoryId: 'finance',
		descriptionTh: 'วิเคราะห์ข้อมูลตลาด บริษัท และงานวิจัยการลงทุนจาก FactSet',
		icon: '/orca/catalog/factset-ai-ready-data.png',
		aliases: ['FactSet', 'หุ้น', 'การลงทุน']
	},
	fathom: {
		categoryId: 'communication',
		descriptionTh: 'ค้นหาการประชุมและเรียกดูสรุป บทถอดเสียง และงานที่ต้องทำ',
		icon: '/orca/catalog/fathom.png',
		aliases: ['ประชุม', 'transcript', 'บันทึก']
	},
	'fellow-ai': {
		categoryId: 'communication',
		descriptionTh: 'ค้นหาการประชุม พร้อมดูบทถอดเสียง สรุป และงานติดตาม',
		icon: '/orca/catalog/fellow-ai.png',
		aliases: ['Fellow', 'ประชุม', 'meeting']
	},
	'files-com': {
		categoryId: 'productivity',
		descriptionTh: 'จัดการไฟล์ ผู้ใช้ กลุ่ม สิทธิ์ และการแชร์ไฟล์อย่างปลอดภัย',
		icon: '/orca/catalog/files-com.svg',
		aliases: ['ไฟล์', 'permissions', 'storage']
	},
	firecrawl: {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหา ดึงข้อมูล สำรวจ และติดตามการเปลี่ยนแปลงบนเว็บ',
		icon: '/orca/catalog/firecrawl.ico',
		aliases: ['เว็บ', 'scraping', 'crawling']
	},
	fireflies: {
		categoryId: 'communication',
		descriptionTh: 'เรียกดูและวิเคราะห์บทถอดเสียงกับสรุปการประชุมใน Fireflies',
		icon: '/orca/catalog/fireflies.ico',
		aliases: ['Fireflies.ai', 'ประชุม', 'transcript']
	},
	gamma: {
		categoryId: 'design-content',
		descriptionTh: 'สร้างงานนำเสนอ เอกสาร เว็บเพจ และโพสต์ด้วย AI',
		aliases: ['สไลด์', 'presentation', 'เนื้อหา']
	},
	github: {
		categoryId: 'developer-tools',
		descriptionTh: 'จัดการคลังโค้ด issues, pull requests และงาน CI/CD ใน GitHub',
		icon: '/orca/catalog/github.svg',
		aliases: ['git', 'โค้ด', 'repository']
	},
	'github-enterprise-cloud': {
		categoryId: 'developer-tools',
		descriptionTh: 'เชื่อมต่อ GitHub Enterprise Cloud ตามเขตที่จัดเก็บข้อมูลขององค์กร',
		icon: '/orca/catalog/github-enterprise-cloud.svg',
		aliases: ['GitHub', 'GHE', 'git', 'องค์กร']
	},
	gitmcp: {
		categoryId: 'developer-tools',
		descriptionTh: 'เข้าถึงเอกสารและโค้ดล่าสุดจากโครงการ GitHub',
		icon: '/orca/catalog/gitmcp.png',
		aliases: ['GitHub', 'เอกสาร', 'โค้ด']
	},
	gmail: {
		categoryId: 'communication',
		descriptionTh: 'อ่าน ส่ง ร่าง ค้นหา และจัดระเบียบอีเมลใน Gmail',
		icon: '/orca/catalog/gmail.svg',
		aliases: ['Google', 'อีเมล', 'email']
	},
	godaddy: {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'ค้นหาไอเดียชื่อโดเมนและตรวจสอบว่ายังจดทะเบียนได้หรือไม่',
		icon: '/orca/catalog/godaddy.png',
		aliases: ['โดเมน', 'DNS', 'เว็บไซต์']
	},
	goodnotes: {
		categoryId: 'design-content',
		descriptionTh: 'สร้างโน้ต ไวต์บอร์ด ภาพประกอบ และแผนภาพที่แก้ไขได้',
		icon: '/orca/catalog/goodnotes.png',
		aliases: ['โน้ต', 'whiteboard', 'การเรียน']
	},
	'google-calendar': {
		categoryId: 'communication',
		descriptionTh: 'จัดการนัดหมาย กิจกรรมซ้ำ และผู้เข้าร่วมใน Google Calendar',
		icon: '/orca/catalog/google-calendar.svg',
		aliases: ['Google', 'ปฏิทิน', 'นัดหมาย']
	},
	'google-cloud-run': {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'ตรวจสอบและเผยแพร่บริการคอนเทนเนอร์บน Google Cloud Run',
		icon: '/orca/catalog/google-cloud-run.svg',
		aliases: ['Google Cloud', 'serverless', 'deploy']
	},
	'google-compute-engine': {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'สร้าง ตรวจสอบ และจัดการทรัพยากร Google Compute Engine',
		icon: '/orca/catalog/google-compute-engine.svg',
		aliases: ['Google Cloud', 'VM', 'เซิร์ฟเวอร์']
	},
	'google-docs': {
		categoryId: 'productivity',
		descriptionTh: 'สร้างและจัดการเอกสารใน Google Docs',
		icon: '/orca/tools/google-docs.svg',
		aliases: ['Google Workspace', 'เอกสาร', 'document']
	},
	'google-drive': {
		categoryId: 'productivity',
		descriptionTh: 'เชื่อมต่อไฟล์และโฟลเดอร์ใน Google Drive ตามสิทธิ์และเครื่องมือที่เปิดให้ใช้',
		icon: '/orca/tools/google-drive.svg',
		aliases: ['Google Workspace', 'ไฟล์', 'storage']
	},
	'google-maps-grounding-lite': {
		categoryId: 'travel-lifestyle',
		descriptionTh: 'ใช้ข้อมูล Google Maps เพื่อประกอบการทำงานของแอป AI',
		icon: '/orca/catalog/google-maps-grounding-lite.svg',
		aliases: ['Google Maps', 'แผนที่', 'สถานที่']
	},
	'google-search-console': {
		categoryId: 'marketing',
		descriptionTh: 'ดูข้อมูลผลค้นหา แผนผังเว็บไซต์ และรายงานจาก Search Console',
		icon: '/orca/catalog/google-search-console.svg',
		aliases: ['Google', 'SEO', 'ค้นหา']
	},
	'google-sheets': {
		categoryId: 'data-analytics',
		descriptionTh: 'สร้างและจัดการสเปรดชีต ชีต เซลล์ และสูตรใน Google Sheets',
		icon: '/orca/tools/google-sheets.svg',
		aliases: ['Google Workspace', 'ตาราง', 'spreadsheet']
	},
	'grafana-cloud': {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'ดู metrics, logs, dashboards การแจ้งเตือน และตารางเวรระบบ',
		icon: '/orca/catalog/grafana-cloud.svg',
		aliases: ['Grafana', 'monitoring', 'DevOps']
	},
	granola: {
		categoryId: 'communication',
		descriptionTh: 'ค้นหาบันทึกประชุม บทถอดเสียง ข้อสรุป และงานที่ต้องติดตาม',
		icon: '/orca/catalog/granola.ico',
		aliases: ['ประชุม', 'โน้ต', 'meeting']
	},
	guru: {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหาและดูแลความรู้ขององค์กรที่ผ่านการตรวจสอบใน Guru',
		icon: '/orca/catalog/guru.png',
		aliases: ['คลังความรู้', 'knowledge', 'wiki']
	},
	gusto: {
		categoryId: 'people',
		descriptionTh: 'ดูข้อมูลเงินเดือนและบุคลากร พร้อมสร้างรายงานกับกราฟ',
		icon: '/orca/catalog/gusto.svg',
		aliases: ['HR', 'เงินเดือน', 'payroll']
	},
	harvey: {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นคว้ากฎหมายและวิเคราะห์เอกสารใน Vault กับแหล่งความรู้ที่เปิดใช้',
		icon: '/orca/catalog/harvey.svg',
		aliases: ['กฎหมาย', 'เอกสาร', 'legal']
	},
	hubspot: {
		categoryId: 'crm-sales',
		descriptionTh: 'เข้าถึงข้อมูล CRM ใน HubSpot ด้วยสิทธิ์ของผู้ใช้แต่ละคน',
		icon: '/orca/catalog/hubspot.svg',
		aliases: ['CRM', 'ลูกค้า', 'งานขาย']
	},
	'hugging-face': {
		categoryId: 'developer-tools',
		descriptionTh: 'ค้นหาโมเดล ชุดข้อมูล งานวิจัย เอกสาร และ Spaces',
		icon: '/orca/catalog/hugging-face.ico',
		aliases: ['AI', 'โมเดล', 'datasets']
	},
	'hyperframes-by-heygen': {
		categoryId: 'design-content',
		descriptionTh: 'สร้างสไลด์เคลื่อนไหว วิดีโออธิบาย และกราฟิกด้วย HTML',
		icon: '/orca/catalog/hyperframes-by-heygen.ico',
		aliases: ['HyperFrames', 'HeyGen', 'วิดีโอ']
	},
	'interactive-brokers-ibkr': {
		categoryId: 'finance',
		descriptionTh: 'วิเคราะห์พอร์ต ข้อมูลตลาด และข้อมูลคำสั่งซื้อขายใน IBKR',
		icon: '/orca/catalog/interactive-brokers-ibkr.png',
		aliases: ['IBKR', 'หุ้น', 'การลงทุน']
	},
	intercom: {
		categoryId: 'crm-sales',
		descriptionTh: 'ค้นหาบทสนทนา ผู้ติดต่อ ตั๋วงาน และข้อมูลลูกค้าใน Intercom',
		icon: '/orca/catalog/intercom.svg',
		aliases: ['บริการลูกค้า', 'support', 'CRM']
	},
	jam: {
		categoryId: 'developer-tools',
		descriptionTh: 'ดูบันทึกบั๊ก logs และข้อมูลเครือข่ายจาก Jam ในเครื่องมือพัฒนา',
		icon: '/orca/catalog/jam.png',
		aliases: ['debug', 'บั๊ก', 'network']
	},
	jotform: {
		categoryId: 'productivity',
		descriptionTh: 'สร้างและแก้ไขฟอร์ม พร้อมวิเคราะห์คำตอบใน Jotform',
		icon: '/orca/catalog/jotform.ico',
		aliases: ['ฟอร์ม', 'แบบสอบถาม', 'forms']
	},
	'kensho-by-s-p-global': {
		categoryId: 'finance',
		descriptionTh: 'เรียกดูข้อมูลบริษัทและการเงินแบบมีโครงสร้างจาก S&P Global',
		icon: '/orca/catalog/kensho-by-s-p-global.webp',
		aliases: ['Kensho', 'S&P', 'ข้อมูลการเงิน']
	},
	'kiwi-com': {
		categoryId: 'travel-lifestyle',
		descriptionTh: 'ค้นหาเที่ยวบินด้วยเงื่อนไขเส้นทาง วันเดินทาง ผู้โดยสาร และชั้นโดยสาร',
		icon: '/orca/catalog/kiwi-com.png',
		aliases: ['Kiwi', 'เที่ยวบิน', 'ท่องเที่ยว']
	},
	klaviyo: {
		categoryId: 'marketing',
		descriptionTh: 'วิเคราะห์แคมเปญ จัดการกลุ่มลูกค้า และสร้างเนื้อหาการตลาด',
		icon: '/orca/catalog/klaviyo.png',
		aliases: ['อีเมล', 'แคมเปญ', 'CRM']
	},
	'legal-data-hunter': {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหาเอกสารกฎหมายทางการจากหลายเขตอำนาจและตรวจคำอ้างอิง',
		icon: '/orca/catalog/legal-data-hunter.svg',
		aliases: ['กฎหมาย', 'legal', 'ค้นคว้า']
	},
	linear: {
		categoryId: 'productivity',
		descriptionTh: 'จัดการ issues โครงการ ความคิดเห็น และกระบวนการทำงานของทีม',
		icon: '/orca/catalog/linear.svg',
		aliases: ['โปรเจกต์', 'งานทีม', 'issue']
	},
	lovable: {
		categoryId: 'developer-tools',
		descriptionTh: 'สร้าง ตรวจสอบ ปรับปรุง และเผยแพร่แอปใน Lovable',
		icon: '/orca/catalog/lovable.png',
		aliases: ['แอป', 'พัฒนา', 'เว็บไซต์']
	},
	lucid: {
		categoryId: 'design-content',
		descriptionTh: 'ค้นหา สรุป แชร์ และสร้างแผนภาพกับเอกสารใน Lucid',
		icon: '/orca/catalog/lucid.ico',
		aliases: ['Lucidchart', 'แผนภาพ', 'ดีไซน์']
	},
	lunarcrush: {
		categoryId: 'finance',
		descriptionTh: 'วิเคราะห์กระแสสังคม ความรู้สึกต่อตลาด และแนวโน้มล่าสุด',
		icon: '/orca/catalog/lunarcrush.ico',
		aliases: ['sentiment', 'คริปโต', 'ตลาด']
	},
	lusha: {
		categoryId: 'crm-sales',
		descriptionTh: 'ค้นหาและเติมข้อมูลผู้ติดต่อกับบริษัทสำหรับงานขาย B2B',
		icon: '/orca/catalog/lusha.ico',
		aliases: ['CRM', 'งานขาย', 'ข้อมูลบริษัท']
	},
	mailerlite: {
		categoryId: 'marketing',
		descriptionTh: 'จัดการผู้รับอีเมล แคมเปญ ระบบอัตโนมัติ และฟอร์มใน MailerLite',
		icon: '/orca/catalog/mailerlite.webp',
		aliases: ['email', 'อีเมล', 'แคมเปญ']
	},
	make: {
		categoryId: 'productivity',
		descriptionTh: 'เรียกใช้และจัดการ scenarios การเชื่อมต่อ ทีม และชุดข้อมูลใน Make',
		icon: '/orca/catalog/make.ico',
		aliases: ['Integromat', 'automation', 'อัตโนมัติ']
	},
	mercury: {
		categoryId: 'finance',
		descriptionTh: 'ค้นหาและวิเคราะห์ข้อมูลบัญชีกับธุรกรรมใน Mercury',
		icon: '/orca/catalog/mercury.ico',
		aliases: ['ธนาคาร', 'การเงิน', 'transactions']
	},
	'mermaid-chart': {
		categoryId: 'design-content',
		descriptionTh: 'ตรวจสอบ สร้างภาพ สรุป และจัดการแผนภาพ Mermaid',
		icon: '/orca/catalog/mermaid-chart.png',
		aliases: ['Mermaid', 'แผนภาพ', 'diagram']
	},
	'microsoft-learn': {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหาเอกสาร Microsoft Learn และตัวอย่างโค้ดทางการ',
		icon: '/orca/tools/microsoft.svg',
		aliases: ['Microsoft', 'เอกสาร', 'การเรียน']
	},
	miro: {
		categoryId: 'design-content',
		descriptionTh: 'ค้นหา สรุป และสร้างเนื้อหาบนบอร์ด Miro',
		icon: '/orca/catalog/miro.png',
		aliases: ['whiteboard', 'แผนภาพ', 'งานทีม']
	},
	mixpanel: {
		categoryId: 'data-analytics',
		descriptionTh: 'วิเคราะห์เหตุการณ์ funnels การกลับมาใช้ และการทดลองของผลิตภัณฑ์',
		icon: '/orca/catalog/mixpanel.ico',
		aliases: ['product analytics', 'ข้อมูล', 'retention']
	},
	mobbin: {
		categoryId: 'design-content',
		descriptionTh: 'ค้นหาหน้าจอ ขั้นตอนใช้งาน และส่วนประกอบเว็บจริงเพื่ออ้างอิงดีไซน์',
		icon: '/orca/catalog/mobbin.svg',
		aliases: ['UI', 'UX', 'ออกแบบ']
	},
	'monday-com': {
		categoryId: 'productivity',
		descriptionTh: 'จัดการบอร์ด รายการงาน ขั้นตอนทำงาน และการร่วมงานของทีม',
		icon: '/orca/catalog/monday-com.svg',
		aliases: ['monday', 'โปรเจกต์', 'งานทีม']
	},
	'monte-carlo': {
		categoryId: 'data-analytics',
		descriptionTh: 'ตรวจสอบปัญหาข้อมูล เส้นทางข้อมูล และระบบติดตามคุณภาพข้อมูล',
		icon: '/orca/catalog/monte-carlo.png',
		aliases: ['data observability', 'lineage', 'คุณภาพข้อมูล']
	},
	morningstar: {
		categoryId: 'finance',
		descriptionTh: 'ค้นหาข้อมูลการเงิน บทวิเคราะห์ และคัดกรองการลงทุน',
		icon: '/orca/catalog/morningstar.ico',
		aliases: ['หุ้น', 'กองทุน', 'การลงทุน']
	},
	'motion-creative-analytics': {
		categoryId: 'marketing',
		descriptionTh: 'วิเคราะห์ผลงานโฆษณา แคมเปญคู่แข่ง และรูปแบบของแบรนด์',
		icon: '/orca/catalog/motion-creative-analytics.png',
		aliases: ['Motion', 'โฆษณา', 'creative']
	},
	'neon-database': {
		categoryId: 'data-analytics',
		descriptionTh: 'จัดการฐานข้อมูล Neon Postgres สาขาข้อมูล และการย้ายโครงสร้าง',
		icon: '/orca/catalog/neon-database.svg',
		aliases: ['Neon', 'PostgreSQL', 'ฐานข้อมูล']
	},
	netlify: {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'สร้าง เผยแพร่ จัดการ และดูแลความปลอดภัยเว็บไซต์บน Netlify',
		icon: '/orca/catalog/netlify.ico',
		aliases: ['hosting', 'deploy', 'เว็บไซต์']
	},
	nimble: {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหา ดึงข้อมูล สำรวจ และรวบรวมข้อมูลสดจากเว็บ',
		icon: '/orca/catalog/nimble.svg',
		aliases: ['เว็บ', 'search', 'scraping']
	},
	notion: {
		categoryId: 'productivity',
		descriptionTh: 'จัดการหน้า ฐานข้อมูล บล็อก ความคิดเห็น และเนื้อหาใน Notion',
		icon: '/orca/catalog/notion.svg',
		aliases: ['โน้ต', 'เอกสาร', 'wiki']
	},
	'omni-analytics': {
		categoryId: 'data-analytics',
		descriptionTh: 'ถามและวิเคราะห์ข้อมูลธุรกิจผ่านแบบจำลองข้อมูลที่กำกับไว้ใน Omni',
		icon: '/orca/catalog/omni-analytics.ico',
		aliases: ['Omni', 'BI', 'semantic model']
	},
	onedrive: {
		categoryId: 'productivity',
		descriptionTh: 'จัดการไฟล์ โฟลเดอร์ การแชร์ และงานข้ามไดรฟ์ใน OneDrive',
		icon: '/orca/catalog/onedrive.svg',
		aliases: ['Microsoft', 'ไฟล์', 'storage']
	},
	'open-targets': {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นคว้าเป้าหมายการรักษา โรค ยา พันธุกรรม และความสัมพันธ์ของข้อมูล',
		icon: '/orca/catalog/open-targets.png',
		aliases: ['ยา', 'พันธุกรรม', 'วิจัย']
	},
	'otter-ai': {
		categoryId: 'communication',
		descriptionTh: 'ค้นหาบทถอดเสียง บทสนทนา สรุป และข้อมูลเชิงลึกจากการประชุม',
		icon: '/orca/catalog/otter-ai.png',
		aliases: ['Otter', 'ประชุม', 'transcript']
	},
	outlook: {
		categoryId: 'communication',
		descriptionTh: 'จัดการอีเมล โฟลเดอร์ ฉบับร่าง และไฟล์แนบใน Outlook',
		icon: '/orca/catalog/outlook.svg',
		aliases: ['Microsoft', 'อีเมล', 'email']
	},
	outreach: {
		categoryId: 'crm-sales',
		descriptionTh: 'ค้นคว้าข้อมูลรายได้ นัดหมาย อีเมล ผู้มุ่งหวัง และโอกาสขาย',
		icon: '/orca/catalog/outreach.png',
		aliases: ['CRM', 'งานขาย', 'prospecting']
	},
	pagerduty: {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'จัดการเหตุขัดข้อง ตารางเวร บริการ และขั้นตอนรับมือปัญหา',
		icon: '/orca/catalog/pagerduty.svg',
		aliases: ['incident', 'on-call', 'ระบบ']
	},
	pandadoc: {
		categoryId: 'productivity',
		descriptionTh: 'สร้าง ส่ง ติดตาม และจัดการเอกสารใน PandaDoc',
		icon: '/orca/catalog/pandadoc.png',
		aliases: ['เอกสาร', 'ลายเซ็น', 'ข้อเสนอ']
	},
	paypal: {
		categoryId: 'finance',
		descriptionTh: 'จัดการใบแจ้งหนี้ การชำระเงิน สมาชิก และข้อพิพาทใน PayPal',
		icon: '/orca/catalog/paypal.ico',
		aliases: ['payments', 'การชำระเงิน', 'invoice']
	},
	'peec-ai': {
		categoryId: 'marketing',
		descriptionTh: 'วิเคราะห์การมองเห็นแบรนด์ ความรู้สึก และส่วนแบ่งบนการค้นหาด้วย AI',
		icon: '/orca/catalog/peec-ai.png',
		aliases: ['AI search', 'แบรนด์', 'SEO']
	},
	pipedrive: {
		categoryId: 'crm-sales',
		descriptionTh: 'ค้นหาและจัดการดีล ผู้ติดต่อ ผู้มุ่งหวัง กิจกรรม และบันทึก',
		icon: '/orca/catalog/pipedrive.webp',
		aliases: ['CRM', 'งานขาย', 'ลูกค้า']
	},
	plaud: {
		categoryId: 'communication',
		descriptionTh: 'ค้นหาไฟล์บันทึกเสียง บทถอดเสียง สรุป โน้ต และงานติดตาม',
		icon: '/orca/catalog/plaud.svg',
		aliases: ['เสียง', 'ประชุม', 'transcript']
	},
	playmcp: {
		categoryId: 'productivity',
		descriptionTh: 'เข้าถึงเครื่องมือที่เลือกจาก Kakao และผู้ให้บริการอื่นในกล่องเดียว',
		icon: '/orca/catalog/playmcp.png',
		aliases: ['Kakao', 'แอป', 'tools']
	},
	posthog: {
		categoryId: 'data-analytics',
		descriptionTh: 'วิเคราะห์การใช้งานผลิตภัณฑ์และจัดการรายงานกับการทดลอง',
		icon: '/orca/catalog/posthog.svg',
		aliases: ['product analytics', 'ข้อมูล', 'experiments']
	},
	postman: {
		categoryId: 'developer-tools',
		descriptionTh: 'จัดการ collections, workspaces, environments และข้อกำหนด API',
		icon: '/orca/catalog/postman.svg',
		aliases: ['API', 'testing', 'ทดสอบ']
	},
	pylon: {
		categoryId: 'crm-sales',
		descriptionTh: 'ค้นหา จัดการ และแก้ไขคำขอความช่วยเหลือจากลูกค้า',
		icon: '/orca/catalog/pylon.png',
		aliases: ['บริการลูกค้า', 'support', 'CRM']
	},
	quartr: {
		categoryId: 'finance',
		descriptionTh: 'ค้นคว้าบริษัทจดทะเบียนจากข้อมูลนักลงทุนสัมพันธ์โดยตรง',
		icon: '/orca/catalog/quartr.svg',
		aliases: ['หุ้น', 'บริษัท', 'investor relations']
	},
	railway: {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'เผยแพร่ จัดการ และแก้ไขปัญหาโครงการกับบริการบน Railway',
		icon: '/orca/catalog/railway.svg',
		aliases: ['hosting', 'deploy', 'DevOps']
	},
	ramp: {
		categoryId: 'finance',
		descriptionTh: 'ค้นหาและวิเคราะห์ธุรกรรม ใบเรียกเก็บเงิน บัตร และผู้ขาย',
		icon: '/orca/catalog/ramp.ico',
		aliases: ['ค่าใช้จ่าย', 'การเงิน', 'vendors']
	},
	'ramp-data': {
		categoryId: 'finance',
		descriptionTh: 'วิเคราะห์แนวโน้มผู้ขายและการใช้ AI ของธุรกิจจาก Ramp Data',
		icon: '/orca/catalog/ramp-data.png',
		aliases: ['Ramp', 'ข้อมูลการเงิน', 'วิจัยตลาด']
	},
	'read-ai': {
		categoryId: 'communication',
		descriptionTh: 'เรียกดูบทถอดเสียง สรุปประชุม สั่งงานเอเจนต์ และแชร์รายงาน',
		icon: '/orca/catalog/read-ai.png',
		aliases: ['ประชุม', 'transcript', 'report']
	},
	ref: {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหาเอกสารอ้างอิงแบบกระชับเพื่อประกอบคำตอบของ AI',
		aliases: ['เอกสาร', 'documentation', 'search']
	},
	render: {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'จัดการบริการ ฐานข้อมูล การเผยแพร่ logs และประสิทธิภาพบน Render',
		icon: '/orca/catalog/render.svg',
		aliases: ['hosting', 'deploy', 'DevOps']
	},
	replit: {
		categoryId: 'developer-tools',
		descriptionTh: 'สร้าง ตรวจสอบ ปรับปรุง และเผยแพร่แอปผ่าน Replit Agent',
		icon: '/orca/catalog/replit.svg',
		aliases: ['แอป', 'โค้ด', 'พัฒนา']
	},
	resend: {
		categoryId: 'communication',
		descriptionTh: 'จัดการการส่งอีเมล กลุ่มผู้รับ โดเมน และระบบอีเมลอัตโนมัติ',
		icon: '/orca/catalog/resend.svg',
		aliases: ['email', 'อีเมล', 'developer']
	},
	salesforce: {
		categoryId: 'crm-sales',
		descriptionTh: 'เข้าถึงระเบียน Salesforce ผ่าน MCP ที่ Salesforce ให้บริการ',
		icon: '/orca/catalog/salesforce.svg',
		aliases: ['CRM', 'ลูกค้า', 'งานขาย']
	},
	sanity: {
		categoryId: 'design-content',
		descriptionTh: 'สร้าง ค้นหา เผยแพร่ และจัดการเนื้อหาแบบมีโครงสร้างใน Sanity',
		icon: '/orca/catalog/sanity.png',
		aliases: ['CMS', 'เนื้อหา', 'content']
	},
	'scholar-gateway': {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหางานวิจัยของ Wiley พร้อมคำอ้างอิงและลิงก์ DOI ที่ตรวจได้',
		icon: '/orca/catalog/scholar-gateway.png',
		aliases: ['Wiley', 'วิจัย', 'บทความ']
	},
	scite: {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหางานวิจัยและตรวจข้อกล่าวอ้างด้วยหลักฐานการอ้างอิง',
		icon: '/orca/catalog/scite.ico',
		aliases: ['วิจัย', 'Smart Citations', 'บทความ']
	},
	semrush: {
		categoryId: 'marketing',
		descriptionTh: 'วิเคราะห์ SEO คีย์เวิร์ด คู่แข่ง ลิงก์ โฆษณา และสุขภาพเว็บไซต์',
		icon: '/orca/catalog/semrush.svg',
		aliases: ['SEO', 'คู่แข่ง', 'คีย์เวิร์ด']
	},
	sentry: {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'ค้นหา ตรวจสอบ และจัดการ errors, issues กับโครงการใน Sentry',
		icon: '/orca/catalog/sentry.ico',
		aliases: ['error monitoring', 'บั๊ก', 'DevOps']
	},
	similarweb: {
		categoryId: 'marketing',
		descriptionTh: 'วิเคราะห์ผู้เข้าชม ช่องทาง ผู้ใช้ การค้นหา คู่แข่ง และแอปมือถือ',
		icon: '/orca/catalog/similarweb.png',
		aliases: ['traffic', 'คู่แข่ง', 'การตลาด']
	},
	'slack-workspace': {
		categoryId: 'communication',
		descriptionTh: 'ทำงานกับข้อความ ไฟล์ ช่องสนทนา และข้อมูลใน Slack',
		icon: '/orca/tools/slack.svg',
		aliases: ['Slack', 'แชต', 'ทีม']
	},
	slidesgpt: {
		categoryId: 'design-content',
		descriptionTh: 'สร้างชุดสไลด์ เลือกธีม สร้างภาพ และส่งออกไฟล์ PowerPoint',
		icon: '/orca/catalog/slidesgpt.png',
		aliases: ['สไลด์', 'PowerPoint', 'presentation']
	},
	snowflake: {
		categoryId: 'data-analytics',
		descriptionTh: 'เข้าถึงข้อมูลผ่าน Snowflake MCP ด้วย OAuth และสิทธิ์ตามบทบาท',
		icon: '/orca/catalog/snowflake.svg',
		aliases: ['SQL', 'คลังข้อมูล', 'database']
	},
	square: {
		categoryId: 'finance',
		descriptionTh: 'จัดการการชำระเงิน ลูกค้า คำสั่งซื้อ สินค้า และงานธุรกิจใน Square',
		icon: '/orca/catalog/square.svg',
		aliases: ['payments', 'ขายสินค้า', 'POS']
	},
	strava: {
		categoryId: 'travel-lifestyle',
		descriptionTh: 'วิเคราะห์กิจกรรม แนวโน้มฟิตเนส การฝึก เป้าหมาย และอุปกรณ์',
		icon: '/orca/catalog/strava.ico',
		aliases: ['กีฬา', 'ฟิตเนส', 'ออกกำลังกาย']
	},
	stripe: {
		categoryId: 'finance',
		descriptionTh: 'จัดการการชำระเงิน สมาชิก ใบแจ้งหนี้ ลูกค้า และข้อพิพาท',
		icon: '/orca/catalog/stripe.svg',
		aliases: ['payments', 'billing', 'การชำระเงิน']
	},
	supabase: {
		categoryId: 'data-analytics',
		descriptionTh: 'เชื่อมต่อ Supabase โดยเลือกสิทธิ์อ่านอย่างเดียวและวิธียืนยันตัวตนได้',
		icon: '/orca/catalog/supabase.png',
		aliases: ['PostgreSQL', 'ฐานข้อมูล', 'backend']
	},
	'superhuman-docs': {
		categoryId: 'productivity',
		descriptionTh: 'สร้าง ค้นหา และปรับปรุงเอกสาร หน้า และตารางใน Superhuman Docs',
		icon: '/orca/catalog/superhuman-docs.png',
		aliases: ['Coda', 'เอกสาร', 'ตาราง']
	},
	'superhuman-mail': {
		categoryId: 'communication',
		descriptionTh: 'ค้นหาอีเมล ร่างและส่งคำตอบ พร้อมจัดการปฏิทิน Gmail กับ Outlook',
		icon: '/orca/catalog/superhuman-mail.png',
		aliases: ['Superhuman', 'อีเมล', 'email']
	},
	'supermetrics-marketing-analytics': {
		categoryId: 'marketing',
		descriptionTh: 'วิเคราะห์ข้อมูลการตลาดและจัดการแคมเปญจากหลายแพลตฟอร์ม',
		icon: '/orca/catalog/supermetrics-marketing-analytics.ico',
		aliases: ['Supermetrics', 'แคมเปญ', 'analytics']
	},
	surfer: {
		categoryId: 'marketing',
		descriptionTh: 'สร้าง ปรับปรุง และประเมินเนื้อหา SEO ด้วยข้อมูลจาก Surfer',
		icon: '/orca/catalog/surfer.ico',
		aliases: ['Surfer SEO', 'เนื้อหา', 'คีย์เวิร์ด']
	},
	surveymonkey: {
		categoryId: 'productivity',
		descriptionTh: 'สร้างและแก้ไขแบบสอบถาม เผยแพร่ลิงก์ และวิเคราะห์คำตอบ',
		icon: '/orca/catalog/surveymonkey.png',
		aliases: ['survey', 'แบบสอบถาม', 'ฟอร์ม']
	},
	'synapse-org': {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหาชุดข้อมูลวิทยาศาสตร์และดูรายละเอียดกับที่มาของข้อมูล',
		icon: '/orca/catalog/synapse-org.webp',
		aliases: ['Synapse', 'วิจัย', 'datasets']
	},
	'tableau-cloud': {
		categoryId: 'data-analytics',
		descriptionTh: 'วิเคราะห์ข้อมูล สำรวจเนื้อหา และจัดการตัวชี้วัด Pulse ใน Tableau',
		icon: '/orca/catalog/tableau-cloud.svg',
		aliases: ['Tableau', 'BI', 'visualization']
	},
	'tavily-search': {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นคว้าเว็บ ดึงข้อมูล และสำรวจเว็บไซต์ด้วยการจัดอันดับของ AI',
		icon: '/orca/catalog/tavily-search.ico',
		aliases: ['Tavily', 'ค้นหาเว็บ', 'วิจัย']
	},
	ticktick: {
		categoryId: 'productivity',
		descriptionTh: 'ค้นหาและจัดการงาน โครงการ นิสัย และช่วงเวลาโฟกัส',
		icon: '/orca/catalog/ticktick.png',
		aliases: ['task', 'งาน', 'นิสัย']
	},
	todoist: {
		categoryId: 'productivity',
		descriptionTh: 'จัดการงาน โครงการ และการร่วมงานของทีมใน Todoist',
		icon: '/orca/catalog/todoist.svg',
		aliases: ['task', 'งาน', 'โปรเจกต์']
	},
	trello: {
		categoryId: 'productivity',
		descriptionTh: 'ค้นหาและจัดการบอร์ด รายการ การ์ด เช็กลิสต์ และแผนงาน',
		icon: '/orca/catalog/trello.svg',
		aliases: ['Atlassian', 'บอร์ด', 'งานทีม']
	},
	'twilio-docs': {
		categoryId: 'research-knowledge',
		descriptionTh: 'ค้นหาเอกสาร Twilio API และแนวทางการพัฒนาใช้งาน',
		icon: '/orca/catalog/twilio-docs.svg',
		aliases: ['Twilio', 'เอกสาร', 'API']
	},
	'udemy-business': {
		categoryId: 'people',
		descriptionTh: 'ค้นหาหลักสูตรสำหรับองค์กรและจัดเส้นทางการเรียนรู้อย่างเป็นระบบ',
		icon: '/orca/catalog/udemy-business.webp',
		aliases: ['Udemy', 'การเรียน', 'อบรม']
	},
	webflow: {
		categoryId: 'design-content',
		descriptionTh: 'จัดการเว็บไซต์ เนื้อหา CMS หน้าเว็บ สื่อ และสไตล์ใน Webflow',
		icon: '/orca/catalog/webflow.ico',
		aliases: ['เว็บไซต์', 'CMS', 'ดีไซน์']
	},
	'windsor-ai': {
		categoryId: 'marketing',
		descriptionTh: 'วิเคราะห์ข้อมูลการตลาด งานขาย เว็บ และอีคอมเมิร์ซ',
		icon: '/orca/catalog/windsor-ai.png',
		aliases: ['Windsor', 'analytics', 'อีคอมเมิร์ซ']
	},
	'wispr-flow': {
		categoryId: 'communication',
		descriptionTh: 'ค้นหาการประชุม บทถอดเสียง โน้ต ปฏิทิน และงาน',
		icon: '/orca/catalog/wispr-flow.png',
		aliases: ['Wispr', 'ประชุม', 'โน้ต']
	},
	wix: {
		categoryId: 'design-content',
		descriptionTh: 'จัดการเว็บไซต์ การจอง แพ็กเกจราคา และเนื้อหาผ่าน Wix API',
		icon: '/orca/catalog/wix.svg',
		aliases: ['เว็บไซต์', 'CMS', 'จอง']
	},
	word: {
		categoryId: 'productivity',
		descriptionTh: 'สร้างและจัดการเอกสาร Microsoft Word พร้อมแปลงเนื้อหา Markdown',
		icon: '/orca/catalog/word.svg',
		aliases: ['Microsoft', 'เอกสาร', 'document']
	},
	wrike: {
		categoryId: 'productivity',
		descriptionTh: 'ค้นหาและจัดการงาน โครงการ โฟลเดอร์ และความคิดเห็นใน Wrike',
		icon: '/orca/catalog/wrike.png',
		aliases: ['โปรเจกต์', 'งานทีม', 'task']
	},
	zapier: {
		categoryId: 'productivity',
		descriptionTh: 'เข้าถึงแอปและขั้นตอนอัตโนมัติผ่านแพลตฟอร์ม Zapier',
		icon: '/orca/catalog/zapier.svg',
		aliases: ['automation', 'อัตโนมัติ', 'แอป']
	},
	ziprecruiter: {
		categoryId: 'people',
		descriptionTh: 'ค้นหางานในสหรัฐฯ และแคนาดาตามตำแหน่ง สถานที่ เงินเดือน และประสบการณ์',
		icon: '/orca/catalog/ziprecruiter.png',
		aliases: ['งาน', 'สรรหา', 'recruiting']
	},
	zoom: {
		categoryId: 'communication',
		descriptionTh: 'ค้นหาการประชุมและเรียกดูไฟล์บันทึก บทถอดเสียง และโน้ตใน Zoom',
		icon: '/orca/catalog/zoom.ico',
		aliases: ['ประชุม', 'วิดีโอ', 'meeting']
	},
	zoominfo: {
		categoryId: 'crm-sales',
		descriptionTh: 'ค้นหาและเติมข้อมูลบริษัท ผู้ติดต่อ สัญญาณซื้อ และข้อมูลตลาด',
		icon: '/orca/catalog/zoominfo.svg',
		aliases: ['งานขาย', 'B2B', 'ข้อมูลบริษัท']
	},
	'incident-io': {
		categoryId: 'cloud-infrastructure',
		descriptionTh: 'จัดการเหตุขัดข้อง การแจ้งเตือน งานติดตาม และตารางเวรระบบ',
		icon: '/orca/catalog/incident-io.svg',
		aliases: ['incident', 'on-call', 'DevOps']
	},
	tldraw: {
		categoryId: 'design-content',
		descriptionTh: 'วาดและปรับแก้แผนภาพ wireframes แผนผังความคิด และภาพประกอบ',
		icon: '/orca/catalog/tldraw.svg',
		aliases: ['whiteboard', 'แผนภาพ', 'ดีไซน์']
	},
	trivago: {
		categoryId: 'travel-lifestyle',
		descriptionTh: 'ค้นหาที่พักและเปรียบเทียบราคาโรงแรมล่าสุดจากผู้ให้บริการจอง',
		icon: '/orca/catalog/trivago.ico',
		aliases: ['โรงแรม', 'ที่พัก', 'ท่องเที่ยว']
	}
};

export function getCatalogPresentation(name: string, description = ''): CatalogPresentation {
	const integration = integrationPresentation(name);
	if (integration) return integration;
	const key = normalizeCatalogName(name);
	const presentation = presentations[({
		'microsoft-outlook': 'outlook', 'microsoft-calendar': 'calendar', 'microsoft-contacts': 'contact',
		'bigquery-mcp': 'bigquery-toolbox'
	} as Record<string, string>)[key] || key];
	if (presentation) return presentation;

	return {
		categoryId: 'developer-tools',
		descriptionTh: 'ดูรายละเอียดและวิธีเชื่อมต่อเครื่องมือ MCP นี้',
		aliases: description ? [description] : []
	};
}

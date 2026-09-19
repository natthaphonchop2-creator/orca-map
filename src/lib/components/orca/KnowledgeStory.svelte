<script lang="ts">
	import ToolIcon from '$lib/orca/ToolIcon.svelte';
	import { localeHref, t } from '$lib/orca/locale.svelte';
	import { reveal } from '$lib/orca/motion';
	import Brand from './Brand.svelte';
	import {
		ArrowRight,
		ArrowDown,
		ArrowUpRight,
		BookOpen,
		Check,
		FileText,
		FolderOpen,
		Link2,
		LockKeyhole,
		MessageSquareText,
		Search,
		ShieldCheck,
		Users
	} from '@lucide/svelte';
</script>

<section id="knowledge" class="knowledge-section" aria-labelledby="knowledge-title" tabindex="-1">
	<div class="o-wrap">
		<header class="knowledge-intro o-reveal" use:reveal>
			<h2 id="knowledge-title">
				{t('ให้ AI เข้าใจความรู้ของบริษัท', 'Put your company’s knowledge to work.')}<br /><span
					>{t('ในขอบเขตที่คุณกำหนด', 'With access you define.')}</span
				>
			</h2>
			<p>
				{t(
					'เปลี่ยนคู่มือ เอกสาร และวิธีทำงานที่กระจายอยู่ ให้เป็นคลังความรู้ที่ทีมใช้กับ AI ได้ พร้อมกำหนดว่าใครเข้าถึงข้อมูลส่วนไหน',
					'Turn scattered manuals, documents and procedures into knowledge your team can use with AI. Decide who can access each part.'
				)}
			</p>
		</header>

		<div class="knowledge-build o-reveal" use:reveal>
			<div class="knowledge-inputs">
				<div class="knowledge-input-label">
					<FolderOpen size={21} aria-hidden="true" />
					<h3>{t('เริ่มจากความรู้ที่ธุรกิจมี', 'Start with what your business knows')}</h3>
				</div>
				<ul class="knowledge-source-list" role="list">
					<li><ToolIcon name="google-drive" size={29} decorative /><span>Google Drive</span></li>
					<li><ToolIcon name="google-docs" size={29} decorative /><span>Google Docs</span></li>
					<li>
						<FileText size={26} aria-hidden="true" /><span
							>{t('PDF และคู่มือ', 'PDFs & manuals')}</span
						>
					</li>
				</ul>
			</div>
			<div class="knowledge-build-arrow" aria-hidden="true"><ArrowDown size={24} /></div>
			<div class="knowledge-methods">
				<article class="knowledge-method knowledge-wiki" aria-labelledby="knowledge-wiki-title">
					<div class="knowledge-method-top">
						<BookOpen size={25} aria-hidden="true" /><span>LLM Wiki</span>
					</div>
					<h3 id="knowledge-wiki-title">
						{t('ให้ AI ช่วยเรียบเรียงเป็นคู่มือ', 'Let AI help build your knowledge library')}
					</h3>
					<p>
						{t(
							'ให้ AI ช่วยสรุป จัดหมวด เชื่อมโยง และปรับปรุงหน้าความรู้เมื่อมีเอกสารใหม่ โดยทีมตรวจทานได้',
							'AI helps build and update linked knowledge pages as new sources are added, with your team reviewing the changes.'
						)}
					</p>
					<div
						class="knowledge-page-stack"
						aria-label={t('หน้าความรู้ที่จัดเป็นหมวด', 'Organized knowledge pages')}
					>
						<span
							><BookOpen size={16} aria-hidden="true" />{t(
								'สินค้าและบริการ',
								'Products & services'
							)}</span
						>
						<span
							><Link2 size={16} aria-hidden="true" />{t(
								'ขั้นตอนบริการลูกค้า',
								'Customer service procedures'
							)}</span
						>
					</div>
				</article>
				<article class="knowledge-method knowledge-rag" aria-labelledby="knowledge-rag-title">
					<div class="knowledge-method-top">
						<Search size={25} aria-hidden="true" /><span>RAG</span>
					</div>
					<h3 id="knowledge-rag-title">
						{t('ให้ AI ค้นเอกสารมาช่วยตอบ', 'Let AI find the knowledge behind an answer')}
					</h3>
					<p>
						{t(
							'เมื่อมีคำถาม ระบบค้นเนื้อหาที่เกี่ยวข้องและมีสิทธิ์อ่าน มาให้ AI เรียบเรียงคำตอบพร้อมระบุที่มา',
							'When someone asks a question, retrieval finds relevant content they can access. AI uses it to answer with source references.'
						)}
					</p>
					<div
						class="knowledge-retrieval-path"
						aria-label={t(
							'คำถาม สู่เนื้อหาที่เกี่ยวข้อง สู่คำตอบ',
							'Question, relevant content, answer'
						)}
					>
						<span>{t('คำถาม', 'Question')}</span><ArrowRight size={17} aria-hidden="true" /><span
							>{t('ค้นเนื้อหา', 'Retrieve')}</span
						><ArrowRight size={17} aria-hidden="true" /><span>{t('คำตอบ', 'Answer')}</span>
					</div>
				</article>
			</div>
			<p class="knowledge-together">
				{t(
					'ใช้ร่วมกันได้: จัดความรู้เป็น Wiki แล้วให้ RAG ค้นจาก Wiki และเอกสารที่อนุญาต โดยเชื่อมกับ AI ผ่าน MCP หรือ API',
					'Use them together: organize a Wiki, then let RAG search it and permitted documents. MCP or API connections bring that knowledge to your AI.'
				)}
			</p>
		</div>

		<figure class="knowledge-flow o-reveal" use:reveal aria-labelledby="knowledge-flow-title">
			<figcaption class="knowledge-flow-heading">
				<h3 id="knowledge-flow-title">
					{t('จากคำถาม สู่คำตอบที่มีที่มา', 'From a question to an answer with sources')}
				</h3>
				<p>
					{t(
						'ORCA กำหนดทางเข้าถึงความรู้ ให้ AI ใช้ข้อมูลตามสิทธิ์ของผู้ถาม',
						'ORCA governs access to knowledge so AI works within the person’s permissions.'
					)}
				</p>
			</figcaption>
			<ol class="knowledge-steps" role="list">
				<li class="knowledge-step knowledge-question">
					<div class="knowledge-step-number">
						<span>01</span><MessageSquareText size={20} aria-hidden="true" />
					</div>
					<h4>{t('ทีมถามผ่านแอป AI', 'Ask in your AI app')}</h4>
					<div class="knowledge-ai-apps">
						<ToolIcon name="chatgpt" size={25} decorative /><span>ChatGPT</span><ToolIcon
							name="claude"
							size={25}
							decorative
						/><span>Claude</span>
					</div>
					<p class="knowledge-question-bubble">
						{t('“ลูกค้าขอเปลี่ยนสินค้า ต้องทำอย่างไร?”', '“How do I handle a product exchange?”')}
					</p>
					<div class="knowledge-person">
						<Users size={17} aria-hidden="true" /><span
							>{t('ทีมบริการลูกค้า', 'Customer service team')}</span
						>
					</div>
					<ArrowRight class="knowledge-step-arrow" size={22} aria-hidden="true" />
				</li>
				<li class="knowledge-step knowledge-gate">
					<div class="knowledge-step-number">
						<span>02</span><ShieldCheck size={20} aria-hidden="true" />
					</div>
					<h4>{t('ORCA ตรวจสิทธิ์', 'ORCA checks access')}</h4>
					<div class="knowledge-gate-brand" aria-hidden="true"><Brand dark /></div>
					<p>
						{t(
							'ตรวจว่าใครเป็นผู้ถาม และใช้แหล่งความรู้ใดได้',
							'Check who is asking and which knowledge sources they can use.'
						)}
					</p>
					<div class="knowledge-gate-scope">
						<Check size={16} aria-hidden="true" /><span
							>{t('คลังบริการลูกค้า', 'Customer service knowledge')}</span
						>
					</div>
					<ArrowRight class="knowledge-step-arrow" size={22} aria-hidden="true" />
				</li>
				<li class="knowledge-step knowledge-retrieve">
					<div class="knowledge-step-number">
						<span>03</span><Search size={20} aria-hidden="true" />
					</div>
					<h4>{t('ค้นเฉพาะข้อมูลที่อนุญาต', 'Retrieve permitted content')}</h4>
					<p>
						{t(
							'ค้นใน Wiki หรือเอกสาร ตามสิทธิ์ที่ตั้งไว้',
							'Search the Wiki or documents within the configured access.'
						)}
					</p>
					<div class="knowledge-found-doc">
						<BookOpen size={19} aria-hidden="true" /><span
							>{t('คู่มือบริการลูกค้า', 'Customer service guide')}</span
						><Check size={16} aria-hidden="true" />
					</div>
					<div class="knowledge-excluded">
						<LockKeyhole size={16} aria-hidden="true" /><span
							>{t('เอกสารฝ่ายบุคคลไม่ถูกนำมาใช้', 'HR documents stay outside this request')}</span
						>
					</div>
					<ArrowRight class="knowledge-step-arrow" size={22} aria-hidden="true" />
				</li>
				<li class="knowledge-step knowledge-answer">
					<div class="knowledge-step-number">
						<span>04</span><BookOpen size={20} aria-hidden="true" />
					</div>
					<h4>{t('AI ตอบพร้อมแหล่งอ้างอิง', 'AI answers with sources')}</h4>
					<p class="knowledge-answer-text">
						{t(
							'ตรวจใบสั่งซื้อ แล้วดำเนินการตามเงื่อนไขการเปลี่ยนสินค้าในคู่มือ',
							'Check the order, then follow the exchange conditions in the service guide.'
						)}
					</p>
					<div class="knowledge-citation">
						<FileText size={17} aria-hidden="true" /><span
							>{t('อ้างอิง: คู่มือบริการลูกค้า', 'Source: Customer service guide')}</span
						>
					</div>
					<small>{t('ทีมเปิดตรวจเอกสารต้นทางได้', 'Your team can check the original source')}</small
					>
				</li>
			</ol>
			<div class="knowledge-permission-note">
				<ShieldCheck size={21} aria-hidden="true" />
				<p>
					{t(
						'ส่งให้ AI เฉพาะเนื้อหาที่ผู้ถามมีสิทธิ์อ่าน โดยตั้งสิทธิ์ของแหล่งความรู้และการเชื่อมต่อให้ตรงกัน',
						'Only content the person can read reaches the answering AI. Configure matching permissions in the knowledge source and its connection.'
					)}
				</p>
			</div>
		</figure>

		<div class="knowledge-access o-reveal" use:reveal>
			<div class="knowledge-access-intro">
				<h3>
					{t('ความรู้ของบริษัท', 'One company’s knowledge.')}<br />{t(
						'แบ่งสิทธิ์ให้เหมาะกับแต่ละทีม',
						'Access suited to each team.'
					)}
				</h3>
				<p>
					{t(
						'ผู้ดูแลเลือกสมาชิกและแหล่งความรู้ ให้ AI ช่วยงานได้ในขอบเขตของแต่ละคน',
						'Choose members and knowledge sources so AI helps each person within their access.'
					)}
				</p>
			</div>
			<ul
				class="knowledge-teams"
				role="list"
				aria-label={t('การกำหนดสิทธิ์แยกตามทีม', 'Access configured for each team')}
			>
				<li>
					<div class="knowledge-team-title">
						<Users size={19} aria-hidden="true" />
						<h4>{t('ทีมบริการลูกค้า', 'Customer service')}</h4>
					</div>
					<p class="knowledge-allowed">
						<Check size={17} aria-hidden="true" />{t(
							'คู่มือสินค้า · ขั้นตอนบริการ',
							'Product guides · Service procedures'
						)}
					</p>
					<p class="knowledge-denied">
						<LockKeyhole size={16} aria-hidden="true" />{t(
							'ไม่เปิดให้เข้าถึงข้อมูลเงินเดือน',
							'Payroll data is outside this access'
						)}
					</p>
				</li>
				<li>
					<div class="knowledge-team-title">
						<Users size={19} aria-hidden="true" />
						<h4>{t('ฝ่ายบุคคล', 'Human resources')}</h4>
					</div>
					<p class="knowledge-allowed">
						<Check size={17} aria-hidden="true" />{t(
							'คู่มือบุคคล · สวัสดิการ',
							'HR handbook · Employee benefits'
						)}
					</p>
					<p class="knowledge-denied">
						<LockKeyhole size={16} aria-hidden="true" />{t(
							'ไม่เปิดให้เข้าถึงข้อมูลบัญชีลูกค้า',
							'Customer account data is outside this access'
						)}
					</p>
				</li>
			</ul>
		</div>
		<div class="knowledge-contact">
			<p>
				{t(
					'เริ่มจากคู่มือหนึ่งชุด หรืองานที่ทีมต้องค้นข้อมูลบ่อย',
					'Start with one set of guides, or a question your team asks often.'
				)}
			</p>
			<a class="o-button" href={localeHref('/start?service=implementation')}
				>{t('วางคลังความรู้กับทีม ORCA', 'Plan your knowledge system')}<ArrowUpRight
					size={20}
					aria-hidden="true"
				/></a
			>
		</div>
	</div>
</section>

<style>
	.knowledge-section {
		padding: 100px 0 84px;
		background: #f8f9f6;
		border-block: 1px solid #e0e4d8;
		scroll-margin-top: 100px;
	}
	.knowledge-intro {
		max-width: 870px;
		margin: 0 auto 48px;
		text-align: center;
	}
	.knowledge-intro h2 {
		font-size: clamp(30px, 3.6vw, 46px);
		line-height: 1.45;
		font-weight: 750;
		letter-spacing: -0.025em;
	}
	.knowledge-intro h2 span {
		color: #53702b;
	}
	.knowledge-intro p {
		max-width: 760px;
		margin: 22px auto 0;
		color: #566078;
		font-size: 18px;
		line-height: 1.85;
	}
	.knowledge-build {
		max-width: 1000px;
		margin-inline: auto;
	}
	.knowledge-inputs {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 24px;
		padding: 22px 28px;
		background: #fff;
		border: 1px solid #dce1d4;
		border-radius: 16px;
	}
	.knowledge-input-label {
		display: flex;
		align-items: center;
		gap: 12px;
		color: #536738;
	}
	.knowledge-input-label h3 {
		color: #222938;
		font-size: 16px;
		font-weight: 650;
	}
	.knowledge-source-list {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 22px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.knowledge-source-list li {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 550;
	}
	.knowledge-source-list li:last-child {
		color: #805d56;
	}
	.knowledge-build-arrow {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 42px;
		color: #6e8c3d;
	}
	.knowledge-methods {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
	}
	.knowledge-method {
		min-width: 0;
		padding: 28px;
		border-radius: 18px;
		border: 1px solid #d7dfc8;
		background: #f0f5e7;
	}
	.knowledge-method-top {
		display: flex;
		align-items: center;
		gap: 11px;
		margin-bottom: 15px;
		color: #4f692e;
		font-size: 16px;
		font-weight: 750;
	}
	.knowledge-method h3 {
		font-size: 23px;
		font-weight: 700;
		line-height: 1.5;
		text-wrap: pretty;
	}
	.knowledge-method p {
		margin-top: 10px;
		font-size: 16px;
		color: #535e50;
		line-height: 1.8;
	}
	.knowledge-rag {
		background: #f0edf8;
		border-color: #ded7ed;
	}
	.knowledge-rag .knowledge-method-top {
		color: #7457a2;
	}
	.knowledge-rag p {
		color: #60586e;
	}
	.knowledge-page-stack {
		display: flex;
		flex-direction: column;
		gap: 7px;
		margin-top: 22px;
	}
	.knowledge-page-stack span {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 9px 12px;
		border: 1px solid #d5dec8;
		background: #ffffffb3;
		border-radius: 7px;
		font-size: 14px;
	}
	.knowledge-page-stack span:last-child {
		margin-left: 22px;
	}
	.knowledge-retrieval-path {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 9px;
		padding: 14px 12px;
		margin-top: 22px;
		border: 1px solid #d9d1e9;
		background: #ffffffb3;
		border-radius: 8px;
		color: #6f509e;
		font-size: 14px;
		font-weight: 600;
	}
	.knowledge-together {
		margin-top: 22px !important;
		text-align: center;
		color: #5d6556;
		font-size: 14px;
		line-height: 1.85;
	}
	.knowledge-flow {
		margin: 62px 0 0;
	}
	.knowledge-flow-heading {
		margin-bottom: 27px;
	}
	.knowledge-flow-heading h3 {
		font-size: 28px;
		font-weight: 700;
		line-height: 1.5;
	}
	.knowledge-flow-heading p {
		color: #596174;
		margin-top: 9px;
		font-size: 16px;
	}
	.knowledge-steps {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 25px;
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.knowledge-step {
		position: relative;
		display: flex;
		flex-direction: column;
		min-width: 0;
		padding: 22px 20px;
		border: 1px solid #dbe0d4;
		border-radius: 15px;
		background: #fff;
		box-shadow: 0 8px 26px -22px #27361560;
	}
	.knowledge-step-number {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: #6a803d;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.06em;
		margin-bottom: 14px;
	}
	.knowledge-step h4 {
		margin: 0 0 18px;
		font-size: 17px;
		line-height: 1.65;
		font-weight: 700;
	}
	.knowledge-step > p {
		color: #586176;
		font-size: 14px;
		line-height: 1.85;
	}
	.knowledge-step :global(.knowledge-step-arrow) {
		position: absolute;
		right: -24px;
		top: 48%;
		color: #6f8c39;
		z-index: 1;
	}
	.knowledge-ai-apps {
		display: flex;
		align-items: center;
		gap: 7px;
		flex-wrap: wrap;
		font-size: 12px;
		color: #4e586b;
	}
	.knowledge-ai-apps span {
		margin-right: 3px;
	}
	.knowledge-step .knowledge-question-bubble {
		padding: 15px;
		margin-top: 18px;
		border-radius: 0 12px 12px 12px;
		background: #f0f2f7;
		color: #263043;
		font-size: 16px;
		font-weight: 550;
	}
	.knowledge-person {
		display: flex;
		align-items: center;
		gap: 7px;
		color: #5f687b;
		margin-top: 17px;
		font-size: 12px;
	}
	.knowledge-gate {
		background: #171e24;
		border-color: #455333;
		box-shadow:
			0 0 0 5px #d9ebbe38,
			0 12px 35px -18px #677b4050;
		color: #f4f6f9;
	}
	.knowledge-gate .knowledge-step-number {
		color: var(--o-citron);
	}
	.knowledge-gate-brand {
		margin: 3px 0 20px;
	}
	.knowledge-gate > p {
		color: #c0cbb9;
	}
	.knowledge-gate-scope {
		display: flex;
		align-items: center;
		gap: 7px;
		padding-top: 16px;
		margin-top: auto;
		color: var(--o-citron);
		font-size: 13px;
	}
	.knowledge-found-doc {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 13px 10px;
		margin-top: 18px;
		border: 1px solid #d6e1bf;
		background: #f3f7e9;
		border-radius: 8px;
		color: #476128;
		font-size: 13px;
	}
	.knowledge-found-doc :global(svg:last-child) {
		margin-left: auto;
	}
	.knowledge-excluded {
		display: flex;
		align-items: flex-start;
		gap: 7px;
		color: #69707a;
		font-size: 12px;
		line-height: 1.7;
		margin-top: 16px;
	}
	.knowledge-excluded :global(svg) {
		flex-shrink: 0;
		margin-top: 2px;
	}
	.knowledge-answer {
		background: #fcfef8;
	}
	.knowledge-answer .knowledge-answer-text {
		color: #303e2d;
		font-size: 15px;
	}
	.knowledge-citation {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 11px 0 0;
		margin-top: auto;
		color: #665084;
		font-size: 12px;
	}
	.knowledge-citation :global(svg) {
		flex-shrink: 0;
	}
	.knowledge-answer small {
		display: block;
		font-size: 12px;
		color: #65705d;
		margin-top: 10px;
	}
	.knowledge-permission-note {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 19px 24px;
		margin-top: 22px;
		border: 1px solid #dfe5d5;
		background: #edf3e2;
		border-radius: 10px;
	}
	.knowledge-permission-note :global(svg) {
		flex-shrink: 0;
		color: #577631;
	}
	.knowledge-permission-note p {
		color: #4f6143;
		font-size: 14px;
		line-height: 1.8;
	}
	.knowledge-access {
		display: grid;
		grid-template-columns: 0.85fr 1.5fr;
		gap: 60px;
		align-items: center;
		margin-top: 62px;
		padding-top: 42px;
		border-top: 1px solid #dce1d4;
	}
	.knowledge-access-intro h3 {
		font-size: 26px;
		font-weight: 700;
		line-height: 1.6;
	}
	.knowledge-access-intro p {
		font-size: 16px;
		line-height: 1.8;
		color: #5d6659;
		margin-top: 13px;
	}
	.knowledge-teams {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 26px;
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.knowledge-teams li {
		min-width: 0;
	}
	.knowledge-teams li + li {
		padding-left: 26px;
		border-left: 1px solid #d6deca;
	}
	.knowledge-team-title {
		display: flex;
		align-items: center;
		gap: 9px;
		color: #46582e;
	}
	.knowledge-team-title h4 {
		color: #263320;
		font-size: 17px;
		font-weight: 700;
		margin: 0;
	}
	.knowledge-teams p {
		display: flex;
		align-items: flex-start;
		gap: 7px;
		font-size: 13px;
		line-height: 1.85;
		margin-top: 13px;
	}
	.knowledge-teams p :global(svg) {
		flex-shrink: 0;
		margin-top: 3px;
	}
	.knowledge-allowed {
		color: #4b6828;
	}
	.knowledge-denied {
		color: #6c7078;
	}
	.knowledge-contact {
		display: flex;
		justify-content: space-between;
		gap: 24px;
		align-items: center;
		margin-top: 45px;
	}
	.knowledge-contact p {
		color: #5b6556;
		font-size: 16px;
	}
	@media (max-width: 1100px) {
		.knowledge-steps {
			gap: 22px;
		}
		.knowledge-step {
			padding: 18px 14px;
		}
		.knowledge-step h4 {
			font-size: 16px;
		}
		.knowledge-inputs {
			flex-direction: column;
			gap: 17px;
		}
		.knowledge-access {
			gap: 35px;
			grid-template-columns: 1fr 1.6fr;
		}
	}
	@media (max-width: 900px) {
		.knowledge-section {
			padding-block: 72px;
		}
		.knowledge-steps {
			grid-template-columns: 1fr;
			gap: 32px;
		}
		.knowledge-step {
			padding: 25px 28px;
		}
		.knowledge-step h4 {
			font-size: 20px;
			margin-bottom: 16px;
		}
		.knowledge-step > p,
		.knowledge-answer .knowledge-answer-text {
			font-size: 16px;
		}
		.knowledge-step :global(.knowledge-step-arrow) {
			top: auto;
			right: auto;
			left: calc(50% - 11px);
			bottom: -28px;
			transform: rotate(90deg);
		}
		.knowledge-person,
		.knowledge-gate-scope,
		.knowledge-found-doc,
		.knowledge-excluded,
		.knowledge-citation,
		.knowledge-answer small {
			font-size: 14px;
		}
		.knowledge-gate-scope,
		.knowledge-citation {
			margin-top: 14px;
		}
		.knowledge-step .knowledge-question-bubble {
			max-width: 420px;
		}
		.knowledge-ai-apps {
			font-size: 13px;
		}
		.knowledge-access {
			grid-template-columns: 1fr;
			gap: 26px;
		}
		.knowledge-contact {
			flex-direction: column;
			align-items: flex-start;
		}
	}
	@media (max-width: 600px) {
		.knowledge-section {
			padding-block: 60px;
		}
		.knowledge-intro {
			text-align: left;
			margin-bottom: 30px;
		}
		.knowledge-intro h2 {
			font-size: 30px;
		}
		.knowledge-intro p {
			font-size: 16px;
		}
		.knowledge-inputs {
			padding: 20px 16px;
			align-items: flex-start;
		}
		.knowledge-input-label {
			gap: 9px;
		}
		.knowledge-input-label h3 {
			font-size: 15px;
		}
		.knowledge-source-list {
			gap: 14px;
		}
		.knowledge-source-list li {
			font-size: 12px;
			gap: 6px;
		}
		.knowledge-methods {
			grid-template-columns: 1fr;
			gap: 16px;
		}
		.knowledge-method {
			padding: 24px 20px;
		}
		.knowledge-method h3 {
			font-size: 22px;
		}
		.knowledge-together {
			text-align: left;
		}
		.knowledge-flow {
			margin-top: 42px;
		}
		.knowledge-flow-heading h3 {
			font-size: 25px;
		}
		.knowledge-step {
			padding: 24px 21px;
		}
		.knowledge-permission-note {
			align-items: flex-start;
			padding: 18px;
		}
		.knowledge-permission-note :global(svg) {
			margin-top: 3px;
		}
		.knowledge-access {
			margin-top: 40px;
			padding-top: 30px;
		}
		.knowledge-access-intro h3 {
			font-size: 24px;
		}
		.knowledge-teams {
			grid-template-columns: 1fr;
			gap: 24px;
		}
		.knowledge-teams li + li {
			padding: 24px 0 0;
			border-left: 0;
			border-top: 1px solid #d6deca;
		}
		.knowledge-teams p {
			font-size: 14px;
		}
		.knowledge-contact {
			gap: 18px;
			margin-top: 32px;
		}
		.knowledge-contact .o-button {
			width: 100%;
			font-size: 15px;
			padding-inline: 14px;
		}
	}
</style>

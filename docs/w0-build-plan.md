# W0 build plan: the calm workspace

Branch `claude/wux-w0`, from live deploy47 (`64a3308`). Design source:
`output/orca-w0/` (ia.md, the mockups, shots/), approved by the owner on
2026-10-07 ("เริ่มสร้างเลย"), plus the visual review's seven fixes.

The workspace only. The backend is unchanged: no new endpoint, no changed call,
no changed permission. Every role check stays where it is.

## Approach

- **Keep the view ids.** Today's `?view=` ids stay the canonical addresses
  wherever a page keeps its content (`servers`, `members`, `workspaces`,
  `approvals`, `executions`, `audit`, `secrets`, `connect-ai`, `settings`,
  `knowledge`, `hub`, `new`). The merges are a matter of frames, tabs and
  sidebar highlight, so deep links, old bookmarks and the many internal links
  keep working with no redirect. New addresses exist only where something is
  new (`skills`, `welcome`, `history`, the catalog modal) and as aliases for the
  new names (`settings&section=team|workspaces`), each redirected by
  `appNavigation()`.
- **One page header per page.** `ui/PageHeader.svelte` stays the only H1.
  A frame (ตั้งค่า, ประวัติ, AI ของฉัน) renders its header and tab bar, and
  marks the page header as taken (`ui/page-header-context.ts`). A PageHeader
  inside it then renders only its action (and status), never a second H1.
- **Type:** h1 24 / 20 at ≤720 px, body 14, small 12.5, from one place
  (`orca-system.css`, the W0 block).

## Slices (one commit each)

| | Slice | Main files |
|---|---|---|
| a | Shell: sidebar, top bar (ไปที่… ⌘K, สร้าง ▾), สร้าง dialog, PageHeader on every page | `AppShell.svelte`, `shell/CreateDialog.svelte`, `shell/JumpDialog.svelte`, `ui/Modal.svelte`, `ui/PageTabs.svelte`, `ui/page-header-context.ts`, `orca/workspace-nav.ts`, `orca/glossary.ts`, `orca-system.css`, `TeamAccess.svelte`, `AppOverview.svelte` |
| b | Home | `WorkspaceDashboard.svelte`, `home/HomeStatus.svelte`, `home/AIReconnectBanner.svelte`, `orca/home-attention.ts` |
| c | Programs and the catalog modal; the connect flow | `ConnectionCenter.svelte`, `programs/CatalogModal.svelte`, `programs/AddProgramFlow.svelte`, `views/AddProgramView.svelte`, `orca/program-catalog.ts`, logos |
| d | Onboarding (2 screens) | `onboarding/Onboarding.svelte`, `orca/onboarding.ts`, `routes/app/+page.svelte` |
| e | ประวัติ (ตรวจสอบ + คำขอของฉัน); แอป AI ที่เชื่อม → AI ของฉัน › ทั้งบริษัท | `views/OversightView.svelte`, `views/MyAIFrame.svelte`, `views/ConnectAIView.svelte` |
| f | ตั้งค่า tabs (บริษัท · ทีม · พื้นที่ทำงาน AI · บัญชีของฉัน · ขั้นสูง) | `views/SettingsFrame.svelte`, `SettingsCenter.svelte`, `TeamView.svelte`, `orca/settings-sections.ts` |
| g | Skills behind `features.skills` | `views/SkillsView.svelte`, `services/orca-skills.ts`, `services/orca.ts` (`OrcaFeatures.skills`) |
| h | Polish: copy, tokens, logos, phone widths, screenshots | various |

`src/lib/components/orca/documents/*` (another branch) is not touched.

## Route map (old → new)

| Page | Address | Notes |
|---|---|---|
| หน้าหลัก | `/app` | unchanged |
| Onboarding 1 (role chips) | `/app?view=welcome` | shown in place of Home on first run (see Onboarding) |
| Onboarding 2 (connect programs) | `/app?view=welcome&page=2` | |
| Skills | `/app?view=skills` | only when the bootstrap has `features.skills === true`; otherwise redirects to `/app` |
| โปรแกรม (was โปรแกรมที่เชื่อม) | `/app?view=servers` | unchanged id |
| Catalog modal | `/app?view=servers&catalog=1` | old `/app?view=add-program` (no `source`) and `/app?view=catalog` redirect here |
| Connect flow | `/app?view=add-program&source=<id>` | the stepper is gone; `&step=done&connection=<id>` redirects to `/app?view=servers&connection=<id>` |
| One program | `/app?view=servers&connection=<id>` (`&tab=tools` for สิ่งที่ AI ทำได้) | unchanged |
| AI ของฉัน (was เชื่อม AI ของฉัน) | `/app?view=connect-ai` | unchanged id |
| AI ของฉัน › ทั้งบริษัท (was ตรวจสอบ › แอป AI ที่เชื่อม) | `/app?view=secrets` | unchanged id, now under AI ของฉัน (admins) |
| ประวัติ | `/app?view=history` | alias: Owners/Admins → `view=approvals`; employees → `view=executions` |
| ประวัติ › รออนุมัติ | `/app?view=approvals` | unchanged id; an employee's คำขอของฉัน |
| ประวัติ › การใช้งาน | `/app?view=executions` | unchanged id (keeps `&hub=`) |
| ประวัติ › การตั้งค่า | `/app?view=audit` | unchanged id (keeps `&hub=`) |
| ตั้งค่า › บริษัท | `/app?view=settings&section=company` | unchanged |
| ตั้งค่า › ทีม | `/app?view=members` (`&tab=invitations|departments`) | alias `/app?view=settings&section=team` redirects here |
| ตั้งค่า › พื้นที่ทำงาน AI | `/app?view=workspaces` | alias `/app?view=settings&section=workspaces` redirects here; `view=hub` and `view=new` stay as its pages |
| ตั้งค่า › บัญชีของฉัน | `/app?view=settings&section=account` | unchanged |
| ตั้งค่า › ขั้นสูง | `/app?view=settings&section=advanced` | unchanged |
| คลังความรู้ | `/app?view=knowledge` | unchanged |
| ช่วยเหลือ | `/app?view=help` | unchanged |
| Platform | `/app?org=default&view=platform&section=…` | unchanged |

Every redirect replaces the history entry and keeps `org` and `lang`, as today.

## Onboarding

- Who: an Owner or Admin (`canManage`) of a company with no connected program,
  on Home, who has not finished or skipped it. That is where today's first-run
  checklist (OwnerSetup) opened.
- Where it is remembered: browser storage only, per company and account,
  guarded with try/catch: `orca.w0.onboarding.<company>.<user>` = `done`, and the
  chosen roles and title in `orca.w0.roles.<company>.<user>` (JSON). Nothing is
  sent to the server. Without storage, it shows once per page load and ข้าม
  still works for that page.
- Force it: `/app?view=welcome` (screen 1) or `/app?view=welcome&page=2`
  (screen 2), for anyone who can manage the company. Employees are sent Home.
- No sidebar; ข้าม on screen 1 and เข้าใช้ ORCA on screen 2 mark it done.

## API calls

No new endpoint. New calls to existing endpoints:

| Where | Call | Why |
|---|---|---|
| Home and โปรแกรม (Owners/Admins) | `GET /orca/program-accounts` (`OrcaService.programAccounts`, `{ items: OrcaProgramAccount[] }`) | count programs whose company account needs reconnecting (`status: "needs_reconnect"`) for ต้องดูแล and the โปรแกรม tile |
| Programs › catalog modal, Onboarding 2 | `GET /orca/candidates` (`ProgramService.candidates`, `{ items: OrcaCandidate[] }`), as the old step 1 did | the catalog and the suggestions |
| ตั้งค่า › ทีม / พื้นที่ทำงาน AI (Owners/Admins) | `GET /orca/user-sources` (`OrcaUserSourcesService.list`, `{ items }`), once per page and company, as ตั้งค่า did | whether the ขั้นสูง tab shows |

Paths are relative to `/api`; a company other than `default` uses `/orca/orgs/<id>/…`.
Home no longer calls `GET /orca/invitations` (the "ชวนทีม" banner is cut), and
reads no library: its คลังความรู้ tile links to the page instead of a partial count. The
connect page's save is the same `ProgramService.save` call the old step 3 made,
now made right after the account works with the read-only default.
Skills: `services/orca-skills.ts` is a typed stub (`SkillsService.list(): Promise<OrcaSkill[]>`)
that returns `[]` without any request; the page and its nav item exist only when
`features.skills === true`.

## Tests

- Update copy assertions only where the copy changed by design (menu names,
  page titles, the cut setup copy).
- Keep every behaviour and permission assertion; where a page moved, assert it
  at its new home.
- New: the redirects above, Skills hidden without the flag, the สร้าง dialog's
  rows by role, onboarding (who sees it, skip, storage failure), the catalog
  modal states (เชื่อมแล้ว for admins), PageHeader nesting.

## Shell notes

- A frame's own header passes `frame` to PageHeader; any PageHeader inside the
  frame keeps only its action and status (and a hidden h2 with its title).
- W0 styles live in `src/lib/components/orca/w0.css`, loaded after
  `orca-system.css`. The primary button is ink (white in dark); citron stays on
  the active menu dot, the onboarding dots and the one highlighted link.
- Screenshots: built app served to Playwright through `page.route` (no server),
  every `/api` call mocked.

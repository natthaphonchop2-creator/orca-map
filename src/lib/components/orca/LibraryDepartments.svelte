<script lang="ts">
  import TeamLifecycleActions from "./TeamLifecycleActions.svelte";
  import { getHttpStatusCode } from "$lib/errors";
  import { t } from "$lib/orca/locale.svelte";
  import {
    OrcaService,
    orcaError,
    memberName,
    type OrcaBootstrap,
    type OrcaUnit,
  } from "$lib/services/orca";
  import {
    OrcaLibraryService,
    type LibraryDepartment,
  } from "$lib/services/orca-library";
  import {
    Check,
    Info,
    Pencil,
    Plus,
    RefreshCw,
    Save,
    Users,
  } from "@lucide/svelte";
  import { onDestroy, onMount } from "svelte";

  let {
    data,
    onchanged,
    ondirty,
    context = "knowledge",
  }: {
    data: OrcaBootstrap;
    onchanged: () => Promise<void>;
    ondirty: (dirty: boolean) => void;
    context?: "knowledge" | "team";
  } = $props();
  let showArchived = $state(false);
  let lifecycleBusy = $state(false);
  let departments = $state<LibraryDepartment[]>([]);
  let extraUnits = $state<OrcaUnit[]>([]);
  let loading = $state(false);
  let loaded = $state(false);
  let saving = $state(false);
  let error = $state("");
  let notice = $state("");
  let selectedID = $state("");
  let selectedMembers = $state<string[]>([]);
  let baselineMembers = $state<string[]>([]);
  let selectedVersion = $state(0);
  let newName = $state("");
  let renameOpen = $state(false);
  let renamedName = $state("");
  let memberQuery = $state("");
  const visibleMembers = $derived(
    data.members.filter((member) =>
      (!member.status || member.status === "active") && `${memberName(member)} ${member.email}`
        .toLowerCase()
        .includes(memberQuery.toLowerCase()),
    ),
  );
  let conflict = $state(false);
  let confirmReload = $state(false);
  const units = $derived([
    ...data.units.filter((unit) => unit.kind === "department"),
    ...extraUnits.filter(
      (unit) => !data.units.some((known) => known.id === unit.id),
    ),
  ]);
  const selectedUnit = $derived(units.find((unit) => unit.id === selectedID));
  const dirty = $derived(
    JSON.stringify([...selectedMembers].sort()) !==
      JSON.stringify([...baselineMembers].sort()),
  );
  $effect(() => ondirty(dirty || saving || lifecycleBusy || !!newName.trim() || renameOpen));
  onDestroy(() => ondirty(false));
  async function load() {
    if (!data.canManage || loading) return;
    loading = true;
    error = "";
    try {
      departments = await OrcaLibraryService.departments();
      loaded = true;
    } catch (cause) {
      error = orcaError(cause);
    } finally {
      loading = false;
    }
  }
  onMount(load);
  function choose(id: string) {
    selectedID = id;
    renameOpen = false;
    memberQuery = "";
    const department = departments.find((item) => item.unitID === id);
    selectedMembers = [...(department?.memberIDs ?? [])];
    baselineMembers = [...selectedMembers];
    selectedVersion = department?.version ?? 0;
    conflict = false;
    error = "";
    notice = "";
    confirmReload = false;
  }
  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (saving || lifecycleBusy || !data.canManage || dirty || renameOpen || !newName.trim()) return;
    saving = true;
    error = "";
    notice = "";
    try {
      const unit = await OrcaService.unit({
        name: newName.trim(),
        kind: "department",
        parentID: "",
        version: 0,
      });
      extraUnits = [...extraUnits, unit];
      newName = "";
      choose(unit.id);
      notice = t(
        "สร้างแผนกแล้ว กรุณาเลือกสมาชิกและบันทึก",
        "Department created. Select its members and save.",
      );
      await onchanged();
    } catch (cause) {
      error = orcaError(cause);
    } finally {
      saving = false;
    }
  }
  async function save() {
    if (saving || lifecycleBusy || conflict || renameOpen || !data.canManage || !selectedID || !selectedUnit || selectedUnit.archivedAt || selectedUnit.deletedAt) return;
    saving = true;
    error = "";
    notice = "";
    try {
      const department = await OrcaLibraryService.saveDepartment(
        selectedID,
        selectedMembers,
        selectedVersion,
      );
      departments = [
        ...departments.filter((item) => item.unitID !== department.unitID),
        department,
      ];
      selectedVersion = department.version;
      baselineMembers = [...selectedMembers];
      notice = t(
        "บันทึกสมาชิกของแผนกแล้ว สิทธิ์การเข้าถึงเนื้อหาจะใช้รายชื่อใหม่ตั้งแต่คำขอครั้งถัดไป",
        "Department members saved. Content access uses the updated list from the next request.",
      );
    } catch (cause) {
      conflict = getHttpStatusCode(cause) === 409;
      error = conflict
        ? t(
            "รายชื่อสมาชิกมีการเปลี่ยนแปลงแล้ว รายชื่อที่คุณเลือกยังคงอยู่ กรุณาโหลดรายชื่อล่าสุดก่อนแก้ไขอีกครั้ง",
            "The member list has changed. Your selection is preserved. Load the latest list before editing again.",
          )
        : orcaError(cause);
    } finally {
      saving = false;
    }
  }
  async function rename(event: SubmitEvent) {
    event.preventDefault();
    if (saving || lifecycleBusy || !data.canManage || !selectedUnit || selectedUnit.archivedAt || selectedUnit.deletedAt || !renamedName.trim()) return;
    saving = true;
    error = "";
    try {
      const unit = await OrcaService.unit(
        {
          name: renamedName.trim(),
          kind: "department",
          parentID: selectedUnit.parentID,
          version: selectedUnit.version,
        },
        selectedUnit.id,
      );
      await onchanged();
      extraUnits = [...extraUnits.filter((item) => item.id !== unit.id), unit];
      departments = departments.map((item) =>
        item.unitID === unit.id ? { ...item, name: unit.name } : item,
      );
      renameOpen = false;
      notice = t("บันทึกชื่อแผนกแล้ว", "Department renamed");
    } catch (cause) {
      error = orcaError(cause);
    } finally {
      saving = false;
    }
  }
  async function reloadSelection() {
    await load();
    if (!error) choose(selectedID);
  }
</script>

<section
  class="library-departments"
  aria-label={t("สมาชิกของแผนก", "Department membership")}
>
  <header class="library-panel-head">
    <span class="library-symbol" aria-hidden="true"><Users size={18} /></span>
    <div class="library-panel-copy">
      <h2>
        {context === "team"
          ? t("แผนกและสมาชิก", "Departments and members")
          : t("แบ่งปันความรู้ตามแผนก", "Share knowledge by department")}
      </h2>
      <p>
        {t(
          "สร้างแผนกตามโครงสร้างองค์กร และกำหนดสมาชิกของแต่ละแผนก",
          "Create departments that match your organization and assign members to each one.",
        )}
      </p>
    </div>
  </header>
  <p class="library-note">
    <Info size={16} />{t(
      "แผนกใช้กำหนดกลุ่มผู้เข้าถึงเนื้อหา ผู้ใช้ยังต้องเป็นสมาชิกของพื้นที่ทำงาน AI นั้นจึงจะอ่านเนื้อหาได้",
      "Departments define who can receive content. A person must also be a member of the AI workspace to read it.",
    )}
  </p>
  {#if error}<div class="library-alert" role="alert">
      <Info size={16} />
      <div>
        <p>{error}</p>
        {#if conflict}<button
            class="k-button small"
            onclick={() => (confirmReload = true)}
            >{t("โหลดรายชื่อล่าสุด", "Load latest list")}</button
          >{:else if !loaded}<button
            class="k-button small"
            disabled={loading}
            onclick={load}
            ><RefreshCw size={16} />{t("ลองอีกครั้ง", "Try again")}</button
          >{/if}
      </div>
    </div>{/if}
  {#if notice}<p class="library-notice" role="status">
      <Check size={16} />{notice}
    </p>{/if}
  {#if loading && !loaded}<p class="library-loading" role="status">
      {t("กำลังโหลดแผนก…", "Loading departments…")}
    </p>{:else if loaded}
    <div class="library-department-grid">
      <aside class="library-department-list">
        <h3>{t("แผนกในองค์กร", "Departments")}</h3>
        <div class="library-segmented"><button class:chosen={!showArchived} aria-pressed={!showArchived} disabled={dirty || saving || lifecycleBusy || renameOpen} onclick={() => {showArchived=false;selectedID='';}}>{t('เปิดใช้งาน','Active')}</button><button class:chosen={showArchived} aria-pressed={showArchived} disabled={dirty || saving || lifecycleBusy || renameOpen} onclick={() => {showArchived=true;selectedID='';}}>{t('จัดเก็บแล้ว','Archived')}</button></div>
        {#each units.filter((unit) => !unit.deletedAt && !!unit.archivedAt === showArchived) as unit}<button
            class:chosen={selectedID === unit.id}
            disabled={saving || lifecycleBusy || renameOpen || (dirty && selectedID !== unit.id)}
            onclick={() => choose(unit.id)}
            ><span>{unit.name}</span><small
              >{departments.find((item) => item.unitID === unit.id)?.memberIDs
                .length ?? 0}
              {t("คน", "members")}</small
            ></button
          >{:else}<p class="library-hint">
            {showArchived
              ? t("ไม่มีแผนกที่จัดเก็บแล้ว", "No archived departments")
              : t(
                  "ยังไม่มีแผนก เพิ่มแผนกได้จากแบบฟอร์มด้านล่าง",
                  "No departments yet. Add one using the form below.",
                )}
          </p>{/each}
        <form onsubmit={create} class="library-create-department">
          <label for="new-department">{t("เพิ่มแผนก", "Add department")}</label
          ><input
            id="new-department"
            bind:value={newName}
            required
            maxlength="100"
            disabled={saving || lifecycleBusy || dirty || renameOpen}
            placeholder={t("เช่น แผนกต้อนรับ", "e.g. Front office")}
          /><button
            type="submit"
            class="k-button small"
            disabled={saving || lifecycleBusy || dirty || renameOpen || !newName.trim()}
            ><Plus size={16} />{t("เพิ่มแผนก", "Add department")}</button
          >
        </form>
      </aside>
      <div class="library-department-members">
        {#if selectedUnit}<div class="library-section-heading">
            <div>
              <h3>{selectedUnit.name}</h3>
              <p>
                {selectedMembers.length}
                {t("คนที่เลือก", "members selected")}
              </p>
            </div>
            <button
              class="k-button small"
              disabled={saving || lifecycleBusy || dirty || renameOpen || !!selectedUnit.archivedAt}
              onclick={() => {
                renamedName = selectedUnit?.name ?? "";
                renameOpen = true;
              }}><Pencil size={16} />{t("แก้ไขชื่อแผนก", "Rename department")}</button
            >
          </div>
          <TeamLifecycleActions kind="department" id={selectedUnit.id} name={selectedUnit.name} version={selectedUnit.version} inactive={!!selectedUnit.archivedAt} disabled={!data.canManage || saving || dirty || renameOpen} onbusy={(value) => lifecycleBusy=value} onchanged={async () => {extraUnits=[];selectedID='';selectedMembers=[];baselineMembers=[];await onchanged();await load();}} />
          {#if selectedUnit.archivedAt}<p class="library-note">{t('แผนกนี้ถูกจัดเก็บแล้ว กรุณากู้คืนแผนกก่อนกำหนดสมาชิกอีกครั้ง', 'This department is archived. Restore it to assign members again.')}</p>{:else}
          {#if renameOpen}<form class="department-rename" onsubmit={rename}>
              <div class="k-field">
                <label for="department-rename"
                  >{t("ชื่อแผนก", "Department name")}</label
                ><input
                  id="department-rename"
                  bind:value={renamedName}
                  maxlength="100"
                  required
                  disabled={saving}
                />
              </div>
              <div class="library-actions">
                <button
                  class="k-button primary small"
                  disabled={saving || !renamedName.trim()}
                  type="submit">{t("บันทึกชื่อ", "Save name")}</button
                ><button
                  type="button"
                  class="k-button small"
                  disabled={saving}
                  onclick={() => (renameOpen = false)}
                  >{t("ยกเลิก", "Cancel")}</button
                >
              </div>
            </form>{/if}
          <div class="k-field department-search">
            <label for="department-member-search"
              >{t("ค้นหาสมาชิก", "Search members")}</label
            ><input
              id="department-member-search"
              type="search"
              bind:value={memberQuery}
              placeholder={t("ชื่อหรืออีเมล", "Name or email")}
            />
          </div>
          <div class="library-choices">
            {#each visibleMembers as member}<label class="library-choice"
                ><input
                  type="checkbox"
                  disabled={saving || lifecycleBusy || conflict || renameOpen}
                  checked={selectedMembers.includes(member.id)}
                  onchange={(event) =>
                    (selectedMembers = event.currentTarget.checked
                      ? [...selectedMembers, member.id]
                      : selectedMembers.filter((id) => id !== member.id))}
                /><span
                  ><strong>{memberName(member)}</strong>{#if memberName(member) !== member.email}<small
                    >{member.email}</small
                  >{/if}</span
                ></label
              >{/each}
          </div>
          {#if confirmReload}<div class="library-alert" role="alert">
              <Info size={16} />
              <div>
                <p>
                  {t(
                    "ต้องการแทนที่รายชื่อที่เลือกไว้ด้วยรายชื่อล่าสุดที่บันทึกไว้หรือไม่",
                    "Replace your selection with the latest saved list?",
                  )}
                </p>
                <div class="library-actions">
                  <button
                    class="k-button small"
                    disabled={loading}
                    onclick={() => (confirmReload = false)}
                    >{t("เก็บรายชื่อที่เลือกไว้", "Keep selection")}</button
                  ><button
                    class="k-button small"
                    disabled={loading}
                    onclick={reloadSelection}
                    >{t("โหลดรายชื่อล่าสุด", "Load latest list")}</button
                  >
                </div>
              </div>
            </div>{/if}
          <div class="library-editor-footer">
            <span
              >{dirty
                ? t(
                    "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก",
                    "Unsaved changes",
                  )
                : t(
                    "สมาชิกของแผนกนี้",
                    "Members of this department",
                  )}</span
            >
            <div class="library-actions">
              {#if dirty}<button
                  class="k-button"
                  disabled={saving}
                  onclick={() => choose(selectedID)}
                  >{t("ยกเลิกการแก้ไข", "Discard changes")}</button
                >{/if}<button
                class="k-button primary"
                disabled={saving || lifecycleBusy || conflict || renameOpen || !dirty}
                onclick={save}
                ><Save size={16} />{saving
                  ? t("กำลังบันทึก…", "Saving…")
                  : t("บันทึกสมาชิก", "Save members")}</button
              >
            </div>
          </div>
          {/if}
        {:else}<div class="library-empty compact">
            <Users size={28} aria-hidden="true" />
            <h3>{t("เลือกแผนกเพื่อกำหนดสมาชิก", "Select a department to manage its members")}</h3>
            <p>
              {t(
                "เพิ่มหรือนำสมาชิกออกให้ตรงกับโครงสร้างขององค์กร",
                "Add or remove members to match your organization.",
              )}
            </p>
          </div>{/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .department-search {
    margin-block: 16px 12px;
  }
  .department-rename {
    display: grid;
    gap: 12px;
    margin: 12px 0 4px;
    padding: 16px;
    border: 1px solid var(--orca-line);
    border-radius: var(--orca-radius);
    background: var(--orca-surface);
  }
</style>

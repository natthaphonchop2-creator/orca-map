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
        "สร้างแผนกแล้ว เลือกสมาชิกแล้วบันทึกได้เลย",
        "Department created. Choose its members and save.",
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
        "บันทึกสมาชิกแผนกแล้ว สิทธิ์เนื้อหาจะใช้รายชื่อใหม่ในการเรียกครั้งถัดไป",
        "Department saved. The next content request uses the updated membership.",
      );
    } catch (cause) {
      conflict = getHttpStatusCode(cause) === 409;
      error = conflict
        ? t(
            "มีการเปลี่ยนรายชื่อสมาชิกแล้ว กรุณาโหลดรายชื่อล่าสุดก่อนแก้ไขอีกครั้ง รายชื่อที่คุณเลือกยังอยู่",
            "Membership changed elsewhere. Your selection is preserved; load the latest list before editing again.",
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
  aria-label={t("จัดสมาชิกแผนก", "Department membership")}
>
  <div class="library-section-heading">
    <div>
      <h2>
        {context === "team"
          ? t("จัดแผนกและสมาชิก", "Manage departments and members")
          : t("แบ่งปันความรู้ให้ทั้งแผนก", "Share knowledge with a department")}
      </h2>
      <p>
        {t(
          "สร้างแผนกตามโครงสร้างองค์กร แล้วเลือกสมาชิกที่อยู่ในแต่ละแผนก",
          "Create departments for your organization and choose the people in each one.",
        )}
      </p>
    </div>
    <Users size={25} />
  </div>
  <p class="library-note">
    <Info size={18} />{t(
      "แผนกใช้กำหนดผู้รับเนื้อหา ทุกคนยังต้องเป็นสมาชิกในพื้นที่ทำงานนั้นด้วย จึงจะอ่านได้",
      "Departments identify an audience. A person still needs membership in the workspace to read its content.",
    )}
  </p>
  {#if error}<div class="library-alert" role="alert">
      <Info size={18} />
      <div>
        <p>{error}</p>
        {#if conflict}<button
            class="k-button"
            onclick={() => (confirmReload = true)}
            >{t("โหลดรายชื่อฉบับล่าสุด", "Load latest membership")}</button
          >{:else if !loaded}<button
            class="k-button"
            disabled={loading}
            onclick={load}
            ><RefreshCw size={16} />{t("ลองอีกครั้ง", "Try again")}</button
          >{/if}
      </div>
    </div>{/if}
  {#if notice}<p class="library-notice" role="status">
      <Check size={18} />{notice}
    </p>{/if}
  {#if loading && !loaded}<p class="library-loading" role="status">
      {t("กำลังโหลดแผนก…", "Loading departments…")}
    </p>{:else if loaded}
    <div class="library-department-grid">
      <aside class="library-department-list">
        <h3>{t("แผนกในองค์กร", "Departments")}</h3>
        <div class="library-actions"><button class:chosen={!showArchived} disabled={dirty || saving || lifecycleBusy || renameOpen} onclick={() => {showArchived=false;selectedID='';}}>{t('ใช้งานอยู่','Current')}</button><button class:chosen={showArchived} disabled={dirty || saving || lifecycleBusy || renameOpen} onclick={() => {showArchived=true;selectedID='';}}>{t('จัดเก็บแล้ว','Archived')}</button></div>
        {#each units.filter((unit) => !unit.deletedAt && !!unit.archivedAt === showArchived) as unit}<button
            class:chosen={selectedID === unit.id}
            disabled={saving || lifecycleBusy || renameOpen || (dirty && selectedID !== unit.id)}
            onclick={() => choose(unit.id)}
            ><span>{unit.name}</span><small
              >{departments.find((item) => item.unitID === unit.id)?.memberIDs
                .length ?? 0}
              {t("คน", "people")}</small
            ></button
          >{:else}<p class="library-hint">
            {showArchived
              ? t("ไม่มีแผนกที่จัดเก็บ", "No archived departments")
              : t(
                  "ยังไม่มีแผนก เริ่มเพิ่มแผนกแรกได้ด้านล่าง",
                  "No departments yet. Add the first one below.",
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
            class="k-button"
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
                {t("คนที่เลือก", "people selected")}
              </p>
            </div>
            <button
              class="k-button quiet small"
              disabled={saving || lifecycleBusy || dirty || renameOpen || !!selectedUnit.archivedAt}
              onclick={() => {
                renamedName = selectedUnit?.name ?? "";
                renameOpen = true;
              }}><Pencil size={15} />{t("แก้ชื่อแผนก", "Rename")}</button
            >
          </div>
          <TeamLifecycleActions kind="department" id={selectedUnit.id} name={selectedUnit.name} version={selectedUnit.version} inactive={!!selectedUnit.archivedAt} disabled={!data.canManage || saving || dirty || renameOpen} onbusy={(value) => lifecycleBusy=value} onchanged={async () => {extraUnits=[];selectedID='';selectedMembers=[];baselineMembers=[];await onchanged();await load();}} />
          {#if selectedUnit.archivedAt}<p class="library-note">{t('แผนกนี้จัดเก็บแล้ว กู้คืนเพื่อกำหนดสมาชิกใหม่', 'This department is archived. Restore it to assign members again.')}</p>{:else}
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
                  class="k-button primary"
                  disabled={saving || !renamedName.trim()}
                  type="submit">{t("บันทึกชื่อ", "Save name")}</button
                ><button
                  type="button"
                  class="k-button"
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
                  ><strong>{memberName(member)}</strong><small
                    >{member.email}</small
                  ></span
                ></label
              >{/each}
          </div>
          {#if confirmReload}<div class="library-alert" role="alert">
              <p>
                {t(
                  "โหลดรายชื่อที่บันทึกไว้แทนรายชื่อที่คุณเลือกอยู่หรือไม่?",
                  "Replace your selection with the latest saved membership?",
                )}
              </p>
              <div class="library-actions">
                <button
                  class="k-button"
                  disabled={loading}
                  onclick={() => (confirmReload = false)}
                  >{t("เก็บที่เลือกไว้", "Keep selection")}</button
                ><button
                  class="k-button"
                  disabled={loading}
                  onclick={reloadSelection}
                  >{t("โหลดรายชื่อใหม่", "Load latest")}</button
                >
              </div>
            </div>{/if}
          <div class="library-editor-footer">
            <span
              >{dirty
                ? t(
                    "มีการเปลี่ยนแปลงที่ยังไม่บันทึก",
                    "Unsaved membership changes",
                  )
                : t(
                    "รายชื่อสมาชิกของแผนกนี้",
                    "Membership of this department",
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
                ><Save size={17} />{saving
                  ? t("กำลังบันทึก…", "Saving…")
                  : t("บันทึกสมาชิก", "Save membership")}</button
              >
            </div>
          </div>
          {/if}
        {:else}<div class="library-empty compact">
            <Users size={30} />
            <h3>{t("เลือกแผนกเพื่อจัดสมาชิก", "Select a department")}</h3>
            <p>
              {t(
                "เพิ่มหรือนำสมาชิกออกได้ตามการทำงานขององค์กร",
                "Add or remove people as your organization changes.",
              )}
            </p>
          </div>{/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .department-search {
    margin-block: 15px;
  }
  .department-rename {
    display: grid;
    gap: 12px;
    padding: 16px;
    margin-bottom: 18px;
    border: 1px solid #dfe6d5;
    border-radius: 12px;
    background: #f7f9f3;
  }
</style>

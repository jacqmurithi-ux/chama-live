/* =========================================================
   CHAMA LIVE — FINES FEATURE
   CANDIDATE FRONTEND INTEGRATION
   ---------------------------------------------------------
   • Manual member fines are created only through the
     canonical create_manual_member_fine() RPC.
   • Fine types are created only through cl_fine_create_rule().
   • Fine balances come from cl_fine_balance().
   • Browser never INSERTs/UPDATEs/DELETEs accounting tables.
   • Contribution-generated fines and manual fines remain
     visibly distinguishable.
========================================================= */

import { supabase } from "./supabase.js";
import { getMyGroup, getMyMember } from "./auth.js";
import { finesApi } from "./api/fines.js";

const OFFICER_ROLES = new Set([
  "chairperson",
  "treasurer",
  "secretary"
]);

const money = value =>
  `KSh ${Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const esc = value =>
  String(value ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[c]));

const date = value =>
  value
    ? new Date(value).toLocaleDateString("en-KE", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      })
    : "—";

const roleName = role =>
  String(role || "").trim().toLowerCase();

let state = {
  groupId: null,
  member: null,
  group: null,
  members: [],
  rules: [],
  fines: [],
  balances: new Map(),
  initialized: false,
  loading: false
};

function el(id) {
  return document.getElementById(id);
}

function showMessage(text, type = "info") {
  const message = el("fineMessage");
  if (!message) return;
  message.textContent = text;
  message.className = `fine-message visible ${type}`;
}

function clearMessage() {
  const message = el("fineMessage");
  if (!message) return;
  message.textContent = "";
  message.className = "fine-message";
}

function memberDisplay(member) {
  return member?.name ||
    member?.full_name ||
    member?.member_name ||
    member?.member_number ||
    "Unnamed member";
}

function ruleForFine(fine) {
  return state.rules.find(
    rule => String(rule.id) === String(fine.rule_id)
  ) || null;
}

function balanceForFine(fine) {
  return state.balances.get(String(fine.id)) || {
    outstanding_amount: Number(fine.calculated_amount || 0),
    allocated_amount: 0,
    status: "OUTSTANDING"
  };
}

function fineSource(fine) {
  const source = String(
    fine.source_type ||
    (fine.trigger_type === "manual_member_fine"
      ? "MANUAL_MEMBER_FINE"
      : "CONTRIBUTION")
  ).toUpperCase();

  return source === "MANUAL_MEMBER_FINE"
    ? "MANUAL"
    : "CONTRIBUTION";
}

function fineType(fine) {
  return fine.fine_type ||
    ruleForFine(fine)?.name ||
    (fineSource(fine) === "MANUAL" ? "Manual fine" : "Contribution fine");
}

function fineReason(fine) {
  return fine.reason ||
    (fineSource(fine) === "CONTRIBUTION"
      ? "Contribution-related fine"
      : "Manual fine");
}

function setFormAvailability() {
  const role = roleName(state.member?.role);
  const allowed = OFFICER_ROLES.has(role);

  const form = el("manualFineForm");
  const typeForm = el("fineTypeForm");

  [form, typeForm].forEach(container => {
    if (container) {
      container.hidden = !allowed;
    }
  });

  const note = el("fineOfficerNote");
  if (note) {
    note.textContent = allowed
      ? "You are authorised to apply and configure member fines."
      : "Only authorised group officers can apply or configure fines.";
  }
}

async function loadContext() {
  state.group = await getMyGroup();
  state.groupId = state.group?.id || state.group?.group_id || null;
  state.member = await getMyMember();

  if (!state.groupId) {
    throw new Error("Group context could not be resolved.");
  }
}

async function loadMembers() {
  const { data, error } = await supabase
    .from("members")
    .select("id,name,full_name,member_number,status,onboarding_status")
    .eq("group_id", state.groupId)
    .order("name", { ascending: true });

  if (error) throw error;

  state.members = (data || []).filter(member => {
    const status = String(member.status || "active").toLowerCase();
    const onboarding = String(
      member.onboarding_status || "active"
    ).toLowerCase();

    return status === "active" && onboarding === "active";
  });

  const select = el("manualFineMember");
  if (!select) return;

  const previous = select.value;

  select.innerHTML =
    '<option value="">Select member</option>' +
    state.members.map(member =>
      `<option value="${esc(member.id)}">${esc(memberDisplay(member))}</option>`
    ).join("");

  if (
    previous &&
    state.members.some(member => String(member.id) === String(previous))
  ) {
    select.value = previous;
  }
}

async function loadFineTypes() {
  const { data, error } = await supabase
    .from("fine_rules")
    .select(
      "id,name,description,trigger_type,calculation_method,fixed_amount,percentage_rate,grace_period_value,grace_period_unit,effective_from,effective_until,status,created_at"
    )
    .eq("group_id", state.groupId)
    .eq("trigger_type", "custom_event")
    .order("created_at", { ascending: false });

  if (error) throw error;

  state.rules = data || [];

  const select = el("manualFineType");
  if (select) {
    const active = state.rules.filter(
      rule => String(rule.status || "").toLowerCase() === "active"
    );

    select.innerHTML =
      '<option value="">Select fine type</option>' +
      active.map(rule =>
        `<option value="${esc(rule.id)}">${esc(rule.name)}</option>`
      ).join("");
  }

  renderFineTypes();
}

async function loadFineLedger() {
  const { data, error } = await supabase
    .from("fines")
    .select(
      "id,group_id,member_id,rule_id,trigger_type,trigger_id,accounting_month,original_amount,calculated_amount,triggered_at,source_type,fine_type,reason,imposed_by,imposed_at"
    )
    .eq("group_id", state.groupId)
    .order("triggered_at", { ascending: false });

  if (error) throw error;

  state.fines = data || [];
  state.balances = new Map();

  await Promise.all(
    state.fines.map(async fine => {
      const { data: balanceData, error: balanceError } =
        await finesApi.getFineBalance(fine.id);

      if (balanceError) throw balanceError;

      const row = Array.isArray(balanceData)
        ? balanceData[0]
        : balanceData;

      if (row) {
        state.balances.set(String(fine.id), row);
      }
    })
  );
}

function populateFilters() {
  const month = el("accountingMonth");
  const member = el("fineMember");

  if (month) {
    const current = month.value;
    const months = [
      ...new Set(
        state.fines
          .map(fine => fine.accounting_month)
          .filter(Boolean)
      )
    ].sort().reverse();

    month.innerHTML =
      '<option value="">All months</option>' +
      months.map(value =>
        `<option value="${esc(value)}">${esc(value)}</option>`
      ).join("");

    month.value = current;
  }

  if (member) {
    const current = member.value;
    member.innerHTML =
      '<option value="">All members</option>' +
      state.members.map(item =>
        `<option value="${esc(item.id)}">${esc(memberDisplay(item))}</option>`
      ).join("");
    member.value = current;
  }
}

function filteredFines() {
  const month = el("accountingMonth")?.value || "";
  const member = el("fineMember")?.value || "";

  return state.fines.filter(fine =>
    (!month || fine.accounting_month === month) &&
    (!member || String(fine.member_id) === String(member))
  );
}

function renderSummary() {
  const fines = filteredFines();

  let total = 0;
  let outstanding = 0;
  let allocated = 0;
  let manual = 0;
  let contribution = 0;

  for (const fine of fines) {
    const balance = balanceForFine(fine);
    total += Number(fine.original_amount ?? fine.calculated_amount ?? 0);
    outstanding += Number(balance.outstanding_amount || 0);
    allocated += Number(balance.allocated_amount || 0);

    if (fineSource(fine) === "MANUAL") {
      manual += 1;
    } else {
      contribution += 1;
    }
  }

  el("totalFineAmount")?.replaceChildren(
    document.createTextNode(money(total))
  );
  el("outstandingFineAmount")?.replaceChildren(
    document.createTextNode(money(outstanding))
  );
  el("allocatedFineAmount")?.replaceChildren(
    document.createTextNode(money(allocated))
  );
  el("fineRecordCount")?.replaceChildren(
    document.createTextNode(String(fines.length))
  );
  el("manualFineCount")?.replaceChildren(
    document.createTextNode(String(manual))
  );
  el("contributionFineCount")?.replaceChildren(
    document.createTextNode(String(contribution))
  );

  return { total, outstanding, allocated };
}

function renderFineLedger() {
  const rows = el("fineRows");
  const mobile = el("fineMobileList");
  if (!rows || !mobile) return;

  const fines = filteredFines();

  if (!fines.length) {
    rows.innerHTML =
      '<tr><td colspan="9" class="fine-empty">No fine ledger records found.</td></tr>';
    mobile.innerHTML =
      '<div class="fine-empty">No fine ledger records found.</div>';
    return;
  }

  rows.innerHTML = fines.map(fine => {
    const balance = balanceForFine(fine);
    const source = fineSource(fine);
    const member = state.members.find(
      item => String(item.id) === String(fine.member_id)
    );

    return `
      <tr>
        <td><strong>${esc(memberDisplay(member))}</strong></td>
        <td><span class="fine-status ${source === "MANUAL" ? "manual" : "automatic"}">${source === "MANUAL" ? "Manual" : "Automatic"}</span></td>
        <td>${esc(fineType(fine))}</td>
        <td>${esc(fineReason(fine))}</td>
        <td class="amount">${money(fine.calculated_amount ?? fine.original_amount)}</td>
        <td class="amount">${money(balance.allocated_amount)}</td>
        <td class="amount">${money(balance.outstanding_amount)}</td>
        <td><span class="fine-status ${String(balance.status || "").toLowerCase().includes("paid") || String(balance.status || "").toLowerCase() === "waived" ? "settled" : "outstanding"}">${esc(String(balance.status || "OUTSTANDING").replaceAll("_", " "))}</span></td>
        <td>${esc(date(fine.imposed_at || fine.triggered_at))}</td>
      </tr>
    `;
  }).join("");

  mobile.innerHTML = fines.map(fine => {
    const balance = balanceForFine(fine);
    const source = fineSource(fine);
    const member = state.members.find(
      item => String(item.id) === String(fine.member_id)
    );

    return `
      <div class="fine-mobile-item">
        <div class="fine-mobile-top">
          <strong class="fine-mobile-name">${esc(memberDisplay(member))}</strong>
          <span class="fine-status ${balance.outstanding_amount > 0 ? "outstanding" : "settled"}">${esc(String(balance.status || "OUTSTANDING").replaceAll("_", " "))}</span>
        </div>
        <div class="fine-mobile-grid">
          <div><span class="fine-mobile-label">Source</span><span class="fine-mobile-value">${source === "MANUAL" ? "Manual" : "Automatic"}</span></div>
          <div><span class="fine-mobile-label">Fine type</span><span class="fine-mobile-value">${esc(fineType(fine))}</span></div>
          <div><span class="fine-mobile-label">Reason</span><span class="fine-mobile-value">${esc(fineReason(fine))}</span></div>
          <div><span class="fine-mobile-label">Amount</span><span class="fine-mobile-value">${money(fine.calculated_amount ?? fine.original_amount)}</span></div>
          <div><span class="fine-mobile-label">Allocated</span><span class="fine-mobile-value">${money(balance.allocated_amount)}</span></div>
          <div><span class="fine-mobile-label">Outstanding</span><span class="fine-mobile-value">${money(balance.outstanding_amount)}</span></div>
          <div><span class="fine-mobile-label">Date</span><span class="fine-mobile-value">${esc(date(fine.imposed_at || fine.triggered_at))}</span></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderFineTypes() {
  const body = el("fineRuleRows");
  if (!body) return;

  const rules = state.rules.filter(
    rule => String(rule.trigger_type || "").toLowerCase() === "custom_event"
  );

  if (!rules.length) {
    body.innerHTML =
      '<tr><td colspan="7" class="fine-empty">No manual fine types configured.</td></tr>';
    return;
  }

  body.innerHTML = rules.map(rule => `
    <tr>
      <td><strong>${esc(rule.name)}</strong></td>
      <td>${esc(rule.description || "—")}</td>
      <td>${esc(rule.calculation_method || "FIXED")}${rule.fixed_amount != null ? ` — ${money(rule.fixed_amount)}` : ""}</td>
      <td>${esc(rule.grace_period_value ?? 0)} ${esc(rule.grace_period_unit || "DAY")}</td>
      <td>${esc(date(rule.effective_from))}</td>
      <td><span class="fine-status ${String(rule.status || "").toLowerCase() === "active" ? "active" : "inactive"}">${esc(rule.status || "—")}</span></td>
      <td>${esc(rule.created_at ? date(rule.created_at) : "—")}</td>
    </tr>
  `).join("");
}

async function createFineType(event) {
  event.preventDefault();

  const name = el("fineTypeName")?.value.trim();
  const description = el("fineTypeDescription")?.value.trim() || null;
  const amount = Number(el("fineTypeAmount")?.value);

  if (!name) throw new Error("Fine type name is required.");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Fine type amount must be greater than zero.");
  }

  const button = el("createFineTypeButton");
  if (button) {
    button.disabled = true;
    button.textContent = "Saving…";
  }

  try {
    const { data, error } = await finesApi.createFineType({
      p_group_id: state.groupId,
      p_name: name,
      p_description: description,
      p_trigger_type: "custom_event",
      p_specificity_level: 1,
      p_priority: 100,
      p_calculation_method: "FIXED",
      p_fixed_amount: amount,
      p_percentage_rate: null,
      p_minimum_amount: null,
      p_maximum_amount: null,
      p_grace_period_value: 0,
      p_grace_period_unit: "DAY",
      p_applicability_mode: "ALL_MEETINGS",
      p_effective_from: new Date().toISOString(),
      p_effective_until: null,
      p_contribution_type_ids: []
    });

    if (error) throw error;

    el("fineTypeForm")?.reset();
    await loadFineTypes();
    showMessage(
      `Fine type "${name}" is now available for authorised member fines.`,
      "success"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Add fine type";
    }
  }
}

async function createManualFine(event) {
  event.preventDefault();

  const memberId = el("manualFineMember")?.value;
  const ruleId = el("manualFineType")?.value;
  const amount = Number(el("manualFineAmount")?.value);
  const reason = el("manualFineReason")?.value.trim();
  const dateInput = el("manualFineDate")?.value;

  if (!memberId) throw new Error("Select a member.");
  if (!ruleId) throw new Error("Select a fine type.");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Fine amount must be greater than zero.");
  }
  if (!reason) throw new Error("A reason is required.");

  const imposedAt = dateInput
    ? new Date(`${dateInput}T12:00:00`).toISOString()
    : new Date().toISOString();

  const triggerId = crypto.randomUUID();

  const button = el("applyManualFineButton");
  if (button) {
    button.disabled = true;
    button.textContent = "Applying…";
  }

  try {
    const { data, error } = await finesApi.createManualFine({
      p_group_id: state.groupId,
      p_member_id: memberId,
      p_rule_id: ruleId,
      p_amount: amount,
      p_reason: reason,
      p_trigger_id: triggerId,
      p_imposed_at: imposedAt
    });

    if (error) throw error;

    const fineId = Array.isArray(data) ? data[0] : data;

    el("manualFineForm")?.reset();

    await refresh();

    showMessage(
      `Fine applied successfully. Fine ID: ${fineId || "recorded"}.`,
      "success"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Apply fine";
    }
  }
}

function bindEvents() {
  el("accountingMonth")?.addEventListener("change", renderAll);
  el("fineMember")?.addEventListener("change", renderAll);
  el("clearFineFilters")?.addEventListener("click", () => {
    if (el("accountingMonth")) el("accountingMonth").value = "";
    if (el("fineMember")) el("fineMember").value = "";
    renderAll();
  });

  el("refreshFines")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Refreshing…";
    try {
      await refresh();
      showMessage("Fine ledger refreshed.", "success");
    } catch (error) {
      console.error("CHAMA LIVE fines refresh:", error);
      showMessage(error?.message || "Unable to refresh fines.", "error");
    } finally {
      button.disabled = false;
      button.textContent = "Refresh";
    }
  });

  el("manualFineForm")?.addEventListener("submit", async event => {
    clearMessage();
    try {
      await createManualFine(event);
    } catch (error) {
      console.error("CHAMA LIVE manual fine:", error);
      showMessage(error?.message || "Unable to apply fine.", "error");
    }
  });

  el("fineTypeForm")?.addEventListener("submit", async event => {
    clearMessage();
    try {
      await createFineType(event);
    } catch (error) {
      console.error("CHAMA LIVE fine type:", error);
      showMessage(error?.message || "Unable to create fine type.", "error");
    }
  });
}

function renderAll() {
  populateFilters();
  renderSummary();
  renderFineLedger();
  renderFineTypes();
}

async function refresh() {
  if (state.loading) return;
  state.loading = true;

  try {
    await Promise.all([
      loadMembers(),
      loadFineTypes()
    ]);

    await loadFineLedger();
    renderAll();
  } finally {
    state.loading = false;
  }
}

export async function initFines() {
  if (state.initialized) return;

  state.initialized = true;

  try {
    await loadContext();
    setFormAvailability();
    bindEvents();
    await refresh();

    showMessage(
      "Fine ledger loaded from authoritative records.",
      "success"
    );
  } catch (error) {
    console.error("CHAMA LIVE fines:", error);
    showMessage(
      error?.message || "Unable to load the fine ledger.",
      "error"
    );
  }
}

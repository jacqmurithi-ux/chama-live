/* =========================================================
   CHAMA LIVE — FINE MANAGEMENT
   CANDIDATE UNIFIED FINE LIFECYCLE
   ---------------------------------------------------------
   • Manual fines -> create_manual_member_fine()
   • Fine types -> cl_fine_create_rule()
   • Adjustments -> cl_fine_adjust()
   • Waivers -> cl_fine_waive()
   • Payment allocation -> cl_fine_allocate_payment()
   • Balances -> cl_fine_balance()
   • Frontend never writes fine/accounting tables directly.
   • Every mutation is followed by an authoritative reload.
========================================================= */

import { supabase } from "./supabase.js";
import { getMyGroup, getMyMember } from "./auth.js";
import { finesApi } from "./api/fines.js";

const MANUAL_FINE_ROLES = new Set([
  "treasurer",
  "secretary",
  "vice secretary"
]);

const CORRECTION_ROLES = new Set([
  "treasurer"
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

const formatDate = value => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : parsed.toLocaleDateString("en-KE", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
};

const formatDateTime = value => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : parsed.toLocaleString("en-KE", {
        dateStyle: "medium",
        timeStyle: "short"
      });
};

const roleName = role =>
  String(role || "").trim().toLowerCase();

const byId = id => document.getElementById(id);

let state = {
  groupId: null,
  group: null,
  member: null,
  members: [],
  rules: [],
  fines: [],
  balances: new Map(),
  payments: [],
  selectedFine: null,
  initialized: false,
  loading: false
};

function showMessage(message, type = "info") {
  const node = byId("fineMessage");
  if (!node) return;
  node.textContent = message;
  node.className = `fine-message visible ${type}`;
}

function clearMessage() {
  const node = byId("fineMessage");
  if (!node) return;
  node.textContent = "";
  node.className = "fine-message";
}

function memberDisplay(member) {
  return member?.name ||
    member?.full_name ||
    member?.member_name ||
    member?.member_number ||
    "Unnamed member";
}

function getRule(fine) {
  return state.rules.find(
    rule => String(rule.id) === String(fine.rule_id)
  ) || null;
}

function getBalance(fine) {
  return state.balances.get(String(fine.id)) || {
    outstanding_amount: Number(
      fine.calculated_amount ?? fine.original_amount ?? 0
    ),
    allocated_amount: 0,
    status: "OUTSTANDING"
  };
}

function sourceFor(fine) {
  const value = String(
    fine.source_type ||
    (fine.trigger_type === "manual_member_fine"
      ? "MANUAL_MEMBER_FINE"
      : "CONTRIBUTION")
  ).toUpperCase();

  return value === "MANUAL_MEMBER_FINE" ? "MANUAL" : "CONTRIBUTION";
}

function typeFor(fine) {
  return fine.fine_type ||
    getRule(fine)?.name ||
    (sourceFor(fine) === "MANUAL"
      ? "Manual fine"
      : "Contribution fine");
}

function reasonFor(fine) {
  return fine.reason ||
    (sourceFor(fine) === "MANUAL"
      ? "Manual fine"
      : "Contribution-related fine");
}

function isFineSettled(fine) {
  const balance = getBalance(fine);
  const status = String(balance.status || "").toLowerCase();
  return Number(balance.outstanding_amount || 0) <= 0 ||
    status === "paid" ||
    status === "settled" ||
    status === "waived";
}

function canManageManualFines() {
  return MANUAL_FINE_ROLES.has(
    roleName(state.member?.role)
  );
}

function canCorrectFines() {
  return CORRECTION_ROLES.has(
    roleName(state.member?.role)
  );
}

function setPermissions() {
  const manualAllowed = canManageManualFines();
  const correctionAllowed = canCorrectFines();

  const manualForm = byId("manualFineForm");
  const typeForm = byId("fineTypeForm");

  if (manualForm) manualForm.hidden = !manualAllowed;
  if (typeForm) typeForm.hidden = !manualAllowed;

  const officerNote = byId("fineOfficerNote");
  if (officerNote) {
    officerNote.textContent = manualAllowed
      ? "You are authorised to manage member fines. Final permission is enforced by the backend."
      : "Fine management controls are available only to authorised group officers.";
  }

  const correctionNote = byId("fineCorrectionNote");
  if (correctionNote) {
    correctionNote.textContent = correctionAllowed
      ? "Adjust, waive, and payment-allocation actions are enabled for your authorised role. Every action is recorded by the backend."
      : "Adjustments, waivers, and payment allocation require an authorised financial officer.";
  }

  byId("fineRulesReadonlyNote")?.replaceChildren(
    document.createTextNode(
      manualAllowed
        ? "Fine types are managed here through the approved backend rule RPC."
        : "Fine types are read-only for this role."
    )
  );
}

async function loadContext() {
  state.group = await getMyGroup();
  state.groupId =
    state.group?.id ||
    state.group?.group_id ||
    null;
  state.member = await getMyMember();

  if (!state.groupId) {
    throw new Error("Group context could not be resolved.");
  }
}

async function loadMembers() {
  const { data, error } = await supabase
    .from("members")
    .select("id,name,member_number,status,onboarding_status")
    .eq("group_id", state.groupId)
    .order("name", { ascending: true });

  if (error) throw error;

  /*
   * The member picker is a group directory, not a login/onboarding
   * filter. A member can still be subject to a recorded incident
   * even when their portal onboarding is pending or their status
   * is not active. Keep every row in this group selectable.
   */
  state.members = data || [];

  const manualMember = byId("manualFineMember");
  if (manualMember) {
    const previous = manualMember.value;
    manualMember.innerHTML =
      '<option value="">Select member</option>' +
      state.members.map(member =>
        `<option value="${esc(member.id)}">${esc(memberDisplay(member))}</option>`
      ).join("");
    if (previous) manualMember.value = previous;
  }

  const filter = byId("fineMember");
  if (filter) {
    const previous = filter.value;
    filter.innerHTML =
      '<option value="">All members</option>' +
      state.members.map(member =>
        `<option value="${esc(member.id)}">${esc(memberDisplay(member))}</option>`
      ).join("");
    if (previous) filter.value = previous;
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

  const select = byId("manualFineType");
  if (select) {
    const active = state.rules.filter(
      rule => String(rule.status || "").toLowerCase() === "active"
    );
    const previous = select.value;
    select.innerHTML =
      active.length
        ? '<option value="">Select fine type</option>' +
          active.map(rule =>
            `<option value="${esc(rule.id)}" data-amount="${esc(rule.fixed_amount ?? "")}">${esc(rule.name)}</option>`
          ).join("")
        : '<option value="">No active manual fine types — add one below</option>';
    if (previous && active.some(rule => String(rule.id) === String(previous))) {
      select.value = previous;
    }
  }

  renderFineTypes();
}

async function loadFineLedger() {
  const { data, error } = await supabase
    .from("fines")
    .select(
      "id,group_id,member_id,rule_id,trigger_type,trigger_id,accounting_month,original_amount,calculated_amount,triggered_at,source_type,reason,imposed_at"
    )
    .eq("group_id", state.groupId)
    .order("triggered_at", { ascending: false });

  if (error) throw error;

  state.fines = data || [];
  state.balances = new Map();

  await Promise.all(
    state.fines.map(async fine => {
      const result = await finesApi.getFineBalance(fine.id);
      if (result.error) throw result.error;
      const row = Array.isArray(result.data)
        ? result.data[0]
        : result.data;
      if (row) state.balances.set(String(fine.id), row);
    })
  );
}

async function loadMemberPayments(memberId) {
  state.payments = [];

  if (!memberId || !state.groupId) {
    renderPaymentOptions();
    return;
  }

  const { data, error } = await supabase
    .from("contributions")
    .select(
      "id,member_id,amount,contribution_date,contribution_type,payment_method,created_at"
    )
    .eq("group_id", state.groupId)
    .eq("member_id", memberId)
    .order("contribution_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  state.payments = data || [];
  renderPaymentOptions();
}

function selectedPayment() {
  const id = byId("finePayment")?.value;
  return state.payments.find(
    payment => String(payment.id) === String(id)
  ) || null;
}

function populatePaymentAmount() {
  const payment = selectedPayment();
  const amount = byId("allocateAmount");
  if (!payment || !amount) return;
  const outstanding = Number(
    getBalance(state.selectedFine || {}).outstanding_amount || 0
  );
  const paymentAmount = Number(payment.amount || 0);
  amount.value = String(
    Math.min(paymentAmount, outstanding)
  );
}

function renderPaymentOptions() {
  const select = byId("finePayment");
  const amount = byId("allocateAmount");
  if (!select) return;

  const previous = select.value;
  select.innerHTML =
    '<option value="">Select an existing member payment</option>' +
    state.payments.map(payment =>
      `<option value="${esc(payment.id)}">${esc(formatDate(payment.contribution_date))} — ${esc(money(payment.amount))} — ${esc(payment.contribution_type || "Contribution")}</option>`
    ).join("");

  if (previous) select.value = previous;

  if (amount && !previous) {
    const first = state.payments[0];
    if (first && state.selectedFine) {
      const outstanding = Number(
        getBalance(state.selectedFine).outstanding_amount || 0
      );
      amount.value = String(
        Math.min(Number(first.amount || 0), outstanding)
      );
    }
  }
}

function filteredFines() {
  const month = byId("accountingMonth")?.value || "";
  const member = byId("fineMember")?.value || "";

  return state.fines.filter(fine =>
    (!month || String(fine.accounting_month || "") === month) &&
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
    const balance = getBalance(fine);
    total += Number(
      fine.original_amount ?? fine.calculated_amount ?? 0
    );
    outstanding += Number(balance.outstanding_amount || 0);
    allocated += Number(balance.allocated_amount || 0);
    if (sourceFor(fine) === "MANUAL") manual += 1;
    else contribution += 1;
  }

  byId("totalFineAmount")?.replaceChildren(
    document.createTextNode(money(total))
  );
  byId("outstandingFineAmount")?.replaceChildren(
    document.createTextNode(money(outstanding))
  );
  byId("allocatedFineAmount")?.replaceChildren(
    document.createTextNode(money(allocated))
  );
  byId("fineRecordCount")?.replaceChildren(
    document.createTextNode(String(fines.length))
  );
  byId("manualFineCount")?.replaceChildren(
    document.createTextNode(String(manual))
  );
  byId("contributionFineCount")?.replaceChildren(
    document.createTextNode(String(contribution))
  );
}

function balanceStatusClass(balance) {
  const status = String(balance?.status || "").toLowerCase();
  return (
    Number(balance?.outstanding_amount || 0) <= 0 ||
    status === "paid" ||
    status === "settled" ||
    status === "waived"
  )
    ? "settled"
    : "outstanding";
}

function actionButtons(fine) {
  if (!canCorrectFines()) return "—";

  const disabled = isFineSettled(fine) ? "disabled" : "";

  return `
    <div class="fine-action-buttons">
      <button type="button" class="button secondary small" data-fine-action="manage" data-fine-id="${esc(fine.id)}">
        Manage
      </button>
      <button type="button" class="button secondary small" data-fine-action="adjust" data-fine-id="${esc(fine.id)}" ${disabled}>
        Adjust
      </button>
      <button type="button" class="button secondary small" data-fine-action="waive" data-fine-id="${esc(fine.id)}" ${disabled}>
        Waive
      </button>
      <button type="button" class="button secondary small" data-fine-action="allocate" data-fine-id="${esc(fine.id)}" ${disabled}>
        Allocate
      </button>
    </div>
  `;
}

function renderFineLedger() {
  const rows = byId("fineRows");
  const mobile = byId("fineMobileList");
  if (!rows || !mobile) return;

  const fines = filteredFines();

  if (!fines.length) {
    rows.innerHTML =
      '<tr><td colspan="10" class="fine-empty">No fine ledger records found.</td></tr>';
    mobile.innerHTML =
      '<div class="fine-empty">No fine ledger records found.</div>';
    return;
  }

  rows.innerHTML = fines.map(fine => {
    const balance = getBalance(fine);
    const source = sourceFor(fine);
    const member = state.members.find(
      item => String(item.id) === String(fine.member_id)
    );

    return `
      <tr>
        <td><strong>${esc(memberDisplay(member))}</strong></td>
        <td><span class="fine-status ${source === "MANUAL" ? "manual" : "automatic"}">${source === "MANUAL" ? "Manual" : "Automatic"}</span></td>
        <td>${esc(typeFor(fine))}</td>
        <td>${esc(reasonFor(fine))}</td>
        <td class="amount">${money(fine.calculated_amount ?? fine.original_amount)}</td>
        <td class="amount">${money(balance.allocated_amount)}</td>
        <td class="amount">${money(balance.outstanding_amount)}</td>
        <td><span class="fine-status ${balanceStatusClass(balance)}">${esc(String(balance.status || "OUTSTANDING").replaceAll("_", " "))}</span></td>
        <td>${esc(formatDate(fine.imposed_at || fine.triggered_at))}</td>
        <td>${actionButtons(fine)}</td>
      </tr>
    `;
  }).join("");

  mobile.innerHTML = fines.map(fine => {
    const balance = getBalance(fine);
    const source = sourceFor(fine);
    const member = state.members.find(
      item => String(item.id) === String(fine.member_id)
    );

    return `
      <div class="fine-mobile-item">
        <div class="fine-mobile-top">
          <strong class="fine-mobile-name">${esc(memberDisplay(member))}</strong>
          <span class="fine-status ${balanceStatusClass(balance)}">${esc(String(balance.status || "OUTSTANDING").replaceAll("_", " "))}</span>
        </div>
        <div class="fine-mobile-grid">
          <div><span class="fine-mobile-label">Source</span><span class="fine-mobile-value">${source === "MANUAL" ? "Manual" : "Automatic"}</span></div>
          <div><span class="fine-mobile-label">Fine type</span><span class="fine-mobile-value">${esc(typeFor(fine))}</span></div>
          <div><span class="fine-mobile-label">Reason</span><span class="fine-mobile-value">${esc(reasonFor(fine))}</span></div>
          <div><span class="fine-mobile-label">Amount</span><span class="fine-mobile-value">${money(fine.calculated_amount ?? fine.original_amount)}</span></div>
          <div><span class="fine-mobile-label">Allocated</span><span class="fine-mobile-value">${money(balance.allocated_amount)}</span></div>
          <div><span class="fine-mobile-label">Outstanding</span><span class="fine-mobile-value">${money(balance.outstanding_amount)}</span></div>
          <div><span class="fine-mobile-label">Date</span><span class="fine-mobile-value">${esc(formatDate(fine.imposed_at || fine.triggered_at))}</span></div>
          <div class="fine-mobile-actions">${actionButtons(fine)}</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderFineTypes() {
  const body = byId("fineRuleRows");
  if (!body) return;

  const rules = state.rules.filter(
    rule => String(rule.trigger_type || "").toLowerCase() === "custom_event"
  );

  if (!rules.length) {
    body.innerHTML =
      '<tr><td colspan="6" class="fine-empty">No manual fine types configured.</td></tr>';
    return;
  }

  body.innerHTML = rules.map(rule => `
    <tr>
      <td><strong>${esc(rule.name)}</strong></td>
      <td>${esc(rule.description || "—")}</td>
      <td>${esc(rule.calculation_method || "FIXED")}${rule.fixed_amount != null ? ` — ${money(rule.fixed_amount)}` : ""}</td>
      <td>${esc(rule.grace_period_value ?? 0)} ${esc(rule.grace_period_unit || "DAY")}</td>
      <td>${esc(formatDate(rule.effective_from))}</td>
      <td><span class="fine-status ${String(rule.status || "").toLowerCase() === "active" ? "active" : "inactive"}">${esc(rule.status || "—")}</span></td>
    </tr>
  `).join("");
}

function selectFine(fineId) {
  const fine = state.fines.find(
    item => String(item.id) === String(fineId)
  );
  if (!fine) {
    throw new Error("Selected fine could not be found.");
  }

  state.selectedFine = fine;
  const balance = getBalance(fine);

  byId("fineActionMember").textContent =
    memberDisplay(
      state.members.find(
        member => String(member.id) === String(fine.member_id)
      )
    );
  byId("fineActionType").textContent = typeFor(fine);
  byId("fineActionReason").textContent = reasonFor(fine);
  byId("fineActionAmount").textContent =
    money(fine.calculated_amount ?? fine.original_amount);
  byId("fineActionAllocated").textContent =
    money(balance.allocated_amount);
  byId("fineActionOutstanding").textContent =
    money(balance.outstanding_amount);
  byId("fineActionStatus").textContent =
    String(balance.status || "OUTSTANDING").replaceAll("_", " ");

  const actionSection = byId("fineActionSection");
  if (actionSection) actionSection.hidden = false;

  const actionTitle = byId("fineActionTitle");
  if (actionTitle) {
    actionTitle.textContent =
      `Fine actions — ${memberDisplay(
        state.members.find(
          member => String(member.id) === String(fine.member_id)
        )
      )}`;
  }

  const action = byId("fineAction");
  if (action) action.value = "adjust";

  const reason = byId("fineActionReasonInput");
  if (reason) reason.value = "";

  const amount = byId("fineActionAmountInput");
  if (amount) amount.value = "";

  const direction = byId("fineAdjustDirection");
  if (direction) direction.value = "INCREASE";

  loadMemberPayments(fine.member_id).catch(error => {
    console.error("CHAMA LIVE fine payments:", error);
    showMessage(error?.message || "Unable to load member payments.", "error");
  });

  renderActionForm();
  actionSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderActionForm() {
  const action = byId("fineAction")?.value || "adjust";
  const adjust = byId("adjustFineForm");
  const waive = byId("waiveFineForm");
  const allocate = byId("allocateFineForm");

  if (adjust) adjust.hidden = action !== "adjust";
  if (waive) waive.hidden = action !== "waive";
  if (allocate) allocate.hidden = action !== "allocate";

  if (action === "allocate") populatePaymentAmount();
}

async function createFineType(event) {
  event.preventDefault();

  if (!canManageManualFines()) {
    throw new Error("You are not authorised to configure fine types.");
  }

  const name = byId("fineTypeName")?.value.trim();
  const description = byId("fineTypeDescription")?.value.trim() || null;
  const amount = Number(byId("fineTypeAmount")?.value);

  if (!name) throw new Error("Fine type name is required.");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Fine type amount must be greater than zero.");
  }

  const button = byId("createFineTypeButton");
  if (button) {
    button.disabled = true;
    button.textContent = "Saving…";
  }

  try {
    const result = await finesApi.createFineType({
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

    if (result.error) throw result.error;

    byId("fineTypeForm")?.reset();
    await refresh();
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

  if (!canManageManualFines()) {
    throw new Error("You are not authorised to impose manual fines.");
  }

  const memberId = byId("manualFineMember")?.value;
  const ruleId = byId("manualFineType")?.value;
  const amount = Number(byId("manualFineAmount")?.value);
  const reason = byId("manualFineReason")?.value.trim();
  const dateInput = byId("manualFineDate")?.value;

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
  const button = byId("applyManualFineButton");

  if (button) {
    button.disabled = true;
    button.textContent = "Applying…";
  }

  try {
    const result = await finesApi.createManualFine({
      p_group_id: state.groupId,
      p_member_id: memberId,
      p_rule_id: ruleId,
      p_amount: amount,
      p_reason: reason,
      p_trigger_id: triggerId,
      p_imposed_at: imposedAt
    });

    if (result.error) throw result.error;

    byId("manualFineForm")?.reset();
    await refresh();
    showMessage("Fine applied successfully.", "success");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Apply fine";
    }
  }
}

async function adjustFine(event) {
  event.preventDefault();

  if (!canCorrectFines()) {
    throw new Error("You are not authorised to adjust fines.");
  }
  if (!state.selectedFine) {
    throw new Error("Select a fine first.");
  }

  const amount = Number(byId("fineAdjustAmount")?.value);
  const direction = byId("fineAdjustDirection")?.value;
  const reason = byId("fineAdjustReason")?.value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Adjustment amount must be greater than zero.");
  }
  if (!["INCREASE", "DECREASE"].includes(direction)) {
    throw new Error("Select an adjustment direction.");
  }
  if (!reason) {
    throw new Error("An adjustment reason is required.");
  }

  const outstanding = Number(
    getBalance(state.selectedFine).outstanding_amount || 0
  );

  if (direction === "DECREASE" && amount > outstanding) {
    throw new Error(
      "A decrease cannot exceed the fine's current outstanding balance."
    );
  }

  const button = byId("submitFineAdjustment");
  if (button) {
    button.disabled = true;
    button.textContent = "Saving…";
  }

  try {
    const result = await finesApi.adjustFine({
      p_fine_id: state.selectedFine.id,
      p_amount: amount,
      p_direction: direction,
      p_reason: reason
    });

    if (result.error) throw result.error;

    await refresh();
    selectFine(state.selectedFine.id);
    showMessage("Fine adjustment recorded.", "success");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Record adjustment";
    }
  }
}

async function waiveFine(event) {
  event.preventDefault();

  if (!canCorrectFines()) {
    throw new Error("You are not authorised to waive fines.");
  }
  if (!state.selectedFine) {
    throw new Error("Select a fine first.");
  }

  const amount = Number(byId("fineWaiveAmount")?.value);
  const reason = byId("fineWaiveReason")?.value.trim();
  const outstanding = Number(
    getBalance(state.selectedFine).outstanding_amount || 0
  );

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Waiver amount must be greater than zero.");
  }
  if (amount > outstanding) {
    throw new Error("Waiver cannot exceed the current outstanding balance.");
  }
  if (!reason) {
    throw new Error("A waiver reason is required.");
  }

  const button = byId("submitFineWaiver");
  if (button) {
    button.disabled = true;
    button.textContent = "Saving…";
  }

  try {
    const result = await finesApi.waiveFine({
      p_fine_id: state.selectedFine.id,
      p_amount: amount,
      p_reason: reason
    });

    if (result.error) throw result.error;

    await refresh();
    selectFine(state.selectedFine.id);
    showMessage("Fine waiver recorded.", "success");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Record waiver";
    }
  }
}

async function allocatePayment(event) {
  event.preventDefault();

  if (!canCorrectFines()) {
    throw new Error("You are not authorised to allocate fine payments.");
  }
  if (!state.selectedFine) {
    throw new Error("Select a fine first.");
  }

  const payment = selectedPayment();
  const amount = Number(byId("allocateAmount")?.value);
  const source = byId("allocateSource")?.value || "MANUAL";
  const outstanding = Number(
    getBalance(state.selectedFine).outstanding_amount || 0
  );

  if (!payment) throw new Error("Select an existing member payment.");
  if (String(payment.member_id) !== String(state.selectedFine.member_id)) {
    throw new Error("The selected payment does not belong to this member.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Allocation amount must be greater than zero.");
  }
  if (amount > Number(payment.amount || 0)) {
    throw new Error("Allocation cannot exceed the selected payment amount.");
  }
  if (amount > outstanding) {
    throw new Error("Allocation cannot exceed the fine's outstanding balance.");
  }
  if (!["MANUAL", "SYSTEM"].includes(source)) {
    throw new Error("Invalid allocation source.");
  }

  const button = byId("submitFineAllocation");
  if (button) {
    button.disabled = true;
    button.textContent = "Allocating…";
  }

  try {
    const result = await finesApi.allocatePayment({
      p_fine_id: state.selectedFine.id,
      p_payment_id: payment.id,
      p_amount: amount,
      p_source: source
    });

    if (result.error) throw result.error;

    await refresh();
    selectFine(state.selectedFine.id);
    showMessage("Payment allocation recorded.", "success");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Allocate payment";
    }
  }
}

function bindEvents() {
  byId("accountingMonth")?.addEventListener("change", renderAll);
  byId("fineMember")?.addEventListener("change", renderAll);

  byId("clearFineFilters")?.addEventListener("click", () => {
    if (byId("accountingMonth")) byId("accountingMonth").value = "";
    if (byId("fineMember")) byId("fineMember").value = "";
    renderAll();
  });

  byId("refreshFines")?.addEventListener("click", async event => {
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

  byId("manualFineForm")?.addEventListener("submit", async event => {
    clearMessage();
    try {
      await createManualFine(event);
    } catch (error) {
      console.error("CHAMA LIVE manual fine:", error);
      showMessage(error?.message || "Unable to apply fine.", "error");
    }
  });

  byId("fineTypeForm")?.addEventListener("submit", async event => {
    clearMessage();
    try {
      await createFineType(event);
    } catch (error) {
      console.error("CHAMA LIVE fine type:", error);
      showMessage(error?.message || "Unable to create fine type.", "error");
    }
  });

  byId("fineRows")?.addEventListener("click", handleFineActionClick);
  byId("fineMobileList")?.addEventListener("click", handleFineActionClick);

  byId("fineAction")?.addEventListener("change", renderActionForm);
  byId("finePayment")?.addEventListener("change", populatePaymentAmount);

  byId("adjustFineForm")?.addEventListener("submit", async event => {
    clearMessage();
    try {
      await adjustFine(event);
    } catch (error) {
      console.error("CHAMA LIVE fine adjustment:", error);
      showMessage(error?.message || "Unable to adjust fine.", "error");
    }
  });

  byId("waiveFineForm")?.addEventListener("submit", async event => {
    clearMessage();
    try {
      await waiveFine(event);
    } catch (error) {
      console.error("CHAMA LIVE fine waiver:", error);
      showMessage(error?.message || "Unable to waive fine.", "error");
    }
  });

  byId("allocateFineForm")?.addEventListener("submit", async event => {
    clearMessage();
    try {
      await allocatePayment(event);
    } catch (error) {
      console.error("CHAMA LIVE fine allocation:", error);
      showMessage(error?.message || "Unable to allocate payment.", "error");
    }
  });

  byId("closeFineAction")?.addEventListener("click", () => {
    state.selectedFine = null;
    const section = byId("fineActionSection");
    if (section) section.hidden = true;
  });

  byId("manualFineType")?.addEventListener("change", () => {
    const selected = byId("manualFineType")?.selectedOptions?.[0];
    const amount = byId("manualFineAmount");
    if (selected?.dataset?.amount && amount && !amount.value) {
      amount.value = selected.dataset.amount;
    }
  });
}

function handleFineActionClick(event) {
  const button = event.target.closest("[data-fine-action]");
  if (!button) return;

  const fineId = button.getAttribute("data-fine-id");
  if (!fineId) return;

  try {
    selectFine(fineId);

    const action = button.getAttribute("data-fine-action");
    if (["adjust", "waive", "allocate"].includes(action)) {
      const select = byId("fineAction");
      if (select) select.value = action;
      renderActionForm();
    }
  } catch (error) {
    console.error("CHAMA LIVE fine action:", error);
    showMessage(error?.message || "Unable to open fine actions.", "error");
  }
}

function populateAccountingMonths() {
  const select = byId("accountingMonth");
  if (!select) return;

  const current = new Date();
  const months = [];

  for (let offset = 0; offset < 18; offset += 1) {
    const date = new Date(
      current.getFullYear(),
      current.getMonth() - offset,
      1
    );
    months.push(
      `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`
    );
  }

  const previous = select.value;
  select.innerHTML =
    '<option value="">All months</option>' +
    months.map(month =>
      `<option value="${esc(month)}">${esc(month)}</option>`
    ).join("");

  if (previous) select.value = previous;
}

function renderAll() {
  populateAccountingMonths();
  renderSummary();
  renderFineLedger();
  renderFineTypes();

  if (state.selectedFine) {
    const exists = state.fines.some(
      fine => String(fine.id) === String(state.selectedFine.id)
    );
    if (exists) {
      renderSelectedFine();
    }
  }
}

function renderSelectedFine() {
  if (!state.selectedFine) return;

  const current =
    state.fines.find(
      fine => String(fine.id) === String(state.selectedFine.id)
    );

  if (!current) return;

  state.selectedFine = current;
  const balance = getBalance(current);

  byId("fineActionAllocated").textContent =
    money(balance.allocated_amount);
  byId("fineActionOutstanding").textContent =
    money(balance.outstanding_amount);
  byId("fineActionStatus").textContent =
    String(balance.status || "OUTSTANDING").replaceAll("_", " ");
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
    setPermissions();
    populateAccountingMonths();
    bindEvents();
    await refresh();
    showMessage(
      "Fine Management loaded from authoritative records.",
      "success"
    );
  } catch (error) {
    console.error("CHAMA LIVE fines:", error);
    showMessage(
      error?.message || "Unable to load Fine Management.",
      "error"
    );
  }
}

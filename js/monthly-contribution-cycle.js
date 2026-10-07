/* =========================================================
   CHAMA LIVE — MONTHLY CONTRIBUTION CYCLE UI OVERRIDE
   ---------------------------------------------------------
   Keeps the legacy Group Management module compatible while
   routing the monthly cycle editor through the canonical
   closing-day + grace-period contract.
   ========================================================= */

import { getMyApplicationContext } from "./auth.js";
import { supabase } from "./supabase.js";

let context = null;
let groupId = null;
let bound = false;

const $ = (id) => document.getElementById(id);

function first(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

function todayIso() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  ].join("-");
}

function formatDate(value) {
  if (!value) return "—";
  const raw = String(value);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + "T00:00:00" : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function setStatus(message, type = "success") {
  const box = $("groupManagementStatus");
  if (!box) return;
  box.textContent = message;
  box.className = "management-status is-visible " + type;
}

function selectedGraceDays() {
  const mode = document.querySelector('input[name="monthlyGraceMode"]:checked')?.value;
  if (mode !== "days") return 0;
  const value = Number($("monthlyGraceDays")?.value || 0);
  return Number.isInteger(value) ? value : 0;
}

function syncDerivedOpening() {
  const closing = Number($("monthlyClosingDay")?.value || 0);
  const opening = Number.isInteger(closing) && closing >= 1 && closing <= 28
    ? closing + 1
    : null;

  if ($("monthlyOpeningDayDerived")) {
    $("monthlyOpeningDayDerived").value = opening ? String(opening) : "—";
  }
}

function syncGraceInput() {
  const mode = document.querySelector('input[name="monthlyGraceMode"]:checked')?.value;
  const input = $("monthlyGraceDays");
  if (!input) return;
  input.disabled = mode !== "days";
  input.max = "27";
  if (mode !== "days") input.value = "0";
}

function renderCycle(cycle, closingDay, graceDays) {
  const summary = $("monthlyCycleSummary");
  if (!summary) return;

  if (cycle?.is_in_grace) {
    summary.textContent =
      "Previous cycle: In grace period through " +
      formatDate(cycle.grace_end_date) +
      ". Next cycle opens " +
      formatDate(cycle.next_cycle_opening_date) +
      ".";
    summary.className = "rule-summary";
    return;
  }

  if (cycle) {
    summary.textContent =
      "Current cycle: Opens " +
      formatDate(cycle.cycle_opening_date) +
      " and closes " +
      formatDate(cycle.cycle_closing_date) +
      ". Next cycle opens " +
      formatDate(cycle.next_cycle_opening_date) +
      ".";
    summary.className = "rule-summary";
    return;
  }

  summary.textContent =
    "Closing day " + closingDay +
    " · Opening day " + (closingDay + 1) +
    " · Grace " + graceDays + " day" +
    (graceDays === 1 ? "" : "s") + ".";
}

async function loadCycle() {
  if (!groupId) return;

  const [settingsResult, cycleResult] = await Promise.all([
    supabase.rpc("get_group_contribution_settings", {
      p_group_id: groupId
    }),
    supabase.rpc("get_group_monthly_cycle_status", {
      p_group_id: groupId,
      p_as_of_date: todayIso()
    })
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (cycleResult.error) throw cycleResult.error;

  const settings = first(settingsResult.data);
  const cycle = first(cycleResult.data);

  const closingDay = Number(
    settings?.monthly_closing_day ?? cycle?.monthly_closing_day
  );
  const graceDays = Number(
    cycle?.monthly_grace_days ?? 0
  );

  if ($("monthlyClosingDay") && Number.isInteger(closingDay)) {
    $("monthlyClosingDay").value = String(closingDay);
  }

  if ($("monthlyGraceDays")) {
    $("monthlyGraceDays").value = String(graceDays);
  }

  document.querySelectorAll('input[name="monthlyGraceMode"]').forEach((radio) => {
    radio.checked = graceDays > 0
      ? radio.value === "days"
      : radio.value === "none";
  });

  syncDerivedOpening();
  syncGraceInput();
  renderCycle(cycle, closingDay, graceDays);
}

async function saveMonthlyCycle(event) {
  event.preventDefault();
  event.stopImmediatePropagation();

  const closingDay = Number($("monthlyClosingDay")?.value || 0);
  const graceDays = selectedGraceDays();
  const amount = Number($("monthlyContribution")?.value || 0);

  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 28) {
    setStatus("Closing day must be a whole number between 1 and 28.", "error");
    return;
  }

  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 27) {
    setStatus("Grace period must be a whole number between 0 and 27 days.", "error");
    return;
  }

  if (!Number.isFinite(amount) || amount < 0) {
    setStatus("Monthly contribution must be a valid non-negative number.", "error");
    return;
  }

  const button = $("saveMonthlyContribution");
  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }

  try {
    const groupResult = await supabase
      .from("groups")
      .update({ monthly_contribution: amount })
      .eq("id", groupId);

    if (groupResult.error) throw groupResult.error;

    const result = await supabase.rpc(
      "update_group_contribution_cycle_settings",
      {
        p_group_id: groupId,
        p_monthly_closing_day: closingDay,
        p_monthly_grace_days: graceDays
      }
    );

    if (result.error) throw result.error;

    await loadCycle();

    setStatus(
      "Monthly contribution saved. Closes on day " +
      closingDay +
      ", opens on day " +
      (closingDay + 1) +
      ", with " +
      graceDays +
      " grace day" +
      (graceDays === 1 ? "" : "s") +
      ".",
      "success"
    );
  } catch (error) {
    console.error("Monthly contribution cycle save failed:", error);
    setStatus(
      error?.message || "Monthly contribution could not be saved.",
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Save Monthly Contribution";
    }
  }
}

function bind() {
  if (bound) return;
  const form = $("monthlyContributionForm");
  if (!form) return;

  form.addEventListener("submit", saveMonthlyCycle, true);

  $("monthlyClosingDay")?.addEventListener("change", syncDerivedOpening);

  document.querySelectorAll('input[name="monthlyGraceMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      syncGraceInput();
      renderCycle(null, Number($("monthlyClosingDay")?.value || 0), selectedGraceDays());
    });
  });

  $("monthlyGraceDays")?.addEventListener("input", () => {
    const value = Number($("monthlyGraceDays").value || 0);
    if (value > 27) $("monthlyGraceDays").value = "27";
  });

  bound = true;
}

export async function initMonthlyContributionCycle() {
  context = await getMyApplicationContext();
  groupId = context?.group?.id || context?.group_id || null;

  if (!groupId) return;

  bind();
  await loadCycle();
}

import { getMyApplicationContext } from "./auth.js";
import { supabase } from "./supabase.js";

const first = (data) => Array.isArray(data) ? data[0] || null : data || null;

function today() {
  const d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function dateText(value) {
  if (!value) return "—";
  const d = new Date(String(value) + "T00:00:00");
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("en-KE", {day:"numeric",month:"short",year:"numeric"});
}

export async function initMemberMonthlyCycle() {
  const status = document.getElementById("memberMonthlyCycleStatus");
  const opening = document.getElementById("memberMonthlyCycleOpening");
  const closing = document.getElementById("memberMonthlyCycleClosing");
  const grace = document.getElementById("memberMonthlyCycleGrace");
  const note = document.getElementById("memberMonthlyCycleNote");
  if (!status || !opening || !closing || !grace || !note) return;

  try {
    const context = await getMyApplicationContext();
    const groupId = context?.group?.id || context?.group_id;
    if (!groupId) throw new Error("Group context is unavailable.");

    const {data,error} = await supabase.rpc("get_group_monthly_cycle_status", {
      p_group_id: groupId,
      p_as_of_date: today()
    });
    if (error) throw error;

    const cycle = first(data);
    if (!cycle) throw new Error("Monthly contribution cycle is not configured.");

    opening.textContent = dateText(cycle.cycle_opening_date);
    closing.textContent = dateText(cycle.cycle_closing_date);
    const days = Number(cycle.monthly_grace_days || 0);
    grace.textContent = days + " day" + (days === 1 ? "" : "s");

    if (cycle.is_in_grace) {
      status.textContent = "Grace period";
      status.className = "member-cycle-badge member-cycle-grace";
      note.textContent =
        "Previous cycle is in grace through " + dateText(cycle.grace_end_date) +
        ". Next cycle opens " + dateText(cycle.next_cycle_opening_date) + ".";
    } else {
      status.textContent = "Current cycle open";
      status.className = "member-cycle-badge member-cycle-open";
      note.textContent =
        "Next contribution cycle opens " + dateText(cycle.next_cycle_opening_date) + ".";
    }
  } catch (error) {
    status.textContent = "Unavailable";
    note.textContent = error?.message || "Monthly contribution cycle could not be loaded.";
  }
}

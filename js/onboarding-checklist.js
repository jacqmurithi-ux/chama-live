import { supabase } from "./supabase.js";

const CHECKLIST_ITEMS = [
  { key: "profile", label: "Group profile complete", href: "group-management.html", help: "Confirm the group name, type, location and contact details." },
  { key: "officers", label: "Officers assigned", href: "group-management.html", help: "Assign the Chairperson, Treasurer and Secretary to the correct members." },
  { key: "members", label: "Members added", href: "members.html", help: "Add the members approved on the group register." },
  { key: "rules", label: "Contribution rules set", href: "group-management.html", help: "Set the approved monthly or member contribution rules." },
  { key: "modules", label: "Modules chosen", href: "group-settings.html", help: "Review optional modules and leave unselected modules off." },
  { key: "opening", label: "Opening balances entered", href: "group-management.html", help: "Reconcile existing member contributions and loans at the agreed cut-off date." },
  { key: "constitution", label: "Constitution uploaded", href: "documents.html?portal=admin", help: "Upload the current, approved group constitution." },
  { key: "meeting", label: "First meeting scheduled", href: "meetings.html", help: "Schedule the first meeting and add its agenda." }
];

const ALLOWED_ROLES = new Set(["admin", "administrator", "chairperson", "treasurer", "secretary"]);

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function hasOfficer(rows, office) {
  return rows.some(row => {
    const values = [row.actual_position, row.actual_position_name, row.role].map(normalize);
    return values.some(value => value === office || value.includes(office));
  });
}

function buildCard() {
  let card = document.getElementById("chamaOnboardingChecklist");
  if (card) return card;
  const main = document.querySelector("main.main") || document.querySelector("main") || document.querySelector(".main");
  if (!main) return null;

  card = document.createElement("section");
  card.id = "chamaOnboardingChecklist";
  card.className = "dashboard-section";
  card.style.cssText = "padding:18px;border:1px solid #d1e7dd;border-radius:16px;background:#fff;margin:0 0 22px";
  card.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <h2 style="margin:0;font-size:19px;color:#101828">Getting started</h2>
        <p id="chamaOnboardingSummary" style="margin:5px 0 0;color:#667085;font-size:13px">Checking your group setup…</p>
      </div>
      <button type="button" id="chamaOnboardingHide" style="padding:8px 11px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;color:#344054;font-weight:700;cursor:pointer">Hide checklist</button>
    </div>
    <div id="chamaOnboardingProgress" style="height:7px;background:#e5e7eb;border-radius:99px;overflow:hidden;margin:15px 0 12px"><div id="chamaOnboardingProgressBar" style="height:100%;width:0;background:#087443;transition:width .2s"></div></div>
    <ul id="chamaOnboardingItems" style="list-style:none;padding:0;margin:0;display:grid;gap:10px"></ul>
    <p id="chamaOnboardingNote" style="font-size:12px;color:#667085;margin:12px 0 0"></p>`;
  const header = main.querySelector(".dashboard-header");
  if (header) main.insertBefore(card, header.nextSibling);
  else main.prepend(card);
  return card;
}

function renderItems(container, statuses) {
  container.replaceChildren();
  for (const item of CHECKLIST_ITEMS) {
    const complete = statuses[item.key] === true;
    const li = document.createElement("li");
    li.style.cssText = "display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid #f0f2f5";
    const marker = document.createElement("span");
    marker.textContent = complete ? "✓" : "○";
    marker.setAttribute("aria-label", complete ? "Complete" : "Not complete");
    marker.style.cssText = `display:inline-grid;place-items:center;flex:0 0 24px;width:24px;height:24px;border-radius:50%;background:${complete ? "#ecfdf3" : "#f2f4f7"};color:${complete ? "#067647" : "#667085"};font-weight:800`;
    const copy = document.createElement("div");
    copy.style.cssText = "min-width:0;flex:1";
    const link = document.createElement("a");
    link.href = item.href;
    link.textContent = item.label;
    link.style.cssText = `font-weight:750;color:${complete ? "#067647" : "#344054"};text-decoration:${complete ? "line-through" : "none"}`;
    const help = document.createElement("p");
    help.textContent = item.help;
    help.style.cssText = "margin:3px 0 0;color:#667085;font-size:12px;line-height:1.45";
    copy.append(link, help);
    li.append(marker, copy);
    container.appendChild(li);
  }
}

async function deriveStatuses(groupId, group) {
  const statuses = Object.create(null);
  const profile = group || {};
  statuses.profile = Boolean(
    String(profile.name || "").trim() &&
    String(profile.category || "").trim() &&
    String(profile.country || "").trim() &&
    (String(profile.phone || "").trim() || String(profile.email || "").trim())
  );

  const memberResult = await supabase
    .from("members")
    .select("id,actual_position,actual_position_name,role")
    .eq("group_id", groupId);
  if (memberResult.error) throw memberResult.error;
  const memberRows = Array.isArray(memberResult.data) ? memberResult.data : [];
  statuses.members = memberRows.length > 1;
  statuses.officers = ["chairperson", "treasurer", "secretary"].every(office => hasOfficer(memberRows, office));

  statuses.rules = Number(profile.monthly_contribution || 0) > 0;
  if (!statuses.rules) {
    const ruleResult = await supabase
      .from("member_contribution_rules")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .eq("status", "active");
    if (!ruleResult.error) statuses.rules = Number(ruleResult.count || 0) > 0;
  }

  statuses.modules = profile.modules !== null && profile.modules !== undefined &&
    typeof profile.merry_go_round_enabled === "boolean" &&
    typeof profile.loans_enabled === "boolean";

  // No dedicated authoritative opening-balance completion record is currently
  // exposed to this UI. Do not infer completion from a zero balance or payment.
  statuses.opening = false;

  const docsResult = await supabase
    .from("documents")
    .select("id,category,document_type")
    .eq("group_id", groupId);
  if (docsResult.error) throw docsResult.error;
  statuses.constitution = (Array.isArray(docsResult.data) ? docsResult.data : []).some(doc =>
    normalize(doc.document_type).includes("constitution") ||
    normalize(doc.category).includes("constitution")
  );

  const today = new Date().toISOString().slice(0, 10);
  const meetingResult = await supabase
    .from("meetings")
    .select("id,date,status")
    .eq("group_id", groupId)
    .gte("date", today);
  if (meetingResult.error) throw meetingResult.error;
  statuses.meeting = (Array.isArray(meetingResult.data) ? meetingResult.data : []).some(row =>
    !["cancelled", "completed"].includes(normalize(row.status))
  );

  return statuses;
}

export async function initOnboardingChecklist(context) {
  const role = normalize(context?.role || context?.member?.role);
  if (!ALLOWED_ROLES.has(role)) return;
  const groupId = context?.member?.group_id || context?.group?.id;
  if (!groupId) return;

  const card = buildCard();
  if (!card) return;

  const storageKey = `chama-onboarding-checklist-open:${groupId}`;
  const items = card.querySelector("#chamaOnboardingItems");
  const summary = card.querySelector("#chamaOnboardingSummary");
  const note = card.querySelector("#chamaOnboardingNote");
  const bar = card.querySelector("#chamaOnboardingProgressBar");
  const hideButton = card.querySelector("#chamaOnboardingHide");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "chamaOnboardingReopen";
  toggle.textContent = "Reopen Getting started";
  toggle.style.cssText = "margin:0 0 18px;padding:8px 11px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;color:#344054;font-weight:700;cursor:pointer";
  toggle.hidden = true;
  card.parentNode.insertBefore(toggle, card);

  toggle.addEventListener("click", () => {
    try { localStorage.setItem(storageKey, "true"); } catch (_) {}
    card.hidden = false;
    toggle.hidden = true;
  });

  hideButton.addEventListener("click", () => {
    card.hidden = true;
    toggle.hidden = false;
    try { localStorage.setItem(storageKey, "false"); } catch (_) {}
  });

  try {
    const statuses = await deriveStatuses(groupId, context.group);
    const completeCount = CHECKLIST_ITEMS.filter(item => statuses[item.key] === true).length;
    summary.textContent = `${completeCount} of ${CHECKLIST_ITEMS.length} steps complete`;
    bar.style.width = `${Math.round(completeCount / CHECKLIST_ITEMS.length * 100)}%`;
    bar.parentElement.setAttribute("role", "progressbar");
    bar.parentElement.setAttribute("aria-valuemin", "0");
    bar.parentElement.setAttribute("aria-valuemax", String(CHECKLIST_ITEMS.length));
    bar.parentElement.setAttribute("aria-valuenow", String(completeCount));
    renderItems(items, statuses);
    if (statuses.opening !== true) {
      note.textContent = "Opening balances remain incomplete until the dedicated, auditable opening-balance workflow can confirm them. Do not treat a zero balance as proof of completion.";
    }
    if (completeCount === CHECKLIST_ITEMS.length) {
      card.hidden = true;
      toggle.hidden = false;
      toggle.textContent = "Reopen Getting started";
    } else {
      let dismissed = false;
      try { dismissed = localStorage.getItem(storageKey) === "false"; } catch (_) {}
      card.hidden = dismissed;
      toggle.hidden = !dismissed;
    }
  } catch (error) {
    console.error("CHAMA LIVE: onboarding checklist could not be derived.", error);
    summary.textContent = "Checklist status could not be verified. Refresh the dashboard to try again.";
    note.textContent = "A step is never marked complete when its source data could not be read.";
    items.replaceChildren();
  }
}

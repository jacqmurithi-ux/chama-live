import { supabase } from "./supabase.js";
import { requireAuth, getMyMember } from "./auth.js";

console.log("CHAMA LIVE: milestones.js loaded");

const MANAGEMENT_ROLES = [
"admin",
"chairperson",
"secretary"
];

const MILESTONE_CATEGORIES = [
"general",
"investment",
"property",
"welfare",
"business",
"education",
"membership",
"fundraising",
"infrastructure",
"other"
];

const state = {
currentMember: null,
groupId: null,
groupName: "",
plans: [],
milestones: []
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
cacheElements();
bindEvents();

try {
await loadContext();
await loadPlans();
await loadMilestones();

```
console.log("CHAMA LIVE: Milestones context ready", {
  groupId: state.groupId,
  groupName: state.groupName
});
```

} catch (error) {
console.error("CHAMA LIVE: Milestones initialization failed", error);
showMessage(normalizeError(error), "error");
}
}

function cacheElements() {
els.groupName = document.getElementById("current-group-name");

els.message = document.getElementById("message");

els.totalMilestones = document.getElementById("total-milestones");
els.upcomingMilestones = document.getElementById("upcoming-milestones");
els.linkedMilestones = document.getElementById("linked-milestones");
els.milestoneAmount = document.getElementById("milestone-amount");

els.form = document.getElementById("milestone-form");
els.title = document.getElementById("milestone-title");
els.category = document.getElementById("milestone-category");
els.plan = document.getElementById("milestone-plan");
els.date = document.getElementById("milestone-date");
els.amount = document.getElementById("milestone-amount");
els.documentId = document.getElementById("milestone-document-id");
els.description = document.getElementById("milestone-description");

els.createButton = document.getElementById("create-milestone-btn");
els.clearButton = document.getElementById("clear-milestone-btn");
els.managementNote = document.getElementById("management-note");

els.search = document.getElementById("milestone-search");
els.categoryFilter = document.getElementById("milestone-category-filter");
els.refreshButton = document.getElementById("refresh-milestones-btn");
els.body = document.getElementById("milestones-body");
}

function bindEvents() {
els.form?.addEventListener("submit", handleCreateMilestone);
els.clearButton?.addEventListener("click", clearForm);
els.refreshButton?.addEventListener("click", refreshData);

els.search?.addEventListener("input", renderMilestones);
els.categoryFilter?.addEventListener("change", renderMilestones);

els.body?.addEventListener("click", handleTableAction);
}

async function loadContext() {
await requireAuth();

state.currentMember = await getMyMember();

if (!state.currentMember?.group_id) {
throw new Error("Your member account is not linked to a group.");
}

state.groupId = state.currentMember.group_id;

const { data: group, error } = await supabase
.from("groups")
.select("id, name")
.eq("id", state.groupId)
.maybeSingle();

if (error) {
throw error;
}

if (!group) {
throw new Error("Current group could not be loaded.");
}

state.groupName = group.name || "";
els.groupName.textContent = state.groupName;

const canManage = isManagementRole();

els.managementNote.style.display = canManage ? "none" : "block";
els.createButton.disabled = !canManage;

if (!canManage) {
els.title.disabled = true;
els.category.disabled = true;
els.plan.disabled = true;
els.date.disabled = true;
els.amount.disabled = true;
els.documentId.disabled = true;
els.description.disabled = true;
}
}

function isManagementRole() {
const role = String(state.currentMember?.role || "").toLowerCase();
return MANAGEMENT_ROLES.includes(role);
}

async function loadPlans() {
const { data, error } = await supabase
.from("group_plans")
.select(`       id,
      title,
      status,
      start_date,
      target_date
    `)
.eq("group_id", state.groupId)
.order("target_date", { ascending: true });

if (error) {
throw error;
}

state.plans = data || [];
populatePlanSelect();
}

function populatePlanSelect() {
els.plan.innerHTML = "";

const noPlan = document.createElement("option");
noPlan.value = "";
noPlan.textContent = "No linked plan";
els.plan.appendChild(noPlan);

for (const plan of state.plans) {
const option = document.createElement("option");
option.value = plan.id;
option.textContent = `${plan.title} (${formatStatus(plan.status)})`;
els.plan.appendChild(option);
}
}

async function loadMilestones() {
const { data, error } = await supabase
.from("group_milestones")
.select(`       id,
      group_id,
      plan_id,
      title,
      description,
      milestone_date,
      category,
      amount,
      document_id,
      created_by,
      created_at,
      updated_at
    `)
.eq("group_id", state.groupId)
.order("milestone_date", { ascending: true })
.order("created_at", { ascending: false });

if (error) {
throw error;
}

state.milestones = data || [];

updateKpis();
renderMilestones();
}

async function refreshData() {
try {
await loadPlans();
await loadMilestones();
showMessage("Milestones refreshed.", "success");
} catch (error) {
console.error(error);
showMessage(normalizeError(error), "error");
}
}

async function handleCreateMilestone(event) {
event.preventDefault();

if (!isManagementRole()) {
showMessage("You do not have permission to create milestones.", "error");
return;
}

const title = els.title.value.trim();
const category = els.category.value;
const planId = els.plan.value || null;
const milestoneDate = els.date.value;
const description = els.description.value.trim();
const documentId = els.documentId.value.trim() || null;

if (!title) {
showMessage("Milestone title is required.", "error");
return;
}

if (!MILESTONE_CATEGORIES.includes(category)) {
showMessage("Invalid milestone category.", "error");
return;
}

if (!milestoneDate) {
showMessage("Milestone date is required.", "error");
return;
}

let amount = null;

if (els.amount.value !== "") {
amount = Number(els.amount.value);

```
if (!Number.isFinite(amount) || amount < 0) {
  showMessage("Amount must be zero or greater.", "error");
  return;
}
```

}

if (planId && !state.plans.some((plan) => plan.id === planId)) {
showMessage("The selected plan does not belong to the current group.", "error");
return;
}

if (documentId && !isUuid(documentId)) {
showMessage("Document ID must be a valid UUID when supplied.", "error");
return;
}

setFormBusy(true);

try {
const payload = {
group_id: state.groupId,
plan_id: planId,
title,
description: description || null,
milestone_date: milestoneDate,
category,
amount,
document_id: documentId,
created_by: state.currentMember.id
};

```
const { error } = await supabase
  .from("group_milestones")
  .insert(payload);

if (error) {
  throw error;
}

clearForm();
await loadMilestones();

showMessage("Milestone created successfully.", "success");
```

} catch (error) {
console.error("CHAMA LIVE: milestone creation failed", error);
showMessage(normalizeError(error), "error");
} finally {
setFormBusy(false);
}
}

async function handleTableAction(event) {
const button = event.target.closest("button[data-action]");

if (!button) {
return;
}

const milestoneId = button.dataset.id;
const action = button.dataset.action;

if (!milestoneId) {
return;
}

if (action === "delete") {
await deleteMilestone(milestoneId);
}
}

async function deleteMilestone(id) {
if (!isManagementRole()) {
showMessage("You do not have permission to delete milestones.", "error");
return;
}

const milestone = state.milestones.find((item) => item.id === id);

if (!milestone) {
showMessage("Milestone could not be found.", "error");
return;
}

const confirmed = window.confirm(
`Delete milestone "${milestone.title}"? This action cannot be undone.`
);

if (!confirmed) {
return;
}

try {
const { error } = await supabase
.from("group_milestones")
.delete()
.eq("id", id)
.eq("group_id", state.groupId);

```
if (error) {
  throw error;
}

await loadMilestones();
showMessage("Milestone deleted successfully.", "success");
```

} catch (error) {
console.error("CHAMA LIVE: milestone deletion failed", error);
showMessage(normalizeError(error), "error");
}
}

function updateKpis() {
const milestones = state.milestones;

const today = todayString();

const upcoming = milestones.filter(
(milestone) => milestone.milestone_date >= today
).length;

const linked = milestones.filter(
(milestone) => Boolean(milestone.plan_id)
).length;

const totalAmount = milestones.reduce(
(sum, milestone) => sum + numericAmount(milestone.amount),
0
);

els.totalMilestones.textContent = String(milestones.length);
els.upcomingMilestones.textContent = String(upcoming);
els.linkedMilestones.textContent = String(linked);
els.milestoneAmount.textContent = formatCurrency(totalAmount);
}

function renderMilestones() {
if (!els.body) {
return;
}

const search = String(els.search?.value || "").trim().toLowerCase();
const category = els.categoryFilter?.value || "";

const filtered = state.milestones.filter((milestone) => {
const matchesCategory =
!category || milestone.category === category;

```
if (!matchesCategory) {
  return false;
}

if (!search) {
  return true;
}

const planTitle = getPlanTitle(milestone.plan_id);

const haystack = [
  milestone.title,
  milestone.description,
  milestone.category,
  planTitle
]
  .filter(Boolean)
  .join(" ")
  .toLowerCase();

return haystack.includes(search);
```

});

if (!filtered.length) {
els.body.innerHTML = `       <tr>         <td colspan="8" class="empty-state">
          No milestones found.         </td>       </tr>
    `;
return;
}

els.body.innerHTML = filtered
.map((milestone) => {
const planTitle = getPlanTitle(milestone.plan_id);
const createdDate = formatDateTime(milestone.created_at);

```
  return `
    <tr>
      <td>
        <strong>${escapeHtml(milestone.title)}</strong>
        ${
          milestone.document_id
            ? `<div class="help-text">Document attached</div>`
            : ""
        }
      </td>

      <td>
        <span class="status-badge">
          ${escapeHtml(formatStatus(milestone.category))}
        </span>
      </td>

      <td>
        ${escapeHtml(planTitle || "—")}
      </td>

      <td>
        ${escapeHtml(formatDate(milestone.milestone_date))}
      </td>

      <td class="amount">
        ${
          milestone.amount === null ||
          milestone.amount === undefined
            ? "—"
            : escapeHtml(formatCurrency(milestone.amount))
        }
      </td>

      <td>
        ${escapeHtml(milestone.description || "—")}
      </td>

      <td>
        ${escapeHtml(createdDate)}
      </td>

      <td>
        <div class="actions">
          ${
            isManagementRole()
              ? `
                <button
                  type="button"
                  class="btn-danger"
                  data-action="delete"
                  data-id="${escapeHtml(milestone.id)}"
                >
                  Delete
                </button>
              `
              : "—"
          }
        </div>
      </td>
    </tr>
  `;
})
.join("");
```

}

function clearForm() {
els.form?.reset();

if (els.category) {
els.category.value = "general";
}

if (els.plan) {
els.plan.value = "";
}
}

function setFormBusy(busy) {
if (els.createButton) {
els.createButton.disabled = busy || !isManagementRole();
els.createButton.textContent = busy
? "Creating..."
: "Create Milestone";
}
}

function getPlanTitle(planId) {
if (!planId) {
return "";
}

const plan = state.plans.find((item) => item.id === planId);
return plan?.title || "Linked plan";
}

function numericAmount(value) {
if (value === null || value === undefined || value === "") {
return 0;
}

const number = Number(value);
return Number.isFinite(number) ? number : 0;
}

function formatCurrency(value) {
return `KSh ${numericAmount(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDate(value) {
if (!value) {
return "—";
}

const date = new Date(`${value}T00:00:00`);

if (Number.isNaN(date.getTime())) {
return value;
}

return date.toLocaleDateString("en-KE", {
day: "2-digit",
month: "short",
year: "numeric"
});
}

function formatDateTime(value) {
if (!value) {
return "—";
}

const date = new Date(value);

if (Number.isNaN(date.getTime())) {
return value;
}

return date.toLocaleString("en-KE", {
day: "2-digit",
month: "short",
year: "numeric",
hour: "2-digit",
minute: "2-digit"
});
}

function formatStatus(value) {
if (!value) {
return "";
}

return String(value)
.replaceAll("_", " ")
.replace(/\b\w/g, (character) => character.toUpperCase());
}

function todayString() {
const date = new Date();

const year = date.getFullYear();
const month = String(date.getMonth() + 1).padStart(2, "0");
const day = String(date.getDate()).padStart(2, "0");

return `${year}-${month}-${day}`;
}

function isUuid(value) {
return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
value
);
}

function escapeHtml(value) {
return String(value ?? "")
.replaceAll("&", "&")
.replaceAll("<", "<")
.replaceAll(">", ">")
.replaceAll('"', """)
.replaceAll("'", "'");
}

function normalizeError(error) {
if (!error) {
return "An unexpected error occurred.";
}

const message = String(error.message || "").trim();

if (!message) {
return "The requested operation could not be completed.";
}

if (
message.includes("row-level security") ||
message.includes("permission denied")
) {
return "You do not have permission to perform this operation for the current group.";
}

if (
message.includes("violates") ||
message.includes("foreign key") ||
message.includes("check constraint")
) {
return "The milestone data does not satisfy the group's database rules.";
}

return message;
}

function showMessage(message, type = "success") {
if (!els.message) {
return;
}

els.message.textContent = message;
els.message.className = `message show ${type}`;

window.clearTimeout(showMessage.timeout);

showMessage.timeout = window.setTimeout(() => {
els.message.className = "message";
els.message.textContent = "";
}, 5000);
}

console.log("CHAMA LIVE: milestones.js ready");

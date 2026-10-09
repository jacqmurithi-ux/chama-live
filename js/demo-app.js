import { getDemoContext, getDemoRows, setDemoOverride, resetDemoChanges } from "./demo-api.js";
import { endDemo, getDemoToken } from "./demo-session.js";

const pageContent = document.querySelector("#pageContent");
const errorBox = document.querySelector("#demoError");
const editDialog = document.querySelector("#editDialog");
const editForm = document.querySelector("#editForm");
const editJson = document.querySelector("#editJson");
const editError = document.querySelector("#editError");
const money = value => new Intl.NumberFormat("en-KE", { style:"currency", currency:"KES", maximumFractionDigits:0 }).format(Number(value || 0));
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[char]));
const definitions = {
  members:{title:"Members",table:"members",fields:["member_number","name","actual_position_name","role","status","phone","email"]},
  contributions:{title:"Contributions",table:"contributions",fields:["contribution_date","member_id","amount","contribution_type","payment_method","status"]},
  fines:{title:"Fines",table:"fines",fields:["created_at","member_id","fine_type","amount","reason","status"]},
  meetings:{title:"Meetings & Attendance",table:"meetings",fields:["date","title","venue","status","type","minutes"]},
  expenses:{title:"Expenses",table:"expenses",fields:["date","description","category","amount","payment_method"]},
  assets:{title:"Assets",table:"group_assets",fields:["name","category","purchase_date","purchase_value","current_value","status"]},
  plans:{title:"Plans & Activities",table:"group_plans",fields:["title","status","start_date","end_date","budget"]},
  milestones:{title:"Milestones",table:"group_milestones",fields:["title","status","target_date","description"]},
  welfare:{title:"Welfare",table:"group_support_cases",fields:["created_at","case_type","status","description","amount"]},
  periods:{title:"Financial Periods",table:"financial_periods",fields:["month","status","opening_balance","closing_balance"]},
  closing:{title:"Monthly Closing",table:"monthly_closings",fields:["closing_month","status","closed_at","opening_balance","closing_balance"]},
  reports:{title:"Reports",table:"contributions",fields:["contribution_date","member_id","amount","contribution_type","payment_method"]},
  billing:{title:"Billing",table:"group_subscriptions",fields:["status","plan_id","current_period_start","current_period_end"]},
  group:{title:"Group Management",table:"groups",fields:["name","category","registration_number","monthly_contribution","location","town","email","phone"]}
};
let currentPage = "dashboard";
let currentDefinition = null;
let currentRows = [];
let editingRow = null;
let context = null;

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}
function clearError() { errorBox.hidden = true; errorBox.textContent = ""; }
function pageTitle(page) {
  return page === "dashboard" ? "Group dashboard" : (definitions[page]?.title || "Dashboard");
}
function renderDashboard(data) {
  const count = key => Array.isArray(data[key]) ? data[key].length : 0;
  const metrics = [
    ["Members",count("members")],["Contribution records",count("contributions")],
    ["Meetings",count("meetings")],["Fines",count("fines")],
    ["Expenses",count("expenses")],["Assets",count("group_assets")],
    ["Financial periods",count("financial_periods")],["Welfare cases",count("group_support_cases")]
  ];
  pageContent.innerHTML = `
    <div class="demo-page-heading"><div><p class="demo-kicker">OVERVIEW</p><h1>Group dashboard</h1><p class="demo-note">Welcome to ${escapeHtml(context?.group_name || "Furaha Investment Group")}. This is a sandbox view of simulated group records.</p></div><span class="demo-pill">DEMO</span></div>
    <div class="demo-metrics">${metrics.map(([label,value])=>`<article class="demo-metric"><span>${escapeHtml(label)}</span><strong>${value}</strong></article>`).join("")}</div>
    <section class="demo-panel"><div class="demo-panel-heading"><div><h2>Explore your workspace</h2><p>Choose a module from the navigation to inspect the seeded records and test temporary edits.</p></div></div><div class="demo-shortcuts">${Object.entries(definitions).slice(0,8).map(([key,def])=>`<button type="button" class="demo-shortcut" data-shortcut="${key}"><strong>${escapeHtml(def.title)}</strong><span>Open module →</span></button>`).join("")}</div></section>
    <p class="demo-status">Financial values are displayed as sample records only. No real payment is initiated or verified in this sandbox.</p>`;
  pageContent.querySelectorAll("[data-shortcut]").forEach(button => button.addEventListener("click",()=>navigate(button.dataset.shortcut)));
}
async function loadDashboard() {
  const names = ["members","contributions","meetings","fines","expenses","group_assets","financial_periods","group_support_cases"];
  const results = await Promise.all(names.map(async name => [name, await getDemoRows(name)]));
  renderDashboard(Object.fromEntries(results));
}
function cellValue(row, key) {
  const value = row[key];
  if (value && typeof value === "object") return JSON.stringify(value);
  if (key.endsWith("_id") && key !== "id") return String(value ?? "").slice(0,8) || "—";
  if (key.includes("amount") || key.includes("balance") || key.includes("value") || key === "budget") return value == null ? "—" : money(value);
  if (typeof value === "string" && value.length > 70) return value.slice(0,67)+"…";
  return value == null || value === "" ? "—" : String(value);
}
function renderTable(def, rows) {
  currentRows = Array.isArray(rows) ? rows : [];
  const keys = def.fields.filter(key => currentRows.some(row => Object.prototype.hasOwnProperty.call(row,key)));
  const safeKeys = keys.length ? keys : Object.keys(currentRows[0] || {}).filter(key => !["id","group_id"].includes(key)).slice(0,6);
  pageContent.innerHTML = `
    <div class="demo-page-heading"><div><p class="demo-kicker">FURAHA INVESTMENT GROUP</p><h1>${escapeHtml(def.title)}</h1><p class="demo-note">Seeded demo records with session-only editing.</p></div><span class="demo-pill">${currentRows.length} records</span></div>
    <section class="demo-panel"><div class="demo-table-toolbar"><input id="tableSearch" type="search" placeholder="Search records…" aria-label="Search records"><span class="demo-note">Use Edit to test a temporary change.</span></div>
      <div class="demo-table-wrap"><table class="demo-table"><thead><tr>${safeKeys.map(key=>`<th>${escapeHtml(key.replaceAll("_"," "))}</th>`).join("")}<th>Action</th></tr></thead><tbody>${currentRows.length ? currentRows.map((row,index)=>`<tr data-row-index="${index}">${safeKeys.map(key=>`<td title="${escapeHtml(cellValue(row,key))}">${escapeHtml(cellValue(row,key))}</td>`).join("")}<td><button type="button" class="demo-row-edit" data-edit-index="${index}">Edit</button></td></tr>`).join("") : `<tr><td colspan="${safeKeys.length+1}">No demo records available for this section.</td></tr>`}</tbody></table></div>
    </section>
    <p class="demo-note">Edits are scoped to this demo session. The original seeded record remains unchanged.</p>`;
  const search = pageContent.querySelector("#tableSearch");
  search.addEventListener("input", () => {
    const query = search.value.toLowerCase();
    pageContent.querySelectorAll("tbody tr[data-row-index]").forEach(row => {
      row.hidden = !row.textContent.toLowerCase().includes(query);
    });
  });
  pageContent.querySelectorAll("[data-edit-index]").forEach(button => button.addEventListener("click", () => openEditor(currentRows[Number(button.dataset.editIndex)])));
}
function openEditor(row) {
  if (!row?.id) return showError("This record has no editable identifier.");
  editingRow = row;
  editJson.value = JSON.stringify(row,null,2);
  editError.hidden = true;
  document.querySelector("#editTitle").textContent = `Edit ${currentDefinition.title.toLowerCase()} record`;
  editDialog.showModal();
}
editForm.addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const parsed = JSON.parse(editJson.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.id !== editingRow.id) {
      throw new Error("Keep the original record id unchanged.");
    }
    await setDemoOverride(currentDefinition.table, editingRow.id, parsed, "upsert");
    editDialog.close();
    await navigate(currentPage);
  } catch (error) {
    editError.textContent = error instanceof Error ? error.message : "Could not save this temporary change.";
    editError.hidden = false;
  }
});
document.querySelector("#cancelEdit").addEventListener("click",()=>editDialog.close());
async function navigate(page) {
  currentPage = page;
  document.querySelectorAll("[data-page]").forEach(button => button.classList.toggle("active",button.dataset.page===page));
  document.querySelector("#demoSidebar").classList.remove("open");
  clearError();
  if (page === "dashboard") {
    pageContent.innerHTML = '<p class="demo-status">Loading dashboard records…</p>';
    try { await loadDashboard(); } catch (error) { showError(error.message || "Could not load the demo dashboard."); }
    return;
  }
  const def = definitions[page];
  if (!def) return;
  currentDefinition = def;
  pageContent.innerHTML = '<p class="demo-status">Loading records…</p>';
  try { renderTable(def, await getDemoRows(def.table)); }
  catch (error) { showError(error.message || "Could not load demo records."); }
}
document.querySelectorAll("[data-page]").forEach(button=>button.addEventListener("click",()=>navigate(button.dataset.page)));
document.querySelector("#menuToggle").addEventListener("click",()=>document.querySelector("#demoSidebar").classList.toggle("open"));
document.querySelector("#resetDemo").addEventListener("click",async()=>{
  if (!confirm("Discard all temporary changes in this session and restore the seeded baseline?")) return;
  try { await resetDemoChanges(); await navigate(currentPage); } catch(error) { showError(error.message || "Reset failed."); }
});
document.querySelector("#endDemo").addEventListener("click",async()=>{
  if (!confirm("End this demo session and discard its temporary changes?")) return;
  await endDemo();
});
window.addEventListener("DOMContentLoaded", async()=>{
  if (!getDemoToken()) { window.location.replace("./demo.html"); return; }
  try {
    context = await getDemoContext();
    if (!context?.demo) throw new Error("This demo session is invalid.");
    document.querySelector("#groupName").textContent = context.group_name || "Furaha Investment Group";
    const requestedPage = new URLSearchParams(window.location.search).get("page");
    await navigate(requestedPage && (requestedPage === "dashboard" || definitions[requestedPage]) ? requestedPage : "dashboard");
  } catch(error) {
    showError(error.message || "The demo session could not be opened.");
  }
});
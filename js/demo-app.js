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
  group:{title:"Group Management",table:"groups",fields:["name","category","registration_number","monthly_contribution","location","town","email","phone"]},
  memberDashboard:{title:"Member Dashboard Preview",dashboard:true},
  memberContributions:{title:"My Contributions",table:"contributions",fields:["contribution_date","amount","contribution_type","payment_method","status"]},
  memberAccounting:{title:"Member Accounting",table:"contribution_obligations",fields:["obligation_month","amount_due","amount_paid","status","member_id"]},
  memberActivities:{title:"Member Activities",table:"group_activities",fields:["title","activity_date","status","description"]},
  memberAssets:{title:"Member Assets",table:"group_assets",fields:["name","category","purchase_date","purchase_value","current_value","status"]},
  memberMilestones:{title:"Member Milestones",table:"group_milestones",fields:["title","status","target_date","description"]},
  memberProfile:{title:"Member Profile Preview",table:"members",fields:["member_number","name","actual_position_name","status","email","phone"]},
  adminMembers:{title:"Admin Member Management",table:"members",fields:["member_number","name","actual_position_name","role","status","email","phone"]},
  dataImport:{title:"Data Import Simulation",custom:true},
  adminGettingStarted:{title:"Admin Getting Started",guide:"admin"},
  memberGettingStarted:{title:"Member Getting Started",guide:"member"}
};
let currentPage = "dashboard";
let currentDefinition = null;
let currentRows = [];
let editingRow = null;
let context = null;

function renderGuide(type) {
  const admin = type === "admin";
  pageContent.innerHTML = `
    <div class="demo-page-heading"><div><p class="demo-kicker">QUICK START</p><h1>${admin ? "Admin Getting Started" : "Member Getting Started"}</h1><p class="demo-note">A guided preview using the Furaha Investment Group sandbox.</p></div><span class="demo-pill">DEMO GUIDE</span></div>
    <section class="demo-panel"><h2>${admin ? "Explore the group workspace" : "Explore the member experience"}</h2>
      <ol class="demo-guide-list">
        ${(admin ? [
          ["Review the dashboard","Check sample members, contributions, meetings, expenses and fines."],
          ["Open Members","Search the fictional roster and create, edit or hide a temporary profile."],
          ["Explore finance modules","Inspect sample contributions, fines, expenses and monthly closing records."],
          ["Test a safe change","Use a module's New record, Edit or Delete controls; only your session view changes."],
          ["Reset the sandbox","Use Reset changes to return your session to the seeded baseline."]
        ] : [
          ["Open Member Dashboard Preview","See the sample group overview without signing into a member account."],
          ["Review My Contributions","Inspect simulated contribution records and amounts."],
          ["Explore activities and assets","View group activities, assets and milestones."],
          ["Preview your profile","Member profiles are fictional and contact details are reserved placeholders."],
          ["End your session","End demo clears your temporary overrides and revokes the session."]
        ]).map(([title,description])=>`<li><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></li>`).join("")}
      </ol>
    </section>`;
}
function renderDataImport() {
  pageContent.innerHTML = `
    <div class="demo-page-heading"><div><p class="demo-kicker">ADMIN TOOLS</p><h1>Data Import Simulation</h1><p class="demo-note">Preview CSV rows and create simulated contribution records only. No file is sent to production and no canonical ledger writes occur.</p></div><span class="demo-pill">SIMULATION</span></div>
    <section class="demo-panel"><h2>Paste sample contribution CSV</h2><p class="demo-note">Required columns: contribution_date, amount, contribution_type, member_id. Member IDs must be selected from the demo roster.</p>
      <label for="importCsv">CSV data</label>
      <textarea id="importCsv" rows="8" spellcheck="false">contribution_date,amount,contribution_type,member_id</textarea>
      <div class="demo-dialog-actions"><button id="previewImport" type="button">Preview rows</button><button id="applyImport" type="button" class="demo-primary">Create simulated rows</button></div>
      <div id="importPreview" class="demo-import-preview" aria-live="polite"></div>
      <div id="importError" class="demo-error" hidden role="alert"></div>
    </section>`;
  let parsedRows = [];
  const csvInput = pageContent.querySelector("#importCsv");
  const preview = pageContent.querySelector("#importPreview");
  const importError = pageContent.querySelector("#importError");
  const parse = () => {
    const lines = csvInput.value.split(/\\r?\\n/).map(line=>line.trim()).filter(Boolean);
    if (lines.length < 2) throw new Error("Add a header row and at least one data row.");
    const headers = lines[0].split(",").map(h=>h.trim());
    const required = ["contribution_date","amount","contribution_type","member_id"];
    if (required.some(h=>!headers.includes(h))) throw new Error("CSV header must include contribution_date, amount, contribution_type and member_id.");
    const members = new Set((currentRows || []).map(row=>row.id));
    return lines.slice(1).map((line,index)=>{
      const values=line.split(",").map(v=>v.trim());
      const row=Object.fromEntries(headers.map((h,i)=>[h,values[i] ?? ""]));
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(row.contribution_date)) throw new Error(`Row ${index+2}: use YYYY-MM-DD for contribution_date.`);
      if (!Number.isFinite(Number(row.amount)) || Number(row.amount)<=0) throw new Error(`Row ${index+2}: amount must be greater than zero.`);
      if (!row.contribution_type) throw new Error(`Row ${index+2}: contribution_type is required.`);
      return row;
    });
  };
  pageContent.querySelector("#previewImport").addEventListener("click",async()=>{
    importError.hidden=true;
    try {
      const members=await getDemoRows("members");
      const ids=new Set(members.map(row=>row.id));
      parsedRows=parse();
      if(parsedRows.some(row=>!ids.has(row.member_id))) throw new Error("Every member_id must match a member in the demo roster.");
      preview.textContent=`${parsedRows.length} simulated contribution row(s) ready to create. Nothing has been saved yet.`;
    } catch(error) { importError.textContent=error.message||"CSV validation failed."; importError.hidden=false; }
  });
  pageContent.querySelector("#applyImport").addEventListener("click",async()=>{
    importError.hidden=true;
    try {
      const groups=await getDemoRows("groups");
      const groupId=groups?.[0]?.id;
      if(!groupId) throw new Error("Could not identify the demo group.");
      const members=await getDemoRows("members");
      const ids=new Set(members.map(row=>row.id));
      parsedRows=parse();
      if(parsedRows.some(row=>!ids.has(row.member_id))) throw new Error("Every member_id must match a member in the demo roster.");
      for(const row of parsedRows) {
        const id=crypto.randomUUID();
        await setDemoOverride("contributions",id,{
          id,group_id:groupId,member_id:row.member_id,contribution_date:row.contribution_date,
          amount:Number(row.amount),contribution_type:row.contribution_type,payment_method:"demo-import",
          status:"simulated",source:"demo-import"
        },"upsert");
      }
      preview.textContent=`Created ${parsedRows.length} simulated row(s) in this session only. The real contribution ledger is unchanged.`;
    } catch(error) { importError.textContent=error.message||"Could not create simulated rows."; importError.hidden=false; }
  });
}
function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}
function clearError() { errorBox.hidden = true; errorBox.textContent = ""; }
function pageTitle(page) {
  return page === "dashboard" ? "Group dashboard" : (definitions[page]?.title || "Dashboard");
}
function renderDashboard(data, memberView = false) {
  const count = key => Array.isArray(data[key]) ? data[key].length : 0;
  const sum = key => (Array.isArray(data[key]) ? data[key] : []).reduce((total,row)=>total+Number(row.amount ?? row.current_value ?? 0),0);
  const metrics = [
    ["Members",count("members")],
    ["Contributions (sample)",money(sum("contributions"))],
    ["Expenses (sample)",money(sum("expenses"))],
    ["Meetings",count("meetings")],
    ["Fines",count("fines")],
    ["Assets",count("group_assets")],
    ["Financial periods",count("financial_periods")],
    ["Welfare cases",count("group_support_cases")]
  ];
  pageContent.innerHTML = `
    <div class="demo-page-heading"><div><p class="demo-kicker">OVERVIEW</p><h1>${memberView ? "Member Dashboard Preview" : "Group dashboard"}</h1><p class="demo-note">${memberView ? "A preview of the member-facing experience. No member account is signed in." : "Welcome to " + escapeHtml(context?.group_name || "Furaha Investment Group") + ". This is a sandbox view of simulated group records."}</p></div><span class="demo-pill">DEMO</span></div>
    <div class="demo-metrics">${metrics.map(([label,value])=>`<article class="demo-metric"><span>${escapeHtml(label)}</span><strong>${value}</strong></article>`).join("")}</div>
    <section class="demo-panel"><div class="demo-panel-heading"><div><h2>Explore your workspace</h2><p>Choose a module from the navigation to inspect the seeded records and test temporary edits.</p></div></div><div class="demo-shortcuts">${Object.entries(definitions).slice(0,8).map(([key,def])=>`<button type="button" class="demo-shortcut" data-shortcut="${key}"><strong>${escapeHtml(def.title)}</strong><span>Open module →</span></button>`).join("")}</div></section>
    <p class="demo-status">Financial values are displayed as sample records only. No real payment is initiated or verified in this sandbox.</p>`;
  pageContent.querySelectorAll("[data-shortcut]").forEach(button => button.addEventListener("click",()=>navigate(button.dataset.shortcut)));
}
async function loadDashboard(memberView = false) {
  const names = ["members","contributions","meetings","fines","expenses","group_assets","financial_periods","group_support_cases"];
  const results = await Promise.all(names.map(async name => [name, await getDemoRows(name)]));
  renderDashboard(Object.fromEntries(results), memberView);
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
    <section class="demo-panel"><div class="demo-table-toolbar"><input id="tableSearch" type="search" placeholder="Search records…" aria-label="Search records"><div class="demo-table-actions"><span class="demo-note">Changes stay in this session.</span>${def.table === "groups" ? "" : '<button type="button" id="newDemoRecord" class="demo-primary">+ New record</button>'}</div></div>
      <div class="demo-table-wrap"><table class="demo-table"><thead><tr>${safeKeys.map(key=>`<th>${escapeHtml(key.replaceAll("_"," "))}</th>`).join("")}<th>Action</th></tr></thead><tbody>${currentRows.length ? currentRows.map((row,index)=>`<tr data-row-index="${index}">${safeKeys.map(key=>`<td title="${escapeHtml(cellValue(row,key))}">${escapeHtml(cellValue(row,key))}</td>`).join("")}<td class="demo-row-actions"><button type="button" class="demo-row-edit" data-edit-index="${index}">Edit</button><button type="button" class="demo-row-delete" data-delete-index="${index}">Delete</button></td></tr>`).join("") : `<tr><td colspan="${safeKeys.length+1}">No demo records available for this section.</td></tr>`}</tbody></table></div>
    </section>
    <p class="demo-note">All changes are session-only overrides. Seeded records and the real accounting ledger are not modified.</p>`;
  const search = pageContent.querySelector("#tableSearch");
  search.addEventListener("input", () => {
    const query = search.value.toLowerCase();
    pageContent.querySelectorAll("tbody tr[data-row-index]").forEach(row => {
      row.hidden = !row.textContent.toLowerCase().includes(query);
    });
  });
  pageContent.querySelectorAll("[data-edit-index]").forEach(button => button.addEventListener("click", () => openEditor(currentRows[Number(button.dataset.editIndex)])));
  pageContent.querySelectorAll("[data-delete-index]").forEach(button => button.addEventListener("click", async () => {
    const row = currentRows[Number(button.dataset.deleteIndex)];
    if (!row?.id || !confirm("Hide this record in your demo session? The original seed record will remain unchanged.")) return;
    try {
      await setDemoOverride(currentDefinition.table, row.id, null, "delete");
      await navigate(currentPage);
    } catch (error) {
      showError(error.message || "Could not delete this demo record.");
    }
  }));
  const createButton = pageContent.querySelector("#newDemoRecord");
  if (createButton) createButton.addEventListener("click", async () => {
    try {
      const groups = await getDemoRows("groups");
      const groupId = groups?.[0]?.id;
      if (!groupId) throw new Error("Could not identify the demo group.");
      const id = crypto.randomUUID();
      const row = { id, group_id: groupId };
      for (const field of currentDefinition.fields) {
        if (!(field in row)) row[field] = "";
      }
      openEditor(row);
      document.querySelector("#editTitle").textContent = `Create demo ${currentDefinition.title.toLowerCase()} record`;
    } catch (error) {
      showError(error.message || "Could not start a new demo record.");
    }
  });
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
  if (page === "dashboard" || page === "memberDashboard") {
    pageContent.innerHTML = '<p class="demo-status">Loading dashboard records…</p>';
    try { await loadDashboard(page === "memberDashboard"); } catch (error) { showError(error.message || "Could not load the demo dashboard."); }
    return;
  }
  const def = definitions[page];
  if (!def) return;
  currentDefinition = def;
  if (def.guide) {
    renderGuide(def.guide);
    return;
  }
  if (def.custom && page === "dataImport") {
    renderDataImport();
    return;
  }
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
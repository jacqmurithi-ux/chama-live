import { supabase } from "./supabase.js";
import { loadMyAccountBundle, uploadMyPaymentProof, submitMyPaymentEvidence, logMyAccountExport, sortAccountRecords, escapeAccountHtml } from "./my-account-service.js";

let initialized = false;
let bundle = null;
let recordRows = [];
let visibleRecordRows = [];
let showAllRecords = false;

const money = value => new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", maximumFractionDigits: 2 }).format(Number(value || 0));
const date = value => value ? new Date(value).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const el = id => document.getElementById(id);

function setMessage(id, message, isError = false) {
  const node = el(id);
  if (!node) return;
  node.textContent = message || "";
  node.hidden = !message;
  node.classList.toggle("account-error", isError);
}
function summaryCard(label, value) {
  return `<article class="account-stat"><span>${escapeAccountHtml(label)}</span><strong>${escapeAccountHtml(value)}</strong></article>`;
}
function recordSet() {
  const contributions = bundle.contributions.map(row => ({
    date: row.payment_date || row.contribution_date || row.created_at,
    amount: Number(row.amount || 0),
    type: row.contribution_type || "Contribution",
    status: "Recognized",
    reference: row.mpesa_reference || row.reference || "—",
    details: row.notes || row.initiative_name || ""
  }));
  const evidence = bundle.paymentEvidence.map(row => ({
    date: row.payment_date || row.submitted_at,
    amount: Number(row.amount || 0),
    type: "Payment evidence",
    status: row.status || "pending",
    reference: row.mpesa_reference || "—",
    details: row.evidence_text || ""
  }));
  const loans = bundle.loans.map(row => ({
    date: row.disbursed_at || row.created_at,
    amount: Number(row.approved_amount || row.requested_amount || 0),
    type: "Loan",
    status: row.status || "—",
    reference: row.id || "—",
    details: row.purpose || ""
  }));
  const fines = bundle.fines.map(row => ({
    date: row.imposed_at || row.triggered_at || row.created_at,
    amount: Number(row.calculated_amount ?? row.original_amount ?? 0),
    type: "Fine",
    status: row.status || "Recorded",
    reference: row.id || "—",
    details: row.reason || row.accounting_month || ""
  }));
  return [...contributions, ...evidence, ...loans, ...fines];
}
function recordMonthKey(row) {
  const raw = row.date || "";
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
  }
  const match = String(raw).match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : "";
}
function populateRecordMonthFilter() {
  const select = el("accountMonthFilter");
  if (!select) return;
  const previous = select.value || "all";
  const months = [...new Set(recordSet().map(recordMonthKey).filter(Boolean))].sort((a,b) => b.localeCompare(a));
  select.innerHTML = ['<option value="all">All months</option>', ...months.map(month => {
    const [year, number] = month.split("-");
    const label = new Date(Number(year), Number(number) - 1, 1).toLocaleDateString("en-KE", { month: "long", year: "numeric" });
    return `<option value="${month}">${escapeAccountHtml(label)}</option>`;
  })].join("");
  select.value = months.includes(previous) ? previous : "all";
}
function renderRecords() {
  const field = el("accountSortField")?.value || "date";
  const direction = el("accountSortDirection")?.value || "desc";
  const selectedMonth = el("accountMonthFilter")?.value || "all";
  const allSortedRows = sortAccountRecords(recordSet(), field, direction);
  recordRows = allSortedRows;
  const monthRows = selectedMonth === "all" ? allSortedRows : allSortedRows.filter(row => recordMonthKey(row) === selectedMonth);
  visibleRecordRows = showAllRecords ? monthRows : monthRows.slice(0, 5);
  const body = el("myAccountRecords");
  if (!body) return;
  const count = el("myAccountRecordsCount");
  if (count) count.textContent = selectedMonth === "all"
    ? `Showing ${visibleRecordRows.length} of ${monthRows.length} records`
    : `Showing ${visibleRecordRows.length} of ${monthRows.length} records for selected month`;
  const summary = el("myAccountRecordsSummary");
  if (summary) summary.textContent = showAllRecords ? "Showing all matching records" : "Latest 5 matching records shown";
  const showAllButton = el("accountShowAllRecords");
  if (showAllButton) {
    showAllButton.hidden = monthRows.length <= 5 || showAllRecords;
    showAllButton.textContent = "Show all records";
  }
  if (!monthRows.length) {
    body.innerHTML = '<tr><td colspan="6" class="account-empty">No records found for this month.</td></tr>';
    return;
  }
  body.innerHTML = visibleRecordRows.map(row => `<tr>
    <td>${escapeAccountHtml(date(row.date))}</td>
    <td>${escapeAccountHtml(row.type)}</td>
    <td>${escapeAccountHtml(money(row.amount))}</td>
    <td><span class="account-status">${escapeAccountHtml(row.status)}</span></td>
    <td>${escapeAccountHtml(row.reference)}</td>
    <td>${escapeAccountHtml(row.details)}</td>
  </tr>`).join("");
}
function renderBundle() {
  const m = bundle.member;
  const s = bundle.summary;
  el("myAccountName").textContent = m.name || m.full_name || "Member";
  el("myAccountMeta").textContent = [m.email, m.phone, m.member_number || m.membership_number, m.role].filter(Boolean).join(" · ");
  el("myAccountProfile").innerHTML = [
    ["Full name", m.name || m.full_name], ["Email", m.email], ["Phone", m.phone],
    ["Member number", m.member_number || m.membership_number], ["Group", bundle.group?.name],
    ["Role", m.role], ["Member since", date(m.join_date)], ["Membership status", m.status]
  ].map(([label, value]) => `<div class="account-profile-field"><span>${escapeAccountHtml(label)}</span><strong>${escapeAccountHtml(value || "—")}</strong></div>`).join("");
  el("myAccountSummary").innerHTML = [
    summaryCard("All Contributions", money(s.recognizedContributions)),
    summaryCard("Allocated to Monthly Obligations", money(s.totalAllocated)),
    summaryCard("Total arrears", money(s.totalArrears)),
    summaryCard("Monthly due", money(s.monthlyDue)),
    summaryCard("Allocated to obligations this month", money(s.appliedThisMonth)),
    summaryCard("Current month outstanding", money(s.outstanding)),
    summaryCard("Carry-forward credit", money(s.carryForwardCredit)),
    summaryCard("Fines outstanding", money(s.finesOutstanding))
  ].join("");
  const allocation = bundle.allocationBreakdown;
  const allocationAvailable = allocation.available === true;
  el("myAccountAllocationTypes").innerHTML = !allocationAvailable
    ? '<p class="account-muted">The contribution-type breakdown is temporarily unavailable. Existing account figures remain unchanged.</p>'
    : allocation.allocationsByType.length
      ? allocation.allocationsByType.map(row => `<div class="account-allocation-row"><span>${escapeAccountHtml(row.contributionType)}</span><strong>${escapeAccountHtml(money(row.allocatedAmount))}</strong></div>`).join("")
      : '<p class="account-muted">No allocations to contribution obligations are recorded yet.</p>';
  el("myAccountAllocationTotals").innerHTML = allocationAvailable ? [
    summaryCard("Total allocated across all types", money(allocation.totalAllocatedAcrossTypes)),
    summaryCard("Unallocated recognized contributions", money(allocation.unallocatedAmount))
  ].join("") : "";
  const allocationNote = el("myAccountAllocationNote");
  allocationNote.hidden = !allocationAvailable || !allocation.allocationExceedsRecognized;
  allocationNote.textContent = allocationAvailable && allocation.allocationExceedsRecognized
    ? "The recorded allocations exceed recognized contributions. Please ask an authorized group official to review the accounting records; this page has not changed them."
    : "";

  const loanSection = el("myAccountLoansSection");
  loanSection.hidden = !bundle.loansEnabled;
  if (bundle.loansEnabled) {
    el("myAccountLoanSummary").innerHTML = [
      summaryCard("Loans borrowed", money(s.loansBorrowed)),
      summaryCard("Loans repaid", money(s.loansRepaid)),
      summaryCard("Loan balance outstanding", money(s.loansOutstanding))
    ].join("");
  }
  populateRecordMonthFilter();
  renderRecords();
}
function toCsv(rows) {
  const columns = ["date", "type", "amount", "status", "reference", "details"];
  const quote = v => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  return [columns.join(","), ...rows.map(row => columns.map(k => quote(row[k])).join(","))].join("\r\n");
}
async function exportRecords(format) {
  setMessage("myAccountMessage", "");
  try {
    await logMyAccountExport(format, recordRows.length);
  } catch (error) {
    setMessage("myAccountMessage", "Export was not started because the audit event could not be recorded. " + (error?.message || ""), true);
    return;
  }
  if (format === "print" || format === "pdf") {
    window.print();
    return;
  }
  const csv = toCsv(recordRows);
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-account-records.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  if (format === "excel") setMessage("myAccountMessage", "An Excel-compatible CSV was downloaded. Native .xlsx workbook export is not yet available.");
}
function bindForm() {
  el("myAccountPaymentForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = el("myAccountPaymentSubmit");
    button.disabled = true;
    button.textContent = "Submitting…";
    setMessage("myAccountPaymentMessage", "");
    try {
      await submitMyPaymentEvidence({
        amount: el("paymentAmount").value,
        payment_date: el("paymentDate").value,
        payment_method: el("paymentMethod").value,
        mpesa_reference: el("paymentReference").value,
        evidence_text: el("paymentDetails").value,
        proof_storage_path: await uploadMyPaymentProof(el("paymentProof").files?.[0] || null, bundle)
      });
      el("myAccountPaymentForm").reset();
      setMessage("myAccountPaymentMessage", "Payment evidence submitted. Status: Pending verification.");
      bundle = await loadMyAccountBundle();
      renderBundle();
    } catch (error) {
      setMessage("myAccountPaymentMessage", error?.message || "Payment submission failed.", true);
    } finally {
      button.disabled = false;
      button.textContent = "Submit payment for verification";
    }
  });
  el("paymentMethod")?.addEventListener("change", () => {
    const mpesa = el("paymentMethod").value === "M-Pesa";
    el("paymentReference").required = mpesa;
    el("paymentReferenceWrap").hidden = !mpesa;
  });
  ["accountSortField", "accountSortDirection", "accountMonthFilter"].forEach(id => el(id)?.addEventListener("change", () => {
    showAllRecords = false;
    renderRecords();
  }));
  el("accountShowAllRecords")?.addEventListener("click", () => {
    showAllRecords = true;
    renderRecords();
  });
  el("accountExportCsv")?.addEventListener("click", () => exportRecords("csv"));
  ["accountExportExcel", "accountExportPdf", "accountPrint"].forEach(id => {
    el(id)?.addEventListener("click", () => exportRecords(({ accountExportCsv: "csv", accountExportExcel: "excel", accountExportPdf: "pdf", accountPrint: "print" })[id]));
  });
}

async function initializeLoanApplication() {
  const section = el("myAccountLoanApplicationSection");
  if (!section || !bundle?.loansEnabled || !bundle?.member?.group_id) return;
  let moduleConfirmedEnabled = false;
  try {
    const { data: enabled, error: enabledError } = await supabase.rpc("cl_group_module_enabled", {
      p_group_id: bundle.member.group_id,
      p_module: "loans"
    });
    if (enabledError) throw enabledError;
    if (enabled !== true) return;
    moduleConfirmedEnabled = true;
    section.hidden = false;

    const { data: settings, error: settingsError } = await supabase
      .from("loan_settings")
      .select("max_loan_amount,max_period_months")
      .eq("group_id", bundle.member.group_id)
      .maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings) {
      setMessage("myAccountLoanApplicationInfo", "Loan applications are not available yet. Please ask your group Admin to configure the loan settings.", true);
      el("myAccountLoanApplicationSubmit").disabled = true;
      return;
    }
    el("myLoanAmount").max = String(settings.max_loan_amount);
    el("myLoanPeriod").max = String(settings.max_period_months);
    el("myAccountLoanApplicationInfo").textContent =
      "Maximum amount: " + money(settings.max_loan_amount) + " · Maximum repayment period: " + settings.max_period_months + " months.";

    const { data: members, error: membersError } = await supabase
      .from("members")
      .select("id,name,member_number")
      .eq("group_id", bundle.member.group_id)
      .eq("status", "active")
      .eq("onboarding_status", "active")
      .order("name");
    if (membersError) throw membersError;
    const guarantor = el("myLoanGuarantor");
    guarantor.innerHTML = '<option value="">No guarantor selected</option>' +
      (members || []).filter(member => member.id !== bundle.member.id).map(member =>
        '<option value="' + escapeAccountHtml(member.id) + '">' +
        escapeAccountHtml(member.name || "Member") +
        (member.member_number ? " · " + escapeAccountHtml(member.member_number) : "") +
        "</option>"
      ).join("");

    el("myAccountLoanApplicationForm").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const fields = form.elements;
      const amount = Number(fields.amount.value);
      const period = Number(fields.period.value);
      if (!Number.isFinite(amount) || amount < 1 || amount > Number(settings.max_loan_amount)) {
        setMessage("myAccountLoanApplicationMessage", "Enter an amount between KES 1 and " + money(settings.max_loan_amount) + ".", true);
        return;
      }
      if (!Number.isInteger(period) || period < 1 || period > Number(settings.max_period_months)) {
        setMessage("myAccountLoanApplicationMessage", "Choose a repayment period from 1 to " + settings.max_period_months + " months.", true);
        return;
      }
      const submit = el("myAccountLoanApplicationSubmit");
      submit.disabled = true;
      setMessage("myAccountLoanApplicationMessage", "");
      try {
        const { data: stillEnabled, error: checkError } = await supabase.rpc("cl_group_module_enabled", {
          p_group_id: bundle.member.group_id,
          p_module: "loans"
        });
        if (checkError) throw checkError;
        if (stillEnabled !== true) throw new Error("Loans have been disabled for this group. Your application was not submitted.");
        const { error } = await supabase.rpc("cl_loan_apply", {
          p_group_id: bundle.member.group_id,
          p_requested_amount: String(amount),
          p_period_months: period,
          p_purpose: fields.purpose.value.trim(),
          p_guarantor_member_id: fields.guarantor.value || null
        });
        if (error) throw error;
        form.reset();
        setMessage("myAccountLoanApplicationMessage", "Your loan application was submitted for review. Submission does not mean it has been approved or disbursed.");
      } catch (error) {
        setMessage("myAccountLoanApplicationMessage", error?.message || "Unable to submit your loan application.", true);
      } finally {
        submit.disabled = false;
      }
    });
  } catch (error) {
    section.hidden = !moduleConfirmedEnabled;
    if (moduleConfirmedEnabled) {
      setMessage("myAccountLoanApplicationInfo", error?.message || "Unable to load loan application details. Please try again later.", true);
      el("myAccountLoanApplicationSubmit").disabled = true;
    }
  }
}

export async function initMyAccount() {
  if (initialized) return;
  initialized = true;
  try {
    setMessage("myAccountMessage", "");
    bundle = await loadMyAccountBundle();
    renderBundle();
    await initializeLoanApplication();
    bindForm();
    const today = new Date();
    el("paymentDate").max = [today.getFullYear(), String(today.getMonth()+1).padStart(2,"0"), String(today.getDate()).padStart(2,"0")].join("-");
    setMessage("myAccountLoading", "");
    el("myAccountLoading").hidden = true;
    el("myAccountContent").hidden = false;
  } catch (error) {
    el("myAccountLoading").hidden = true;
    setMessage("myAccountError", error?.message || "Unable to load My Account.", true);
  }
}

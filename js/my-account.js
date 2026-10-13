import { loadMyAccountBundle, uploadMyPaymentProof, submitMyPaymentEvidence, logMyAccountExport, sortAccountRecords, escapeAccountHtml } from "./my-account-service.js";

let initialized = false;
let bundle = null;
let recordRows = [];

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
function renderRecords() {
  const field = el("accountSortField")?.value || "date";
  const direction = el("accountSortDirection")?.value || "desc";
  recordRows = sortAccountRecords(recordSet(), field, direction);
  const body = el("myAccountRecords");
  if (!body) return;
  if (!recordRows.length) {
    body.innerHTML = '<tr><td colspan="6" class="account-empty">No personal financial records are available yet.</td></tr>';
    return;
  }
  body.innerHTML = recordRows.map(row => `<tr>
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
    summaryCard("Recognized contributions", money(s.recognizedContributions)),
    summaryCard("Monthly due", money(s.monthlyDue)),
    summaryCard("Applied this month", money(s.appliedThisMonth)),
    summaryCard("Current outstanding", money(s.outstanding)),
    summaryCard("Carry-forward credit", money(s.carryForwardCredit)),
    summaryCard("Fines outstanding", money(s.finesOutstanding))
  ].join("");
  const loanSection = el("myAccountLoansSection");
  loanSection.hidden = !bundle.loansEnabled;
  if (bundle.loansEnabled) {
    el("myAccountLoanSummary").innerHTML = [
      summaryCard("Loans borrowed", money(s.loansBorrowed)),
      summaryCard("Loans repaid", money(s.loansRepaid)),
      summaryCard("Loan balance outstanding", money(s.loansOutstanding))
    ].join("");
  }
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
  ["accountSortField", "accountSortDirection"].forEach(id => el(id)?.addEventListener("change", renderRecords));
  ["accountExportCsv", "accountExportExcel", "accountExportPdf", "accountPrint"].forEach(id => {
    el(id)?.addEventListener("click", () => exportRecords(({ accountExportCsv: "csv", accountExportExcel: "excel", accountExportPdf: "pdf", accountPrint: "print" })[id]));
  });
}
export async function initMyAccount() {
  if (initialized) return;
  initialized = true;
  try {
    setMessage("myAccountMessage", "");
    bundle = await loadMyAccountBundle();
    renderBundle();
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

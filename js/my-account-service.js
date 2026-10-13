import { supabase } from "./supabase.js";

/**
 * Shared, self-only account service.
 * The bundle RPC derives the member from auth.uid(); no member/group IDs
 * are accepted from the browser. The page intentionally never queries
 * group-wide member lists or canonical accounting tables directly.
 */
export async function loadMyAccountBundle() {
  const { data, error } = await supabase.rpc("cl_get_my_account_bundle");
  if (error) throw error;
  const bundle = Array.isArray(data) ? data[0] : data;
  if (!bundle?.member?.id) {
    throw new Error("Your personal member account could not be resolved. Please contact your group administrator; no duplicate account has been created.");
  }
  return normalizeBundle(bundle);
}

export async function submitMyPaymentEvidence(input) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero.");
  if (!input.payment_date) throw new Error("Select the payment date.");
  if (!["M-Pesa", "Cash", "Bank transfer"].includes(input.payment_method)) throw new Error("Select a valid payment method.");
  if (input.payment_method === "M-Pesa" && !String(input.mpesa_reference || "").trim()) throw new Error("An M-Pesa reference is required.");
  if (!String(input.evidence_text || "").trim()) throw new Error("Enter payment details.");

  // Identity and group are resolved by the database function; the browser
  // never supplies member_id or group_id to this submission.
  const { data, error } = await supabase.rpc("cl_submit_my_payment_evidence", {
    p_amount: amount,
    p_payment_date: input.payment_date,
    p_payment_method: input.payment_method,
    p_mpesa_reference: input.payment_method === "M-Pesa" ? String(input.mpesa_reference).trim() : null,
    p_evidence_text: String(input.evidence_text).trim()
  });
  if (error) throw error;
  return data;
}

export async function logMyAccountExport(format, recordCount) {
  const { error } = await supabase.rpc("cl_log_my_account_event", {
    p_action: "export",
    p_format: format,
    p_record_count: Math.max(0, Number(recordCount) || 0)
  });
  if (error) {
    // Do not falsely claim the export was audited. Caller can show this error.
    throw error;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function asNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function normalizeBundle(bundle) {
  return {
    ...bundle,
    member: bundle.member || {},
    summary: {
      ...bundle.summary,
      recognizedContributions: asNumber(bundle.summary?.recognizedContributions),
      monthlyDue: asNumber(bundle.summary?.monthlyDue),
      appliedThisMonth: asNumber(bundle.summary?.appliedThisMonth),
      outstanding: asNumber(bundle.summary?.outstanding),
      carryForwardCredit: asNumber(bundle.summary?.carryForwardCredit),
      finesOutstanding: asNumber(bundle.summary?.finesOutstanding),
      loansBorrowed: asNumber(bundle.summary?.loansBorrowed),
      loansRepaid: asNumber(bundle.summary?.loansRepaid),
      loansOutstanding: asNumber(bundle.summary?.loansOutstanding)
    },
    contributions: asArray(bundle.contributions),
    paymentEvidence: asArray(bundle.paymentEvidence),
    fines: asArray(bundle.fines),
    loans: asArray(bundle.loans),
    statements: asArray(bundle.statements),
    loansEnabled: bundle.loansEnabled === true
  };
}

export function sortAccountRecords(records, field = "date", direction = "desc") {
  const sign = direction === "asc" ? 1 : -1;
  const safeField = ["date", "amount", "type", "status"].includes(field) ? field : "date";
  return [...records].sort((a, b) => {
    let av, bv;
    if (safeField === "date") {
      av = Date.parse(a.date || a.created_at || "") || 0;
      bv = Date.parse(b.date || b.created_at || "") || 0;
    } else if (safeField === "amount") {
      av = asNumber(a.amount);
      bv = asNumber(b.amount);
    } else {
      av = String(a[safeField] || "").toLocaleLowerCase();
      bv = String(b[safeField] || "").toLocaleLowerCase();
    }
    return (av < bv ? -1 : av > bv ? 1 : 0) * sign;
  });
}

export function escapeAccountHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[ch]);
}

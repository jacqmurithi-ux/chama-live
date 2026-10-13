/*
 * Shared group-wide loan dashboard summary.
 * Both portals use this service and the same backend data contract.
 */
export const EMPTY_GROUP_LOAN_SUMMARY = Object.freeze({
  totalDisbursed: 0,
  interestGained: 0,
  membersBenefited: 0,
  outstandingAmount: 0,
  activeLoansCount: 0
});

export function normalizeGroupLoanSummary(value) {
  const row = Array.isArray(value) ? (value[0] || {}) : (value || {});
  const number = value => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  return {
    totalDisbursed: number(row.totalDisbursed),
    interestGained: number(row.interestGained),
    membersBenefited: Math.max(0, Math.trunc(number(row.membersBenefited))),
    outstandingAmount: number(row.outstandingAmount),
    activeLoansCount: Math.max(0, Math.trunc(number(row.activeLoansCount)))
  };
}

/**
 * Reads the feature flag first so a disabled group never calls the loan RPC.
 * The RPC independently enforces authorization and the feature flag.
 * Returns null when disabled; otherwise returns the shared summary contract.
 */
export async function loadGroupLoanSummary(supabase, groupId) {
  if (!groupId) {
    throw new Error("A group ID is required to load the loan summary.");
  }

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("loans_enabled")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError) throw groupError;
  if (group?.loans_enabled !== true) return null;

  const { data, error } = await supabase.rpc(
    "cl_get_group_loan_summary",
    { p_group_id: groupId }
  );

  if (error) throw error;
  return normalizeGroupLoanSummary(data);
}

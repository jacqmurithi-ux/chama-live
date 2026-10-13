import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../js/loan-summary.js", import.meta.url), "utf8");
const moduleUrl = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const { EMPTY_GROUP_LOAN_SUMMARY, normalizeGroupLoanSummary, loadGroupLoanSummary } = await import(moduleUrl);

function mockClient({ enabled = true, summary = {}, groupError = null, rpcError = null } = {}) {
  const calls = [];
  const client = {
    from(table) {
      calls.push(["from", table]);
      return {
        select(columns) {
          calls.push(["select", columns]);
          return {
            eq(column, value) {
              calls.push(["eq", column, value]);
              return {
                async maybeSingle() {
                  calls.push(["maybeSingle"]);
                  return { data: { loans_enabled: enabled }, error: groupError };
                }
              };
            }
          };
        }
      };
    },
    async rpc(name, args) {
      calls.push(["rpc", name, args]);
      return { data: summary, error: rpcError };
    }
  };
  return { client, calls };
}

test("empty loan summary contract defaults every figure to zero", () => {
  assert.deepEqual(normalizeGroupLoanSummary(null), EMPTY_GROUP_LOAN_SUMMARY);
});

test("normalizes shared JSON contract including numeric strings", () => {
  assert.deepEqual(normalizeGroupLoanSummary({
    totalDisbursed: "2300.00",
    interestGained: "170",
    membersBenefited: "2",
    outstandingAmount: "600",
    activeLoansCount: "2"
  }), {
    totalDisbursed: 2300,
    interestGained: 170,
    membersBenefited: 2,
    outstandingAmount: 600,
    activeLoansCount: 2
  });
});

test("loans disabled hides summary and does not call the loan RPC", async () => {
  const { client, calls } = mockClient({ enabled: false });
  assert.equal(await loadGroupLoanSummary(client, "group-1"), null);
  assert.equal(calls.some(call => call[0] === "rpc"), false);
});

test("enabled group calls the shared summary RPC once", async () => {
  const { client, calls } = mockClient({
    summary: { totalDisbursed: 100, interestGained: 10, membersBenefited: 1, outstandingAmount: 50, activeLoansCount: 1 }
  });
  const result = await loadGroupLoanSummary(client, "group-1");
  assert.equal(result.totalDisbursed, 100);
  assert.equal(calls.filter(call => call[0] === "rpc").length, 1);
  assert.deepEqual(calls.find(call => call[0] === "rpc"), [
    "rpc", "cl_get_group_loan_summary", { p_group_id: "group-1" }
  ]);
});

test("group lookup errors are surfaced before the loan RPC", async () => {
  const { client, calls } = mockClient({ groupError: new Error("denied") });
  await assert.rejects(loadGroupLoanSummary(client, "group-1"), /denied/);
  assert.equal(calls.some(call => call[0] === "rpc"), false);
});

test("missing group ID is rejected before any request", async () => {
  const { client, calls } = mockClient();
  await assert.rejects(loadGroupLoanSummary(client, null), /group ID is required/i);
  assert.equal(calls.length, 0);
});

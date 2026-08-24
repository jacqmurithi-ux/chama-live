import { supabase } from "./supabase.js";
import {
  getCurrentGroupId,
  money,
  setText,
  showError
} from "./app.js";

async function loadReports() {
  try {
    const groupId = await getCurrentGroupId();

    if (!groupId) {
      throw new Error("No group is linked to this account.");
    }

    const [
      groupResult,
      contributionsResult,
      expensesResult,
      membersResult
    ] = await Promise.all([
      // Opening balance
      supabase
        .from("groups")
        .select("opening_balance")
        .eq("id", groupId)
        .single(),

      // Contributions
      supabase
        .from("contributions")
        .select("amount")
        .eq("group_id", groupId),

      // Expenses
      supabase
        .from("expenses")
        .select("amount, approval_status")
        .eq("group_id", groupId),

      // Active members
      supabase
        .from("members")
        .select("id", {
          count: "exact",
          head: true
        })
        .eq("group_id", groupId)
        .eq("status", "active")
    ]);

    // Check group
    if (groupResult.error) {
      throw groupResult.error;
    }

    // Check contributions
    if (contributionsResult.error) {
      throw contributionsResult.error;
    }

    // Check expenses
    if (expensesResult.error) {
      throw expensesResult.error;
    }

    // Check members
    if (membersResult.error) {
      throw membersResult.error;
    }

    /*
     * OPENING BALANCE
     */
    const openingBalance = Number(
      groupResult.data?.opening_balance || 0
    );

    /*
     * TOTAL CONTRIBUTIONS
     */
    const totalContributions = (
      contributionsResult.data || []
    ).reduce(
      (total, contribution) =>
        total + Number(contribution.amount || 0),
      0
    );

    /*
     * APPROVED EXPENSES
     */
    const approvedExpenses = (
      expensesResult.data || []
    )
      .filter(expense =>
        String(
          expense.approval_status || ""
        ).toLowerCase() === "approved"
      )
      .reduce(
        (total, expense) =>
          total + Number(expense.amount || 0),
        0
      );

    /*
     * CLOSING BALANCE
     *
     * Opening Balance
     * + Contributions
     * - Approved Expenses
     */
    const closingBalance =
      openingBalance +
      totalContributions -
      approvedExpenses;

    /*
     * SUMMARY CARDS
     */

    // Active members
    setText(
      "#members",
      membersResult.count ?? 0
    );

    // Contributions
    setText(
      "#contributions",
      money(totalContributions)
    );

    // Approved expenses
    setText(
      "#expenses",
      money(approvedExpenses)
    );

    /*
     * FINANCIAL POSITION
     */

    // Opening balance
    setText(
      "#opening",
      money(openingBalance)
    );

    // Contributions
    setText(
      "#c2",
      money(totalContributions)
    );

    // Approved expenses
    setText(
      "#e2",
      money(approvedExpenses)
    );

    // Closing balance
    setText(
      "#balance",
      money(closingBalance)
    );

  } catch (error) {
    console.error(
      "CHAMA LIVE reports error:",
      error
    );

    showError(error);
  }
}

loadReports();

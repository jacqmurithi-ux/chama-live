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
      supabase
        .from("groups")
        .select("opening_balance")
        .eq("id", groupId)
        .single(),

      supabase
        .from("contributions")
        .select("amount")
        .eq("group_id", groupId),

      supabase
        .from("expenses")
        .select("amount, approval_status")
        .eq("group_id", groupId),

      supabase
        .from("members")
        .select("id", {
          count: "exact",
          head: true
        })
        .eq("group_id", groupId)
        .eq("status", "active")
    ]);

    if (groupResult.error) {
      throw groupResult.error;
    }

    if (contributionsResult.error) {
      throw contributionsResult.error;
    }

    if (expensesResult.error) {
      throw expensesResult.error;
    }

    if (membersResult.error) {
      throw membersResult.error;
    }

    // Opening balance
    const openingBalance = Number(
      groupResult.data?.opening_balance || 0
    );

    // Total contributions
    const totalContributions = (
      contributionsResult.data || []
    ).reduce(
      (total, contribution) =>
        total + Number(contribution.amount || 0),
      0
    );

    // Approved expenses only
    const approvedExpenses = (
      expensesResult.data || []
    )
      .filter(
        expense =>
          expense.approval_status === "approved"
      )
      .reduce(
        (total, expense) =>
          total + Number(expense.amount || 0),
        0
      );

    // Closing balance
    const closingBalance =
      openingBalance +
      totalContributions -
      approvedExpenses;

    // Summary cards
    setText(
      "#members",
      membersResult.count ?? 0
    );

    setText(
      "#contributions",
      money(totalContributions)
    );

    setText(
      "#expenses",
      money(approvedExpenses)
    );

    // Financial position
    setText(
      "#opening",
      money(openingBalance)
    );

    setText(
      "#c2",
      money(totalContributions)
    );

    setText(
      "#e2",
      money(approvedExpenses)
    );

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

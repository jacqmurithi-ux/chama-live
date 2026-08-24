import { supabase } from "./supabase.js";
import {
  getCurrentGroupId,
  money,
  setText,
  showError
} from "./app.js";

async function loadDashboard() {
  try {
    const groupId = await getCurrentGroupId();

    if (!groupId) {
      throw new Error("No group is linked to this account.");
    }

    const [
      { data: group, error: groupError },
      { count, error: memberError },
      { data: contributions, error: contributionError },
      { data: expenses, error: expenseError }
    ] = await Promise.all([
      supabase
        .from("groups")
        .select("name, opening_balance")
        .eq("id", groupId)
        .single(),

      supabase
        .from("members")
        .select("id", {
          count: "exact",
          head: true
        })
        .eq("group_id", groupId)
        .eq("status", "active"),

      supabase
        .from("contributions")
        .select("amount, contribution_date")
        .eq("group_id", groupId),

      supabase
        .from("expenses")
        .select("amount, date, approval_status")
        .eq("group_id", groupId)
    ]);

    if (groupError) throw groupError;
    if (memberError) throw memberError;
    if (contributionError) throw contributionError;
    if (expenseError) throw expenseError;

    const contributionRows = contributions || [];
    const expenseRows = expenses || [];

    // Total contributions
    const totalContributions = contributionRows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0
    );

    // Approved expenses only
    const approvedExpenses = expenseRows
      .filter(row => row.approval_status === "approved")
      .reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0
      );

    // Start of current month
    const now = new Date();

    const monthStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    // Current month contributions
    const monthContributions = contributionRows
      .filter(row => {
        if (!row.contribution_date) return false;

        const date = new Date(row.contribution_date);

        return date >= monthStart;
      })
      .reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0
      );

    // Current month approved expenses
    const monthExpenses = expenseRows
      .filter(row => {
        if (row.approval_status !== "approved") return false;
        if (!row.date) return false;

        const date = new Date(row.date);

        return date >= monthStart;
      })
      .reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0
      );

    // Opening balance
    const openingBalance = Number(
      group.opening_balance || 0
    );

    // Current balance
    const balance =
      openingBalance +
      totalContributions -
      approvedExpenses;

    // Update dashboard
    setText("#group-name", group.name || "CHAMA");

    setText(
      "#members",
      Number(count || 0).toLocaleString()
    );

    setText(
      "#contributions",
      money(totalContributions)
    );

    setText(
      "#expenses",
      money(approvedExpenses)
    );

    setText(
      "#balance",
      money(balance)
    );

    setText(
      "#month-contributions",
      money(monthContributions)
    );

    setText(
      "#month-expenses",
      money(monthExpenses)
    );

  } catch (error) {
    console.error("CHAMA LIVE dashboard error:", error);
    showError(error);
  }
}

loadDashboard();

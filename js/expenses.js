import { supabase } from "./supabase.js";
import {
  getCurrentGroupId,
  money,
  showError
} from "./app.js";

async function loadExpenses() {
  try {
    const groupId = await getCurrentGroupId();

    if (!groupId) {
      throw new Error(
        "No group is linked to this account."
      );
    }

    const {
      data: expenses,
      error
    } = await supabase
      .from("expenses")
      .select(
        "date, description, category, amount, approval_status"
      )
      .eq("group_id", groupId)
      .order("date", {
        ascending: false
      });

    if (error) {
      throw error;
    }

    const rows = document.querySelector("#rows");

    if (!rows) {
      throw new Error(
        "Expenses table container (#rows) was not found."
      );
    }

    const expenseRows = expenses || [];

    /*
     * NO EXPENSES
     */
    if (expenseRows.length === 0) {
      rows.innerHTML = `
        <tr>
          <td colspan="5">
            No expenses yet.
          </td>
        </tr>
      `;

      return;
    }

    /*
     * DISPLAY EXPENSES
     */
    rows.innerHTML = expenseRows
      .map(expense => {

        const status =
          expense.approval_status || "—";

        return `
          <tr>
            <td>
              ${escapeHtml(
                expense.date ?? "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                expense.description ?? "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                expense.category ?? "—"
              )}
            </td>

            <td>
              ${money(
                Number(expense.amount || 0)
              )}
            </td>

            <td>
              ${escapeHtml(status)}
            </td>
          </tr>
        `;
      })
      .join("");

  } catch (error) {
    console.error(
      "CHAMA LIVE expenses error:",
      error
    );

    showError(error);
  }
}


/*
 * SECURITY
 *
 * Prevent database/user content from being
 * interpreted as HTML.
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


loadExpenses();

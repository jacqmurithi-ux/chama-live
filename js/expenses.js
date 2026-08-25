import { supabase } from "./supabase.js";

import {
  getCurrentGroupId,
  money
} from "./app.js";


/* =====================================================
   ELEMENTS
===================================================== */

const rows =
  document.querySelector("#rows");

const errorBox =
  document.querySelector("[data-error]") ||
  document.querySelector("#error");


/* =====================================================
   ERROR
===================================================== */

function showError(error) {

  console.error(
    "CHAMA LIVE expenses error:",
    error
  );

  if (errorBox) {

    errorBox.textContent =
      "Error: " +
      (error?.message || String(error));

    errorBox.hidden = false;

  }

}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


/* =====================================================
   LOAD EXPENSES
===================================================== */

async function loadExpenses() {

  try {

    if (!rows) {

      throw new Error(
        "Expense table not found."
      );

    }


    rows.innerHTML =
      `
        <tr>
          <td colspan="7">
            Loading expenses...
          </td>
        </tr>
      `;


    /* ================================================
       LOGIN
    ================================================ */

    const {
      data: sessionData,
      error: sessionError
    } =
      await supabase.auth.getSession();


    if (sessionError) {
      throw sessionError;
    }


    if (!sessionData?.session) {

      window.location.href =
        "login.html";

      return;

    }


    /* ================================================
       GROUP
    ================================================ */

    const groupId =
      await getCurrentGroupId();


    if (!groupId) {

      throw new Error(
        "No group is linked to this account."
      );

    }


    /* ================================================
       GET EXPENSES

       IMPORTANT:
       Your database column is `date`.
       NOT `expense_date`.
    ================================================ */

    const {
      data,
      error
    } =
      await supabase

        .from("expenses")

        .select(
          "id,date,description,category,amount,approval_status,payment_method,reference"
        )

        .eq(
          "group_id",
          groupId
        )

        .order(
          "date",
          {
            ascending: false
          }
        );


    if (error) {
      throw error;
    }


    const expenses =
      data || [];


    /* ================================================
       NO EXPENSES
    ================================================ */

    if (
      expenses.length === 0
    ) {

      rows.innerHTML =
        `
          <tr>
            <td colspan="7">
              No expenses yet.
            </td>
          </tr>
        `;

      return;

    }


    /* ================================================
       DISPLAY
    ================================================ */

    rows.innerHTML =

      expenses
        .map(
          function (expense) {

            return `

              <tr>

                <td>
                  ${escapeHtml(
                    expense.date || "—"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    expense.description || "—"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    expense.category || "—"
                  )}
                </td>

                <td>
                  ${money(
                    Number(
                      expense.amount || 0
                    )
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    expense.approval_status || "—"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    expense.payment_method || "—"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    expense.reference || "—"
                  )}
                </td>

              </tr>

            `;

          }
        )
        .join("");


  } catch (error) {

    showError(error);

    rows.innerHTML =
      `
        <tr>
          <td colspan="7" style="color:red">
            ERROR:
            ${escapeHtml(
              error?.message || String(error)
            )}
          </td>
        </tr>
      `;

  }

}


/* =====================================================
   START
===================================================== */

loadExpenses();

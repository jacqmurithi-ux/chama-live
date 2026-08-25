import { supabase } from "./supabase.js";

import {
  getCurrentGroupId,
  money,
  showError
} from "./app.js";


/* =====================================================
   ELEMENTS
===================================================== */

const rows =
  document.querySelector("#rows");


/* =====================================================
   LOAD EXPENSES
===================================================== */

async function loadExpenses() {

  try {

    if (!rows) {
      throw new Error(
        "Expenses table not found."
      );
    }


    rows.innerHTML =
      "<tr><td colspan='5'>Loading expenses...</td></tr>";


    /* -----------------------------------------------
       LOGIN
    ------------------------------------------------ */

    const {
      data: sessionData,
      error: sessionError
    } =
      await supabase.auth.getSession();


    if (sessionError) {
      throw sessionError;
    }


    if (!sessionData.session) {

      window.location.href =
        "login.html";

      return;

    }


    /* -----------------------------------------------
       CURRENT GROUP
    ------------------------------------------------ */

    const groupId =
      await getCurrentGroupId();


    if (!groupId) {

      throw new Error(
        "No group is linked to this account."
      );

    }


    /* -----------------------------------------------
       LOAD EXPENSES
       
       IMPORTANT:
       The database column is "date",
       NOT "expense_date".
    ------------------------------------------------ */

    const {
      data,
      error
    } =
      await supabase

        .from("expenses")

        .select(
          "id, group_id, description, category, amount, date, approval_status, payment_method, reference, created_at"
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


    console.log(
      "CHAMA LIVE expenses:",
      data,
      error
    );


    if (error) {
      throw error;
    }


    const expenses =
      data || [];


    /* -----------------------------------------------
       EMPTY
    ------------------------------------------------ */

    if (expenses.length === 0) {

      rows.innerHTML =
        `
          <tr>
            <td colspan="5">
              No expenses yet.
            </td>
          </tr>
        `;

      return;

    }


    /* -----------------------------------------------
       DISPLAY
    ------------------------------------------------ */

    rows.innerHTML =

      expenses
        .map(
          function (expense) {

            const date =
              expense.date ||
              "—";


            const description =
              escapeHtml(
                expense.description ||
                "—"
              );


            const category =
              escapeHtml(
                expense.category ||
                "other"
              );


            const amount =
              money(
                Number(
                  expense.amount ||
                  0
                )
              );


            const status =
              escapeHtml(
                expense.approval_status ||
                "pending"
              );


            return `

              <tr>

                <td>
                  ${escapeHtml(date)}
                </td>

                <td>
                  ${description}
                </td>

                <td>
                  ${category}
                </td>

                <td>
                  ${amount}
                </td>

                <td>
                  ${status}
                </td>

              </tr>

            `;

          }
        )

        .join("");


  }

  catch (error) {

    console.error(
      "CHAMA LIVE expenses error:",
      error
    );


    rows.innerHTML =
      `
        <tr>

          <td
            colspan="5"
            style="color:red"
          >
            ERROR:
            ${escapeHtml(
              error?.message ||
              String(error)
            )}

          </td>

        </tr>
      `;


    showError(error);

  }

}


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHtml(value) {

  return String(value)

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );

}


/* =====================================================
   START
===================================================== */

loadExpenses();

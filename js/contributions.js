import { supabase } from "./supabase.js";

console.log("CHAMA LIVE: contributions.js loaded");


/* =======================================================
   ELEMENTS
======================================================= */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const form =
  document.getElementById("contributionForm");

const memberSelect =
  document.getElementById("member");

const amountInput =
  document.getElementById("amount");

const dateInput =
  document.getElementById("contributionDate");

const typeSelect =
  document.getElementById("contributionType");

const methodSelect =
  document.getElementById("paymentMethod");

const mpesaReference =
  document.getElementById("mpesaReference");

const mpesaReferenceWrap =
  document.getElementById("mpesaReferenceWrap");

const saveButton =
  document.getElementById("saveContribution");

const monthlyExpected =
  document.getElementById("monthlyExpected");

const memberStatusRows =
  document.getElementById("memberStatusRows");

const contributionRows =
  document.getElementById("contributionRows");


/* =======================================================
   STATE
======================================================= */

let groupId = null;

let members = [];

let contributions = [];

let monthlyContribution = 0;


/* =======================================================
   PAYMENT METHOD VALUES
======================================================= */

/*
 * IMPORTANT:
 *
 * These values must match the database CHECK constraint.
 *
 * Database values:
 *
 * mpesa
 * cash
 * bank_transfer
 *
 * User-friendly labels are handled separately.
 */

const PAYMENT_METHODS = {
  mpesa: "M-Pesa",
  cash: "Cash",
  bank_transfer: "Bank transfer"
};


/* =======================================================
   HELPERS
======================================================= */

function money(value) {

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(
    Number(value || 0)
  );

}


function todayString() {

  const now = new Date();

  return [
    now.getFullYear(),

    String(
      now.getMonth() + 1
    ).padStart(2, "0"),

    String(
      now.getDate()
    ).padStart(2, "0")

  ].join("-");

}


function getCurrentMonth() {

  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;

}


function getContributionMonth(item) {

  /*
   * Primary:
   * contribution_date
   *
   * Fallback:
   * month
   *
   * Final fallback:
   * created_at
   */

  if (item?.contribution_date) {

    return String(
      item.contribution_date
    ).slice(0, 7);

  }


  if (item?.month) {

    return String(
      item.month
    ).slice(0, 7);

  }


  if (item?.created_at) {

    return String(
      item.created_at
    ).slice(0, 7);

  }


  return "";

}


function formatDate(value) {

  if (!value) {

    return "—";

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(value);

  }


  return date.toLocaleDateString(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );

}


function escapeHtml(value) {

  return String(value ?? "")
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


/* =======================================================
   STATUS / ERROR
======================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE Contributions Error:",
    error
  );


  if (errorEl) {

    let message =
      error?.message ||
      "Something went wrong.";


    /*
     * Make the common payment-method
     * constraint error easier to understand.
     */

    if (
      String(message)
        .includes(
          "contributions_payment_method_check"
        )
    ) {

      message =
        "The selected payment method is not accepted by the database. Please use M-Pesa, Cash, or Bank transfer.";

    }


    errorEl.textContent =
      message;

    errorEl.hidden =
      false;

  }


  if (statusEl) {

    statusEl.textContent =
      "Unable to load contributions.";

  }

}


function clearError() {

  if (!errorEl) {

    return;

  }


  errorEl.hidden =
    true;

  errorEl.textContent =
    "";

}


/* =======================================================
   CURRENT GROUP
======================================================= */

async function getGroupId() {

  const {
    data,
    error
  } =
    await supabase.rpc(
      "my_group_id"
    );


  if (error) {

    throw error;

  }


  if (!data) {

    throw new Error(
      "No group is associated with your account."
    );

  }


  return data;

}


/* =======================================================
   LOAD GROUP
======================================================= */

async function loadGroup() {

  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(
        "monthly_contribution"
      )
      .eq(
        "id",
        groupId
      )
      .single();


  if (error) {

    throw error;

  }


  monthlyContribution =
    Number(
      data?.monthly_contribution || 0
    );


  if (monthlyExpected) {

    monthlyExpected.textContent =
      money(
        monthlyContribution
      );

  }


  /*
   * Automatically suggest the
   * configured monthly contribution.
   */

  if (
    amountInput &&
    monthlyContribution > 0
  ) {

    amountInput.value =
      monthlyContribution;

  }

}


/* =======================================================
   LOAD MEMBERS
======================================================= */

async function loadMembers() {

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(`
        id,
        name,
        status
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "name",
        {
          ascending: true
        }
      );


  if (error) {

    throw error;

  }


  /*
   * Only active members can
   * receive new contributions.
   */

  members =
    (data || [])
      .filter(
        member =>
          String(
            member.status ||
            "active"
          ).toLowerCase() ===
          "active"
      );


  if (!memberSelect) {

    return;

  }


  memberSelect.innerHTML = `
    <option value="">
      Select member
    </option>
  `;


  members.forEach(
    member => {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        member.id;


      option.textContent =
        member.name;


      memberSelect.appendChild(
        option
      );

    }
  );

}


/* =======================================================
   LOAD CONTRIBUTIONS
======================================================= */

async function loadContributions() {

  const {
    data,
    error
  } =
    await supabase
      .from("contributions")
      .select(`
        id,
        group_id,
        member_id,
        amount,
        contribution_type,
        month,
        payment_method,
        reference,
        recorded_by,
        created_at,
        goal_id,
        contribution_date,
        notes,
        mpesa_reference
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "contribution_date",
        {
          ascending: false
        }
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      );


  if (error) {

    throw error;

  }


  contributions =
    data || [];

}


/* =======================================================
   MEMBER NAME
======================================================= */

function getMemberName(
  memberId
) {

  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );


  return (
    member?.name ||
    "Unknown member"
  );

}


/* =======================================================
   PAYMENT METHOD LABEL
======================================================= */

function getPaymentMethodLabel(
  value
) {

  const normalized =
    String(
      value || ""
    ).toLowerCase().trim();


  return (
    PAYMENT_METHODS[
      normalized
    ] ||
    value ||
    "—"
  );

}


/* =======================================================
   LEDGER
======================================================= */

function renderLedger() {

  if (!contributionRows) {

    return;

  }


  if (!contributions.length) {

    contributionRows.innerHTML = `
      <tr>
        <td colspan="6">
          No contributions recorded yet.
        </td>
      </tr>
    `;

    return;

  }


  contributionRows.innerHTML =
    contributions
      .slice(0, 100)
      .map(
        item => {

          const date =
            item.contribution_date ||
            item.created_at ||
            (
              item.month
                ? `${item.month}-01`
                : null
            );


          const reference =
            item.mpesa_reference ||
            item.reference ||
            "—";


          const method =
            getPaymentMethodLabel(
              item.payment_method
            );


          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(date)
                )}
              </td>

              <td>
                ${escapeHtml(
                  getMemberName(
                    item.member_id
                  )
                )}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    money(item.amount)
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  item.contribution_type ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  method
                )}
              </td>

              <td>
                ${escapeHtml(
                  reference
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =======================================================
   MEMBER STATUS
======================================================= */

function renderMemberStatus() {

  if (!memberStatusRows) {

    return;

  }


  if (!members.length) {

    memberStatusRows.innerHTML = `
      <tr>
        <td colspan="5">
          No active members found.
        </td>
      </tr>
    `;

    return;

  }


  const currentMonth =
    getCurrentMonth();


  memberStatusRows.innerHTML =
    members
      .map(
        member => {

          /*
           * Only MONTHLY contributions
           * count toward the monthly
           * contribution requirement.
           */

          const paid =
            contributions
              .filter(
                item => {

                  if (
                    String(
                      item.member_id
                    ) !==
                    String(
                      member.id
                    )
                  ) {

                    return false;

                  }


                  const type =
                    String(
                      item.contribution_type ||
                      ""
                    ).toLowerCase();


                  if (
                    type !==
                    "monthly"
                  ) {

                    return false;

                  }


                  return (
                    getContributionMonth(
                      item
                    ) ===
                    currentMonth
                  );

                }
              )
              .reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  Number(
                    item.amount || 0
                  ),
                0
              );


          const expected =
            monthlyContribution;


          const outstanding =
            Math.max(
              expected - paid,
              0
            );


          /*
           * Determine status.
           */

          let status =
            "OUTSTANDING";


          if (
            expected <= 0
          ) {

            status =
              "NOT SET";

          }
          else if (
            paid > expected
          ) {

            status =
              "OVERPAID";

          }
          else if (
            paid === expected
          ) {

            status =
              "PAID";

          }
          else if (
            paid > 0
          ) {

            status =
              "PARTIAL";

          }


          return `
            <tr>

              <td>
                ${escapeHtml(
                  member.name
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(expected)
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(paid)
                )}
              </td>

              <td>
                ${escapeHtml(
                  money(outstanding)
                )}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    status
                  )}
                </strong>
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =======================================================
   PAYMENT METHOD UI
======================================================= */

function updatePaymentMethod() {

  if (
    !methodSelect ||
    !mpesaReference ||
    !mpesaReferenceWrap
  ) {

    return;

  }


  /*
   * HTML values should be:
   *
   * mpesa
   * cash
   * bank_transfer
   */

  const method =
    String(
      methodSelect.value || ""
    ).toLowerCase();


  const isMpesa =
    method === "mpesa";


  mpesaReferenceWrap.style.display =
    isMpesa
      ? ""
      : "none";


  mpesaReference.required =
    isMpesa;


  if (!isMpesa) {

    mpesaReference.value =
      "";

  }

}


/* =======================================================
   RECORD CONTRIBUTION
======================================================= */

async function recordContribution(
  event
) {

  event.preventDefault();

  clearError();


  const memberId =
    memberSelect?.value;


  const amount =
    Number(
      amountInput?.value || 0
    );


  const contributionDate =
    dateInput?.value;


  const contributionType =
    typeSelect?.value;


  /*
   * IMPORTANT:
   *
   * This returns database values:
   *
   * mpesa
   * cash
   * bank_transfer
   */

  const paymentMethod =
    String(
      methodSelect?.value || ""
    ).toLowerCase();


  const reference =
    mpesaReference?.value
      .trim() || "";


  /* ---------------------------------------------------
     VALIDATION
  --------------------------------------------------- */

  if (!memberId) {

    showError(
      new Error(
        "Please select a member."
      )
    );

    return;

  }


  if (
    !amount ||
    amount <= 0
  ) {

    showError(
      new Error(
        "Please enter a valid amount."
      )
    );

    return;

  }


  if (!contributionDate) {

    showError(
      new Error(
        "Please select the contribution date."
      )
    );

    return;

  }


  if (!contributionType) {

    showError(
      new Error(
        "Please select the contribution type."
      )
    );

    return;

  }


  if (!paymentMethod) {

    showError(
      new Error(
        "Please select the payment method."
      )
    );

    return;

  }


  /*
   * Ensure the method is one of
   * the supported database values.
   */

  if (
    !Object.prototype.hasOwnProperty.call(
      PAYMENT_METHODS,
      paymentMethod
    )
  ) {

    showError(
      new Error(
        "Invalid payment method. Please select M-Pesa, Cash, or Bank transfer."
      )
    );

    return;

  }


  /*
   * M-Pesa requires a reference.
   */

  if (
    paymentMethod === "mpesa" &&
    !reference
  ) {

    showError(
      new Error(
        "Please enter the M-Pesa reference."
      )
    );

    return;

  }


  const month =
    contributionDate.slice(
      0,
      7
    );


  /* ---------------------------------------------------
     DUPLICATE MONTHLY PAYMENT WARNING
  --------------------------------------------------- */

  if (
    String(
      contributionType
    ).toLowerCase() ===
    "monthly"
  ) {

    const existing =
      contributions.some(
        item =>

          String(
            item.member_id
          ) ===
          String(
            memberId
          ) &&

          String(
            item.contribution_type ||
            ""
          ).toLowerCase() ===
          "monthly" &&

          getContributionMonth(
            item
          ) ===
          month
      );


    if (existing) {

      const proceed =
        window.confirm(
          `This member already has a monthly contribution for ${month}.\n\n` +
          `This will be recorded as an additional payment. Continue?`
        );


      if (!proceed) {

        return;

      }

    }

  }


  /* ---------------------------------------------------
     BUTTON STATE
  --------------------------------------------------- */

  if (saveButton) {

    saveButton.disabled =
      true;

    saveButton.textContent =
      "Saving...";

  }


  if (statusEl) {

    statusEl.textContent =
      "Recording contribution...";

  }


  /* ---------------------------------------------------
     INSERT
  --------------------------------------------------- */

  try {

    const contributionData = {

      group_id:
        groupId,

      member_id:
        memberId,

      amount:
        amount,

      contribution_type:
        contributionType,

      month:
        month,

      payment_method:
        paymentMethod,

      contribution_date:
        contributionDate,

      mpesa_reference:
        paymentMethod === "mpesa"
          ? reference
          : null,

      reference:
        reference || null

    };


    console.log(
      "CHAMA LIVE: Recording contribution:",
      contributionData
    );


    const {
      error
    } =
      await supabase
        .from("contributions")
        .insert(
          contributionData
        );


    if (error) {

      throw error;

    }


    /* -------------------------------------------------
       REFRESH DATA
    ------------------------------------------------- */

    await loadContributions();

    renderLedger();

    renderMemberStatus();


    /* -------------------------------------------------
       RESET FORM
    ------------------------------------------------- */

    form?.reset();


    if (dateInput) {

      dateInput.value =
        todayString();

    }


    if (typeSelect) {

      typeSelect.value =
        "monthly";

    }


    if (methodSelect) {

      methodSelect.value =
        "mpesa";

    }


    updatePaymentMethod();


    if (
      amountInput &&
      monthlyContribution > 0
    ) {

      amountInput.value =
        monthlyContribution;

    }


    /* -------------------------------------------------
       SUCCESS
    ------------------------------------------------- */

    if (statusEl) {

      statusEl.textContent =
        "✓ Contribution recorded successfully.";

    }


    console.log(
      "CHAMA LIVE: Contribution recorded successfully."
    );

  }
  catch (error) {

    showError(
      error
    );

  }
  finally {

    if (saveButton) {

      saveButton.disabled =
        false;

      saveButton.textContent =
        "Record Contribution";

    }

  }

}


/* =======================================================
   INITIALIZE
======================================================= */

async function init() {

  try {

    clearError();


    if (statusEl) {

      statusEl.textContent =
        "Loading contributions...";

    }


    console.log(
      "CHAMA LIVE: Getting current group..."
    );


    groupId =
      await getGroupId();


    console.log(
      "CHAMA LIVE GROUP:",
      groupId
    );


    await Promise.all([

      loadGroup(),

      loadMembers(),

      loadContributions()

    ]);


    /*
     * Default date.
     */

    if (dateInput) {

      dateInput.value =
        todayString();

    }


    /*
     * Default contribution type.
     */

    if (typeSelect) {

      typeSelect.value =
        "monthly";

    }


    /*
     * Default payment method.
     */

    if (methodSelect) {

      methodSelect.value =
        "mpesa";

    }


    updatePaymentMethod();


    renderLedger();

    renderMemberStatus();


    if (statusEl) {

      statusEl.textContent =
        "Contributions loaded.";

    }


    console.log(
      "CHAMA LIVE: Contributions ready."
    );

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =======================================================
   EVENTS
======================================================= */

if (form) {

  form.addEventListener(
    "submit",
    recordContribution
  );

}


if (methodSelect) {

  methodSelect.addEventListener(
    "change",
    updatePaymentMethod
  );

}


/* =======================================================
   START
======================================================= */

init();

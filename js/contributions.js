
import { supabase } from "./supabase.js";


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
   HELPERS
======================================================= */

function money(value) {

  return new Intl.NumberFormat(
    "en-KE",
    {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }
  ).format(
    Number(value || 0)
  );

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
    return value;
  }

  return date.toLocaleDateString(
    "en-KE",
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );

}


function escapeHtml(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll(
      "'",
      "&#039;"
    );

}


function todayString() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;

}


/* =======================================================
   STATUS / ERROR
======================================================= */

function showError(error) {

  console.error(
    "CHAMA LIVE Contributions Error:",
    error
  );

  errorEl.textContent =
    error?.message ||
    "Something went wrong.";

  errorEl.hidden = false;

  statusEl.textContent =
    "Unable to load contributions.";

}


function clearError() {

  errorEl.hidden = true;

  errorEl.textContent = "";

}


/* =======================================================
   GET CURRENT GROUP
======================================================= */

async function getGroupId() {

  const {
    data,
    error
  } = await supabase.rpc(
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
   LOAD GROUP SETTINGS
======================================================= */

async function loadGroup() {

  const {
    data,
    error
  } = await supabase
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


  monthlyExpected.textContent =
    money(
      monthlyContribution
    );


  /*
    Automatically suggest the group's
    monthly contribution.
  */

  if (
    monthlyContribution > 0
  ) {

    amountInput.value =
      monthlyContribution;

  }

}


/* =======================================================
   LOAD ACTIVE MEMBERS
======================================================= */

async function loadMembers() {

  const {
    data,
    error
  } = await supabase
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


  members =
    (data || []).filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() ===
        "active"
    );


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

  /*
    IMPORTANT:
    These are the actual column names
    from your live contributions table.
  */

  const {
    data,
    error
  } = await supabase
    .from("contributions")
    .select(`
      id,
      groupid,
      memberid,
      amount,
      contribution,
      month,
      paymentmethod,
      contribution_date,
      mpesa_reference
    `)
    .eq(
      "groupid",
      groupId
    )
    .order(
      "contribution_date",
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
        item.id ===
        memberId
    );


  return (
    member?.name ||
    "Unknown member"
  );

}


/* =======================================================
   RENDER CONTRIBUTION LEDGER
======================================================= */

function renderLedger() {

  if (
    !contributions.length
  ) {

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
      .slice(0, 50)
      .map(
        item => {

          /*
            Existing records use:
            contribution = monthly
            paymentmethod = M-Pesa
          */

          const type =
            item.contribution ||
            "—";

          const method =
            item.paymentmethod ||
            "—";

          const reference =
            item.mpesa_reference ||
            "—";


          /*
            Older records may not have
            contribution_date yet.

            Fall back to month.
          */

          const date =
            item.contribution_date ||
            (
              item.month
                ? `${item.month}-01`
                : null
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
                    item.memberid
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
                  type
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
   MONTHLY CONTRIBUTION STATUS
======================================================= */

function renderMemberStatus() {

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


  /*
    Current month.

    Example:

    2026-08
  */

  const now =
    new Date();

  const currentMonth =
    `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;


  memberStatusRows.innerHTML =
    members
      .map(
        member => {

          /*
            Find all monthly contributions
            for this member in the current
            month.
          */

          const paid =
            contributions
              .filter(
                item => {

                  if (
                    item.memberid !==
                    member.id
                  ) {
                    return false;
                  }


                  /*
                    Contribution type.
                  */

                  const type =
                    String(
                      item.contribution ||
                      ""
                    ).toLowerCase();


                  if (
                    type !==
                    "monthly"
                  ) {
                    return false;
                  }


                  /*
                    Primary month field.
                  */

                  if (
                    item.month
                  ) {

                    return String(
                      item.month
                    ) ===
                    currentMonth;

                  }


                  /*
                    Fallback to date.
                  */

                  if (
                    item.contribution_date
                  ) {

                    return String(
                      item.contribution_date
                    ).startsWith(
                      currentMonth
                    );

                  }


                  return false;

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


          /*
            Expected monthly amount
            comes from groups.
          */

          const expected =
            monthlyContribution;


          const outstanding =
            Math.max(
              expected -
              paid,
              0
            );


          let status =
            "OUTSTANDING";


          if (
            expected <= 0
          ) {

            status =
              "NOT SET";

          }
          else if (
            paid >= expected
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

  const method =
    methodSelect.value;


  if (
    method === "M-Pesa"
  ) {

    mpesaReferenceWrap.style.display =
      "";

    mpesaReference.required =
      true;

  }
  else {

    mpesaReferenceWrap.style.display =
      "none";

    mpesaReference.required =
      false;

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
    memberSelect.value;

  const amount =
    Number(
      amountInput.value
    );

  const contributionDate =
    dateInput.value;

  const contributionType =
    typeSelect.value;

  const paymentMethod =
    methodSelect.value;

  const reference =
    mpesaReference.value.trim();


  /* -----------------------------------------------------
     VALIDATION
  ----------------------------------------------------- */

  if (!memberId) {

    errorEl.textContent =
      "Please select a member.";

    errorEl.hidden = false;

    return;

  }


  if (
    !amount ||
    amount <= 0
  ) {

    errorEl.textContent =
      "Please enter a valid contribution amount.";

    errorEl.hidden = false;

    return;

  }


  if (
    !contributionDate
  ) {

    errorEl.textContent =
      "Please select the contribution date.";

    errorEl.hidden = false;

    return;

  }


  if (
    !contributionType
  ) {

    errorEl.textContent =
      "Please select the contribution type.";

    errorEl.hidden = false;

    return;

  }


  if (
    !paymentMethod
  ) {

    errorEl.textContent =
      "Please select the payment method.";

    errorEl.hidden = false;

    return;

  }


  if (
    paymentMethod ===
      "M-Pesa" &&
    !reference
  ) {

    errorEl.textContent =
      "Please enter the M-Pesa reference.";

    errorEl.hidden = false;

    return;

  }


  /* -----------------------------------------------------
     PREVENT DUPLICATE MONTHLY PAYMENT
  ----------------------------------------------------- */

  if (
    contributionType ===
    "monthly"
  ) {

    const selectedMonth =
      contributionDate
        .slice(0, 7);


    const alreadyPaid =
      contributions.some(
        item => {

          return (
            item.memberid ===
              memberId &&

            String(
              item.contribution ||
              ""
            ).toLowerCase() ===
              "monthly" &&

            String(
              item.month || ""
            ) ===
              selectedMonth
          );

        }
      );


    /*
      We don't completely block it because
      a member may make a partial payment
      followed by another payment.

      So only display a warning.
    */

    if (
      alreadyPaid
    ) {

      const proceed =
        window.confirm(
          "This member already has a monthly contribution for " +
          selectedMonth +
          ". Continue and record another payment?"
        );


      if (!proceed) {
        return;
      }

    }

  }


  /* -----------------------------------------------------
     BUTTON
  ----------------------------------------------------- */

  saveButton.disabled =
    true;

  saveButton.textContent =
    "Saving...";

  statusEl.textContent =
    "Recording contribution...";


  try {

    /*
      Month is stored as:

      2026-08

      matching your existing database.
    */

    const month =
      contributionDate
        .slice(0, 7);


    /*
      EXACT EXISTING COLUMN NAMES
    */

    const contributionData = {

      groupid:
        groupId,

      memberid:
        memberId,

      amount:
        amount,

      contribution:
        contributionType,

      month:
        month,

      paymentmethod:
        paymentMethod

    };


    /*
      Add the new fields only if
      they exist in the database.
    */

    contributionData.contribution_date =
      contributionDate;

    contributionData.mpesa_reference =
      paymentMethod ===
        "M-Pesa"
        ? reference
        : null;


    const {
      error
    } = await supabase
      .from("contributions")
      .insert(
        contributionData
      );


    if (error) {
      throw error;
    }


    /* ---------------------------------------------------
       RELOAD DATA
    --------------------------------------------------- */

    await loadContributions();


    renderLedger();

    renderMemberStatus();


    /* ---------------------------------------------------
       RESET FORM
    --------------------------------------------------- */

    form.reset();


    dateInput.value =
      todayString();


    typeSelect.value =
      "monthly";


    methodSelect.value =
      "M-Pesa";


    updatePaymentMethod();


    if (
      monthlyContribution > 0
    ) {

      amountInput.value =
        monthlyContribution;

    }


    statusEl.textContent =
      "✓ Contribution recorded successfully.";


  } catch (error) {

    showError(error);

  } finally {

    saveButton.disabled =
      false;

    saveButton.textContent =
      "Record Contribution";

  }

}


/* =======================================================
   INITIALIZE
======================================================= */

async function init() {

  try {

    clearError();

    statusEl.textContent =
      "Loading contributions...";


    /*
      Get user's group.
    */

    groupId =
      await getGroupId();


    /*
      Load:

      1. Group settings
      2. Members
      3. Contributions
    */

    await Promise.all([
      loadGroup(),
      loadMembers(),
      loadContributions()
    ]);


    /*
      Set default form values.
    */

    dateInput.value =
      todayString();


    typeSelect.value =
      "monthly";


    methodSelect.value =
      "M-Pesa";


    updatePaymentMethod();


    /*
      Render.
    */

    renderLedger();

    renderMemberStatus();


    statusEl.textContent =
      "Contributions loaded.";


  } catch (error) {

    showError(error);

  }

}


/* =======================================================
   EVENTS
======================================================= */

form.addEventListener(
  "submit",
  recordContribution
);


methodSelect.addEventListener(
  "change",
  updatePaymentMethod
);


/* =======================================================
   START
======================================================= */

init();

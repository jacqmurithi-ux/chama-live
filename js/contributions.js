
import { supabase } from "./supabase.js";


/* -------------------------------------------------------
   ELEMENTS
------------------------------------------------------- */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const form =
  document.getElementById(
    "contributionForm"
  );

const memberSelect =
  document.getElementById("member");

const amountInput =
  document.getElementById("amount");

const dateInput =
  document.getElementById(
    "contributionDate"
  );

const typeSelect =
  document.getElementById(
    "contributionType"
  );

const methodSelect =
  document.getElementById(
    "paymentMethod"
  );

const mpesaReference =
  document.getElementById(
    "mpesaReference"
  );

const mpesaReferenceWrap =
  document.getElementById(
    "mpesaReferenceWrap"
  );

const saveButton =
  document.getElementById(
    "saveContribution"
  );

const monthlyExpected =
  document.getElementById(
    "monthlyExpected"
  );

const memberStatusRows =
  document.getElementById(
    "memberStatusRows"
  );

const contributionRows =
  document.getElementById(
    "contributionRows"
  );


/* -------------------------------------------------------
   STATE
------------------------------------------------------- */

let groupId = null;

let members = [];

let contributions = [];

let monthlyContribution = 0;


/* -------------------------------------------------------
   HELPERS
------------------------------------------------------- */

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


/* -------------------------------------------------------
   ERROR
------------------------------------------------------- */

function showError(error) {

  console.error(error);

  errorEl.textContent =
    error?.message ||
    "Something went wrong.";

  errorEl.hidden = false;

  statusEl.textContent =
    "Unable to load contributions.";

}


/* -------------------------------------------------------
   GROUP ID
------------------------------------------------------- */

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


/* -------------------------------------------------------
   LOAD GROUP
------------------------------------------------------- */

async function loadGroup() {

  const {
    data,
    error
  } = await supabase
    .from("groups")
    .select(`
      monthly_contribution
    `)
    .eq("id", groupId)
    .single();


  if (error) {
    throw error;
  }


  monthlyContribution =
    Number(
      data?.monthly_contribution || 0
    );


  monthlyExpected.textContent =
    money(monthlyContribution);


  /*
    Automatically suggest the monthly amount.
  */
  if (
    monthlyContribution > 0
  ) {

    amountInput.value =
      monthlyContribution;

  }

}


/* -------------------------------------------------------
   LOAD MEMBERS
------------------------------------------------------- */

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
    .eq("group_id", groupId)
    .order("name", {
      ascending: true
    });


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


/* -------------------------------------------------------
   LOAD CONTRIBUTIONS
------------------------------------------------------- */

async function loadContributions() {

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
      type,
      month,
      paymentmethod,
      contribution_date,
      mpesa_reference
    `)
    .eq("groupid", groupId)
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


/* -------------------------------------------------------
   MEMBER NAME
------------------------------------------------------- */

function getMemberName(memberId) {

  const member =
    members.find(
      item =>
        item.id === memberId
    );


  return (
    member?.name ||
    "Unknown member"
  );

}


/* -------------------------------------------------------
   RENDER LEDGER
------------------------------------------------------- */

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

          const type =
            item.type ||
            item.contribution ||
            "—";

          const method =
            item.paymentmethod ||
            "—";

          const reference =
            item.mpesa_reference ||
            "—";


          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    item.contribution_date
                  )
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


/* -------------------------------------------------------
   MONTHLY STATUS
------------------------------------------------------- */

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
    Determine current month.
  */

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    now.getMonth() + 1;


  /*
    YYYY-MM format.
  */

  const currentMonth =
    `${year}-${String(
      month
    ).padStart(2, "0")}`;


  memberStatusRows.innerHTML =
    members
      .map(
        member => {

          /*
            Only monthly contributions
            for the current month count
            toward the monthly target.
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


                  const type =
                    String(
                      item.type ||
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
                    Prefer month column
                    where available.
                  */

                  if (
                    item.month
                  ) {

                    return String(
                      item.month
                    ).startsWith(
                      currentMonth
                    );

                  }


                  /*
                    Fall back to
                    contribution date.
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


          const expected =
            monthlyContribution;


          const outstanding =
            Math.max(
              expected - paid,
              0
            );


          let status =
            "OUTSTANDING";


          if (
            expected === 0
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


/* -------------------------------------------------------
   PAYMENT METHOD
------------------------------------------------------- */

function updatePaymentMethod() {

  const method =
    methodSelect.value;


  if (
    method === "mpesa"
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


/* -------------------------------------------------------
   RECORD CONTRIBUTION
------------------------------------------------------- */

async function recordContribution(
  event
) {

  event.preventDefault();

  errorEl.hidden = true;


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


  /* ---------------------------------------------
     VALIDATION
  ---------------------------------------------- */

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


  if (!contributionDate) {

    errorEl.textContent =
      "Please select the contribution date.";

    errorEl.hidden = false;

    return;

  }


  if (
    paymentMethod === "mpesa" &&
    !reference
  ) {

    errorEl.textContent =
      "Please enter the M-Pesa reference.";

    errorEl.hidden = false;

    return;

  }


  /* ---------------------------------------------
     DISABLE BUTTON
  ---------------------------------------------- */

  saveButton.disabled =
    true;

  saveButton.textContent =
    "Saving...";


  try {

    /*
      Create YYYY-MM month value.
    */

    const month =
      contributionDate
        .slice(0, 7);


    const {
      error
    } = await supabase
      .from("contributions")
      .insert({

        groupid:
          groupId,

        memberid:
          memberId,

        amount:
          amount,

        contribution:
          contributionType,

        type:
          contributionType,

        month:
          month,

        paymentmethod:
          paymentMethod,

        contribution_date:
          contributionDate,

        mpesa_reference:
          paymentMethod === "mpesa"
            ? reference
            : null

      });


    if (error) {
      throw error;
    }


    /*
      Reload everything.
    */

    await loadContributions();

    renderLedger();

    renderMemberStatus();


    /*
      Reset form.
    */

    form.reset();


    /*
      Restore today's date.
    */

    dateInput.value =
      new Date()
        .toISOString()
        .slice(0, 10);


    /*
      Restore monthly amount.
    */

    if (
      monthlyContribution > 0
    ) {

      amountInput.value =
        monthlyContribution;

    }


    typeSelect.value =
      "monthly";

    methodSelect.value =
      "mpesa";

    updatePaymentMethod();


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


/* -------------------------------------------------------
   INITIALIZE
------------------------------------------------------- */

async function init() {

  try {

    statusEl.textContent =
      "Loading contributions...";


    groupId =
      await getGroupId();


    await Promise.all([
      loadGroup(),
      loadMembers(),
      loadContributions()
    ]);


    /*
      Today's date.
    */

    dateInput.value =
      new Date()
        .toISOString()
        .slice(0, 10);


    typeSelect.value =
      "monthly";


    methodSelect.value =
      "mpesa";


    updatePaymentMethod();


    renderLedger();

    renderMemberStatus();


    statusEl.textContent =
      "Contributions loaded.";


  } catch (error) {

    showError(error);

  }

}


/* -------------------------------------------------------
   EVENTS
------------------------------------------------------- */

form.addEventListener(
  "submit",
  recordContribution
);


methodSelect.addEventListener(
  "change",
  updatePaymentMethod
);


/* -------------------------------------------------------
   START
------------------------------------------------------- */

init();

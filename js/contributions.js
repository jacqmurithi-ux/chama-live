
import { supabase } from "./supabase.js";

/* =======================================================
   ELEMENTS
======================================================= */

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const form = document.getElementById("contributionForm");

const memberSelect = document.getElementById("member");
const amountInput = document.getElementById("amount");
const dateInput = document.getElementById("contributionDate");

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

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(value || 0));

}


function todayString() {

  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(now.getMonth() + 1)
      .padStart(2, "0");

  const day =
    String(now.getDate())
      .padStart(2, "0");

  return `${year}-${month}-${day}`;

}


function formatDate(value) {

  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });

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
    .replaceAll("'", "&#039;");

}


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
    Automatically fill the group's
    configured monthly contribution.
  */

  if (monthlyContribution > 0) {

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
        ).toLowerCase() === "active"
    );

  memberSelect.innerHTML = `
    <option value="">
      Select member
    </option>
  `;

  members.forEach(member => {

    const option =
      document.createElement("option");

    option.value =
      member.id;

    option.textContent =
      member.name;

    memberSelect.appendChild(option);

  });

}


/* =======================================================
   LOAD CONTRIBUTIONS

   EXACT DATABASE COLUMNS
======================================================= */

async function loadContributions() {

  const {
    data,
    error
  } = await supabase
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
    .eq("group_id", groupId)
    .order("contribution_date", {
      ascending: false
    })
    .order("created_at", {
      ascending: false
    });

  if (error) {
    throw error;
  }

  contributions =
    data || [];

}


/* =======================================================
   MEMBER NAME
======================================================= */

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


/* =======================================================
   RENDER CONTRIBUTION LEDGER
======================================================= */

function renderLedger() {

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
      .slice(0, 50)
      .map(item => {

        /*
          Use contribution_date.
          Fall back to created_at.
          Finally fall back to month.
        */

        const date =
          item.contribution_date ||
          item.created_at ||
          (
            item.month
              ? `${item.month}-01`
              : null
          );

        /*
          Your database has both reference
          and mpesa_reference.

          For M-Pesa, prefer mpesa_reference.
          Otherwise show reference.
        */

        const reference =
          item.mpesa_reference ||
          item.reference ||
          "—";

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
                item.payment_method ||
                "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                reference
              )}
            </td>

          </tr>
        `;

      })
      .join("");

}


/* =======================================================
   MONTHLY MEMBER STATUS
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

  const now = new Date();

  const currentMonth =
    `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;


  memberStatusRows.innerHTML =
    members
      .map(member => {

        /*
          Add together all monthly payments
          made by this member this month.

          This allows partial payments.

          Example:

          Payment 1 = 100
          Payment 2 = 100

          Paid = 200
          Outstanding = 0
        */

        const paid =
          contributions
            .filter(item => {

              if (
                item.member_id !==
                member.id
              ) {
                return false;
              }

              const type =
                String(
                  item.contribution_type ||
                  ""
                ).toLowerCase();

              if (
                type !== "monthly"
              ) {
                return false;
              }

              return (
                String(
                  item.month || ""
                ) === currentMonth
              );

            })
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


        if (expected <= 0) {

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

      })
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

async function recordContribution(event) {

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
      "Please enter a valid amount.";

    errorEl.hidden = false;

    return;
  }


  if (!contributionDate) {

    errorEl.textContent =
      "Please select the contribution date.";

    errorEl.hidden = false;

    return;
  }


  if (!contributionType) {

    errorEl.textContent =
      "Please select the contribution type.";

    errorEl.hidden = false;

    return;
  }


  if (!paymentMethod) {

    errorEl.textContent =
      "Please select the payment method.";

    errorEl.hidden = false;

    return;
  }


  if (
    paymentMethod === "M-Pesa" &&
    !reference
  ) {

    errorEl.textContent =
      "Please enter the M-Pesa reference.";

    errorEl.hidden = false;

    return;
  }


  /* -----------------------------------------------------
     MONTH
  ----------------------------------------------------- */

  const month =
    contributionDate.slice(0, 7);


  /* -----------------------------------------------------
     WARN ABOUT EXISTING MONTHLY PAYMENT
  ----------------------------------------------------- */

  if (
    contributionType ===
    "monthly"
  ) {

    const existing =
      contributions.some(item => {

        return (
          item.member_id ===
            memberId &&

          String(
            item.contribution_type ||
            ""
          ).toLowerCase() ===
            "monthly" &&

          String(
            item.month || ""
          ) ===
            month
        );

      });


    if (existing) {

      const proceed =
        window.confirm(
          "This member already has a monthly contribution for " +
          month +
          ". Continue with another payment?"
        );

      if (!proceed) {
        return;
      }

    }

  }


  /* -----------------------------------------------------
     SAVE
  ----------------------------------------------------- */

  saveButton.disabled =
    true;

  saveButton.textContent =
    "Saving...";

  statusEl.textContent =
    "Recording contribution...";


  try {

    /*
      EXACT MATCH TO YOUR DATABASE.
    */

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
        paymentMethod === "M-Pesa"
          ? reference
          : null,

      /*
        Keep reference synchronized
        for compatibility with your
        existing reference field.
      */

      reference:
        reference || null

    };


    /*
      recorded_by is intentionally not
      supplied here because we don't want
      to guess the authenticated user's ID.

      If your RLS/database trigger handles
      it automatically, it will continue
      doing so.
    */


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
       RELOAD
    --------------------------------------------------- */

    await loadContributions();


    renderLedger();

    renderMemberStatus();


    /* ---------------------------------------------------
       RESET
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
      1. Find user's group.
    */

    groupId =
      await getGroupId();


    /*
      2. Load group settings.
      3. Load members.
      4. Load contributions.
    */

    await Promise.all([
      loadGroup(),
      loadMembers(),
      loadContributions()
    ]);


    /*
      Default date.
    */

    dateInput.value =
      todayString();


    /*
      Default contribution type.
    */

    typeSelect.value =
      "monthly";


    /*
      Default payment method.
    */

    methodSelect.value =
      "M-Pesa";


    updatePaymentMethod();


    /*
      Render everything.
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

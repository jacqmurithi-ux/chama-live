import { supabase } from "./supabase.js";

console.log("CHAMA LIVE: contributions.js loaded");

/* =======================================================
   ELEMENTS
======================================================= */

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");

const form = document.getElementById("contributionForm");

const memberSelect = document.getElementById("member");
const amountInput = document.getElementById("amount");
const dateInput = document.getElementById("contributionDate");

const typeSelect = document.getElementById("contributionType");
const methodSelect = document.getElementById("paymentMethod");

const mpesaReference = document.getElementById("mpesaReference");
const mpesaReferenceWrap = document.getElementById("mpesaReferenceWrap");

const saveButton = document.getElementById("saveContribution");

const monthlyExpected = document.getElementById("monthlyExpected");
const memberStatusRows = document.getElementById("memberStatusRows");
const contributionRows = document.getElementById("contributionRows");


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

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
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
   * contribution_date is the primary source.
   * month is the fallback.
   */

  if (item.contribution_date) {
    return String(item.contribution_date).slice(0, 7);
  }

  if (item.month) {
    return String(item.month).slice(0, 7);
  }

  if (item.created_at) {
    return String(item.created_at).slice(0, 7);
  }

  return "";
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
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}


function escapeHtml(value) {

  return String(value ?? "")
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

  if (errorEl) {
    errorEl.textContent =
      error?.message ||
      "Something went wrong.";

    errorEl.hidden = false;
  }

  if (statusEl) {
    statusEl.textContent =
      "Unable to load contributions.";
  }
}


function clearError() {

  if (!errorEl) return;

  errorEl.hidden = true;
  errorEl.textContent = "";
}


/* =======================================================
   CURRENT GROUP
======================================================= */

async function getGroupId() {

  const {
    data,
    error
  } = await supabase.rpc("my_group_id");

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
  } = await supabase
    .from("groups")
    .select("monthly_contribution")
    .eq("id", groupId)
    .single();

  if (error) {
    throw error;
  }

  monthlyContribution =
    Number(data?.monthly_contribution || 0);

  if (monthlyExpected) {
    monthlyExpected.textContent =
      money(monthlyContribution);
  }

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

  /*
   * Keep active members for recording.
   */

  members = (data || []).filter(member =>
    String(member.status || "active")
      .toLowerCase() === "active"
  );

  if (!memberSelect) return;

  memberSelect.innerHTML = `
    <option value="">
      Select member
    </option>
  `;

  members.forEach(member => {

    const option =
      document.createElement("option");

    option.value = member.id;
    option.textContent = member.name;

    memberSelect.appendChild(option);
  });
}


/* =======================================================
   LOAD CONTRIBUTIONS
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

  contributions = data || [];
}


/* =======================================================
   MEMBER NAME
======================================================= */

function getMemberName(memberId) {

  const member =
    members.find(
      item => String(item.id) === String(memberId)
    );

  return member?.name || "Unknown member";
}


/* =======================================================
   LEDGER
======================================================= */

function renderLedger() {

  if (!contributionRows) return;

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
      .map(item => {

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

        return `
          <tr>

            <td>
              ${escapeHtml(formatDate(date))}
            </td>

            <td>
              ${escapeHtml(
                getMemberName(item.member_id)
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
                item.contribution_type || "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                item.payment_method || "—"
              )}
            </td>

            <td>
              ${escapeHtml(reference)}
            </td>

          </tr>
        `;

      })
      .join("");
}


/* =======================================================
   MONTHLY STATUS
======================================================= */

function renderMemberStatus() {

  if (!memberStatusRows) return;

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
      .map(member => {

        /*
         * ONLY monthly contributions count
         * toward monthly contribution status.
         */

        const paid =
          contributions
            .filter(item => {

              if (
                String(item.member_id) !==
                String(member.id)
              ) {
                return false;
              }

              const type =
                String(
                  item.contribution_type || ""
                ).toLowerCase();

              if (type !== "monthly") {
                return false;
              }

              return (
                getContributionMonth(item) ===
                currentMonth
              );

            })
            .reduce(
              (total, item) =>
                total +
                Number(item.amount || 0),
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
          status = "NOT SET";
        }
        else if (paid >= expected) {
          status = "PAID";
        }
        else if (paid > 0) {
          status = "PARTIAL";
        }

        return `
          <tr>

            <td>
              ${escapeHtml(member.name)}
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
                ${escapeHtml(status)}
              </strong>
            </td>

          </tr>
        `;

      })
      .join("");
}


/* =======================================================
   PAYMENT METHOD
======================================================= */

function updatePaymentMethod() {

  if (
    !methodSelect ||
    !mpesaReference ||
    !mpesaReferenceWrap
  ) {
    return;
  }

  const method =
    methodSelect.value;

  const isMpesa =
    method === "M-Pesa";

  mpesaReferenceWrap.style.display =
    isMpesa ? "" : "none";

  mpesaReference.required =
    isMpesa;

  if (!isMpesa) {
    mpesaReference.value = "";
  }
}


/* =======================================================
   RECORD CONTRIBUTION
======================================================= */

async function recordContribution(event) {

  event.preventDefault();

  clearError();

  const memberId =
    memberSelect?.value;

  const amount =
    Number(amountInput?.value || 0);

  const contributionDate =
    dateInput?.value;

  const contributionType =
    typeSelect?.value;

  const paymentMethod =
    methodSelect?.value;

  const reference =
    mpesaReference?.value.trim() || "";


  if (!memberId) {
    showError(
      new Error("Please select a member.")
    );
    return;
  }

  if (!amount || amount <= 0) {
    showError(
      new Error("Please enter a valid amount.")
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

  if (
    paymentMethod === "M-Pesa" &&
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
    contributionDate.slice(0, 7);


  /*
   * Warn, but still allow partial payments.
   */

  if (
    String(contributionType).toLowerCase() ===
    "monthly"
  ) {

    const existing =
      contributions.some(item =>
        String(item.member_id) ===
          String(memberId) &&
        String(
          item.contribution_type || ""
        ).toLowerCase() === "monthly" &&
        getContributionMonth(item) === month
      );

    if (existing) {

      const proceed =
        window.confirm(
          `This member already has a monthly contribution for ${month}.\n\n` +
          `Continue with another payment?`
        );

      if (!proceed) {
        return;
      }
    }
  }


  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
  }

  if (statusEl) {
    statusEl.textContent =
      "Recording contribution...";
  }


  try {

    const contributionData = {

      group_id: groupId,

      member_id: memberId,

      amount: amount,

      contribution_type:
        contributionType,

      month: month,

      payment_method:
        paymentMethod,

      contribution_date:
        contributionDate,

      mpesa_reference:
        paymentMethod === "M-Pesa"
          ? reference
          : null,

      reference:
        reference || null
    };


    const {
      error
    } =
      await supabase
        .from("contributions")
        .insert(contributionData);

    if (error) {
      throw error;
    }


    await loadContributions();

    renderLedger();
    renderMemberStatus();


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
        "M-Pesa";
    }

    updatePaymentMethod();


    if (
      amountInput &&
      monthlyContribution > 0
    ) {
      amountInput.value =
        monthlyContribution;
    }


    if (statusEl) {
      statusEl.textContent =
        "✓ Contribution recorded successfully.";
    }

  } catch (error) {

    showError(error);

  } finally {

    if (saveButton) {
      saveButton.disabled = false;
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

    groupId =
      await getGroupId();

    await Promise.all([
      loadGroup(),
      loadMembers(),
      loadContributions()
    ]);


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
        "M-Pesa";
    }

    updatePaymentMethod();

    renderLedger();
    renderMemberStatus();

    if (statusEl) {
      statusEl.textContent =
        "Contributions loaded.";
    }

  } catch (error) {

    showError(error);
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

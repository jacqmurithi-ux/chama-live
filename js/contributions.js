/* =========================================================
   CHAMA LIVE — CONTRIBUTIONS
   Schema-aligned version
   Loaded dynamically by layout.js
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: contributions.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

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


/* =========================================================
   STATE
========================================================= */

let groupId = null;

let currentUser = null;

let currentMember = null;

let members = [];

let contributions = [];

let monthlyContribution = 0;

let initialized = false;


/* =========================================================
   HELPERS
========================================================= */

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


function todayString() {

  const now =
    new Date();


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


function currentMonth() {

  return todayString()
    .slice(0, 7);

}


function escapeHtml(value) {

  return String(
    value ?? ""
  )
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
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );

}


/* =========================================================
   ERROR
========================================================= */

function showPageError(error) {

  console.error(
    "CHAMA LIVE Contributions:",
    error
  );


  if (errorEl) {

    errorEl.textContent =
      error?.message ||
      "Unable to load contributions.";

    errorEl.hidden =
      false;

  }

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers() {

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        member_number,
        membership_number,
        name,
        phone,
        email,
        role,
        status
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "member_number",
        {
          ascending: true
        }
      );


  if (error) {

    throw error;

  }


  members =
    data || [];


  if (!memberSelect) {

    return;

  }


  memberSelect.innerHTML = `
    <option value="">
      Select member
    </option>
  `;


  members
    .filter(
      member =>
        String(
          member.status ||
          "active"
        ).toLowerCase() ===
        "active"
    )
    .forEach(
      member => {

        const option =
          document.createElement(
            "option"
          );


        option.value =
          member.id;


        const number =
          member.member_number ||
          member.membership_number ||
          "";


        option.textContent =
          number
            ? `${number} — ${member.name}`
            : member.name;


        memberSelect.appendChild(
          option
        );

      }
    );

}


/* =========================================================
   LOAD GROUP
========================================================= */

async function loadGroup() {

  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(`
        id,
        monthly_contribution
      `)
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
      data?.monthly_contribution ||
      0
    );


  if (monthlyExpected) {

    monthlyExpected.textContent =
      money(
        monthlyContribution
      );

  }

}


/* =========================================================
   LOAD CONTRIBUTIONS
========================================================= */

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


/* =========================================================
   MEMBER NAME
========================================================= */

function memberName(
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


/* =========================================================
   RENDER LEDGER
========================================================= */

function renderContributions() {

  if (!contributionRows) {

    return;

  }


  if (
    contributions.length === 0
  ) {

    contributionRows.innerHTML = `
      <tr>
        <td colspan="6">
          No contributions recorded.
        </td>
      </tr>
    `;

    return;

  }


  contributionRows.innerHTML =
    contributions
      .map(
        contribution => {

          const reference =
            contribution.mpesa_reference ||
            contribution.reference ||
            "—";


          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDate(
                    contribution.contribution_date ||
                    contribution.created_at
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  memberName(
                    contribution.member_id
                  )
                )}
              </td>

              <td>
                <strong>
                  ${escapeHtml(
                    money(
                      contribution.amount
                    )
                  )}
                </strong>
              </td>

              <td>
                ${escapeHtml(
                  contribution.contribution_type ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  contribution.payment_method ||
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

        }
      )
      .join("");

}


/* =========================================================
   RENDER MONTHLY STATUS
========================================================= */

function renderMemberStatus() {

  if (!memberStatusRows) {

    return;

  }


  const month =
    currentMonth();


  if (
    members.length === 0
  ) {

    memberStatusRows.innerHTML = `
      <tr>
        <td colspan="5">
          No active members found.
        </td>
      </tr>
    `;

    return;

  }


  const activeMembers =
    members.filter(
      member =>
        String(
          member.status ||
          "active"
        ).toLowerCase() ===
        "active"
    );


  memberStatusRows.innerHTML =
    activeMembers
      .map(
        member => {

          const paid =
            contributions
              .filter(
                item =>
                  String(
                    item.member_id
                  ) ===
                  String(
                    member.id
                  ) &&
                  String(
                    item.month ||
                    ""
                  ).slice(0, 7) ===
                  month
              )
              .reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  Number(
                    item.amount ||
                    0
                  ),
                0
              );


          const expected =
            monthlyContribution;


          const outstanding =
            Math.max(
              expected -
              paid,
              0
            );


          let status =
            "Outstanding";


          if (
            expected > 0 &&
            paid >= expected
          ) {

            status =
              "Paid";

          }
          else if (
            paid > 0
          ) {

            status =
              "Partial";

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
                ${escapeHtml(
                  status
                )}
              </td>

            </tr>
          `;

        }
      )
      .join("");

}


/* =========================================================
   PAYMENT METHOD UI
========================================================= */

function updateMpesaField() {

  const isMpesa =
    methodSelect?.value ===
    "M-Pesa";


  if (mpesaReferenceWrap) {

    mpesaReferenceWrap.hidden =
      !isMpesa;

  }


  if (mpesaReference) {

    mpesaReference.required =
      isMpesa;

  }

}


/* =========================================================
   RECORD CONTRIBUTION
========================================================= */

async function saveContribution(
  event
) {

  event.preventDefault();


  try {

    if (errorEl) {

      errorEl.hidden =
        true;

    }


    const memberId =
      memberSelect?.value;


    const amount =
      Number(
        amountInput?.value ||
        0
      );


    const contributionDate =
      dateInput?.value;


    const contributionType =
      typeSelect?.value ||
      "monthly";


    const paymentMethod =
      methodSelect?.value ||
      "M-Pesa";


    const mpesaRef =
      mpesaReference?.value
        ?.trim() ||
      "";


    if (!memberId) {

      throw new Error(
        "Please select a member."
      );

    }


    if (
      !amount ||
      amount <= 0
    ) {

      throw new Error(
        "Please enter a valid contribution amount."
      );

    }


    if (!contributionDate) {

      throw new Error(
        "Please select the contribution date."
      );

    }


    if (
      paymentMethod ===
      "M-Pesa" &&
      !mpesaRef
    ) {

      throw new Error(
        "Please enter the M-Pesa reference."
      );

    }


    if (saveButton) {

      saveButton.disabled =
        true;

      saveButton.textContent =
        "Saving...";

    }


    const month =
      contributionDate.slice(0, 7);


    const reference =
      mpesaRef ||
      null;


    const {
      error
    } =
      await supabase
        .from("contributions")
        .insert({

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

          reference:
            reference,

          mpesa_reference:
            paymentMethod ===
            "M-Pesa"
              ? mpesaRef
              : null,

          recorded_by:
            currentUser.id,

          contribution_date:
            contributionDate

        });


    if (error) {

      throw error;

    }


    form?.reset();


    if (dateInput) {

      dateInput.value =
        todayString();

    }


    updateMpesaField();


    await loadContributions();

    renderContributions();

    renderMemberStatus();


    if (statusEl) {

      statusEl.textContent =
        "Contribution recorded successfully.";

    }


  }
  catch (error) {

    showPageError(
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


/* =========================================================
   INITIALIZE
========================================================= */

export async function initPage() {

  if (initialized) {

    return;

  }


  initialized =
    true;


  try {

    currentUser =
      await requireAuth();


    currentMember =
      await getMyMember();


    groupId =
      currentMember.group_id;


    if (form) {

      form.addEventListener(
        "submit",
        saveContribution
      );

    }


    if (methodSelect) {

      methodSelect.addEventListener(
        "change",
        updateMpesaField
      );

    }


    if (dateInput) {

      dateInput.value =
        todayString();

    }


    updateMpesaField();


    await loadGroup();

    await loadMembers();

    await loadContributions();


    renderContributions();

    renderMemberStatus();


    if (statusEl) {

      statusEl.textContent =
        "Contributions ready.";

    }


  }
  catch (error) {

    initialized =
      false;

    showPageError(
      error
    );

  }

}


export const initContributions =
  initPage;


console.log(
  "CHAMA LIVE: contributions.js ready"
);

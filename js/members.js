import { supabase } from "./supabase.js";


/* =====================================================
   ELEMENTS
===================================================== */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const memberForm =
  document.getElementById("memberForm");

const memberName =
  document.getElementById("memberName");

const memberNumber =
  document.getElementById("memberNumber");

const membershipNumber =
  document.getElementById("membershipNumber");

const phone =
  document.getElementById("phone");

const email =
  document.getElementById("email");

const role =
  document.getElementById("role");

const joinDate =
  document.getElementById("joinDate");

const saveMember =
  document.getElementById("saveMember");

const statusFilter =
  document.getElementById("statusFilter");

const searchMember =
  document.getElementById("searchMember");

const memberRows =
  document.getElementById("memberRows");

const totalMembers =
  document.getElementById("totalMembers");

const activeMembers =
  document.getElementById("activeMembers");

const inactiveMembers =
  document.getElementById("inactiveMembers");

const detailsCard =
  document.getElementById("detailsCard");

const memberDetails =
  document.getElementById("memberDetails");

const contributionHistory =
  document.getElementById("contributionHistory");

const statementMemberButton =
  document.getElementById("statementMember");

const editMemberButton =
  document.getElementById("editMember");

const toggleMemberButton =
  document.getElementById("toggleMember");


/* =====================================================
   STATE
===================================================== */

let groupId = null;

let monthlyContribution = 0;

let members = [];

let contributions = [];

let selectedMember = null;


/* =====================================================
   HELPERS
===================================================== */

function money(value) {

  const number =
    Number(value || 0);

  return number.toLocaleString(
    "en-KE",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }
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


function currentMonth() {

  const date =
    new Date();

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;

}


function currentMonthLabel() {

  const date =
    new Date();

  return date.toLocaleDateString(
    "en-KE",
    {
      year: "numeric",
      month: "long"
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
    .replaceAll("'", "&#039;");

}


function showError(error) {

  console.error(
    "Members error:",
    error
  );

  errorEl.textContent =
    error?.message ||
    "Unable to load members.";

  errorEl.hidden =
    false;

}


/* =====================================================
   GET GROUP
===================================================== */

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


/* =====================================================
   LOAD GROUP SETTINGS
===================================================== */

async function loadGroupSettings() {

  const {
    data,
    error
  } = await supabase
    .from("groups")
    .select(
      "id, name, monthly_contribution"
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
      data?.monthly_contribution ||
      0
    );

}


/* =====================================================
   LOAD MEMBERS
===================================================== */

async function loadMembers() {

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select(`
      id,
      group_id,
      user_id,
      member_number,
      name,
      phone,
      role,
      join_date,
      status,
      created_at,
      email,
      membership_number,
      onboarding_status
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
    data || [];

}


/* =====================================================
   LOAD CONTRIBUTIONS
===================================================== */

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
      mpesa_reference,
      contribution_date,
      created_at
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
    );

  if (error) {
    throw error;
  }

  contributions =
    data || [];

}


/* =====================================================
   MONTHLY MEMBER STATUS
===================================================== */

function getMemberPaid(
  memberId
) {

  const month =
    currentMonth();


  return contributions
    .filter(
      contribution =>

        contribution.member_id ===
        memberId &&

        String(
          contribution.month
        ) ===
        month &&

        String(
          contribution.contribution_type ||
          ""
        ).toLowerCase() ===
        "monthly"
    )
    .reduce(
      (
        total,
        contribution
      ) =>
        total +
        Number(
          contribution.amount ||
          0
        ),
      0
    );

}


function getMemberStatus(
  memberId
) {

  const expected =
    monthlyContribution;

  const paid =
    getMemberPaid(
      memberId
    );

  const outstanding =
    Math.max(
      expected - paid,
      0
    );


  let status =
    "OUTSTANDING";


  if (
    expected <= 0
  ) {

    status =
      "NO TARGET";

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


  return {
    expected,
    paid,
    outstanding,
    status
  };

}


/* =====================================================
   TOTAL CONTRIBUTIONS
===================================================== */

function getMemberTotal(
  memberId
) {

  return contributions
    .filter(
      contribution =>
        contribution.member_id ===
        memberId
    )
    .reduce(
      (
        total,
        contribution
      ) =>
        total +
        Number(
          contribution.amount ||
          0
        ),
      0
    );

}


/* =====================================================
   METRICS
===================================================== */

function renderMetrics() {

  const total =
    members.length;

  const active =
    members.filter(
      member =>
        String(
          member.status
        ).toLowerCase() ===
        "active"
    ).length;

  const inactive =
    total -
    active;


  totalMembers.textContent =
    total;

  activeMembers.textContent =
    active;

  inactiveMembers.textContent =
    inactive;

}


/* =====================================================
   FILTER MEMBERS
===================================================== */

function filteredMembers() {

  const filter =
    statusFilter.value;

  const search =
    searchMember.value
      .trim()
      .toLowerCase();


  return members.filter(
    member => {

      const statusMatch =
        filter === "all" ||
        String(
          member.status
        ).toLowerCase() ===
        filter;


      const searchMatch =
        !search ||
        String(
          member.name ||
          ""
        )
        .toLowerCase()
        .includes(search) ||

        String(
          member.member_number ||
          ""
        )
        .toLowerCase()
        .includes(search) ||

        String(
          member.phone ||
          ""
        )
        .toLowerCase()
        .includes(search);


      return (
        statusMatch &&
        searchMatch
      );

    }
  );

}


/* =====================================================
   RENDER MEMBERS
===================================================== */

function renderMembers() {

  const list =
    filteredMembers();


  if (!list.length) {

    memberRows.innerHTML = `
      <tr>
        <td colspan="9">
          No members found.
        </td>
      </tr>
    `;

    return;

  }


  memberRows.innerHTML =
    list.map(
      member => {

        const monthly =
          getMemberStatus(
            member.id
          );


        return `

          <tr>

            <td>
              <strong>
                ${escapeHtml(
                  member.name
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                member.member_number
              )}
            </td>

            <td>
              ${escapeHtml(
                member.phone
              )}
            </td>

            <td>
              ${escapeHtml(
                member.role
              )}
            </td>

            <td>
              <strong>
                ${escapeHtml(
                  member.status
                )}
              </strong>
            </td>

            <td>
              KSh ${money(
                monthly.expected
              )}
            </td>

            <td>
              KSh ${money(
                monthly.paid
              )}
            </td>

            <td>
              KSh ${money(
                monthly.outstanding
              )}
            </td>

            <td>

              <button
                type="button"
                class="btn btn-secondary"
                data-action="view"
                data-id="${escapeHtml(
                  member.id
                )}"
              >
                View
              </button>

            </td>

          </tr>

        `;

      }
    )
    .join("");

}


/* =====================================================
   ADD MEMBER
===================================================== */

async function addMember(
  event
) {

  event.preventDefault();


  try {

    errorEl.hidden =
      true;


    const name =
      memberName.value.trim();

    const memberNo =
      memberNumber.value.trim();

    const membershipNo =
      membershipNumber.value.trim();

    const memberPhone =
      phone.value.trim();

    const memberEmail =
      email.value.trim();

    const memberRole =
      role.value;

    const memberJoinDate =
      joinDate.value ||
      new Date()
        .toISOString()
        .slice(0, 10);


    if (!name) {

      throw new Error(
        "Please enter the member name."
      );

    }


    if (!memberNo) {

      throw new Error(
        "Please enter the member number."
      );

    }


    if (!membershipNo) {

      throw new Error(
        "Please enter the membership number."
      );

    }


    if (!memberPhone) {

      throw new Error(
        "Please enter the phone number."
      );

    }


    saveMember.disabled =
      true;

    saveMember.textContent =
      "Adding...";


    const {
      error
    } = await supabase
      .from("members")
      .insert({

        group_id:
          groupId,

        member_number:
          memberNo,

        name:
          name,

        phone:
          memberPhone,

        role:
          memberRole,

        join_date:
          memberJoinDate,

        status:
          "active",

        email:
          memberEmail ||
          null,

        membership_number:
          membershipNo,

        onboarding_status:
          "pending"

      });


    if (error) {
      throw error;
    }


    memberForm.reset();

    setDefaultDate();


    await loadMembers();


    renderMetrics();

    renderMembers();


    statusEl.textContent =
      "Member added successfully.";

  }
  catch (error) {

    showError(
      error
    );

  }
  finally {

    saveMember.disabled =
      false;

    saveMember.textContent =
      "Add Member";

  }

}


/* =====================================================
   SELECT MEMBER
===================================================== */

async function selectMember(
  id
) {

  selectedMember =
    members.find(
      member =>
        member.id ===
        id
    );


  if (
    !selectedMember
  ) {

    return;

  }


  const monthly =
    getMemberStatus(
      selectedMember.id
    );


  const total =
    getMemberTotal(
      selectedMember.id
    );


  detailsCard.hidden =
    false;


  memberDetails.innerHTML = `

    <p>
      <strong>Name:</strong>
      ${escapeHtml(
        selectedMember.name
      )}
    </p>

    <p>
      <strong>Member Number:</strong>
      ${escapeHtml(
        selectedMember.member_number
      )}
    </p>

    <p>
      <strong>Membership Number:</strong>
      ${escapeHtml(
        selectedMember.membership_number
      )}
    </p>

    <p>
      <strong>Phone:</strong>
      ${escapeHtml(
        selectedMember.phone
      )}
    </p>

    <p>
      <strong>Email:</strong>
      ${escapeHtml(
        selectedMember.email ||
        "—"
      )}
    </p>

    <p>
      <strong>Role:</strong>
      ${escapeHtml(
        selectedMember.role
      )}
    </p>

    <p>
      <strong>Join Date:</strong>
      ${escapeHtml(
        formatDate(
          selectedMember.join_date
        )
      )}
    </p>

    <p>
      <strong>Status:</strong>
      ${escapeHtml(
        selectedMember.status
      )}
    </p>

    <hr>

    <h3>
      ${escapeHtml(
        currentMonthLabel()
      )}
    </h3>

    <p>
      Expected:
      <strong>
        KSh ${money(
          monthly.expected
        )}
      </strong>
    </p>

    <p>
      Paid:
      <strong>
        KSh ${money(
          monthly.paid
        )}
      </strong>
    </p>

    <p>
      Outstanding:
      <strong>
        KSh ${money(
          monthly.outstanding
        )}
      </strong>
    </p>

    <p>
      Status:
      <strong>
        ${escapeHtml(
          monthly.status
        )}
      </strong>
    </p>

    <p>
      Total Contributions:
      <strong>
        KSh ${money(
          total
        )}
      </strong>
    </p>

  `;


  renderContributionHistory();


  const isActive =
    String(
      selectedMember.status
    ).toLowerCase() ===
    "active";


  toggleMemberButton.textContent =
    isActive
      ? "Deactivate Member"
      : "Activate Member";

}


/* =====================================================
   CONTRIBUTION HISTORY
===================================================== */

function renderContributionHistory() {

  if (
    !selectedMember
  ) {
    return;
  }


  const history =
    contributions.filter(
      contribution =>
        contribution.member_id ===
        selectedMember.id
    );


  if (!history.length) {

    contributionHistory.innerHTML = `
      <tr>
        <td colspan="5">
          No contributions recorded.
        </td>
      </tr>
    `;

    return;

  }


  contributionHistory.innerHTML =
    history.map(
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
              <strong>
                KSh ${money(
                  contribution.amount
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


/* =====================================================
   MEMBER STATEMENT
===================================================== */

function openMemberStatement() {

  if (
    !selectedMember
  ) {

    showError(
      new Error(
        "Please select a member first."
      )
    );

    return;

  }


  const monthly =
    getMemberStatus(
      selectedMember.id
    );


  const total =
    getMemberTotal(
      selectedMember.id
    );


  const history =
    contributions
      .filter(
        contribution =>
          contribution.member_id ===
          selectedMember.id
      )
      .sort(
        (a, b) => {

          const dateA =
            new Date(
              a.contribution_date ||
              a.created_at
            );

          const dateB =
            new Date(
              b.contribution_date ||
              b.created_at
            );

          return dateB - dateA;

        }
      );


  const rows =
    history.length

      ? history.map(
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
                  <strong>
                    KSh ${money(
                      contribution.amount
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
        ).join("")

      : `
        <tr>
          <td colspan="5">
            No contributions recorded.
          </td>
        </tr>
      `;


  const statementWindow =
    window.open(
      "",
      "_blank"
    );


  if (!statementWindow) {

    showError(
      new Error(
        "The statement window was blocked. Please allow pop-ups for CHAMA LIVE."
      )
    );

    return;

  }


  statementWindow.document.write(`

<!doctype html>

<html lang="en">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>
Member Statement -
${escapeHtml(
  selectedMember.name
)}
</title>


<style>

* {
  box-sizing: border-box;
}


body {

  margin: 0;

  padding: 30px;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  color: #111;

  background: #fff;

}


.statement {

  max-width: 900px;

  margin: auto;

}


.header {

  display: flex;

  justify-content: space-between;

  align-items: flex-start;

  border-bottom:
    2px solid #111;

  padding-bottom: 20px;

  margin-bottom: 25px;

}


.brand {

  font-size: 24px;

  font-weight: 700;

}


.muted {

  color: #666;

}


h1 {

  margin: 0 0 6px;

  font-size: 28px;

}


h2 {

  margin-top: 30px;

}


.member-info {

  display: grid;

  grid-template-columns:
    repeat(2, 1fr);

  gap: 12px;

  margin-bottom: 25px;

}


.info {

  border:
    1px solid #ddd;

  padding: 12px;

  border-radius: 6px;

}


.label {

  font-size: 12px;

  color: #666;

  margin-bottom: 4px;

}


.value {

  font-weight: 600;

}


.summary {

  display: grid;

  grid-template-columns:
    repeat(4, 1fr);

  gap: 12px;

}


.metric {

  border:
    1px solid #ddd;

  padding: 18px;

  border-radius: 6px;

}


.metric-label {

  color: #666;

  font-size: 13px;

}


.metric-value {

  font-size: 20px;

  font-weight: 700;

  margin-top: 6px;

}


table {

  width: 100%;

  border-collapse:
    collapse;

  margin-top: 15px;

}


th,
td {

  border-bottom:
    1px solid #ddd;

  padding: 10px;

  text-align: left;

}


th {

  background: #f5f5f5;

}


.footer {

  margin-top: 40px;

  padding-top: 15px;

  border-top:
    1px solid #ddd;

  color: #666;

  font-size: 13px;

}


.actions {

  max-width: 900px;

  margin:
    0 auto 20px;

  display: flex;

  gap: 10px;

}


.actions button {

  padding:
    10px 16px;

  border:
    1px solid #ccc;

  border-radius: 5px;

  background: #111;

  color: white;

  cursor: pointer;

}


@media print {

  body {
    padding: 0;
  }

  .actions {
    display: none;
  }

}


@media(max-width:700px) {

  .member-info,
  .summary {

    grid-template-columns:
      1fr;

  }

}

</style>

</head>


<body>


<div class="actions">

  <button
    onclick="window.print()"
  >
    Print Statement
  </button>


  <button
    onclick="window.close()"
  >
    Close
  </button>

</div>


<div class="statement">


  <div class="header">

    <div>

      <div class="brand">
        CHAMA LIVE
      </div>

      <div class="muted">
        Member Financial Statement
      </div>

    </div>


    <div class="muted">

      Generated:
      ${escapeHtml(
        new Date().toLocaleString(
          "en-KE"
        )
      )}

    </div>

  </div>


  <h1>

    ${escapeHtml(
      selectedMember.name
    )}

  </h1>


  <div class="member-info">


    <div class="info">

      <div class="label">
        Member Number
      </div>

      <div class="value">

        ${escapeHtml(
          selectedMember.member_number
        )}

      </div>

    </div>


    <div class="info">

      <div class="label">
        Membership Number
      </div>

      <div class="value">

        ${escapeHtml(
          selectedMember.membership_number
        )}

      </div>

    </div>


    <div class="info">

      <div class="label">
        Phone
      </div>

      <div class="value">

        ${escapeHtml(
          selectedMember.phone
        )}

      </div>

    </div>


    <div class="info">

      <div class="label">
        Role
      </div>

      <div class="value">

        ${escapeHtml(
          selectedMember.role
        )}

      </div>

    </div>


    <div class="info">

      <div class="label">
        Join Date
      </div>

      <div class="value">

        ${escapeHtml(
          formatDate(
            selectedMember.join_date
          )
        )}

      </div>

    </div>


    <div class="info">

      <div class="label">
        Status
      </div>

      <div class="value">

        ${escapeHtml(
          selectedMember.status
        )}

      </div>

    </div>


  </div>


  <h2>

    ${escapeHtml(
      currentMonthLabel()
    )}

    Contribution Summary

  </h2>


  <div class="summary">


    <div class="metric">

      <div class="metric-label">
        Expected
      </div>

      <div class="metric-value">

        KSh ${money(
          monthly.expected
        )}

      </div>

    </div>


    <div class="metric">

      <div class="metric-label">
        Paid
      </div>

      <div class="metric-value">

        KSh ${money(
          monthly.paid
        )}

      </div>

    </div>


    <div class="metric">

      <div class="metric-label">
        Outstanding
      </div>

      <div class="metric-value">

        KSh ${money(
          monthly.outstanding
        )}

      </div>

    </div>


    <div class="metric">

      <div class="metric-label">
        Status
      </div>

      <div class="metric-value">

        ${escapeHtml(
          monthly.status
        )}

      </div>

    </div>


  </div>


  <h2>
    Contribution History
  </h2>


  <table>

    <thead>

      <tr>

        <th>
          Date
        </th>

        <th>
          Amount
        </th>

        <th>
          Type
        </th>

        <th>
          Method
        </th>

        <th>
          Reference
        </th>

      </tr>

    </thead>


    <tbody>

      ${rows}

    </tbody>

  </table>


  <h2>
    Total Contributions
  </h2>


  <p>

    <strong>
      KSh ${money(
        total
      )}
    </strong>

  </p>


  <div class="footer">

    This statement was generated
    from CHAMA LIVE.

  </div>


</div>


</body>

</html>

  `);


  statementWindow.document.close();

}


/* =====================================================
   EDIT MEMBER
===================================================== */

async function editSelectedMember() {

  if (
    !selectedMember
  ) {

    return;

  }


  const name =
    window.prompt(
      "Member name:",
      selectedMember.name
    );


  if (
    name === null
  ) {

    return;

  }


  const phoneValue =
    window.prompt(
      "Phone:",
      selectedMember.phone
    );


  if (
    phoneValue === null
  ) {

    return;

  }


  const emailValue =
    window.prompt(
      "Email:",
      selectedMember.email ||
      ""
    );


  if (
    emailValue === null
  ) {

    return;

  }


  const roleValue =
    window.prompt(
      "Role:",
      selectedMember.role
    );


  if (
    roleValue === null
  ) {

    return;

  }


  try {

    errorEl.hidden =
      true;


    const {
      error
    } = await supabase
      .from("members")
      .update({

        name:
          name.trim(),

        phone:
          phoneValue.trim(),

        email:
          emailValue.trim() ||
          null,

        role:
          roleValue.trim() ||
          "member"

      })
      .eq(
        "id",
        selectedMember.id
      )
      .eq(
        "group_id",
        groupId
      );


    if (error) {
      throw error;
    }


    const selectedId =
      selectedMember.id;


    await loadMembers();


    renderMetrics();

    renderMembers();


    selectedMember =
      members.find(
        member =>
          member.id ===
          selectedId
      );


    if (
      selectedMember
    ) {

      await selectMember(
        selectedMember.id
      );

    }


    statusEl.textContent =
      "Member updated successfully.";

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =====================================================
   ACTIVATE / DEACTIVATE
===================================================== */

async function toggleMember() {

  if (
    !selectedMember
  ) {

    return;

  }


  const currentStatus =
    String(
      selectedMember.status
    ).toLowerCase();


  const newStatus =
    currentStatus === "active"
      ? "inactive"
      : "active";


  try {

    errorEl.hidden =
      true;


    const {
      error
    } = await supabase
      .from("members")
      .update({

        status:
          newStatus

      })
      .eq(
        "id",
        selectedMember.id
      )
      .eq(
        "group_id",
        groupId
      );


    if (error) {
      throw error;
    }


    const selectedId =
      selectedMember.id;


    await loadMembers();


    renderMetrics();

    renderMembers();


    selectedMember =
      members.find(
        member =>
          member.id ===
          selectedId
      );


    if (
      selectedMember
    ) {

      await selectMember(
        selectedMember.id
      );

    }


    statusEl.textContent =
      `Member ${
        newStatus === "active"
          ? "activated"
          : "deactivated"
      } successfully.`;

  }
  catch (error) {

    showError(
      error
    );

  }

}


/* =====================================================
   TABLE CLICK
===================================================== */

memberRows.addEventListener(
  "click",
  event => {

    const button =
      event.target.closest(
        "button[data-action]"
      );


    if (!button) {
      return;
    }


    if (
      button.dataset.action ===
      "view"
    ) {

      selectMember(
        button.dataset.id
      );

    }

  }
);


/* =====================================================
   DEFAULT DATE
===================================================== */

function setDefaultDate() {

  const date =
    new Date();


  const year =
    date.getFullYear();


  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );


  joinDate.value =
    `${year}-${month}-${day}`;

}


/* =====================================================
   EVENTS
===================================================== */

memberForm.addEventListener(
  "submit",
  addMember
);


statusFilter.addEventListener(
  "change",
  renderMembers
);


searchMember.addEventListener(
  "input",
  renderMembers
);


statementMemberButton.addEventListener(
  "click",
  openMemberStatement
);


editMemberButton.addEventListener(
  "click",
  editSelectedMember
);


toggleMemberButton.addEventListener(
  "click",
  toggleMember
);


/* =====================================================
   INITIALIZE
===================================================== */

async function init() {

  try {

    errorEl.hidden =
      true;


    statusEl.textContent =
      "Loading members...";


    setDefaultDate();


    groupId =
      await getGroupId();


    await loadGroupSettings();

    await loadMembers();

    await loadContributions();


    renderMetrics();

    renderMembers();


    statusEl.textContent =
      `Members loaded • ${new Date().toLocaleString(
        "en-KE"
      )}`;

  }
  catch (error) {

    showError(
      error
    );

    statusEl.textContent =
      "Unable to load members.";

  }

}


init();

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


/* MEMBER DETAILS */

const detailsCard =
  document.getElementById("detailsCard");

const detailsTitle =
  document.getElementById("detailsTitle");

const detailsSubtitle =
  document.getElementById("detailsSubtitle");

const memberStatusBadge =
  document.getElementById("memberStatusBadge");

const detailMemberNumber =
  document.getElementById(
    "detailMemberNumber"
  );

const detailMembershipNumber =
  document.getElementById(
    "detailMembershipNumber"
  );

const detailPhone =
  document.getElementById(
    "detailPhone"
  );

const detailEmail =
  document.getElementById(
    "detailEmail"
  );

const detailRole =
  document.getElementById(
    "detailRole"
  );

const detailJoinDate =
  document.getElementById(
    "detailJoinDate"
  );

const detailExpected =
  document.getElementById(
    "detailExpected"
  );

const detailPaid =
  document.getElementById(
    "detailPaid"
  );

const detailOutstanding =
  document.getElementById(
    "detailOutstanding"
  );

const detailMonthlyStatus =
  document.getElementById(
    "detailMonthlyStatus"
  );

const detailLifetime =
  document.getElementById(
    "detailLifetime"
  );

const contributionHistory =
  document.getElementById(
    "contributionHistory"
  );

const editMemberButton =
  document.getElementById(
    "editMember"
  );

const statementMemberButton =
  document.getElementById(
    "statementMember"
  );

const toggleMemberButton =
  document.getElementById(
    "toggleMember"
  );


/* EDIT MODAL */

const editModal =
  document.getElementById(
    "editModal"
  );

const editMemberForm =
  document.getElementById(
    "editMemberForm"
  );

const closeEditModal =
  document.getElementById(
    "closeEditModal"
  );

const cancelEdit =
  document.getElementById(
    "cancelEdit"
  );

const saveEdit =
  document.getElementById(
    "saveEdit"
  );

const editName =
  document.getElementById(
    "editName"
  );

const editMemberNumber =
  document.getElementById(
    "editMemberNumber"
  );

const editMembershipNumber =
  document.getElementById(
    "editMembershipNumber"
  );

const editPhone =
  document.getElementById(
    "editPhone"
  );

const editEmail =
  document.getElementById(
    "editEmail"
  );

const editRole =
  document.getElementById(
    "editRole"
  );

const editJoinDate =
  document.getElementById(
    "editJoinDate"
  );

const editStatus =
  document.getElementById(
    "editStatus"
  );


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

  return Number(
    value || 0
  ).toLocaleString(
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

  return (
    date.getFullYear() +
    "-" +
    String(
      date.getMonth() + 1
    ).padStart(2, "0")
  );

}


function currentMonthLabel() {

  return new Date().toLocaleDateString(
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


function showError(error) {

  console.error(
    "Members error:",
    error
  );

  errorEl.textContent =
    error?.message ||
    "Unable to process request.";

  errorEl.hidden =
    false;

}


function clearError() {

  errorEl.hidden =
    true;

  errorEl.textContent =
    "";

}


/* =====================================================
   GROUP
===================================================== */

async function getGroupId() {

  /*
   * Uses the same group RPC already used
   * by the CHAMA LIVE application.
   */

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
   GROUP SETTINGS
===================================================== */

async function loadGroupSettings() {

  const {
    data,
    error
  } = await supabase
    .from("groups")
    .select(
      "id,name,monthly_contribution"
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
   MEMBER CONTRIBUTION CALCULATIONS
===================================================== */

function getMemberPaid(
  memberId
) {

  const month =
    currentMonth();


  return contributions
    .filter(
      contribution => {

        return (

          contribution.member_id ===
          memberId &&

          String(
            contribution.month ||
            ""
          ) ===
          month &&

          String(
            contribution.contribution_type ||
            ""
          ).toLowerCase() ===
          "monthly"

        );

      }
    )
    .reduce(
      (
        total,
        contribution
      ) => {

        return (
          total +
          Number(
            contribution.amount ||
            0
          )
        );

      },
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
      ) => {

        return (
          total +
          Number(
            contribution.amount ||
            0
          )
        );

      },
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
   FILTER
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
   RENDER REGISTER
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
   SHOW MEMBER ACCOUNT
===================================================== */

function showMemberDetails(
  member
) {

  selectedMember =
    member;


  const monthly =
    getMemberStatus(
      member.id
    );


  const lifetime =
    getMemberTotal(
      member.id
    );


  detailsCard.hidden =
    false;


  detailsTitle.textContent =
    member.name;


  detailsSubtitle.textContent =
    `Member account • ${member.member_number}`;


  memberStatusBadge.textContent =
    String(
      member.status
    ).toUpperCase();


  detailMemberNumber.textContent =
    member.member_number ||
    "—";


  detailMembershipNumber.textContent =
    member.membership_number ||
    "—";


  detailPhone.textContent =
    member.phone ||
    "—";


  detailEmail.textContent =
    member.email ||
    "—";


  detailRole.textContent =
    member.role ||
    "—";


  detailJoinDate.textContent =
    formatDate(
      member.join_date
    );


  detailExpected.textContent =
    `KSh ${money(
      monthly.expected
    )}`;


  detailPaid.textContent =
    `KSh ${money(
      monthly.paid
    )}`;


  detailOutstanding.textContent =
    `KSh ${money(
      monthly.outstanding
    )}`;


  detailMonthlyStatus.textContent =
    monthly.status;


  detailLifetime.textContent =
    `KSh ${money(
      lifetime
    )}`;


  toggleMemberButton.textContent =
    String(
      member.status
    ).toLowerCase() === "active"
      ? "Deactivate Member"
      : "Activate Member";


  renderContributionHistory();


  detailsCard.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


/* =====================================================
   CONTRIBUTION HISTORY
===================================================== */

function renderContributionHistory() {

  if (!selectedMember) {
    return;
  }


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
   ADD MEMBER
===================================================== */

async function addMember(
  event
) {

  event.preventDefault();

  clearError();


  try {

    saveMember.disabled =
      true;

    saveMember.textContent =
      "Adding...";


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
        "Full name is required."
      );
    }

    if (!memberNo) {
      throw new Error(
        "Member number is required."
      );
    }

    if (!membershipNo) {
      throw new Error(
        "Membership number is required."
      );
    }

    if (!memberPhone) {
      throw new Error(
        "Phone number is required."
      );
    }


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


    await refresh();


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
   OPEN EDIT MODAL
===================================================== */

function openEditModal() {

  if (!selectedMember) {

    showError(
      new Error(
        "Select a member first."
      )
    );

    return;

  }


  clearError();


  editName.value =
    selectedMember.name ||
    "";


  editMemberNumber.value =
    selectedMember.member_number ||
    "";


  editMembershipNumber.value =
    selectedMember.membership_number ||
    "";


  editPhone.value =
    selectedMember.phone ||
    "";


  editEmail.value =
    selectedMember.email ||
    "";


  editRole.value =
    selectedMember.role ||
    "member";


  editJoinDate.value =
    selectedMember.join_date ||
    "";


  editStatus.value =
    selectedMember.status ||
    "active";


  editModal.hidden =
    false;


  document.body.style.overflow =
    "hidden";


  setTimeout(
    () => {
      editName.focus();
    },
    50
  );

}


/* =====================================================
   CLOSE EDIT MODAL
===================================================== */

function closeEdit() {

  editModal.hidden =
    true;

  document.body.style.overflow =
    "";

}


/* =====================================================
   SAVE EDITED MEMBER
===================================================== */

async function saveEditedMember(
  event
) {

  event.preventDefault();

  clearError();


  if (!selectedMember) {
    return;
  }


  try {

    saveEdit.disabled =
      true;

    saveEdit.textContent =
      "Saving...";


    const updates = {

      name:
        editName.value.trim(),

      member_number:
        editMemberNumber.value.trim(),

      membership_number:
        editMembershipNumber.value.trim(),

      phone:
        editPhone.value.trim(),

      email:
        editEmail.value.trim() ||
        null,

      role:
        editRole.value,

      join_date:
        editJoinDate.value ||
        null,

      status:
        editStatus.value

    };


    if (!updates.name) {

      throw new Error(
        "Full name is required."
      );

    }


    if (!updates.member_number) {

      throw new Error(
        "Member number is required."
      );

    }


    if (!updates.membership_number) {

      throw new Error(
        "Membership number is required."
      );

    }


    if (!updates.phone) {

      throw new Error(
        "Phone number is required."
      );

    }


    const {
      error
    } = await supabase
      .from("members")
      .update(
        updates
      )
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


    const memberId =
      selectedMember.id;


    closeEdit();


    await refresh();


    const updatedMember =
      members.find(
        member =>
          member.id ===
          memberId
      );


    if (updatedMember) {

      showMemberDetails(
        updatedMember
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
  finally {

    saveEdit.disabled =
      false;

    saveEdit.textContent =
      "Save Changes";

  }

}


/* =====================================================
   ACTIVATE / DEACTIVATE
===================================================== */

async function toggleMember() {

  if (!selectedMember) {

    showError(
      new Error(
        "Select a member first."
      )
    );

    return;

  }


  const active =
    String(
      selectedMember.status
    ).toLowerCase() ===
    "active";


  const newStatus =
    active
      ? "inactive"
      : "active";


  const action =
    active
      ? "deactivate"
      : "activate";


  const confirmed =
    window.confirm(
      `Are you sure you want to ${action} ${selectedMember.name}?`
    );


  if (!confirmed) {
    return;
  }


  try {

    clearError();


    toggleMemberButton.disabled =
      true;


    toggleMemberButton.textContent =
      active
        ? "Deactivating..."
        : "Activating...";


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


    const memberId =
      selectedMember.id;


    await refresh();


    const updatedMember =
      members.find(
        member =>
          member.id ===
          memberId
      );


    if (updatedMember) {

      showMemberDetails(
        updatedMember
      );

    }


    statusEl.textContent =
      `Member ${
        active
          ? "deactivated"
          : "activated"
      } successfully.`;

  }
  catch (error) {

    showError(
      error
    );

  }
  finally {

    toggleMemberButton.disabled =
      false;

  }

}


/* =====================================================
   PRINT MEMBER STATEMENT
===================================================== */

function printStatement() {

  if (!selectedMember) {

    showError(
      new Error(
        "Select a member first."
      )
    );

    return;

  }


  const member =
    selectedMember;

  const monthly =
    getMemberStatus(
      member.id
    );

  const lifetime =
    getMemberTotal(
      member.id
    );


  const history =
    contributions
      .filter(
        contribution =>
          contribution.member_id ===
          member.id
      )
      .sort(
        (a, b) => {

          return new Date(
            b.contribution_date ||
            b.created_at
          ) -
          new Date(
            a.contribution_date ||
            a.created_at
          );

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
                  KSh ${money(
                    contribution.amount
                  )}
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


  const printWindow =
    window.open(
      "",
      "_blank"
    );


  if (!printWindow) {

    showError(
      new Error(
        "Please allow pop-ups to print the statement."
      )
    );

    return;

  }


  printWindow.document.write(`

<!doctype html>

<html>

<head>

<meta charset="utf-8">

<title>
Member Statement - ${escapeHtml(
  member.name
)}
</title>


<style>

body {

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  margin:40px;

  color:#111;

}


.header {

  display:flex;

  justify-content:space-between;

  border-bottom:
    2px solid #111;

  padding-bottom:20px;

  margin-bottom:30px;

}


.logo {

  font-size:25px;

  font-weight:bold;

}


.muted {

  color:#666;

}


.info {

  display:grid;

  grid-template-columns:
    repeat(2,1fr);

  gap:15px;

}


.box {

  border:
    1px solid #ddd;

  padding:15px;

}


.summary {

  display:grid;

  grid-template-columns:
    repeat(4,1fr);

  gap:15px;

  margin-top:20px;

}


.summary .box {

  text-align:center;

}


.amount {

  font-size:20px;

  font-weight:bold;

  margin-top:7px;

}


table {

  width:100%;

  border-collapse:
    collapse;

  margin-top:20px;

}


th,
td {

  border-bottom:
    1px solid #ddd;

  padding:10px;

  text-align:left;

}


th {

  background:#f3f3f3;

}


.footer {

  margin-top:40px;

  padding-top:15px;

  border-top:
    1px solid #ddd;

  font-size:12px;

  color:#666;

}


@media print {

  body {
    margin:20px;
  }

}


</style>

</head>


<body>


<div class="header">

  <div>

    <div class="logo">
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
  member.name
)}
</h1>


<div class="info">


  <div class="box">

    <div class="muted">
      Member Number
    </div>

    <strong>
      ${escapeHtml(
        member.member_number
      )}
    </strong>

  </div>


  <div class="box">

    <div class="muted">
      Membership Number
    </div>

    <strong>
      ${escapeHtml(
        member.membership_number
      )}
    </strong>

  </div>


  <div class="box">

    <div class="muted">
      Phone
    </div>

    <strong>
      ${escapeHtml(
        member.phone
      )}
    </strong>

  </div>


  <div class="box">

    <div class="muted">
      Role
    </div>

    <strong>
      ${escapeHtml(
        member.role
      )}
    </strong>

  </div>


  <div class="box">

    <div class="muted">
      Join Date
    </div>

    <strong>
      ${escapeHtml(
        formatDate(
          member.join_date
        )
      )}
    </strong>

  </div>


  <div class="box">

    <div class="muted">
      Status
    </div>

    <strong>
      ${escapeHtml(
        member.status
      ).toUpperCase()}
    </strong>

  </div>


</div>


<h2>
${escapeHtml(
  currentMonthLabel()
)}
Contribution Summary
</h2>


<div class="summary">


  <div class="box">

    <div class="muted">
      Expected
    </div>

    <div class="amount">
      KSh ${money(
        monthly.expected
      )}
    </div>

  </div>


  <div class="box">

    <div class="muted">
      Paid
    </div>

    <div class="amount">
      KSh ${money(
        monthly.paid
      )}
    </div>

  </div>


  <div class="box">

    <div class="muted">
      Outstanding
    </div>

    <div class="amount">
      KSh ${money(
        monthly.outstanding
      )}
    </div>

  </div>


  <div class="box">

    <div class="muted">
      Status
    </div>

    <div class="amount">
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

  <th>Date</th>
  <th>Amount</th>
  <th>Type</th>
  <th>Method</th>
  <th>Reference</th>

</tr>

</thead>


<tbody>

${rows}

</tbody>

</table>


<h2>
Lifetime Contributions
</h2>


<p>

  <strong>
    KSh ${money(
      lifetime
    )}
  </strong>

</p>


<div class="footer">

  CHAMA LIVE — Member financial statement.

</div>


<script>

window.onload = function() {

  window.print();

};

</script>


</body>

</html>

  `);


  printWindow.document.close();

}


/* =====================================================
   DEFAULT DATE
===================================================== */

function setDefaultDate() {

  const date =
    new Date();


  joinDate.value =
    date.toISOString()
      .slice(
        0,
        10
      );

}


/* =====================================================
   REFRESH
===================================================== */

async function refresh() {

  await loadGroupSettings();

  await loadMembers();

  await loadContributions();


  renderMetrics();

  renderMembers();


  if (selectedMember) {

    const updated =
      members.find(
        member =>
          member.id ===
          selectedMember.id
      );


    if (updated) {

      selectedMember =
        updated;

    }

  }

}


/* =====================================================
   TABLE EVENTS
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

      const member =
        members.find(
          item =>
            item.id ===
            button.dataset.id
        );


      if (member) {

        showMemberDetails(
          member
        );

      }

    }

  }
);


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


editMemberButton.addEventListener(
  "click",
  openEditModal
);


statementMemberButton.addEventListener(
  "click",
  printStatement
);


toggleMemberButton.addEventListener(
  "click",
  toggleMember
);


editMemberForm.addEventListener(
  "submit",
  saveEditedMember
);


closeEditModal.addEventListener(
  "click",
  closeEdit
);


cancelEdit.addEventListener(
  "click",
  closeEdit
);


editModal.addEventListener(
  "click",
  event => {

    if (
      event.target ===
      editModal
    ) {

      closeEdit();

    }

  }
);


document.addEventListener(
  "keydown",
  event => {

    if (
      event.key ===
      "Escape" &&
      !editModal.hidden
    ) {

      closeEdit();

    }

  }
);


/* =====================================================
   INITIALIZE
===================================================== */

async function init() {

  try {

    clearError();


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

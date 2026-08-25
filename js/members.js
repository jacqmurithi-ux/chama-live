import { supabase } from "./supabase.js";

/*
  CHAMA LIVE — MEMBERS MODULE

  Existing tables used:

  groups
  members
  contributions

  Existing columns:

  members:
    id
    group_id
    member_number
    membership_number
    name
    phone
    email
    role
    join_date
    status

  contributions:
    id
    group_id
    member_id
    amount
    contribution_type
    month
    payment_method
    reference
    contribution_date
    mpesa_reference
    created_at

  groups:
    id
    monthly_contribution
    opening_balance
*/


let currentGroupId = null;
let members = [];
let selectedMember = null;
let currentMonth = getCurrentMonth();

let monthlyContribution = 0;


/* =========================================================
   DOM HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}


function setText(id, value) {
  const el = $(id);

  if (el) {
    el.textContent = value;
  }
}


function showError(message) {

  const error = $("error");

  if (!error) {
    console.error(message);
    return;
  }

  error.textContent = message;
  error.hidden = false;
}


function clearError() {

  const error = $("error");

  if (error) {
    error.textContent = "";
    error.hidden = true;
  }
}


function setStatus(message) {

  const status = $("status");

  if (status) {
    status.textContent = message;
  }
}


/* =========================================================
   FORMATTERS
========================================================= */

function money(value) {

  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}


function getCurrentMonth() {

  const date = new Date();

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  return `${year}-${month}`;
}


function formatDate(value) {

  if (!value) {
    return "—";
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}


function escapeHtml(value) {

  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   AUTH / GROUP
========================================================= */

async function getCurrentUser() {

  const {
    data,
    error
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!data?.user) {
    window.location.href = "login.html";
    return null;
  }

  return data.user;
}


async function getMyGroup(user) {

  /*
    First try the member record linked to the
    authenticated user.
  */

  const { data: member, error: memberError } =
    await supabase
      .from("members")
      .select("group_id")
      .or(
        `user_id.eq.${user.id},auth_user_id.eq.${user.id}`
      )
      .limit(1)
      .maybeSingle();

  if (!memberError && member?.group_id) {
    return member.group_id;
  }


  /*
    Fallback: if the user is the group admin,
    find the group through its members.
  */

  const { data: adminMember, error: adminError } =
    await supabase
      .from("members")
      .select("group_id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

  if (!adminError && adminMember?.group_id) {
    return adminMember.group_id;
  }


  throw new Error(
    "Your account is not linked to a group."
  );
}


/* =========================================================
   LOAD GROUP SETTINGS
========================================================= */

async function loadGroupSettings() {

  const {
    data,
    error
  } = await supabase
    .from("groups")
    .select(`
      id,
      name,
      monthly_contribution
    `)
    .eq("id", currentGroupId)
    .single();

  if (error) {
    throw error;
  }

  monthlyContribution =
    Number(data.monthly_contribution || 0);

  return data;
}


/* =========================================================
   LOAD MEMBERS
========================================================= */

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
      auth_user_id,
      member_number,
      membership_number,
      name,
      phone,
      email,
      role,
      join_date,
      status,
      created_at
    `)
    .eq("group_id", currentGroupId)
    .order("name", {
      ascending: true
    });

  if (error) {
    throw error;
  }

  members = data || [];

  await loadContributionSummary();

  renderMembers();

  updateCounters();
}


/* =========================================================
   CONTRIBUTION SUMMARY
========================================================= */

let contributionTotals = new Map();


async function loadContributionSummary() {

  contributionTotals = new Map();


  const {
    data,
    error
  } = await supabase
    .from("contributions")
    .select(`
      member_id,
      amount,
      contribution_type,
      month
    `)
    .eq("group_id", currentGroupId);

  if (error) {
    throw error;
  }


  for (const row of data || []) {

    const memberId = row.member_id;

    const current =
      contributionTotals.get(memberId) || {
        lifetime: 0,
        currentMonth: 0
      };


    const amount =
      Number(row.amount || 0);


    current.lifetime += amount;


    if (
      row.month === currentMonth &&
      row.contribution_type === "monthly"
    ) {

      current.currentMonth += amount;

    }


    contributionTotals.set(
      memberId,
      current
    );
  }
}


/* =========================================================
   MEMBER STATUS CALCULATION
========================================================= */

function getMemberFinancials(member) {

  const totals =
    contributionTotals.get(member.id) || {
      lifetime: 0,
      currentMonth: 0
    };


  const expected =
    monthlyContribution;


  const paid =
    totals.currentMonth;


  const outstanding =
    Math.max(expected - paid, 0);


  let status = "OUTSTANDING";


  if (expected <= 0) {

    status = "NO TARGET";

  } else if (paid >= expected) {

    status = "PAID";

  } else if (paid > 0) {

    status = "PARTIAL";

  }


  return {
    expected,
    paid,
    outstanding,
    status,
    lifetime: totals.lifetime
  };
}


/* =========================================================
   COUNTERS
========================================================= */

function updateCounters() {

  const total =
    members.length;

  const active =
    members.filter(
      member => member.status === "active"
    ).length;

  const inactive =
    total - active;


  setText(
    "totalMembers",
    total
  );

  setText(
    "activeMembers",
    active
  );

  setText(
    "inactiveMembers",
    inactive
  );
}


/* =========================================================
   RENDER MEMBERS
========================================================= */

function renderMembers() {

  const tbody =
    $("memberRows");

  if (!tbody) {
    return;
  }


  const filter =
    $("memberFilter")?.value || "all";


  let filtered =
    members;


  if (filter !== "all") {

    filtered =
      members.filter(
        member =>
          member.status === filter
      );

  }


  if (!filtered.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="9">
          No members found.
        </td>
      </tr>
    `;

    return;
  }


  tbody.innerHTML =
    filtered.map(member => {

      const financial =
        getMemberFinancials(member);


      const statusClass =
        member.status === "active"
          ? "status-active"
          : "status-inactive";


      return `
        <tr>

          <td>
            <strong>
              ${escapeHtml(member.name)}
            </strong>
          </td>

          <td>
            ${escapeHtml(member.member_number)}
          </td>

          <td>
            ${escapeHtml(member.phone)}
          </td>

          <td>
            ${escapeHtml(member.role)}
          </td>

          <td>
            <span class="status-pill ${statusClass}">
              ${escapeHtml(member.status)}
            </span>
          </td>

          <td>
            ${money(financial.expected)}
          </td>

          <td>
            ${money(financial.paid)}
          </td>

          <td>
            ${money(financial.outstanding)}
          </td>

          <td>

            <button
              type="button"
              class="btn btn-secondary btn-view-member"
              data-id="${member.id}"
            >
              View
            </button>

          </td>

        </tr>
      `;

    }).join("");


  tbody
    .querySelectorAll(".btn-view-member")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const member =
            members.find(
              item =>
                item.id === button.dataset.id
            );

          if (member) {
            openMemberAccount(member);
          }

        }
      );

    });
}


/* =========================================================
   MEMBER ACCOUNT
========================================================= */

async function openMemberAccount(member) {

  selectedMember = member;


  const account =
    $("memberAccount");

  if (!account) {
    return;
  }


  account.hidden = false;


  setText(
    "accountMemberNumber",
    member.member_number || "—"
  );

  setText(
    "accountMembershipNumber",
    member.membership_number || "—"
  );

  setText(
    "accountPhone",
    member.phone || "—"
  );

  setText(
    "accountEmail",
    member.email || "—"
  );

  setText(
    "accountRole",
    member.role || "—"
  );

  setText(
    "accountJoinDate",
    formatDate(member.join_date)
  );


  const financial =
    getMemberFinancials(member);


  setText(
    "accountExpected",
    money(financial.expected)
  );

  setText(
    "accountPaid",
    money(financial.paid)
  );

  setText(
    "accountOutstanding",
    money(financial.outstanding)
  );

  setText(
    "accountMonthlyStatus",
    financial.status
  );

  setText(
    "accountLifetime",
    money(financial.lifetime)
  );


  const statusEl =
    $("accountStatus");


  if (statusEl) {

    const active =
      member.status === "active";


    statusEl.innerHTML = `
      <span class="status-pill ${
        active
          ? "status-active"
          : "status-inactive"
      }">
        ${escapeHtml(member.status)}
      </span>
    `;

  }


  const toggleButton =
    $("toggleMemberBtn");


  if (toggleButton) {

    toggleButton.textContent =
      member.status === "active"
        ? "Deactivate Member"
        : "Reactivate Member";

  }


  await loadMemberContributionHistory(
    member.id
  );


  account.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


/* =========================================================
   CONTRIBUTION HISTORY
========================================================= */

async function loadMemberContributionHistory(
  memberId
) {

  const tbody =
    $("accountContributionRows");

  if (!tbody) {
    return;
  }


  tbody.innerHTML = `
    <tr>
      <td colspan="5">
        Loading...
      </td>
    </tr>
  `;


  const {
    data,
    error
  } = await supabase
    .from("contributions")
    .select(`
      contribution_date,
      amount,
      contribution_type,
      payment_method,
      reference,
      mpesa_reference,
      created_at
    `)
    .eq("group_id", currentGroupId)
    .eq("member_id", memberId)
    .order("contribution_date", {
      ascending: false
    })
    .order("created_at", {
      ascending: false
    });


  if (error) {
    throw error;
  }


  if (!data?.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="5">
          No contributions recorded.
        </td>
      </tr>
    `;

    return;
  }


  tbody.innerHTML =
    data.map(row => {

      const reference =
        row.mpesa_reference ||
        row.reference ||
        "—";


      return `
        <tr>

          <td>
            ${formatDate(
              row.contribution_date
            )}
          </td>

          <td>
            <strong>
              ${money(row.amount)}
            </strong>
          </td>

          <td>
            ${escapeHtml(
              row.contribution_type || "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              row.payment_method || "—"
            )}
          </td>

          <td>
            ${escapeHtml(reference)}
          </td>

        </tr>
      `;

    }).join("");
}


/* =========================================================
   ADD MEMBER
========================================================= */

async function handleAddMember(event) {

  event.preventDefault();

  clearError();


  const form =
    event.currentTarget;


  const name =
    $("memberName")?.value.trim();

  const memberNumber =
    $("memberNumber")?.value.trim();

  const membershipNumber =
    $("membershipNumber")?.value.trim();

  const phone =
    $("memberPhone")?.value.trim();

  const email =
    $("memberEmail")?.value.trim() || null;

  const role =
    $("memberRole")?.value || "member";

  const joinDate =
    $("memberJoinDate")?.value;


  if (
    !name ||
    !memberNumber ||
    !membershipNumber ||
    !phone ||
    !joinDate
  ) {

    showError(
      "Please complete all required member fields."
    );

    return;
  }


  const button =
    form.querySelector(
      'button[type="submit"]'
    );


  if (button) {
    button.disabled = true;
    button.textContent = "Adding...";
  }


  try {

    const {
      error
    } = await supabase
      .from("members")
      .insert({
        group_id: currentGroupId,
        name,
        member_number: memberNumber,
        membership_number: membershipNumber,
        phone,
        email,
        role,
        join_date: joinDate,
        status: "active"
      });


    if (error) {
      throw error;
    }


    form.reset();


    $("memberJoinDate").value =
      new Date()
        .toISOString()
        .slice(0, 10);


    await loadMembers();


    setStatus(
      "Member added successfully."
    );

  } catch (error) {

    console.error(error);

    showError(
      error.message ||
      "Unable to add member."
    );

  } finally {

    if (button) {

      button.disabled = false;
      button.textContent = "Add Member";

    }

  }
}


/* =========================================================
   EDIT MEMBER
========================================================= */

function openEditMember() {

  if (!selectedMember) {
    return;
  }


  const panel =
    $("editPanel");


  if (!panel) {
    return;
  }


  $("editName").value =
    selectedMember.name || "";

  $("editMemberNumber").value =
    selectedMember.member_number || "";

  $("editMembershipNumber").value =
    selectedMember.membership_number || "";

  $("editPhone").value =
    selectedMember.phone || "";

  $("editEmail").value =
    selectedMember.email || "";

  $("editRole").value =
    selectedMember.role || "member";

  $("editJoinDate").value =
    selectedMember.join_date || "";


  panel.classList.add("show");


  panel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


function closeEditMember() {

  const panel =
    $("editPanel");

  if (panel) {
    panel.classList.remove("show");
  }
}


async function handleEditMember(event) {

  event.preventDefault();

  clearError();


  if (!selectedMember) {

    showError(
      "No member selected."
    );

    return;
  }


  const updates = {

    name:
      $("editName").value.trim(),

    member_number:
      $("editMemberNumber").value.trim(),

    membership_number:
      $("editMembershipNumber").value.trim(),

    phone:
      $("editPhone").value.trim(),

    email:
      $("editEmail").value.trim() || null,

    role:
      $("editRole").value,

    join_date:
      $("editJoinDate").value

  };


  if (
    !updates.name ||
    !updates.member_number ||
    !updates.membership_number ||
    !updates.phone ||
    !updates.join_date
  ) {

    showError(
      "Please complete all required fields."
    );

    return;
  }


  const button =
    event.currentTarget.querySelector(
      'button[type="submit"]'
    );


  if (button) {

    button.disabled = true;
    button.textContent = "Saving...";

  }


  try {

    const {
      data,
      error
    } = await supabase
      .from("members")
      .update(updates)
      .eq("id", selectedMember.id)
      .eq("group_id", currentGroupId)
      .select()
      .single();


    if (error) {
      throw error;
    }


    selectedMember =
      data;


    const index =
      members.findIndex(
        member =>
          member.id === data.id
      );


    if (index !== -1) {
      members[index] = data;
    }


    await loadMembers();


    openMemberAccount(data);


    closeEditMember();


    setStatus(
      "Member details updated successfully."
    );

  } catch (error) {

    console.error(error);

    showError(
      error.message ||
      "Unable to update member."
    );

  } finally {

    if (button) {

      button.disabled = false;
      button.textContent = "Save Changes";

    }

  }
}


/* =========================================================
   DEACTIVATE / REACTIVATE
========================================================= */

async function toggleMemberStatus() {

  if (!selectedMember) {
    return;
  }


  const currentlyActive =
    selectedMember.status === "active";


  const newStatus =
    currentlyActive
      ? "inactive"
      : "active";


  const action =
    currentlyActive
      ? "deactivate"
      : "reactivate";


  const confirmed =
    window.confirm(
      `Are you sure you want to ${action} ${selectedMember.name}?`
    );


  if (!confirmed) {
    return;
  }


  const button =
    $("toggleMemberBtn");


  if (button) {

    button.disabled = true;
    button.textContent =
      currentlyActive
        ? "Deactivating..."
        : "Reactivating...";

  }


  try {

    const {
      data,
      error
    } = await supabase
      .from("members")
      .update({
        status: newStatus
      })
      .eq("id", selectedMember.id)
      .eq("group_id", currentGroupId)
      .select()
      .single();


    if (error) {
      throw error;
    }


    selectedMember =
      data;


    const index =
      members.findIndex(
        member =>
          member.id === data.id
      );


    if (index !== -1) {
      members[index] = data;
    }


    await loadMembers();


    openMemberAccount(data);


    setStatus(
      `Member ${action}d successfully.`
    );

  } catch (error) {

    console.error(error);

    showError(
      error.message ||
      `Unable to ${action} member.`
    );

  } finally {

    if (button) {

      button.disabled = false;

      button.textContent =
        newStatus === "active"
          ? "Deactivate Member"
          : "Reactivate Member";

    }

  }
}


/* =========================================================
   PRINT STATEMENT
========================================================= */

async function printStatement() {

  if (!selectedMember) {
    return;
  }


  const financial =
    getMemberFinancials(
      selectedMember
    );


  const {
    data,
    error
  } = await supabase
    .from("contributions")
    .select(`
      contribution_date,
      amount,
      contribution_type,
      payment_method,
      reference,
      mpesa_reference
    `)
    .eq("group_id", currentGroupId)
    .eq("member_id", selectedMember.id)
    .order("contribution_date", {
      ascending: false
    });


  if (error) {

    showError(
      error.message
    );

    return;
  }


  const rows =
    (data || []).map(row => {

      const reference =
        row.mpesa_reference ||
        row.reference ||
        "—";


      return `
        <tr>
          <td>
            ${formatDate(row.contribution_date)}
          </td>

          <td>
            ${money(row.amount)}
          </td>

          <td>
            ${escapeHtml(
              row.contribution_type || "—"
            )}
          </td>

          <td>
            ${escapeHtml(
              row.payment_method || "—"
            )}
          </td>

          <td>
            ${escapeHtml(reference)}
          </td>
        </tr>
      `;

    }).join("");


  const statementWindow =
    window.open(
      "",
      "_blank",
      "width=900,height=700"
    );


  if (!statementWindow) {

    showError(
      "Please allow pop-ups to print the statement."
    );

    return;
  }


  statementWindow.document.write(`

    <!doctype html>

    <html>

    <head>

      <title>
        Member Statement - ${escapeHtml(
          selectedMember.name
        )}
      </title>

      <style>

        body {
          font-family: Arial, sans-serif;
          padding: 40px;
          color: #111;
        }

        h1 {
          margin-bottom: 5px;
        }

        h2 {
          margin-top: 30px;
        }

        .muted {
          color: #666;
        }

        .summary {
          display: grid;
          grid-template-columns:
            repeat(3, 1fr);
          gap: 15px;
          margin: 25px 0;
        }

        .box {
          border: 1px solid #ddd;
          padding: 15px;
          border-radius: 8px;
        }

        .label {
          color: #666;
          font-size: 13px;
        }

        .value {
          font-size: 20px;
          font-weight: bold;
          margin-top: 5px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 15px;
        }

        th,
        td {
          border: 1px solid #ddd;
          padding: 10px;
          text-align: left;
        }

        th {
          background: #f5f5f5;
        }

        @media print {
          body {
            padding: 20px;
          }
        }

      </style>

    </head>


    <body>

      <h1>
        CHAMA LIVE
      </h1>

      <div class="muted">
        Member Contribution Statement
      </div>


      <h2>
        ${escapeHtml(
          selectedMember.name
        )}
      </h2>


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


      <div class="summary">

        <div class="box">

          <div class="label">
            Monthly Expected
          </div>

          <div class="value">
            ${money(financial.expected)}
          </div>

        </div>


        <div class="box">

          <div class="label">
            Paid This Month
          </div>

          <div class="value">
            ${money(financial.paid)}
          </div>

        </div>


        <div class="box">

          <div class="label">
            Lifetime Contributions
          </div>

          <div class="value">
            ${money(financial.lifetime)}
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

          ${
            rows ||
            `
              <tr>
                <td colspan="5">
                  No contributions recorded.
                </td>
              </tr>
            `
          }

        </tbody>

      </table>


      <p style="margin-top:40px;">
        Generated:
        ${new Date().toLocaleString("en-KE")}
      </p>


      <script>
        window.onload = function() {
          window.print();
        };
      <\/script>

    </body>

    </html>

  `);


  statementWindow.document.close();
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function setupEvents() {

  const addForm =
    $("addMemberForm");

  if (addForm) {

    addForm.addEventListener(
      "submit",
      handleAddMember
    );

  }


  const filter =
    $("memberFilter");

  if (filter) {

    filter.addEventListener(
      "change",
      renderMembers
    );

  }


  const editButton =
    $("editMemberBtn");

  if (editButton) {

    editButton.addEventListener(
      "click",
      openEditMember
    );

  }


  const editForm =
    $("editMemberForm");

  if (editForm) {

    editForm.addEventListener(
      "submit",
      handleEditMember
    );

  }


  const cancelEdit =
    $("cancelEditBtn");

  if (cancelEdit) {

    cancelEdit.addEventListener(
      "click",
      closeEditMember
    );

  }


  const toggleButton =
    $("toggleMemberBtn");

  if (toggleButton) {

    toggleButton.addEventListener(
      "click",
      toggleMemberStatus
    );

  }


  const printButton =
    $("printStatementBtn");

  if (printButton) {

    printButton.addEventListener(
      "click",
      printStatement
    );

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

  try {

    clearError();


    /*
      Set today's date safely.
      This also prevents the old
      "null.value" problem.
    */

    const joinDate =
      $("memberJoinDate");

    if (joinDate) {

      joinDate.value =
        new Date()
          .toISOString()
          .slice(0, 10);

    }


    setupEvents();


    const user =
      await getCurrentUser();


    if (!user) {
      return;
    }


    currentGroupId =
      await getMyGroup(user);


    await loadGroupSettings();

    await loadMembers();


    setStatus(
      `Members loaded • ${new Date().toLocaleString(
        "en-KE"
      )}`
    );


  } catch (error) {

    console.error(
      "Members module error:",
      error
    );


    showError(
      error.message ||
      "Unable to load members."
    );


    setStatus(
      "Unable to load members."
    );

  }

}


init();

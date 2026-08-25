import { supabase } from "./supabase.js";


// ============================================================
// STATE
// ============================================================

let currentGroupId = null;
let members = [];
let selectedMember = null;
let monthlyContribution = 0;


// ============================================================
// DOM HELPERS
// ============================================================

const $ = (id) => document.getElementById(id);


function setStatus(message) {

  const el = $("status");

  if (el) {
    el.textContent = message;
  }

}


function showError(message) {

  const el = $("error");

  if (!el) return;

  el.hidden = false;
  el.textContent = message;

}


function clearError() {

  const el = $("error");

  if (!el) return;

  el.hidden = true;
  el.textContent = "";

}


function money(value) {

  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);

}


function dateText(value) {

  if (!value) return "—";

  const date = new Date(value + "T00:00:00");

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

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


// ============================================================
// AUTH / GROUP
// ============================================================

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
    We first try to identify the member connected to the
    logged-in account.

    Your members table has both user_id and auth_user_id,
    so we support either one.
  */

  let result = await supabase
    .from("members")
    .select("group_id")
    .or(
      `user_id.eq.${user.id},auth_user_id.eq.${user.id}`
    )
    .limit(1)
    .maybeSingle();

  if (!result.error && result.data?.group_id) {
    return result.data.group_id;
  }


  /*
    Fallback: if the application already has a
    get_my_member RPC, use it.
  */

  const rpc = await supabase.rpc("get_my_member");

  if (!rpc.error && rpc.data) {

    const row = Array.isArray(rpc.data)
      ? rpc.data[0]
      : rpc.data;

    if (row?.group_id) {
      return row.group_id;
    }

  }


  throw new Error(
    "Unable to determine your group. Make sure your account is linked to a member record."
  );

}


// ============================================================
// LOAD GROUP SETTINGS
// ============================================================

async function loadGroupSettings() {

  const {
    data,
    error
  } = await supabase
    .from("groups")
    .select(
      "id,name,monthly_contribution,opening_balance"
    )
    .eq("id", currentGroupId)
    .single();

  if (error) {
    throw error;
  }

  monthlyContribution =
    Number(data?.monthly_contribution || 0);

}


// ============================================================
// LOAD MEMBERS
// ============================================================

async function loadMembers() {

  clearError();

  setStatus("Loading members...");


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


  await renderMembers();


  $("totalMembers").textContent =
    members.length;


  $("activeMembers").textContent =
    members.filter(
      member => member.status === "active"
    ).length;


  $("inactiveMembers").textContent =
    members.filter(
      member => member.status !== "active"
    ).length;


  setStatus(
    `Members loaded • ${new Date().toLocaleString("en-KE")}`
  );

}


// ============================================================
// GET MONTHLY CONTRIBUTIONS
// ============================================================

async function getCurrentMonth() {

  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, "0")}`;

}


async function getContributionSummary() {

  const month = await getCurrentMonth();


  const {
    data,
    error
  } = await supabase
    .from("contributions")
    .select(`
      id,
      member_id,
      amount,
      contribution_type,
      month,
      payment_method,
      reference,
      mpesa_reference,
      contribution_date
    `)
    .eq("group_id", currentGroupId);


  if (error) {
    throw error;
  }


  const rows = data || [];


  const monthlyRows = rows.filter(
    row =>
      row.month === month &&
      row.contribution_type === "monthly"
  );


  const paidByMember = {};


  for (const row of monthlyRows) {

    const memberId = row.member_id;

    if (!paidByMember[memberId]) {
      paidByMember[memberId] = 0;
    }

    paidByMember[memberId] +=
      Number(row.amount || 0);

  }


  return {
    rows,
    monthlyRows,
    paidByMember,
    month
  };

}


// ============================================================
// RENDER MEMBER TABLE
// ============================================================

async function renderMembers() {

  const tbody = $("memberRows");

  if (!tbody) return;


  const filter =
    $("memberFilter")?.value || "all";


  const {
    paidByMember
  } = await getContributionSummary();


  let visibleMembers = [...members];


  if (filter === "active") {

    visibleMembers =
      visibleMembers.filter(
        member => member.status === "active"
      );

  }


  if (filter === "inactive") {

    visibleMembers =
      visibleMembers.filter(
        member => member.status !== "active"
      );

  }


  if (!visibleMembers.length) {

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
    visibleMembers.map(member => {

      const paid =
        Number(
          paidByMember[member.id] || 0
        );

      const expected =
        member.status === "active"
          ? monthlyContribution
          : 0;

      const outstanding =
        Math.max(
          expected - paid,
          0
        );


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
            <strong>
              ${escapeHtml(member.status)}
            </strong>
          </td>

          <td>
            ${money(expected)}
          </td>

          <td>
            ${money(paid)}
          </td>

          <td>
            ${money(outstanding)}
          </td>

          <td>

            <button
              type="button"
              class="btn btn-secondary view-member"
              data-id="${member.id}"
            >
              View
            </button>

          </td>

        </tr>
      `;

    }).join("");


  tbody
    .querySelectorAll(".view-member")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {
          selectMember(button.dataset.id);
        }
      );

    });

}


// ============================================================
// SELECT MEMBER
// ============================================================

async function selectMember(memberId) {

  clearError();


  const member =
    members.find(
      item => item.id === memberId
    );


  if (!member) {
    showError("Member not found.");
    return;
  }


  selectedMember = member;


  $("memberAccount").hidden = false;


  $("accountStatus").textContent =
    String(member.status || "").toUpperCase();


  $("accountMemberNumber").textContent =
    member.member_number || "—";


  $("accountMembershipNumber").textContent =
    member.membership_number || "—";


  $("accountPhone").textContent =
    member.phone || "—";


  $("accountEmail").textContent =
    member.email || "—";


  $("accountRole").textContent =
    member.role || "—";


  $("accountJoinDate").textContent =
    dateText(member.join_date);


  await loadMemberAccount(member);


  $("memberAccount").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


// ============================================================
// MEMBER ACCOUNT
// ============================================================

async function loadMemberAccount(member) {

  const {
    data,
    error
  } = await supabase
    .from("contributions")
    .select(`
      id,
      amount,
      contribution_type,
      month,
      payment_method,
      reference,
      mpesa_reference,
      contribution_date,
      notes,
      created_at
    `)
    .eq("group_id", currentGroupId)
    .eq("member_id", member.id)
    .order("contribution_date", {
      ascending: false
    })
    .order("created_at", {
      ascending: false
    });


  if (error) {
    throw error;
  }


  const contributions = data || [];


  const month =
    await getCurrentMonth();


  const monthlyPaid =
    contributions
      .filter(row =>
        row.month === month &&
        row.contribution_type === "monthly"
      )
      .reduce(
        (total, row) =>
          total + Number(row.amount || 0),
        0
      );


  const expected =
    member.status === "active"
      ? monthlyContribution
      : 0;


  const outstanding =
    Math.max(
      expected - monthlyPaid,
      0
    );


  const lifetime =
    contributions.reduce(
      (total, row) =>
        total + Number(row.amount || 0),
      0
    );


  $("accountExpected").textContent =
    money(expected);


  $("accountPaid").textContent =
    money(monthlyPaid);


  $("accountOutstanding").textContent =
    money(outstanding);


  $("accountMonthlyStatus").textContent =
    monthlyPaid >= expected && expected > 0
      ? "PAID"
      : monthlyPaid > 0
        ? "PARTIAL"
        : "OUTSTANDING";


  $("accountLifetime").textContent =
    money(lifetime);


  renderContributionHistory(
    contributions
  );


  $("toggleMemberBtn").textContent =
    member.status === "active"
      ? "Deactivate Member"
      : "Activate Member";

}


// ============================================================
// CONTRIBUTION HISTORY
// ============================================================

function renderContributionHistory(rows) {

  const tbody =
    $("accountContributionRows");


  if (!tbody) return;


  if (!rows.length) {

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
    rows.map(row => {

      const reference =
        row.mpesa_reference ||
        row.reference ||
        "—";


      return `
        <tr>

          <td>
            ${dateText(row.contribution_date)}
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


// ============================================================
// ADD MEMBER
// ============================================================

async function addMember(event) {

  event.preventDefault();

  clearError();


  const button =
    $("addMemberBtn");


  button.disabled = true;
  button.textContent = "Adding...";


  try {

    const name =
      $("name").value.trim();


    const memberNumber =
      $("member_number").value.trim();


    const membershipNumber =
      $("membership_number").value.trim();


    const phone =
      $("phone").value.trim();


    const email =
      $("email").value.trim() || null;


    const role =
      $("role").value;


    const joinDate =
      $("join_date").value ||
      new Date().toISOString().slice(0, 10);


    if (!name) {
      throw new Error("Full name is required.");
    }


    if (!memberNumber) {
      throw new Error("Member number is required.");
    }


    if (!membershipNumber) {
      throw new Error(
        "Membership number is required."
      );
    }


    if (!phone) {
      throw new Error("Phone number is required.");
    }


    const {
      error
    } = await supabase
      .from("members")
      .insert({
        group_id: currentGroupId,
        member_number: memberNumber,
        membership_number: membershipNumber,
        name,
        phone,
        email,
        role,
        join_date: joinDate,
        status: "active"
      });


    if (error) {
      throw error;
    }


    $("memberForm").reset();


    $("join_date").value =
      new Date().toISOString().slice(0, 10);


    setStatus(
      "Member added successfully."
    );


    await loadMembers();


  } catch (error) {

    console.error(error);

    showError(
      error?.message ||
      "Unable to add member."
    );

  } finally {

    button.disabled = false;
    button.textContent = "Add Member";

  }

}


// ============================================================
// EDIT MEMBER
// ============================================================

function openEditMember() {

  if (!selectedMember) {
    showError("Select a member first.");
    return;
  }


  const member = selectedMember;


  $("edit_id").value =
    member.id;


  $("edit_name").value =
    member.name || "";


  $("edit_member_number").value =
    member.member_number || "";


  $("edit_membership_number").value =
    member.membership_number || "";


  $("edit_phone").value =
    member.phone || "";


  $("edit_email").value =
    member.email || "";


  $("edit_role").value =
    member.role || "member";


  $("edit_join_date").value =
    member.join_date || "";


  $("editMemberSection").hidden = false;


  $("editMemberSection").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


// ============================================================
// SAVE EDIT
// ============================================================

async function saveMember(event) {

  event.preventDefault();

  clearError();


  const id =
    $("edit_id").value;


  if (!id) {
    showError("No member selected.");
    return;
  }


  try {

    const updates = {

      name:
        $("edit_name").value.trim(),

      member_number:
        $("edit_member_number").value.trim(),

      membership_number:
        $("edit_membership_number").value.trim(),

      phone:
        $("edit_phone").value.trim(),

      email:
        $("edit_email").value.trim() || null,

      role:
        $("edit_role").value,

      join_date:
        $("edit_join_date").value

    };


    const {
      error
    } = await supabase
      .from("members")
      .update(updates)
      .eq("id", id)
      .eq("group_id", currentGroupId);


    if (error) {
      throw error;
    }


    setStatus(
      "Member updated successfully."
    );


    $("editMemberSection").hidden = true;


    await loadMembers();


    await selectMember(id);


  } catch (error) {

    console.error(error);

    showError(
      error?.message ||
      "Unable to update member."
    );

  }

}


// ============================================================
// ACTIVATE / DEACTIVATE
// ============================================================

async function toggleMemberStatus() {

  if (!selectedMember) {
    showError("Select a member first.");
    return;
  }


  const isActive =
    selectedMember.status === "active";


  const newStatus =
    isActive
      ? "inactive"
      : "active";


  const action =
    isActive
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

    const {
      error
    } = await supabase
      .from("members")
      .update({
        status: newStatus
      })
      .eq("id", selectedMember.id)
      .eq("group_id", currentGroupId);


    if (error) {
      throw error;
    }


    setStatus(
      `Member ${action}d successfully.`
    );


    await loadMembers();


    await selectMember(
      selectedMember.id
    );


  } catch (error) {

    console.error(error);

    showError(
      error?.message ||
      `Unable to ${action} member.`
    );

  }

}


// ============================================================
// PRINT STATEMENT
// ============================================================

function printStatement() {

  if (!selectedMember) {
    showError("Select a member first.");
    return;
  }


  const member =
    selectedMember;


  const history =
    $("accountContributionRows")
      ?.innerHTML || "";


  const html = `

<!doctype html>

<html>

<head>

<meta charset="utf-8">

<title>
Member Statement - ${escapeHtml(member.name)}
</title>

<style>

body {
  font-family: Arial, sans-serif;
  margin: 40px;
  color: #111;
}

h1 {
  margin-bottom: 5px;
}

.muted {
  color: #666;
}

.info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
  margin: 25px 0;
}

.box {
  border: 1px solid #ddd;
  padding: 15px;
  border-radius: 8px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
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
    margin: 20px;
  }

}

</style>

</head>

<body>

<h1>CHAMA LIVE</h1>

<div class="muted">
Member Contribution Statement
</div>

<hr>

<div class="info">

<div class="box">
<strong>Name</strong><br>
${escapeHtml(member.name)}
</div>

<div class="box">
<strong>Status</strong><br>
${escapeHtml(member.status)}
</div>

<div class="box">
<strong>Member Number</strong><br>
${escapeHtml(member.member_number)}
</div>

<div class="box">
<strong>Membership Number</strong><br>
${escapeHtml(member.membership_number)}
</div>

<div class="box">
<strong>Phone</strong><br>
${escapeHtml(member.phone)}
</div>

<div class="box">
<strong>Role</strong><br>
${escapeHtml(member.role)}
</div>

</div>

<h2>
Monthly Contribution
</h2>

<div class="info">

<div class="box">
<strong>Expected</strong><br>
${$("accountExpected")?.textContent || "KSh 0"}
</div>

<div class="box">
<strong>Paid</strong><br>
${$("accountPaid")?.textContent || "KSh 0"}
</div>

<div class="box">
<strong>Outstanding</strong><br>
${$("accountOutstanding")?.textContent || "KSh 0"}
</div>

<div class="box">
<strong>Status</strong><br>
${$("accountMonthlyStatus")?.textContent || "OUTSTANDING"}
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

${history}

</tbody>

</table>

<br>

<p>
Generated:
${new Date().toLocaleString("en-KE")}
</p>

<script>
window.onload = function() {
  window.print();
};
</script>

</body>

</html>
`;


  const printWindow =
    window.open(
      "",
      "_blank",
      "width=900,height=700"
    );


  if (!printWindow) {

    showError(
      "Your browser blocked the print window. Please allow pop-ups."
    );

    return;

  }


  printWindow.document.open();

  printWindow.document.write(html);

  printWindow.document.close();

}


// ============================================================
// EVENTS
// ============================================================

function bindEvents() {

  $("memberForm")
    ?.addEventListener(
      "submit",
      addMember
    );


  $("memberFilter")
    ?.addEventListener(
      "change",
      async () => {

        try {

          await renderMembers();

        } catch (error) {

          console.error(error);

          showError(
            error?.message ||
            "Unable to filter members."
          );

        }

      }
    );


  $("editMemberBtn")
    ?.addEventListener(
      "click",
      openEditMember
    );


  $("printStatementBtn")
    ?.addEventListener(
      "click",
      printStatement
    );


  $("toggleMemberBtn")
    ?.addEventListener(
      "click",
      toggleMemberStatus
    );


  $("editMemberForm")
    ?.addEventListener(
      "submit",
      saveMember
    );


  $("cancelEditBtn")
    ?.addEventListener(
      "click",
      () => {

        $("editMemberSection").hidden =
          true;

      }
    );

}


// ============================================================
// INITIALISE
// ============================================================

async function init() {

  try {

    clearError();


    const user =
      await getCurrentUser();


    if (!user) {
      return;
    }


    currentGroupId =
      await getMyGroup(user);


    await loadGroupSettings();


    const today =
      new Date()
        .toISOString()
        .slice(0, 10);


    if ($("join_date")) {
      $("join_date").value = today;
    }


    bindEvents();


    await loadMembers();


  } catch (error) {

    console.error(
      "Members initialization error:",
      error
    );


    setStatus(
      "Unable to load members."
    );


    showError(
      error?.message ||
      "Unable to load members. Check your Supabase connection and RLS policies."
    );

  }

}


init();

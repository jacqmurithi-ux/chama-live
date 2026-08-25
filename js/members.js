import { supabase } from "./supabase.js";


/* =========================================================
   STATE
========================================================= */

let currentGroup = null;
let members = [];
let selectedMember = null;
let currentMonthlyContribution = 0;


/* =========================================================
   DOM
========================================================= */

const $ = (id) => document.getElementById(id);


/* =========================================================
   HELPERS
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


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function formatDate(value) {

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


function currentMonth() {

  const date = new Date();

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;

}


function showError(message) {

  const error = $("error");

  error.hidden = false;
  error.textContent = message;

}


function clearError() {

  const error = $("error");

  error.hidden = true;
  error.textContent = "";

}


function setStatus(message) {

  $("status").textContent = message;

}


/* =========================================================
   GET CURRENT GROUP
========================================================= */

async function getCurrentGroup() {

  /*
    We first try to identify the group through the logged-in
    user's member record.

    This matches the existing CHAMA LIVE structure:
    members.group_id
  */

  const {
    data: {
      user
    }
  } = await supabase.auth.getUser();


  if (!user) {
    throw new Error("You are not logged in.");
  }


  /*
    Try auth_user_id first.
  */

  let { data: member, error } = await supabase
    .from("members")
    .select("group_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();


  /*
    Some existing records may use user_id instead.
  */

  if (!member && !error) {

    const result = await supabase
      .from("members")
      .select("group_id")
      .eq("user_id", user.id)
      .maybeSingle();

    member = result.data;
    error = result.error;

  }


  if (error) {
    throw error;
  }


  if (!member?.group_id) {
    throw new Error(
      "Your account is not linked to a group."
    );
  }


  const {
    data: group,
    error: groupError
  } = await supabase
    .from("groups")
    .select(`
      id,
      name,
      monthly_contribution,
      opening_balance
    `)
    .eq("id", member.group_id)
    .single();


  if (groupError) {
    throw groupError;
  }


  currentGroup = group;

  currentMonthlyContribution =
    Number(group.monthly_contribution || 0);

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
    .eq("group_id", currentGroup.id)
    .order("name", {
      ascending: true
    });


  if (error) {
    throw error;
  }


  members = data || [];

  await renderMemberRegister();

  updateMemberMetrics();

}


/* =========================================================
   MEMBER METRICS
========================================================= */

function updateMemberMetrics() {

  const total = members.length;

  const active = members.filter(
    member => member.status === "active"
  ).length;

  const inactive = total - active;


  $("totalMembers").textContent = total;

  $("activeMembers").textContent = active;

  $("inactiveMembers").textContent = inactive;

}


/* =========================================================
   GET MONTHLY PAYMENT DATA
========================================================= */

async function getMonthlyData(memberId) {

  const month = currentMonth();


  const {
    data,
    error
  } = await supabase
    .from("contributions")
    .select(`
      amount,
      contribution_type,
      month
    `)
    .eq("group_id", currentGroup.id)
    .eq("member_id", memberId)
    .eq("month", month);


  if (error) {
    throw error;
  }


  const paid = (data || []).reduce(
    (total, row) =>
      total + Number(row.amount || 0),
    0
  );


  const expected = currentMonthlyContribution;

  const outstanding = Math.max(
    expected - paid,
    0
  );


  let status = "OUTSTANDING";

  if (paid >= expected && expected > 0) {
    status = "PAID";
  } else if (paid > 0) {
    status = "PARTIAL";
  }


  return {
    expected,
    paid,
    outstanding,
    status
  };

}


/* =========================================================
   RENDER MEMBER REGISTER
========================================================= */

async function renderMemberRegister() {

  const rows = $("memberRows");

  const filter = $("memberFilter").value;


  let visibleMembers = members;


  if (filter === "active") {

    visibleMembers = members.filter(
      member => member.status === "active"
    );

  }


  if (filter === "inactive") {

    visibleMembers = members.filter(
      member => member.status !== "active"
    );

  }


  if (!visibleMembers.length) {

    rows.innerHTML = `
      <tr>
        <td colspan="9">
          No members found.
        </td>
      </tr>
    `;

    return;

  }


  rows.innerHTML = `
    <tr>
      <td colspan="9">
        Loading member balances...
      </td>
    </tr>
  `;


  const result = [];


  for (const member of visibleMembers) {

    const monthly = await getMonthlyData(
      member.id
    );


    result.push(`
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
          ${money(monthly.expected)}
        </td>

        <td>
          ${money(monthly.paid)}
        </td>

        <td>
          ${money(monthly.outstanding)}
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
    `);

  }


  rows.innerHTML = result.join("");


  document
    .querySelectorAll(".btn-view-member")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {
          openMemberAccount(
            button.dataset.id
          );
        }
      );

    });

}


/* =========================================================
   OPEN MEMBER ACCOUNT
========================================================= */

async function openMemberAccount(memberId) {

  clearError();


  selectedMember = members.find(
    member => member.id === memberId
  );


  if (!selectedMember) {

    showError("Member could not be found.");

    return;

  }


  $("memberAccount").hidden = false;

  $("editMemberCard").hidden = true;


  /*
    Populate account profile.
  */

  $("accountMemberNumber").textContent =
    selectedMember.member_number || "—";

  $("accountMembershipNumber").textContent =
    selectedMember.membership_number || "—";

  $("accountPhone").textContent =
    selectedMember.phone || "—";

  $("accountEmail").textContent =
    selectedMember.email || "—";

  $("accountRole").textContent =
    selectedMember.role || "—";

  $("accountJoinDate").textContent =
    formatDate(selectedMember.join_date);


  $("accountStatus").textContent =
    String(selectedMember.status || "active")
      .toUpperCase();


  /*
    Change action button according to status.
  */

  $("toggleMemberBtn").textContent =
    selectedMember.status === "active"
      ? "Deactivate Member"
      : "Reactivate Member";


  /*
    Monthly account.
  */

  const monthly =
    await getMonthlyData(
      selectedMember.id
    );


  $("accountExpected").textContent =
    money(monthly.expected);

  $("accountPaid").textContent =
    money(monthly.paid);

  $("accountOutstanding").textContent =
    money(monthly.outstanding);

  $("accountMonthlyStatus").textContent =
    monthly.status;


  /*
    Lifetime contributions.
  */

  const {
    data: lifetimeData,
    error: lifetimeError
  } = await supabase
    .from("contributions")
    .select("amount")
    .eq("group_id", currentGroup.id)
    .eq("member_id", selectedMember.id);


  if (lifetimeError) {
    throw lifetimeError;
  }


  const lifetime =
    (lifetimeData || []).reduce(
      (total, row) =>
        total + Number(row.amount || 0),
      0
    );


  $("accountLifetime").textContent =
    money(lifetime);


  /*
    Contribution history.
  */

  await loadContributionHistory(
    selectedMember.id
  );


  /*
    Scroll account into view.
  */

  $("memberAccount").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


/* =========================================================
   CONTRIBUTION HISTORY
========================================================= */

async function loadContributionHistory(memberId) {

  const rows =
    $("accountContributionRows");


  const {
    data,
    error
  } = await supabase
    .from("contributions")
    .select(`
      id,
      amount,
      contribution_type,
      payment_method,
      reference,
      mpesa_reference,
      contribution_date,
      month,
      created_at
    `)
    .eq("group_id", currentGroup.id)
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


  if (!data || !data.length) {

    rows.innerHTML = `
      <tr>
        <td colspan="5">
          No contributions recorded.
        </td>
      </tr>
    `;

    return;

  }


  rows.innerHTML = data.map(row => {

    const reference =
      row.mpesa_reference ||
      row.reference ||
      "—";


    return `
      <tr>

        <td>
          ${formatDate(
            row.contribution_date ||
            row.created_at?.slice(0, 10)
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

async function addMember(event) {

  event.preventDefault();

  clearError();


  const button =
    $("addMemberBtn");


  button.disabled = true;

  button.textContent =
    "Adding Member...";


  try {

    const name =
      $("name").value.trim();

    const memberNumber =
      $("memberNumber").value.trim();

    const membershipNumber =
      $("membershipNumber").value.trim();

    const phone =
      $("phone").value.trim();

    const email =
      $("email").value.trim() || null;

    const role =
      $("role").value;

    const joinDate =
      $("joinDate").value;


    if (!name ||
        !memberNumber ||
        !membershipNumber ||
        !phone ||
        !joinDate) {

      throw new Error(
        "Please fill in all required member fields."
      );

    }


    const {
      error
    } = await supabase
      .from("members")
      .insert({
        group_id: currentGroup.id,
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


    /*
      Restore today's date.
    */

    setDefaultJoinDate();


    setStatus(
      "Member added successfully."
    );


    await loadMembers();


  } catch (error) {

    console.error(error);

    showError(
      error.message ||
      "Unable to add member."
    );

  } finally {

    button.disabled = false;

    button.textContent =
      "Add Member";

  }

}


/* =========================================================
   EDIT MEMBER
========================================================= */

function openEditMember() {

  if (!selectedMember) {
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

  $("editStatus").value =
    selectedMember.status || "active";


  $("editMemberCard").hidden = false;


  $("editMemberCard").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


/* =========================================================
   SAVE MEMBER
========================================================= */

async function saveMember(event) {

  event.preventDefault();

  clearError();


  if (!selectedMember) {
    return;
  }


  const button =
    $("saveMemberBtn");


  button.disabled = true;

  button.textContent =
    "Saving...";


  try {

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
        $("editJoinDate").value,

      status:
        $("editStatus").value

    };


    if (!updates.name ||
        !updates.member_number ||
        !updates.membership_number ||
        !updates.phone ||
        !updates.join_date) {

      throw new Error(
        "Please fill in all required fields."
      );

    }


    const {
      data,
      error
    } = await supabase
      .from("members")
      .update(updates)
      .eq("id", selectedMember.id)
      .eq("group_id", currentGroup.id)
      .select()
      .single();


    if (error) {
      throw error;
    }


    selectedMember = data;


    $("editMemberCard").hidden = true;


    setStatus(
      "Member updated successfully."
    );


    await loadMembers();

    await openMemberAccount(
      selectedMember.id
    );


  } catch (error) {

    console.error(error);

    showError(
      error.message ||
      "Unable to update member."
    );

  } finally {

    button.disabled = false;

    button.textContent =
      "Save Changes";

  }

}


/* =========================================================
   CANCEL EDIT
========================================================= */

function cancelEdit() {

  $("editMemberCard").hidden = true;

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
      .eq("group_id", currentGroup.id)
      .select()
      .single();


    if (error) {
      throw error;
    }


    selectedMember = data;


    setStatus(
      `Member ${newStatus === "active"
        ? "reactivated"
        : "deactivated"
      } successfully.`
    );


    await loadMembers();

    await openMemberAccount(
      selectedMember.id
    );


  } catch (error) {

    console.error(error);

    showError(
      error.message ||
      "Unable to update member status."
    );

  }

}


/* =========================================================
   PRINT STATEMENT
========================================================= */

function printStatement() {

  if (!selectedMember) {
    return;
  }


  const monthlyExpected =
    $("accountExpected").textContent;

  const monthlyPaid =
    $("accountPaid").textContent;

  const monthlyOutstanding =
    $("accountOutstanding").textContent;

  const lifetime =
    $("accountLifetime").textContent;


  const history =
    $("accountContributionRows").innerHTML;


  const printWindow =
    window.open(
      "",
      "_blank",
      "width=900,height=700"
    );


  if (!printWindow) {

    showError(
      "Please allow pop-ups to print the statement."
    );

    return;

  }


  printWindow.document.write(`

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

        .grid {
          display: grid;
          grid-template-columns:
            repeat(3, 1fr);
          gap: 20px;
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
          margin-top: 15px;
        }

        th,
        td {
          border-bottom: 1px solid #ddd;
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
        Member Financial Statement
      </div>


      <h2>
        ${escapeHtml(selectedMember.name)}
      </h2>


      <div class="grid">

        <div class="box">
          <div class="muted">
            Member Number
          </div>

          <strong>
            ${escapeHtml(
              selectedMember.member_number
            )}
          </strong>
        </div>


        <div class="box">
          <div class="muted">
            Phone
          </div>

          <strong>
            ${escapeHtml(
              selectedMember.phone
            )}
          </strong>
        </div>


        <div class="box">
          <div class="muted">
            Status
          </div>

          <strong>
            ${escapeHtml(
              selectedMember.status
            ).toUpperCase()}
          </strong>
        </div>

      </div>


      <h2>
        Monthly Contribution
      </h2>


      <div class="grid">

        <div class="box">
          <div class="muted">
            Expected
          </div>

          <strong>
            ${monthlyExpected}
          </strong>
        </div>


        <div class="box">
          <div class="muted">
            Paid
          </div>

          <strong>
            ${monthlyPaid}
          </strong>
        </div>


        <div class="box">
          <div class="muted">
            Outstanding
          </div>

          <strong>
            ${monthlyOutstanding}
          </strong>
        </div>

      </div>


      <h2>
        Lifetime Contributions
      </h2>

      <div class="box">
        <strong>
          ${lifetime}
        </strong>
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


      <p class="muted">
        Generated ${new Date().toLocaleString(
          "en-KE"
        )}
      </p>


      <script>
        window.onload = function() {
          window.print();
        };
      <\/script>


    </body>

    </html>

  `);


  printWindow.document.close();

}


/* =========================================================
   DEFAULT JOIN DATE
========================================================= */

function setDefaultJoinDate() {

  const input =
    $("joinDate");


  if (!input.value) {

    const date =
      new Date();


    input.value =
      `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`;

  }

}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {

  $("memberForm")
    .addEventListener(
      "submit",
      addMember
    );


  $("editMemberForm")
    .addEventListener(
      "submit",
      saveMember
    );


  $("cancelEditBtn")
    .addEventListener(
      "click",
      cancelEdit
    );


  $("editMemberBtn")
    .addEventListener(
      "click",
      openEditMember
    );


  $("toggleMemberBtn")
    .addEventListener(
      "click",
      toggleMemberStatus
    );


  $("printStatementBtn")
    .addEventListener(
      "click",
      printStatement
    );


  $("memberFilter")
    .addEventListener(
      "change",
      async () => {

        try {

          await renderMemberRegister();

        } catch (error) {

          console.error(error);

          showError(
            error.message ||
            "Unable to filter members."
          );

        }

      }
    );

}


/* =========================================================
   INIT
========================================================= */

async function init() {

  try {

    clearError();

    setStatus(
      "Loading members..."
    );


    setDefaultJoinDate();


    await getCurrentGroup();


    if (!currentGroup) {
      throw new Error(
        "Unable to determine your group."
      );
    }


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


    setStatus(
      "Unable to load members."
    );


    showError(
      error.message ||
      "Unable to load members."
    );

  }

}


/* =========================================================
   START
========================================================= */

bindEvents();

init();

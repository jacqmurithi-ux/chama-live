import { supabase } from "./supabase.js";


/*
==========================================================
CHAMA LIVE — MEMBERS MODULE
==========================================================

Existing tables used:

members
groups
contributions

No schema changes required.
*/


let groupId = null;
let selectedMember = null;
let members = [];
let contributions = [];
let groupSettings = null;
let currentFilter = "all";


/*
==========================================================
DOM HELPERS
==========================================================
*/

function $(id) {
  return document.getElementById(id);
}


function showError(message) {

  const box = $("error");

  if (!box) return;

  box.textContent = message;
  box.hidden = false;

}


function clearError() {

  const box = $("error");

  if (!box) return;

  box.textContent = "";
  box.hidden = true;

}


function setStatus(message) {

  const box = $("status");

  if (!box) return;

  box.textContent = message;

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


function money(value) {

  const number = Number(value || 0);

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(number);

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


function today() {

  const date = new Date();

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    date.getDate()
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;

}


function currentMonth() {

  const date = new Date();

  const year = date.getFullYear();

  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");

  return `${year}-${month}`;

}


/*
==========================================================
GET CURRENT USER / GROUP
==========================================================
*/

async function getCurrentGroup() {

  /*
    First try the existing helper RPC used elsewhere
    in CHAMA LIVE.
  */

  try {

    const {
      data,
      error
    } = await supabase.rpc("get_my_member");

    if (!error && data) {

      const member = Array.isArray(data)
        ? data[0]
        : data;

      if (member?.group_id) {

        groupId = member.group_id;

        return groupId;

      }

    }

  } catch (error) {

    console.warn(
      "get_my_member RPC unavailable:",
      error
    );

  }


  /*
    Fallback:
    get authenticated user and find their member row.
  */

  const {
    data: authData,
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    throw authError;
  }

  const user = authData?.user;

  if (!user) {

    window.location.href = "login.html";

    return null;

  }


  /*
    Existing schema has both user_id and auth_user_id.
    Try auth_user_id first.
  */

  let result = await supabase
    .from("members")
    .select("group_id")
    .eq("auth_user_id", user.id)
    .limit(1)
    .maybeSingle();


  if (result.error) {

    result = await supabase
      .from("members")
      .select("group_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

  }


  if (result.error) {
    throw result.error;
  }


  if (!result.data?.group_id) {

    throw new Error(
      "Your account is not linked to a group."
    );

  }


  groupId = result.data.group_id;

  return groupId;

}


/*
==========================================================
LOAD GROUP SETTINGS
==========================================================
*/

async function loadGroupSettings() {

  const {
    data,
    error
  } = await supabase
    .from("groups")
    .select(
      "id,name,monthly_contribution,opening_balance"
    )
    .eq("id", groupId)
    .single();


  if (error) {
    throw error;
  }


  groupSettings = data;

}


/*
==========================================================
LOAD MEMBERS
==========================================================
*/

async function loadMembers() {

  const {
    data,
    error
  } = await supabase
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
      join_date,
      status,
      created_at
    `)
    .eq("group_id", groupId)
    .order("name", {
      ascending: true
    });


  if (error) {
    throw error;
  }


  members = data || [];

}


/*
==========================================================
LOAD CONTRIBUTIONS
==========================================================
*/

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
      created_at,
      notes
    `)
    .eq("group_id", groupId)
    .order("contribution_date", {
      ascending: false
    });


  if (error) {
    throw error;
  }


  contributions = data || [];

}


/*
==========================================================
CONTRIBUTION HELPERS
==========================================================
*/

function memberContributions(memberId) {

  return contributions.filter(
    item => item.member_id === memberId
  );

}


function monthlyPaid(memberId, month = currentMonth()) {

  return memberContributions(memberId)
    .filter(item =>
      item.contribution_type === "monthly" &&
      item.month === month
    )
    .reduce(
      (sum, item) =>
        sum + Number(item.amount || 0),
      0
    );

}


function lifetimePaid(memberId) {

  return memberContributions(memberId)
    .reduce(
      (sum, item) =>
        sum + Number(item.amount || 0),
      0
    );

}


function monthlyExpected() {

  return Number(
    groupSettings?.monthly_contribution || 0
  );

}


function monthlyOutstanding(memberId) {

  const expected = monthlyExpected();

  const paid = monthlyPaid(
    memberId
  );

  return Math.max(
    expected - paid,
    0
  );

}


function monthlyStatus(memberId) {

  const expected = monthlyExpected();

  const paid = monthlyPaid(
    memberId
  );


  if (expected <= 0) {

    return "OUTSTANDING";

  }


  if (paid >= expected) {

    return "PAID";

  }


  if (paid > 0) {

    return "PARTIAL";

  }


  return "OUTSTANDING";

}


/*
==========================================================
SUMMARY
==========================================================
*/

function renderSummary() {

  const total = members.length;

  const active = members.filter(
    member => member.status === "active"
  ).length;

  const inactive = members.filter(
    member => member.status !== "active"
  ).length;


  $("totalMembers").textContent =
    total;

  $("activeMembers").textContent =
    active;

  $("inactiveMembers").textContent =
    inactive;

}


/*
==========================================================
MEMBER REGISTER
==========================================================
*/

function renderMembers() {

  const tbody = $("memberRows");

  if (!tbody) return;


  let visibleMembers = members;


  if (currentFilter !== "all") {

    visibleMembers =
      members.filter(
        member =>
          member.status === currentFilter
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

      const expected =
        monthlyExpected();

      const paid =
        monthlyPaid(member.id);

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
              class="btn btn-secondary view-member"
              type="button"
              data-id="${member.id}"
            >
              View
            </button>

          </td>

        </tr>
      `;

    }).join("");

}


/*
==========================================================
SHOW MEMBER ACCOUNT
==========================================================
*/

async function showMember(memberId) {

  const member =
    members.find(
      item => item.id === memberId
    );


  if (!member) {
    return;
  }


  selectedMember = member;


  const history =
    memberContributions(
      member.id
    );


  const expected =
    monthlyExpected();

  const paid =
    monthlyPaid(member.id);

  const outstanding =
    Math.max(
      expected - paid,
      0
    );

  const status =
    monthlyStatus(member.id);

  const lifetime =
    lifetimePaid(member.id);


  $("memberAccount").hidden =
    false;


  $("accountStatus").textContent =
    String(member.status || "")
      .toUpperCase();


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
    formatDate(member.join_date);


  $("accountExpected").textContent =
    money(expected);


  $("accountPaid").textContent =
    money(paid);


  $("accountOutstanding").textContent =
    money(outstanding);


  $("accountMonthlyStatus").textContent =
    status;


  $("accountLifetime").textContent =
    money(lifetime);


  renderContributionHistory(
    history
  );


  $("editPanel").hidden = true;


  $("memberAccount").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


/*
==========================================================
CONTRIBUTION HISTORY
==========================================================
*/

function renderContributionHistory(history) {

  const tbody =
    $("accountContributionRows");


  if (!tbody) return;


  if (!history.length) {

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
    history.map(item => {

      const reference =
        item.mpesa_reference ||
        item.reference ||
        "—";


      return `
        <tr>

          <td>
            ${formatDate(
              item.contribution_date
            )}
          </td>

          <td>
            <strong>
              ${money(item.amount)}
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
            ${escapeHtml(
              reference
            )}
          </td>

        </tr>
      `;

    }).join("");

}


/*
==========================================================
ADD MEMBER
==========================================================
*/

async function addMember(event) {

  event.preventDefault();

  clearError();


  const form =
    event.currentTarget;


  const name =
    $("name").value.trim();

  const memberNumber =
    $("member_number").value.trim();

  const membershipNumber =
    $("membership_number").value.trim();

  const phone =
    $("phone").value.trim();

  const email =
    $("email").value.trim();

  const role =
    $("role").value;

  const joinDate =
    $("join_date").value;


  if (!name ||
      !memberNumber ||
      !membershipNumber ||
      !phone ||
      !joinDate) {

    showError(
      "Please complete all required member fields."
    );

    return;

  }


  const button =
    form.querySelector(
      'button[type="submit"]'
    );


  button.disabled = true;

  button.textContent =
    "Adding...";


  try {

    const {
      error
    } = await supabase
      .from("members")
      .insert({
        group_id: groupId,
        name,
        member_number: memberNumber,
        membership_number: membershipNumber,
        phone,
        email: email || null,
        role,
        join_date: joinDate,
        status: "active"
      });


    if (error) {
      throw error;
    }


    form.reset();


    $("join_date").value =
      today();


    await refresh();


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

    button.disabled = false;

    button.textContent =
      "Add Member";

  }

}


/*
==========================================================
OPEN EDIT FORM
==========================================================
*/

function openEditMember() {

  if (!selectedMember) {
    return;
  }


  $("editId").value =
    selectedMember.id;


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
    selectedMember.join_date || today();


  $("editPanel").hidden =
    false;


  $("editPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

}


/*
==========================================================
SAVE EDITED MEMBER
==========================================================
*/

async function saveEditedMember(event) {

  event.preventDefault();

  clearError();


  const id =
    $("editId").value;


  if (!id) {

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


  if (!updates.name ||
      !updates.member_number ||
      !updates.membership_number ||
      !updates.phone ||
      !updates.join_date) {

    showError(
      "Please complete all required fields."
    );

    return;

  }


  const button =
    event.currentTarget.querySelector(
      'button[type="submit"]'
    );


  button.disabled = true;

  button.textContent =
    "Saving...";


  try {

    const {
      error
    } = await supabase
      .from("members")
      .update(updates)
      .eq("id", id)
      .eq("group_id", groupId);


    if (error) {
      throw error;
    }


    await refresh();


    selectedMember =
      members.find(
        member => member.id === id
      ) || null;


    if (selectedMember) {

      await showMember(id);

    }


    $("editPanel").hidden =
      true;


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

    button.disabled = false;

    button.textContent =
      "Save Changes";

  }

}


/*
==========================================================
DEACTIVATE MEMBER
==========================================================
*/

async function deactivateMember() {

  if (!selectedMember) {
    return;
  }


  if (
    selectedMember.status !== "active"
  ) {

    alert(
      "This member is already inactive."
    );

    return;

  }


  const confirmed =
    window.confirm(
      `Deactivate ${selectedMember.name}?\n\n` +
      "The member will remain in the register " +
      "and their contribution history will not be deleted."
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
        status: "inactive"
      })
      .eq("id", selectedMember.id)
      .eq("group_id", groupId);


    if (error) {
      throw error;
    }


    await refresh();


    selectedMember =
      members.find(
        member =>
          member.id === selectedMember.id
      ) || null;


    if (selectedMember) {

      await showMember(
        selectedMember.id
      );

    }


    setStatus(
      "Member deactivated successfully."
    );


  } catch (error) {

    console.error(error);

    showError(
      error.message ||
      "Unable to deactivate member."
    );

  }

}


/*
==========================================================
PRINT MEMBER STATEMENT
==========================================================
*/

function printStatement() {

  if (!selectedMember) {
    return;
  }


  const member =
    selectedMember;


  const history =
    memberContributions(
      member.id
    );


  const expected =
    monthlyExpected();

  const paid =
    monthlyPaid(member.id);

  const outstanding =
    Math.max(
      expected - paid,
      0
    );

  const lifetime =
    lifetimePaid(member.id);

  const month =
    currentMonth();


  const groupName =
    groupSettings?.name ||
    "CHAMA LIVE";


  const historyRows =
    history.length
      ? history.map(item => {

          const reference =
            item.mpesa_reference ||
            item.reference ||
            "—";


          return `
            <tr>
              <td>
                ${formatDate(
                  item.contribution_date
                )}
              </td>

              <td>
                ${money(item.amount)}
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

        }).join("")
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
      "_blank",
      "width=900,height=700"
    );


  if (!printWindow) {

    alert(
      "Please allow pop-ups to print the statement."
    );

    return;

  }


  printWindow.document.write(`

    <!doctype html>

    <html>

    <head>

      <meta charset="utf-8">

      <title>
        Member Statement — ${escapeHtml(member.name)}
      </title>

      <style>

        * {
          box-sizing: border-box;
        }

        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          color: #111;
        }

        h1 {
          margin-bottom: 4px;
        }

        h2 {
          margin-top: 30px;
        }

        .muted {
          color: #666;
        }

        .header {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 2px solid #111;
          padding-bottom: 15px;
        }

        .grid {
          display: grid;
          grid-template-columns:
            repeat(3, 1fr);
          gap: 20px;
          margin-top: 25px;
        }

        .box {
          border: 1px solid #ddd;
          padding: 15px;
          border-radius: 6px;
        }

        .label {
          color: #666;
          font-size: 13px;
          margin-bottom: 5px;
        }

        .value {
          font-size: 20px;
          font-weight: bold;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 15px;
        }

        th,
        td {
          border: 1px solid #ddd;
          padding: 9px;
          text-align: left;
        }

        th {
          background: #f4f4f4;
        }

        .footer {
          margin-top: 40px;
          padding-top: 15px;
          border-top: 1px solid #ddd;
          font-size: 12px;
          color: #666;
        }

        @media print {

          body {
            margin: 20px;
          }

          .no-print {
            display: none;
          }

        }

      </style>

    </head>


    <body>

      <div class="header">

        <div>

          <h1>
            ${escapeHtml(groupName)}
          </h1>

          <div class="muted">
            Member Contribution Statement
          </div>

        </div>

        <div>
          <strong>
            ${formatDate(today())}
          </strong>
        </div>

      </div>


      <h2>
        Member Details
      </h2>


      <div class="grid">

        <div class="box">

          <div class="label">
            Full Name
          </div>

          <div class="value">
            ${escapeHtml(member.name)}
          </div>

        </div>


        <div class="box">

          <div class="label">
            Member Number
          </div>

          <div class="value">
            ${escapeHtml(
              member.member_number
            )}
          </div>

        </div>


        <div class="box">

          <div class="label">
            Membership Number
          </div>

          <div class="value">
            ${escapeHtml(
              member.membership_number
            )}
          </div>

        </div>


        <div class="box">

          <div class="label">
            Phone
          </div>

          <div class="value">
            ${escapeHtml(
              member.phone
            )}
          </div>

        </div>


        <div class="box">

          <div class="label">
            Role
          </div>

          <div class="value">
            ${escapeHtml(
              member.role
            )}
          </div>

        </div>


        <div class="box">

          <div class="label">
            Status
          </div>

          <div class="value">
            ${escapeHtml(
              member.status
            )}
          </div>

        </div>

      </div>


      <h2>
        ${escapeHtml(month)}
        Monthly Contribution
      </h2>


      <div class="grid">

        <div class="box">

          <div class="label">
            Expected
          </div>

          <div class="value">
            ${money(expected)}
          </div>

        </div>


        <div class="box">

          <div class="label">
            Paid
          </div>

          <div class="value">
            ${money(paid)}
          </div>

        </div>


        <div class="box">

          <div class="label">
            Outstanding
          </div>

          <div class="value">
            ${money(outstanding)}
          </div>

        </div>

      </div>


      <h2>
        Lifetime Contributions
      </h2>

      <div class="box">

        <div class="value">
          ${money(lifetime)}
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

          ${historyRows}

        </tbody>

      </table>


      <div class="footer">

        Generated by CHAMA LIVE.

      </div>


      <script>

        window.onload = function () {

          window.print();

        };

      <\/script>

    </body>

    </html>

  `);


  printWindow.document.close();

}


/*
==========================================================
FILTERS
==========================================================
*/

function setupFilters() {

  document
    .querySelectorAll(
      ".member-filter"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          currentFilter =
            button.dataset.filter ||
            "all";


          document
            .querySelectorAll(
              ".member-filter"
            )
            .forEach(item => {

              item.classList.remove(
                "active"
              );

            });


          button.classList.add(
            "active"
          );


          renderMembers();

        }
      );

    });

}


/*
==========================================================
REFRESH
==========================================================
*/

async function refresh() {

  clearError();


  await loadGroupSettings();

  await loadMembers();

  await loadContributions();


  renderSummary();

  renderMembers();

}


/*
==========================================================
EVENTS
==========================================================
*/

function setupEvents() {


  /*
    Add member
  */

  $("memberForm")
    ?.addEventListener(
      "submit",
      addMember
    );


  /*
    View member
  */

  $("memberRows")
    ?.addEventListener(
      "click",
      event => {

        const button =
          event.target.closest(
            ".view-member"
          );


        if (!button) {
          return;
        }


        const id =
          button.dataset.id;


        showMember(id);

      }
    );


  /*
    Edit member
  */

  $("editMember")
    ?.addEventListener(
      "click",
      openEditMember
    );


  /*
    Save edited member
  */

  $("editMemberForm")
    ?.addEventListener(
      "submit",
      saveEditedMember
    );


  /*
    Cancel edit
  */

  $("cancelEdit")
    ?.addEventListener(
      "click",
      () => {

        $("editPanel").hidden =
          true;

      }
    );


  /*
    Print statement
  */

  $("printStatement")
    ?.addEventListener(
      "click",
      printStatement
    );


  /*
    Deactivate
  */

  $("deactivateMember")
    ?.addEventListener(
      "click",
      deactivateMember
    );


  setupFilters();

}


/*
==========================================================
INITIALIZE
==========================================================
*/

async function init() {

  try {

    setStatus(
      "Loading members..."
    );


    await getCurrentGroup();


    if (!groupId) {
      return;
    }


    $("join_date").value =
      today();


    await refresh();


    setStatus(
      `Members loaded • ${new Date().toLocaleString(
        "en-GB"
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


/*
==========================================================
START
==========================================================
*/

setupEvents();

init();

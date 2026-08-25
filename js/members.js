import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentGroup = null;
let members = [];
let selectedMember = null;
let selectedContributions = [];

let monthlyContribution = 0;


/* =========================================================
   DOM HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);


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

  const amount = Number(value || 0);

  return "KSh " + amount.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}


function formatDate(dateValue) {

  if (!dateValue) {
    return "—";
  }

  const date = new Date(dateValue + "T00:00:00");

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}


function todayString() {

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


function showStatus(message, type = "normal") {

  const el = $("status");

  if (!el) return;

  el.hidden = false;

  if (type === "success") {

    el.className = "success";

  } else if (type === "error") {

    el.className = "error-box";

  } else {

    el.className = "card";

  }

  el.textContent = message;
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


/* =========================================================
   INITIALISE
========================================================= */

async function init() {

  try {

    clearError();

    showStatus("Loading members...");


    /*
      Existing application helper.

      getMyMember() returns the currently logged-in
      user's member record, including group_id.
    */

    currentUser = await getMyMember();

    if (!currentUser) {
      throw new Error(
        "Unable to identify the current member."
      );
    }


    const groupId = currentUser.group_id;

    if (!groupId) {
      throw new Error(
        "Your member account is not connected to a group."
      );
    }


    /* Load group settings */

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
      .eq("id", groupId)
      .single();


    if (groupError) {
      throw groupError;
    }


    currentGroup = group;

    monthlyContribution =
      Number(group.monthly_contribution || 0);


    /* Load members */

    await loadMembers(groupId);


    /* Form defaults */

    $("joinDate").value = todayString();


    showStatus(
      `Members loaded • ${new Date().toLocaleString("en-GB")}`
    );


  } catch (error) {

    console.error(error);

    showStatus(
      "Unable to load members.",
      "error"
    );

    showError(
      error.message || "An unexpected error occurred."
    );

  }

}


/* =========================================================
   LOAD MEMBERS
========================================================= */

async function loadMembers(groupId) {

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
      email,
      membership_number,
      onboarding_status,
      invited_at,
      activated_at,
      auth_user_id,
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


  await renderMembers();

}


/* =========================================================
   MEMBER CONTRIBUTION TOTALS
========================================================= */

async function getContributionTotals() {

  if (!members.length) {
    return {};
  }


  const memberIds = members.map(
    member => member.id
  );


  const {
    data,
    error
  } = await supabase
    .from("contributions")
    .select(`
      member_id,
      amount,
      contribution_type,
      month,
      contribution_date
    `)
    .in("member_id", memberIds);


  if (error) {
    throw error;
  }


  const totals = {};


  for (const member of members) {

    totals[member.id] = {
      lifetime: 0,
      currentMonth: 0
    };

  }


  for (const row of data || []) {

    const memberId = row.member_id;

    if (!totals[memberId]) {

      totals[memberId] = {
        lifetime: 0,
        currentMonth: 0
      };

    }


    const amount = Number(row.amount || 0);


    totals[memberId].lifetime += amount;


    if (
      row.month === currentMonth()
    ) {

      totals[memberId].currentMonth += amount;

    }

  }


  return totals;

}


/* =========================================================
   RENDER MEMBER REGISTER
========================================================= */

async function renderMembers() {

  const rows = $("memberRows");

  if (!rows) return;


  if (!members.length) {

    rows.innerHTML = `
      <tr>
        <td colspan="9">
          No members found.
        </td>
      </tr>
    `;

    updateMemberMetrics();

    return;

  }


  const totals =
    await getContributionTotals();


  const filter =
    $("memberFilter")?.value || "all";


  let visibleMembers =
    members;


  if (filter !== "all") {

    visibleMembers =
      members.filter(
        member =>
          member.status === filter
      );

  }


  if (!visibleMembers.length) {

    rows.innerHTML = `
      <tr>
        <td colspan="9">
          No ${escapeHtml(filter)} members found.
        </td>
      </tr>
    `;

    updateMemberMetrics();

    return;

  }


  rows.innerHTML =
    visibleMembers.map(member => {

      const memberTotals =
        totals[member.id] || {
          lifetime: 0,
          currentMonth: 0
        };


      const paid =
        memberTotals.currentMonth;


      const expected =
        monthlyContribution;


      const outstanding =
        Math.max(
          expected - paid,
          0
        );


      const status =
        paid >= expected && expected > 0
          ? "PAID"
          : "OUTSTANDING";


      const statusClass =
        status === "PAID"
          ? "badge badge-paid"
          : "badge badge-outstanding";


      const memberStatusClass =
        member.status === "active"
          ? "account-status status-active"
          : "account-status status-inactive";


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
            <span class="${memberStatusClass}">
              ${escapeHtml(member.status)}
            </span>
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
              data-id="${escapeHtml(member.id)}"
            >
              View
            </button>

          </td>

        </tr>
      `;

    }).join("");


  document
    .querySelectorAll(".view-member")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const memberId =
            button.dataset.id;

          openMemberAccount(memberId);

        }
      );

    });


  updateMemberMetrics();

}


/* =========================================================
   MEMBER METRICS
========================================================= */

function updateMemberMetrics() {

  const total =
    members.length;


  const active =
    members.filter(
      member =>
        member.status === "active"
    ).length;


  const inactive =
    members.filter(
      member =>
        member.status === "inactive"
    ).length;


  $("totalMembers").textContent =
    total;


  $("activeMembers").textContent =
    active;


  $("inactiveMembers").textContent =
    inactive;

}


/* =========================================================
   OPEN MEMBER ACCOUNT
========================================================= */

async function openMemberAccount(memberId) {

  try {

    clearError();

    showStatus("Loading member account...");


    const member =
      members.find(
        item => item.id === memberId
      );


    if (!member) {
      throw new Error(
        "Member could not be found."
      );
    }


    selectedMember =
      member;


    $("memberAccount").hidden =
      false;


    renderMemberDetails(member);


    await loadMemberContributions(member.id);


    $("memberAccount")
      .scrollIntoView({
        behavior: "smooth",
        block: "start"
      });


    showStatus(
      `Member account loaded • ${member.name}`
    );


  } catch (error) {

    console.error(error);

    showError(
      error.message ||
      "Unable to load member account."
    );

  }

}


/* =========================================================
   MEMBER DETAILS
========================================================= */

function renderMemberDetails(member) {

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


  const status =
    $("accountStatus");


  status.textContent =
    member.status || "—";


  status.className =
    member.status === "active"
      ? "account-status status-active"
      : "account-status status-inactive";


  const toggleButton =
    $("toggleMemberBtn");


  if (member.status === "active") {

    toggleButton.textContent =
      "Deactivate Member";

  } else {

    toggleButton.textContent =
      "Reactivate Member";

  }


  populateEditForm(member);

}


/* =========================================================
   LOAD MEMBER CONTRIBUTIONS
========================================================= */

async function loadMemberContributions(memberId) {

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
      created_at,
      contribution_date,
      mpesa_reference,
      notes
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


  selectedContributions =
    data || [];


  renderContributionHistory(
    selectedContributions
  );


  calculateMemberFinancials(
    selectedContributions
  );

}


/* =========================================================
   MEMBER FINANCIALS
========================================================= */

function calculateMemberFinancials(contributions) {

  let lifetime = 0;

  let currentMonthPaid = 0;


  for (const contribution of contributions) {

    const amount =
      Number(contribution.amount || 0);


    lifetime += amount;


    if (
      contribution.month ===
      currentMonth()
    ) {

      currentMonthPaid +=
        amount;

    }

  }


  const expected =
    monthlyContribution;


  const outstanding =
    Math.max(
      expected - currentMonthPaid,
      0
    );


  const status =
    currentMonthPaid >= expected &&
    expected > 0
      ? "PAID"
      : "OUTSTANDING";


  $("monthlyExpected").textContent =
    money(expected);


  $("monthlyPaid").textContent =
    money(currentMonthPaid);


  $("monthlyOutstanding").textContent =
    money(outstanding);


  $("monthlyStatus").textContent =
    status;


  $("monthlyStatus").className =
    status === "PAID"
      ? "badge badge-paid"
      : "badge badge-outstanding";


  $("lifetimeContributions").textContent =
    money(lifetime);

}


/* =========================================================
   CONTRIBUTION HISTORY
========================================================= */

function renderContributionHistory(
  contributions
) {

  const rows =
    $("historyRows");


  if (!contributions.length) {

    rows.innerHTML = `
      <tr>
        <td colspan="5">
          No contributions recorded.
        </td>
      </tr>
    `;

    return;

  }


  rows.innerHTML =
    contributions.map(row => {

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

async function addMember(event) {

  event.preventDefault();

  try {

    clearError();


    const form =
      event.currentTarget;


    const formData =
      new FormData(form);


    const name =
      String(
        formData.get("name") || ""
      ).trim();


    const memberNumber =
      String(
        formData.get("member_number") || ""
      ).trim();


    const membershipNumber =
      String(
        formData.get("membership_number") || ""
      ).trim();


    const phone =
      String(
        formData.get("phone") || ""
      ).trim();


    const email =
      String(
        formData.get("email") || ""
      ).trim();


    const role =
      String(
        formData.get("role") || "member"
      );


    const joinDate =
      formData.get("join_date") ||
      todayString();


    if (!name) {
      throw new Error(
        "Full name is required."
      );
    }


    if (!memberNumber) {
      throw new Error(
        "Member number is required."
      );
    }


    if (!membershipNumber) {
      throw new Error(
        "Membership number is required."
      );
    }


    if (!phone) {
      throw new Error(
        "Phone number is required."
      );
    }


    showStatus("Adding member...");


    const {
      data,
      error
    } = await supabase
      .from("members")
      .insert({
        group_id: currentGroup.id,
        member_number: memberNumber,
        name,
        phone,
        role,
        join_date: joinDate,
        status: "active",
        email: email || null,
        membership_number:
          membershipNumber,
        onboarding_status: "pending"
      })
      .select()
      .single();


    if (error) {
      throw error;
    }


    form.reset();

    $("joinDate").value =
      todayString();


    await loadMembers(
      currentGroup.id
    );


    showStatus(
      `Member "${data.name}" added successfully.`,
      "success"
    );


  } catch (error) {

    console.error(error);

    showStatus(
      "Unable to add member.",
      "error"
    );

    showError(
      error.message ||
      "Unable to add member."
    );

  }

}


/* =========================================================
   POPULATE EDIT FORM
========================================================= */

function populateEditForm(member) {

  $("editName").value =
    member.name || "";


  $("editMemberNumber").value =
    member.member_number || "";


  $("editMembershipNumber").value =
    member.membership_number || "";


  $("editPhone").value =
    member.phone || "";


  $("editEmail").value =
    member.email || "";


  $("editRole").value =
    member.role || "member";


  $("editJoinDate").value =
    member.join_date || "";

}


/* =========================================================
   SHOW EDIT PANEL
========================================================= */

function showEditPanel() {

  if (!selectedMember) {
    return;
  }


  populateEditForm(
    selectedMember
  );


  $("editPanel")
    .classList.add("show");


  $("editPanel")
    .scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });

}


/* =========================================================
   HIDE EDIT PANEL
========================================================= */

function hideEditPanel() {

  $("editPanel")
    .classList.remove("show");

}


/* =========================================================
   UPDATE MEMBER
========================================================= */

async function updateMember(event) {

  event.preventDefault();


  if (!selectedMember) {
    return;
  }


  try {

    clearError();

    showStatus("Saving member changes...");


    const updatedMember = {

      name:
        $("editName").value.trim(),

      member_number:
        $("editMemberNumber")
          .value.trim(),

      membership_number:
        $("editMembershipNumber")
          .value.trim(),

      phone:
        $("editPhone")
          .value.trim(),

      email:
        $("editEmail")
          .value.trim() || null,

      role:
        $("editRole").value,

      join_date:
        $("editJoinDate").value ||
        selectedMember.join_date

    };


    if (!updatedMember.name) {
      throw new Error(
        "Full name is required."
      );
    }


    if (!updatedMember.member_number) {
      throw new Error(
        "Member number is required."
      );
    }


    if (!updatedMember.membership_number) {
      throw new Error(
        "Membership number is required."
      );
    }


    if (!updatedMember.phone) {
      throw new Error(
        "Phone number is required."
      );
    }


    const {
      data,
      error
    } = await supabase
      .from("members")
      .update(updatedMember)
      .eq("id", selectedMember.id)
      .eq("group_id", currentGroup.id)
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

      members[index] =
        data;

    }


    renderMemberDetails(
      selectedMember
    );


    await loadMembers(
      currentGroup.id
    );


    /*
      Re-select the updated member
      because loadMembers may have
      refreshed the members array.
    */

    const refreshedMember =
      members.find(
        member =>
          member.id === data.id
      );


    if (refreshedMember) {

      selectedMember =
        refreshedMember;

      renderMemberDetails(
        refreshedMember
      );

      await loadMemberContributions(
        refreshedMember.id
      );

    }


    hideEditPanel();


    showStatus(
      "Member details updated successfully.",
      "success"
    );


  } catch (error) {

    console.error(error);

    showStatus(
      "Unable to save member changes.",
      "error"
    );

    showError(
      error.message ||
      "Unable to update member."
    );

  }

}


/* =========================================================
   DEACTIVATE / REACTIVATE
========================================================= */

async function toggleMemberStatus() {

  if (!selectedMember) {
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
      : "reactivate";


  const confirmed =
    window.confirm(
      `Are you sure you want to ${action} ${selectedMember.name}?`
    );


  if (!confirmed) {
    return;
  }


  try {

    clearError();

    showStatus(
      isActive
        ? "Deactivating member..."
        : "Reactivating member..."
    );


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


    selectedMember =
      data;


    const index =
      members.findIndex(
        member =>
          member.id === data.id
      );


    if (index !== -1) {

      members[index] =
        data;

    }


    renderMemberDetails(
      selectedMember
    );


    await loadMembers(
      currentGroup.id
    );


    showStatus(
      isActive
        ? `${selectedMember.name} has been deactivated.`
        : `${selectedMember.name} has been reactivated.`,
      "success"
    );


  } catch (error) {

    console.error(error);

    showStatus(
      "Unable to change member status.",
      "error"
    );

    showError(
      error.message ||
      "Unable to update member status."
    );

  }

}


/* =========================================================
   PRINT STATEMENT
========================================================= */

function preparePrintStatement() {

  if (!selectedMember) {
    return;
  }


  let lifetime = 0;

  let paidThisMonth = 0;


  for (
    const contribution
    of selectedContributions
  ) {

    const amount =
      Number(
        contribution.amount || 0
      );


    lifetime += amount;


    if (
      contribution.month ===
      currentMonth()
    ) {

      paidThisMonth +=
        amount;

    }

  }


  const expected =
    monthlyContribution;


  const outstanding =
    Math.max(
      expected - paidThisMonth,
      0
    );


  $("printGroupName").textContent =
    currentGroup?.name ||
    "CHAMA LIVE";


  $("printName").textContent =
    selectedMember.name || "—";


  $("printMemberNumber").textContent =
    selectedMember.member_number ||
    "—";


  $("printMembershipNumber").textContent =
    selectedMember.membership_number ||
    "—";


  $("printPhone").textContent =
    selectedMember.phone ||
    "—";


  $("printEmail").textContent =
    selectedMember.email ||
    "—";


  $("printStatus").textContent =
    selectedMember.status ||
    "—";


  $("printExpected").textContent =
    money(expected);


  $("printPaid").textContent =
    money(paidThisMonth);


  $("printOutstanding").textContent =
    money(outstanding);


  $("printLifetime").textContent =
    money(lifetime);


  $("printDate").textContent =
    `Statement date: ${new Date().toLocaleDateString(
      "en-GB",
      {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }
    )}`;


  const rows =
    $("printHistoryRows");


  if (!selectedContributions.length) {

    rows.innerHTML = `
      <tr>
        <td
          colspan="5"
          style="
            border:1px solid #000;
            padding:7px;
          "
        >
          No contributions recorded.
        </td>
      </tr>
    `;

  } else {

    rows.innerHTML =
      selectedContributions
        .map(row => {

          const reference =
            row.mpesa_reference ||
            row.reference ||
            "—";


          return `
            <tr>

              <td
                style="
                  border:1px solid #000;
                  padding:7px;
                "
              >
                ${escapeHtml(
                  formatDate(
                    row.contribution_date
                  )
                )}
              </td>

              <td
                style="
                  border:1px solid #000;
                  padding:7px;
                  text-align:right;
                "
              >
                ${escapeHtml(
                  money(row.amount)
                )}
              </td>

              <td
                style="
                  border:1px solid #000;
                  padding:7px;
                "
              >
                ${escapeHtml(
                  row.contribution_type ||
                  "—"
                )}
              </td>

              <td
                style="
                  border:1px solid #000;
                  padding:7px;
                "
              >
                ${escapeHtml(
                  row.payment_method ||
                  "—"
                )}
              </td>

              <td
                style="
                  border:1px solid #000;
                  padding:7px;
                "
              >
                ${escapeHtml(reference)}
              </td>

            </tr>
          `;

        })
        .join("");

  }


  window.print();

}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function setupEvents() {


  /* Add member */

  $("addMemberForm")
    ?.addEventListener(
      "submit",
      addMember
    );


  /* Filter */

  $("memberFilter")
    ?.addEventListener(
      "change",
      async () => {

        try {

          await renderMembers();

        } catch (error) {

          console.error(error);

          showError(
            error.message
          );

        }

      }
    );


  /* Edit */

  $("editMemberBtn")
    ?.addEventListener(
      "click",
      showEditPanel
    );


  /* Cancel edit */

  $("cancelEditBtn")
    ?.addEventListener(
      "click",
      hideEditPanel
    );


  /* Save edit */

  $("editMemberForm")
    ?.addEventListener(
      "submit",
      updateMember
    );


  /* Print */

  $("printStatementBtn")
    ?.addEventListener(
      "click",
      preparePrintStatement
    );


  /* Activate / deactivate */

  $("toggleMemberBtn")
    ?.addEventListener(
      "click",
      toggleMemberStatus
    );

}


/* =========================================================
   START
========================================================= */

setupEvents();

await init();

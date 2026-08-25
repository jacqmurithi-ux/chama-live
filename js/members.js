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
  document.getElementById(
    "contributionHistory"
  );

const editMemberButton =
  document.getElementById(
    "editMember"
  );

const toggleMemberButton =
  document.getElementById(
    "toggleMember"
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
   GROUP
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
      "id, monthly_contribution"
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
   MEMBER MONTHLY PAYMENT
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
    expected > 0 &&
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
        currentMonth()
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


    await loadMembers();


    renderMetrics();

    renderMembers();


    selectedMember =
      members.find(
        member =>
          member.id ===
          selectedMember.id
      );


    await selectMember(
      selectedMember.id
    );


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
    currentStatus ===
    "active"
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


    await loadMembers();


    renderMetrics();

    renderMembers();


    selectedMember =
      members.find(
        member =>
          member.id ===
          selectedMember.id
      );


    await selectMember(
      selectedMember.id
    );


    statusEl.textContent =
      `Member ${newStatus === "active"
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

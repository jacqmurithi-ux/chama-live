/* =========================================================
   LOAD MONTHLY CONTRIBUTION TYPE
   ---------------------------------------------------------
   READ-ONLY

   Actual contribution_types schema:
     id
     group_id
     name
     created_by
     created_at
     code

   IMPORTANT:
   - contribution_types.is_active does NOT exist.
   - Do not filter on is_active.
   - No database writes.
   ========================================================= */

async function loadMonthlyContributionType() {
  if (!groupId) {
    monthlyContributionType = null;
    contributionTypesLoaded = true;
    return null;
  }

  const {
    data,
    error
  } = await supabase
    .from("contribution_types")
    .select(
      "id, group_id, name, created_by, created_at, code"
    )
    .eq(
      "group_id",
      groupId
    );

  if (error) {
    throw error;
  }

  const rows =
    Array.isArray(data)
      ? data
      : [];

  /*
     Prefer a contribution type that clearly represents
     the normal/monthly contribution.

     We use the existing name/code fields only.
  */
  const monthly =
    rows.find(row => {
      const name =
        String(row.name || "")
          .trim()
          .toLowerCase();

      const code =
        String(row.code || "")
          .trim()
          .toLowerCase();

      return (
        name === "monthly" ||
        name === "monthly contribution" ||
        name.includes("monthly") ||
        code === "monthly" ||
        code === "monthly_contribution"
      );
    }) ||
    rows[0] ||
    null;

  monthlyContributionType =
    monthly;

  contributionTypesLoaded =
    true;

  return monthlyContributionType;
}
/* =========================================================
   CONTRIBUTION PREVIEW
   ========================================================= */

function updateContributionPreview() {
  const amountInput =
    byId("contributionAmount");

  const preview =
    byId("contributionPreview");

  if (!preview) {
    return;
  }

  const amount =
    Number(
      amountInput?.value || 0
    );

  const typeName =
    getContributionTypeName();

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    preview.textContent =
      typeName
        ? `${typeName}: No contribution amount set.`
        : "No contribution amount set.";

    return;
  }

  preview.textContent =
    `${typeName || "Contribution"}: KES ${amount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )} per period.`;
}


/* =========================================================
   HISTORICAL CONTROLS
   ========================================================= */

function updateHistoricalControls() {
  const historicalEnabled =
    byId("historicalEnabled");

  const enabled =
    Boolean(
      historicalEnabled?.checked
    );

  const historicalFields = [
    "historicalPaidThrough",
    "paymentMethod"
  ];

  historicalFields.forEach(
    fieldId => {
      const field =
        byId(fieldId);

      if (field) {
        field.disabled =
          !enabled;
      }
    }
  );

  const historicalSection =
    byId("historicalContributionSection");

  if (historicalSection) {
    historicalSection.hidden =
      !enabled;
  }

  updateHistoricalPreview();
}


/* =========================================================
   HISTORICAL PREVIEW
   ========================================================= */

function updateHistoricalPreview() {
  const preview =
    byId("historicalPreview");

  if (!preview) {
    return;
  }

  const historicalEnabled =
    byId("historicalEnabled");

  if (
    !historicalEnabled?.checked
  ) {
    preview.textContent =
      "Historical contribution setup is not enabled.";

    return;
  }

  const effectiveFrom =
    byId("effectiveFrom")?.value;

  const paidThrough =
    byId(
      "historicalPaidThrough"
    )?.value;

  if (!effectiveFrom) {
    preview.textContent =
      "Select the effective contribution date.";

    return;
  }

  if (!paidThrough) {
    preview.textContent =
      "Select the date through which historical contributions have been paid.";

    return;
  }

  const amount =
    Number(
      byId(
        "contributionAmount"
      )?.value || 0
    );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    preview.textContent =
      "Enter the contribution amount to calculate the historical preview.";

    return;
  }

  preview.textContent =
    `Historical contribution setup: KES ${amount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )} per period, effective from ${effectiveFrom}, paid through ${paidThrough}.`;
}


/* =========================================================
   CONTRIBUTION TYPE HELPERS
   ========================================================= */

function getSelectedContributionTypeId() {
  const select =
    byId(
      "contributionType"
    );

  if (
    select?.value
  ) {
    return select.value;
  }

  return (
    monthlyContributionType?.id ||
    null
  );
}


function getContributionTypeName() {
  const select =
    byId(
      "contributionType"
    );

  if (
    select?.selectedOptions?.length
  ) {
    const selected =
      select.selectedOptions[0];

    if (
      selected.value &&
      selected.textContent
    ) {
      return selected.textContent.trim();
    }
  }

  return (
    monthlyContributionType?.name ||
    "Monthly Contribution"
  );
}


/* =========================================================
   FIRST HISTORICAL MONTH
   ========================================================= */

function resolveFirstHistoricalMonth(
  effectiveFrom
) {
  if (!effectiveFrom) {
    return null;
  }

  const date =
    new Date(
      `${effectiveFrom}T00:00:00`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return (
    `${date.getFullYear()}-` +
    `${String(
      date.getMonth() + 1
    ).padStart(2, "0")}-01`
  );
}


/* =========================================================
   FORM VALUES
   ========================================================= */

function getFormValues() {
  const contributionAmount =
    Number(
      byId(
        "contributionAmount"
      )?.value || 0
    );

  const historicalEnabled =
    Boolean(
      byId(
        "historicalEnabled"
      )?.checked
    );

  return {
    memberNumber:
      byId(
        "memberNumber"
      )?.value.trim() || "",

    name:
      byId(
        "memberName"
      )?.value.trim() || "",

    nationalId:
      byId(
        "memberNationalId"
      )?.value.trim() || "",

    phone:
      byId(
        "memberPhone"
      )?.value.trim() || "",

    email:
      byId(
        "memberEmail"
      )?.value.trim() || "",

    role:
      byId(
        "memberRole"
      )?.value || "member",

    status:
      byId(
        "memberStatus"
      )?.value || "active",

    joinDate:
      byId(
        "memberJoinDate"
      )?.value || null,

    contributionTypeId:
      getSelectedContributionTypeId(),

    contributionAmount:
      Number.isFinite(
        contributionAmount
      )
        ? contributionAmount
        : 0,

    firstPeriodRule:
      byId(
        "firstPeriodRule"
      )?.value || "full_period",

    effectiveFrom:
      byId(
        "effectiveFrom"
      )?.value || null,

    historicalEnabled,

    historicalPaidThrough:
      byId(
        "historicalPaidThrough"
      )?.value || null,

    paymentMethod:
      byId(
        "paymentMethod"
      )?.value || null
  };
}


/* =========================================================
   FORM VALIDATION
   ========================================================= */

function validateForm(
  values
) {
  if (!values.memberNumber) {
    return {
      valid: false,
      message:
        "Member number is required."
    };
  }

  if (!values.name) {
    return {
      valid: false,
      message:
        "Member name is required."
    };
  }

  if (
    values.contributionAmount <
    0
  ) {
    return {
      valid: false,
      message:
        "Contribution amount cannot be negative."
    };
  }

  if (
    values.historicalEnabled
  ) {
    if (
      !values.effectiveFrom
    ) {
      return {
        valid: false,
        message:
          "Select the effective contribution date."
      };
    }

    if (
      !values.historicalPaidThrough
    ) {
      return {
        valid: false,
        message:
          "Select the historical paid-through date."
      };
    }

    if (
      values.historicalPaidThrough <
      values.effectiveFrom
    ) {
      return {
        valid: false,
        message:
          "Historical paid-through date cannot be earlier than the effective date."
      };
    }
  }

  return {
    valid: true,
    message: ""
  };
}


/* =========================================================
   DUPLICATE MEMBER NUMBER CHECK
   ========================================================= */

async function checkDuplicateMemberNumber(
  memberNumber,
  excludedMemberId = null
) {
  const normalized =
    String(
      memberNumber || ""
    )
      .trim();

  if (!normalized || !groupId) {
    return false;
  }

  let query =
    supabase
      .from("members")
      .select("id, member_number")
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "member_number",
        normalized
      )
      .limit(1);

  if (
    excludedMemberId
  ) {
    query =
      query.neq(
        "id",
        excludedMemberId
      );
  }

  const {
    data,
    error
  } =
    await query;

  if (error) {
    throw error;
  }

  return (
    Array.isArray(data) &&
    data.length > 0
  );
}
/* =========================================================
   CONTRIBUTION RESULT MESSAGE
   ========================================================= */

function showContributionResult(
  message,
  type = "success"
) {
  const element =
    byId("contributionResult");

  if (!element) {
    return;
  }

  element.textContent =
    message || "";

  element.className =
    `contribution-result ${type}`;
}


/* =========================================================
   MEMBER ROW / CARD RENDERING
   ========================================================= */

function renderMembers(
  searchTerm = ""
) {
  const filteredMembers =
    filterMembers(
      searchTerm
    );

  const rows =
    byId("memberRows");

  const cards =
    byId("memberCards");

  if (rows) {
    if (!filteredMembers.length) {
      rows.innerHTML = `
        <tr>
          <td
            colspan="10"
            class="empty-state"
          >
            No members found.
          </td>
        </tr>
      `;
    } else {
      rows.innerHTML =
        filteredMembers
          .map(
            member =>
              renderMemberRow(
                member
              )
          )
          .join("");
    }
  }

  if (cards) {
    if (!filteredMembers.length) {
      cards.innerHTML = `
        <div class="empty-state">
          No members found.
        </div>
      `;
    } else {
      cards.innerHTML =
        filteredMembers
          .map(
            member =>
              renderMemberCard(
                member
              )
          )
          .join("");
    }
  }

  const resultCount =
    byId(
      "memberResultCount"
    );

  if (resultCount) {
    resultCount.textContent =
      `${filteredMembers.length} ${
        filteredMembers.length === 1
          ? "member"
          : "members"
      }`;
  }
}


function renderMemberRow(
  member
) {
  const position =
    contributionPositions.get(
      String(member.id)
    );

  const status =
    position?.status ||
    null;

  const contributionStatus =
    status
      ? status
          .replace(
            /_/g,
            " "
          )
          .replace(
            /\b\w/g,
            character =>
              character.toUpperCase()
          )
      : "—";

  const contributionClass =
    contributionPositionStatusClass(
      status
    );

  return `
    <tr>
      <td>
        ${escapeHtml(
          member.member_number ||
            "—"
        )}
      </td>

      <td>
        ${escapeHtml(
          member.membership_number ||
            "—"
        )}
      </td>

      <td>
        <div class="member-name-cell">
          <strong>
            ${escapeHtml(
              member.name ||
                "Unnamed member"
            )}
          </strong>
        </div>
      </td>

      <td>
        ${escapeHtml(
          member.phone ||
            "—"
        )}
      </td>

      <td>
        ${escapeHtml(
          member.email ||
            "—"
        )}
      </td>

      <td>
        ${roleBadgeHtml(
          member.role
        )}
      </td>

      <td>
        ${accountStatusHtml(
          member.status
        )}
      </td>

      <td>
        <span
          class="${contributionClass}"
        >
          ${escapeHtml(
            contributionStatus
          )}
        </span>
      </td>

      <td>
        ${loginStatusHtml(
          member
        )}
      </td>

      <td>
        <div class="member-actions">

          <button
            type="button"
            class="btn btn-sm"
            data-action="view"
            data-member-id="${escapeHtml(
              member.id
            )}"
          >
            View
          </button>

          <button
            type="button"
            class="btn btn-sm"
            data-action="edit"
            data-member-id="${escapeHtml(
              member.id
            )}"
          >
            Edit
          </button>

          ${
            member.email
              ? `
                <button
                  type="button"
                  class="btn btn-sm"
                  data-action="invite"
                  data-member-id="${escapeHtml(
                    member.id
                  )}"
                >
                  Invite
                </button>
              `
              : ""
          }

        </div>
      </td>
    </tr>
  `;
}


function renderMemberCard(
  member
) {
  const position =
    contributionPositions.get(
      String(member.id)
    );

  const status =
    position?.status ||
    null;

  const contributionStatus =
    status
      ? status
          .replace(
            /_/g,
            " "
          )
          .replace(
            /\b\w/g,
            character =>
              character.toUpperCase()
          )
      : "—";

  const contributionClass =
    contributionPositionStatusClass(
      status
    );

  return `
    <article class="member-card">

      <div class="member-card-header">

        <div class="member-avatar">
          ${escapeHtml(
            getInitials(
              member.name
            )
          )}
        </div>

        <div>
          <h3>
            ${escapeHtml(
              member.name ||
                "Unnamed member"
            )}
          </h3>

          <p>
            Member #
            ${escapeHtml(
              member.member_number ||
                "—"
            )}
          </p>
        </div>

      </div>

      <div class="member-card-details">

        <div>
          <span>Phone</span>
          <strong>
            ${escapeHtml(
              member.phone ||
                "—"
            )}
          </strong>
        </div>

        <div>
          <span>Email</span>
          <strong>
            ${escapeHtml(
              member.email ||
                "—"
            )}
          </strong>
        </div>

        <div>
          <span>Role</span>
          <strong>
            ${escapeHtml(
              displayRole(
                member.role
              )
            )}
          </strong>
        </div>

        <div>
          <span>Status</span>
          <strong>
            ${accountStatusHtml(
              member.status
            )}
          </strong>
        </div>

        <div>
          <span>
            Contribution Status
          </span>

          <strong
            class="${contributionClass}"
          >
            ${escapeHtml(
              contributionStatus
            )}
          </strong>
        </div>

        <div>
          <span>Login</span>
          <strong>
            ${loginStatusHtml(
              member
            )}
          </strong>
        </div>

      </div>

      <div class="member-card-actions">

        <button
          type="button"
          class="btn btn-sm"
          data-action="view"
          data-member-id="${escapeHtml(
            member.id
          )}"
        >
          View
        </button>

        <button
          type="button"
          class="btn btn-sm"
          data-action="edit"
          data-member-id="${escapeHtml(
            member.id
          )}"
        >
          Edit
        </button>

        ${
          member.email
            ? `
              <button
                type="button"
                class="btn btn-sm"
                data-action="invite"
                data-member-id="${escapeHtml(
                  member.id
                )}"
              >
                Invite
              </button>
            `
            : ""
        }

      </div>

    </article>
  `;
}


/* =========================================================
   MEMBER COUNTS
   ========================================================= */

function updateMemberCount() {
  const total =
    members.length;

  const active =
    members.filter(
      member =>
        String(
          member.status || ""
        ).toLowerCase() ===
        "active"
    ).length;

  const loginActive =
    members.filter(
      member =>
        hasMemberLogin(
          member
        )
    ).length;

  const noLogin =
    total -
    loginActive;

  const memberCount =
    byId("memberCount");

  if (memberCount) {
    memberCount.textContent =
      total.toLocaleString(
        "en-KE"
      );
  }

  const activeMembers =
    byId("activeMembers");

  if (activeMembers) {
    activeMembers.textContent =
      active.toLocaleString(
        "en-KE"
      );
  }

  const loginMembers =
    byId("loginMembers");

  if (loginMembers) {
    loginMembers.textContent =
      loginActive.toLocaleString(
        "en-KE"
      );
  }

  const noLoginMembers =
    byId("noLoginMembers");

  if (noLoginMembers) {
    noLoginMembers.textContent =
      noLogin.toLocaleString(
        "en-KE"
      );
  }
}


/* =========================================================
   LOAD MEMBERS
   ========================================================= */

async function loadMembers() {
  if (!groupId) {
    members = [];
    return [];
  }

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select("*")
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
    Array.isArray(data)
      ? data
      : [];

  return members;
}
/* =========================================================
   ADD MEMBER
   ========================================================= */

function openAddMember() {
  editingMemberId = null;

  const panel =
    byId("addMemberPanel");

  if (panel) {
    panel.hidden = false;
    panel.classList.add("open");
  }

  const title =
    byId("addMemberTitle");

  if (title) {
    title.textContent =
      "Add Member";
  }

  const description =
    byId("addMemberDescription");

  if (description) {
    description.textContent =
      "Create a new group member account.";
  }

  const form =
    byId("addMemberForm");

  if (form) {
    form.reset();
  }

  ensureNationalIdUI();
  ensureContributionUI();

  const historicalEnabled =
    byId("historicalEnabled");

  if (historicalEnabled) {
    historicalEnabled.disabled =
      false;
    historicalEnabled.checked =
      false;
  }

  const contributionAmount =
    byId("contributionAmount");

  if (contributionAmount) {
    contributionAmount.disabled =
      false;
  }

  const firstPeriodRule =
    byId("firstPeriodRule");

  if (firstPeriodRule) {
    firstPeriodRule.disabled =
      false;
  }

  const effectiveFrom =
    byId("effectiveFrom");

  if (effectiveFrom) {
    effectiveFrom.disabled =
      false;
  }

  updateContributionPreview();
  updateHistoricalControls();
  updateHistoricalPreview();

  clearFormMessage();

  const memberNumber =
    byId("memberNumber");

  if (memberNumber) {
    memberNumber.focus();
  }

  panel?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}


/* =========================================================
   FORM MESSAGE HELPERS
   ========================================================= */

function clearFormMessage() {
  const element =
    byId("memberFormMessage");

  if (!element) {
    return;
  }

  element.textContent = "";
  element.className =
    "form-message";
}


function showFormMessage(
  message,
  type = "info"
) {
  const element =
    byId("memberFormMessage");

  if (!element) {
    return;
  }

  element.textContent =
    message || "";

  element.className =
    `form-message ${type}`;
}


/* =========================================================
   GENERAL MESSAGE HELPERS
   ========================================================= */

function showError(
  message
) {
  console.error(
    message
  );

  const element =
    byId("pageMessage");

  if (!element) {
    return;
  }

  element.textContent =
    message || "An error occurred.";

  element.className =
    "page-message error";
}


function showSuccess(
  message
) {
  const element =
    byId("pageMessage");

  if (!element) {
    return;
  }

  element.textContent =
    message || "";

  element.className =
    "page-message success";
}


/* =========================================================
   NATIONAL ID UI
   ========================================================= */

function ensureNationalIdUI() {
  if (
    byId("memberNationalId")
  ) {
    return;
  }

  const memberPhone =
    byId("memberPhone");

  if (!memberPhone) {
    return;
  }

  const field =
    document.createElement(
      "div"
    );

  field.className =
    "form-group";

  field.innerHTML = `
    <label for="memberNationalId">
      National ID
    </label>

    <input
      type="text"
      id="memberNationalId"
      name="national_id"
      autocomplete="off"
      placeholder="Enter national ID"
    >
  `;

  const parent =
    memberPhone.closest(
      ".form-group"
    );

  if (parent?.parentElement) {
    parent.parentElement.insertBefore(
      field,
      parent.nextSibling
    );
  }
}


/* =========================================================
   CONTRIBUTION SETUP UI
   ========================================================= */

function ensureContributionUI() {
  if (
    byId(
      "contributionAmount"
    )
  ) {
    return;
  }

  const form =
    byId("addMemberForm");

  if (!form) {
    return;
  }

  const section =
    document.createElement(
      "div"
    );

  section.id =
    "memberContributionSetup";

  section.className =
    "member-contribution-setup";

  section.innerHTML = `
    <div class="section-heading">
      <h3>
        Contribution Setup
      </h3>

      <p>
        Configure this member's contribution plan.
      </p>
    </div>

    <div class="form-grid">

      <div class="form-group">
        <label for="contributionType">
          Contribution Type
        </label>

        <select
          id="contributionType"
          name="contribution_type"
        >
          <option value="">
            Select contribution type
          </option>
        </select>
      </div>

      <div class="form-group">
        <label for="contributionAmount">
          Contribution Amount
        </label>

        <input
          type="number"
          id="contributionAmount"
          name="contribution_amount"
          min="0"
          step="0.01"
          placeholder="0.00"
        >
      </div>

      <div class="form-group">
        <label for="firstPeriodRule">
          First Period Rule
        </label>

        <select
          id="firstPeriodRule"
          name="first_period_rule"
        >
          <option value="full_period">
            Full Period
          </option>

          <option value="from_effective_date">
            From Effective Date
          </option>
        </select>
      </div>

      <div class="form-group">
        <label for="effectiveFrom">
          Effective From
        </label>

        <input
          type="date"
          id="effectiveFrom"
          name="effective_from"
        >
      </div>

    </div>

    <div
      id="contributionPreview"
      class="contribution-preview"
    >
      No contribution amount set.
    </div>

    <div class="historical-toggle">
      <label>
        <input
          type="checkbox"
          id="historicalEnabled"
          name="historical_enabled"
        >

        Add historical contribution information
      </label>
    </div>

    <div
      id="historicalContributionSection"
      hidden
    >

      <div class="form-grid">

        <div class="form-group">
          <label for="historicalPaidThrough">
            Historical Paid Through
          </label>

          <input
            type="date"
            id="historicalPaidThrough"
            name="historical_paid_through"
            disabled
          >
        </div>

        <div class="form-group">
          <label for="paymentMethod">
            Payment Method
          </label>

          <select
            id="paymentMethod"
            name="payment_method"
            disabled
          >
            <option value="">
              Select payment method
            </option>

            <option value="cash">
              Cash
            </option>

            <option value="mpesa">
              M-Pesa
            </option>

            <option value="bank">
              Bank
            </option>

            <option value="other">
              Other
            </option>
          </select>
        </div>

      </div>

      <div
        id="historicalPreview"
        class="historical-preview"
      >
        Historical contribution setup is not enabled.
      </div>

    </div>
  `;

  form.appendChild(
    section
  );

  /*
   * Populate the contribution type
   * from the already-loaded read-only
   * contribution_types result.
   */

  const select =
    byId("contributionType");

  if (
    select &&
    monthlyContributionType
  ) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      monthlyContributionType.id;

    option.textContent =
      monthlyContributionType.name ||
      "Monthly Contribution";

    option.selected =
      true;

    select.appendChild(
      option
    );
  }
}


/* =========================================================
   CONTRIBUTION TYPE SELECTION
   ========================================================= */

function syncContributionTypeSelect() {
  const select =
    byId(
      "contributionType"
    );

  if (
    !select ||
    !monthlyContributionType
  ) {
    return;
  }

  const existing =
    Array.from(
      select.options
    ).some(
      option =>
        String(option.value) ===
        String(
          monthlyContributionType.id
        )
    );

  if (!existing) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      monthlyContributionType.id;

    option.textContent =
      monthlyContributionType.name ||
      "Monthly Contribution";

    select.appendChild(
      option
    );
  }

  select.value =
    monthlyContributionType.id;
}


/* =========================================================
   DATE DEFAULTS
   ========================================================= */

function setDefaultContributionDates() {
  const today =
    getToday();

  const joinDate =
    byId("memberJoinDate");

  const effectiveFrom =
    byId("effectiveFrom");

  if (
    joinDate &&
    !joinDate.value
  ) {
    joinDate.value =
      today;
  }

  if (
    effectiveFrom &&
    !effectiveFrom.value
  ) {
    effectiveFrom.value =
      joinDate?.value ||
      today;
  }

  updateHistoricalPreview();
}
/* =========================================================
   SAVE MEMBER
   ========================================================= */

async function saveMember() {
  const saveButton =
    byId("saveMemberButton");

  const values =
    getFormValues();

  const validation =
    validateForm(values);

  if (!validation.valid) {
    showFormMessage(
      validation.message,
      "error"
    );
    return;
  }

  try {
    const duplicate =
      await checkDuplicateMemberNumber(
        values.memberNumber,
        editingMemberId
      );

    if (duplicate) {
      showFormMessage(
        "That member number is already in use.",
        "error"
      );
      return;
    }
  } catch (error) {
    console.error(
      "Failed to check member number:",
      error
    );

    showFormMessage(
      error?.message ||
        "Unable to validate the member number.",
      "error"
    );

    return;
  }

  if (saveButton) {
    saveButton.disabled =
      true;

    saveButton.dataset.originalText =
      saveButton.textContent;

    saveButton.textContent =
      editingMemberId
        ? "Saving..."
        : "Creating...";
  }

  clearFormMessage();

  try {
    /*
     * -------------------------------------------------------
     * EDIT EXISTING MEMBER
     * -------------------------------------------------------
     */

    if (editingMemberId) {
      const {
        data,
        error
      } = await supabase
        .from("members")
        .update({
          member_number:
            values.memberNumber,

          name:
            values.name,

          national_id:
            values.nationalId ||
            null,

          phone:
            values.phone ||
            null,

          email:
            values.email ||
            null,

          role:
            values.role,

          status:
            values.status,

          join_date:
            values.joinDate ||
            null
        })
        .eq(
          "id",
          editingMemberId
        )
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "Member update returned no member."
        );
      }

      showFormMessage(
        "Member updated successfully.",
        "success"
      );

      await refreshMembers();

      window.setTimeout(
        () => {
          closeAddMember();
        },
        500
      );

      return;
    }

    /*
     * -------------------------------------------------------
     * CREATE MEMBER
     * -------------------------------------------------------
     */

    const requestId =
      crypto.randomUUID();

    let createdMember =
      null;

    /*
     * Historical onboarding continues
     * to use the existing server-side
     * primitive.
     */

    if (
      values.historicalEnabled
    ) {
      const {
        data,
        error
      } = await supabase.rpc(
        "create_member_with_historical_contributions",
        {
          p_request_id:
            requestId,

          p_group_id:
            groupId,

          p_member_number:
            values.memberNumber,

          p_name:
            values.name,

          p_national_id:
            values.nationalId ||
            null,

          p_phone:
            values.phone ||
            null,

          p_email:
            values.email ||
            null,

          p_role:
            values.role,

          p_status:
            values.status,

          p_join_date:
            values.joinDate ||
            null,

          p_contribution_type_id:
            values.contributionTypeId ||
            null,

          p_contribution_amount:
            values.contributionAmount,

          p_first_period_rule:
            values.firstPeriodRule,

          p_effective_from:
            values.effectiveFrom ||
            null,

          p_historical_paid_through:
            values.historicalPaidThrough ||
            null,

          p_payment_method:
            values.paymentMethod ||
            null
        }
      );

      if (error) {
        throw error;
      }

      createdMember =
        Array.isArray(data)
          ? data[0]
          : data;

    } else {
      /*
       * Normal member onboarding.
       */

      const {
        data,
        error
      } = await supabase.rpc(
        "create_member_with_contribution_plan",
        {
          p_request_id:
            requestId,

          p_group_id:
            groupId,

          p_member_number:
            values.memberNumber,

          p_name:
            values.name,

          p_national_id:
            values.nationalId ||
            null,

          p_phone:
            values.phone ||
            null,

          p_email:
            values.email ||
            null,

          p_role:
            values.role,

          p_status:
            values.status,

          p_join_date:
            values.joinDate ||
            null,

          p_contribution_type_id:
            values.contributionTypeId ||
            null,

          p_contribution_amount:
            values.contributionAmount,

          p_first_period_rule:
            values.firstPeriodRule,

          p_effective_from:
            values.effectiveFrom ||
            null
        }
      );

      if (error) {
        throw error;
      }

      createdMember =
        Array.isArray(data)
          ? data[0]
          : data;
    }

    /*
     * Store the onboarding event locally.
     * This does not write to Supabase.
     */

    try {
      sessionStorage.setItem(
        "chamaLiveLastMemberOnboarding",
        JSON.stringify({
          type:
            "member_created",

          member_id:
            createdMember?.id ||
            null,

          group_id:
            groupId,

          member_number:
            values.memberNumber,

          created_at:
            new Date().toISOString()
        })
      );
    } catch (storageError) {
      console.warn(
        "Unable to store onboarding event:",
        storageError
      );
    }

    showFormMessage(
      "Member created successfully.",
      "success"
    );

    await refreshMembers();

    window.setTimeout(
      () => {
        closeAddMember();
      },
      500
    );

  } catch (error) {
    console.error(
      "Failed to save member:",
      error
    );

    showFormMessage(
      error?.message ||
        "Failed to save member.",
      "error"
    );

  } finally {
    if (saveButton) {
      saveButton.disabled =
        false;

      saveButton.textContent =
        saveButton.dataset.originalText ||
        "Save Member";
    }
  }
}


/* =========================================================
   HISTORICAL PAYMENT RECONCILIATION
   ========================================================= */

async function reconcileMemberHistoricalPayments(
  memberId
) {
  if (!memberId) {
    throw new Error(
      "Member ID is required."
    );
  }

  const {
    data,
    error
  } = await supabase.rpc(
    "reconcile_member_historical_payments",
    {
      p_member_id:
        memberId
    }
  );

  if (error) {
    throw error;
  }

  return data;
}


async function handleHistoricalReconciliation(
  memberId,
  button = null
) {
  if (!memberId) {
    showError(
      "Member ID is missing."
    );
    return;
  }

  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );

  if (!member) {
    showError(
      "Member not found."
    );
    return;
  }

  const confirmed =
    window.confirm(
      `Reconcile historical payments for ${member.name || "this member"}?`
    );

  if (!confirmed) {
    return;
  }

  const originalText =
    button?.textContent ||
    "Reconcile Historical Payments";

  if (button) {
    button.disabled =
      true;

    button.textContent =
      "Reconciling...";
  }

  try {
    const result =
      await reconcileMemberHistoricalPayments(
        memberId
      );

    console.info(
      "Historical reconciliation result:",
      result
    );

    await refreshMembers();

    /*
     * Refresh the accounting display if
     * the same member's modal is open.
     */

    const modal =
      byId("memberModal");

    const openMemberId =
      modal?.dataset?.memberId;

    if (
      openMemberId &&
      String(openMemberId) ===
        String(memberId)
    ) {
      await loadMemberContributionPosition(
        memberId
      );
    }

    showSuccess(
      "Historical payments reconciled successfully."
    );

  } catch (error) {
    console.error(
      "Historical reconciliation failed:",
      error
    );

    showError(
      error?.message ||
        "Historical payment reconciliation failed."
    );

  } finally {
    if (button) {
      button.disabled =
        false;

      button.textContent =
        originalText;
    }
  }
}


/* =========================================================
   MEMBER INVITATION
   ========================================================= */

async function sendMemberInvitation(
  memberId,
  reopenModal = false
) {
  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );

  if (!member) {
    showError(
      "Member not found."
    );
    return;
  }

  if (!member.email) {
    showError(
      "This member does not have an email address."
    );
    return;
  }

  try {
    const {
      data: sessionData,
      error: sessionError
    } =
      await supabase.auth.getSession();

    if (sessionError) {
      throw sessionError;
    }

    if (!sessionData?.session) {
      throw new Error(
        "Your session has expired. Please sign in again."
      );
    }

    const {
      data,
      error
    } =
      await supabase.functions.invoke(
        "send-member-invitation",
        {
          body: {
            member_id:
              member.id
          }
        }
      );

    if (error) {
      throw error;
    }

    console.info(
      "Member invitation result:",
      data
    );

    showSuccess(
      `Invitation sent to ${member.email}.`
    );

    await refreshMembers();

    if (reopenModal) {
      await openMemberModal(
        member.id
      );
    }

  } catch (error) {
    console.error(
      "Failed to send member invitation:",
      error
    );

    showError(
      error?.message ||
        "Failed to send member invitation."
    );
  }
}


/* =========================================================
   CLOSE ADD MEMBER
   ========================================================= */

function closeAddMember() {
  const panel =
    byId("addMemberPanel");

  if (panel) {
    panel.hidden =
      true;

    panel.classList.remove(
      "open"
    );
  }

  editingMemberId =
    null;

  const form =
    byId("addMemberForm");

  if (form) {
    form.reset();
  }

  clearFormMessage();

  updateContributionPreview();
  updateHistoricalControls();
  updateHistoricalPreview();
}


/* =========================================================
   EDIT MEMBER
   ========================================================= */

async function openEditMember(
  memberId
) {
  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );

  if (!member) {
    showError(
      "Member not found."
    );
    return;
  }

  editingMemberId =
    member.id;

  const panel =
    byId("addMemberPanel");

  if (panel) {
    panel.hidden =
      false;

    panel.classList.add(
      "open"
    );
  }

  const title =
    byId("addMemberTitle");

  if (title) {
    title.textContent =
      "Edit Member";
  }

  const description =
    byId("addMemberDescription");

  if (description) {
    description.textContent =
      "Update the member's account details.";
  }

  const form =
    byId("addMemberForm");

  if (form) {
    form.reset();
  }

  ensureNationalIdUI();
  ensureContributionUI();

  const fields = {
    memberNumber:
      member.member_number,

    memberName:
      member.name,

    memberNationalId:
      member.national_id,

    memberPhone:
      member.phone,

    memberEmail:
      member.email,

    memberRole:
      member.role,

    memberStatus:
      member.status,

    memberJoinDate:
      member.join_date
  };

  Object.entries(
    fields
  ).forEach(
    ([id, value]) => {
      const element =
        byId(id);

      if (element) {
        element.value =
          value || "";
      }
    }
  );

  const contributionAmount =
    byId(
      "contributionAmount"
    );

  if (contributionAmount) {
    contributionAmount.disabled =
      true;
  }

  const firstPeriodRule =
    byId(
      "firstPeriodRule"
    );

  if (firstPeriodRule) {
    firstPeriodRule.disabled =
      true;
  }

  const effectiveFrom =
    byId("effectiveFrom");

  if (effectiveFrom) {
    effectiveFrom.disabled =
      true;
  }

  const historicalEnabled =
    byId(
      "historicalEnabled"
    );

  if (historicalEnabled) {
    historicalEnabled.checked =
      false;

    historicalEnabled.disabled =
      true;
  }

  updateHistoricalControls();

  clearFormMessage();

  const memberNumber =
    byId("memberNumber");

  if (memberNumber) {
    memberNumber.focus();
  }

  panel?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}
/* =========================================================
   CONTRIBUTION POSITION UI
   ========================================================= */

function ensureContributionPositionUI() {
  const modal =
    byId("memberModal");

  if (!modal) {
    return;
  }

  /*
   * The Members HTML already contains the accounting
   * section. Reuse those elements when available.
   */

  const existingSection =
    byId("memberContributionPosition");

  if (existingSection) {
    ensureContributionPositionStyles();

    /*
     * Add Contribution Records only when the HTML
     * does not already provide a records element.
     */

    if (
      !byId("viewContributionRecords")
    ) {
      const recordsCard =
        document.createElement("div");

      recordsCard.className =
        "contribution-position-item contribution-records-item";

      recordsCard.innerHTML = `
        <span class="contribution-position-label">
          Contribution Records
        </span>

        <strong
          id="viewContributionRecords"
          class="contribution-position-value contribution-records-value"
        >
          —
        </strong>
      `;

      existingSection.appendChild(
        recordsCard
      );
    }

    return;
  }

  /*
   * Fallback for older Members HTML.
   */

  const anchor =
    byId("viewMemberGroup")?.closest(
      ".member-details"
    ) ||
    modal.querySelector(
      ".modal-body"
    ) ||
    modal;

  const section =
    document.createElement("section");

  section.id =
    "memberContributionPosition";

  section.className =
    "member-contribution-position";

  section.innerHTML = `
    <div class="contribution-position-header">
      <div>
        <h3>Contribution Accounting</h3>
        <p>
          Current contribution position for this member.
        </p>
      </div>

      <span
        id="viewContributionStatus"
        class="contribution-status-badge status-unknown"
      >
        UNKNOWN
      </span>
    </div>

    <div class="contribution-position-grid">

      <div class="contribution-position-item contribution-total-item">
        <span class="contribution-position-label">
          Total Contributed
        </span>

        <strong
          id="viewContributionTotal"
          class="contribution-position-value contribution-total-value"
        >
          —
        </strong>
      </div>

      <div class="contribution-position-item">
        <span class="contribution-position-label">
          Total Due
        </span>

        <strong
          id="viewContributionDue"
          class="contribution-position-value"
        >
          —
        </strong>
      </div>

      <div class="contribution-position-item contribution-allocated-item">
        <span class="contribution-position-label">
          Allocated
        </span>

        <strong
          id="viewContributionAllocated"
          class="contribution-position-value contribution-allocated-value"
        >
          —
        </strong>
      </div>

      <div class="contribution-position-item contribution-arrears-item">
        <span class="contribution-position-label">
          Arrears
        </span>

        <strong
          id="viewContributionArrears"
          class="contribution-position-value contribution-arrears-value"
        >
          —
        </strong>
      </div>

      <div class="contribution-position-item contribution-credit-item">
        <span class="contribution-position-label">
          Credit
        </span>

        <strong
          id="viewContributionCredit"
          class="contribution-position-value contribution-credit-value"
        >
          —
        </strong>
      </div>

      <div class="contribution-position-item contribution-records-item">
        <span class="contribution-position-label">
          Contribution Records
        </span>

        <strong
          id="viewContributionRecords"
          class="contribution-position-value contribution-records-value"
        >
          —
        </strong>
      </div>

    </div>

    <p
      id="viewContributionDescription"
      class="contribution-position-description"
    >
      Loading contribution position...
    </p>
  `;

  anchor.appendChild(
    section
  );

  ensureContributionPositionStyles();
}


function ensureContributionPositionStyles() {
  if (
    byId(
      "membersContributionPositionStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "membersContributionPositionStyles";

  style.textContent = `
    .member-contribution-position {
      margin-top: 20px;
      padding: 18px;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      background: #ffffff;
    }

    .contribution-position-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }

    .contribution-position-header h3 {
      margin: 0 0 4px;
      font-size: 17px;
      font-weight: 700;
    }

    .contribution-position-header p {
      margin: 0;
      color: #6b7280;
      font-size: 13px;
    }

    .contribution-position-grid {
      display: grid;
      grid-template-columns:
        repeat(
          auto-fit,
          minmax(145px, 1fr)
        );
      gap: 10px;
    }

    .contribution-position-item {
      padding: 13px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      background: #f9fafb;
    }

    .contribution-position-label {
      display: block;
      margin-bottom: 6px;
      color: #6b7280;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .03em;
    }

    .contribution-position-value {
      display: block;
      font-size: 18px;
      line-height: 1.2;
      font-weight: 800;
      color: #111827;
    }

    .contribution-total-item {
      background: #ecfdf5;
      border-color: #a7f3d0;
    }

    .contribution-total-value {
      color: #047857;
    }

    .contribution-allocated-item {
      background: #eff6ff;
      border-color: #bfdbfe;
    }

    .contribution-allocated-value {
      color: #1d4ed8;
    }

    .contribution-arrears-item {
      background: #fef2f2;
      border-color: #fecaca;
    }

    .contribution-arrears-value {
      color: #dc2626;
    }

    .contribution-credit-item {
      background: #faf5ff;
      border-color: #e9d5ff;
    }

    .contribution-credit-value {
      color: #7e22ce;
    }

    .contribution-records-item {
      background: #eff6ff;
      border-color: #bfdbfe;
    }

    .contribution-records-value {
      color: #2563eb;
    }

    .contribution-status-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 30px;
      padding: 5px 11px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .04em;
    }

    .contribution-status-badge.status-arrears {
      color: #991b1b;
      background: #fee2e2;
      border: 1px solid #fecaca;
    }

    .contribution-status-badge.status-credit {
      color: #6b21a8;
      background: #f3e8ff;
      border: 1px solid #e9d5ff;
    }

    .contribution-status-badge.status-up-to-date {
      color: #166534;
      background: #dcfce7;
      border: 1px solid #bbf7d0;
    }

    .contribution-status-badge.status-unknown {
      color: #374151;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
    }

    .contribution-position-description {
      margin: 14px 0 0;
      color: #4b5563;
      font-size: 13px;
      line-height: 1.5;
    }

    @media (max-width: 640px) {
      .contribution-position-header {
        align-items: flex-start;
        flex-direction: column;
      }

      .contribution-position-grid {
        grid-template-columns:
          repeat(
            2,
            minmax(0, 1fr)
          );
      }
    }
  `;

  document.head.appendChild(
    style
  );
}


function setContributionPositionLoading() {
  const status =
    byId("viewContributionStatus");

  const ids = [
    "viewContributionTotal",
    "viewContributionDue",
    "viewContributionAllocated",
    "viewContributionArrears",
    "viewContributionCredit",
    "viewContributionRecords"
  ];

  if (status) {
    status.textContent =
      "LOADING";

    status.className =
      "contribution-status-badge status-unknown";
  }

  ids.forEach(
    id => {
      const element =
        byId(id);

      if (element) {
        element.textContent =
          "—";
      }
    }
  );

  const description =
    byId(
      "viewContributionDescription"
    );

  if (description) {
    description.textContent =
      "Loading contribution position...";
  }
}


function contributionPositionStatusClass(
  status
) {
  const normalized =
    String(status || "")
      .trim()
      .toLowerCase()
      .replace(
        /\s+/g,
        "_"
      );

  if (
    normalized ===
      "arrears" ||
    normalized ===
      "overdue"
  ) {
    return "status-arrears";
  }

  if (
    normalized ===
      "credit" ||
    normalized ===
      "in_credit"
  ) {
    return "status-credit";
  }

  if (
    normalized ===
      "up_to_date" ||
    normalized ===
      "up-to-date" ||
    normalized ===
      "current" ||
    normalized ===
      "paid"
  ) {
    return "status-up-to-date";
  }

  return "status-unknown";
}


/* =========================================================
   LOAD MEMBER CONTRIBUTION POSITION
   ========================================================= */

async function loadMemberContributionPosition(
  memberId
) {
  if (!memberId) {
    return null;
  }

  setContributionPositionLoading();

  try {
    const {
      data,
      error
    } = await supabase.rpc(
      "get_member_contribution_position",
      {
        p_member_id:
          memberId
      },
      {
        get: true
      }
    );

    if (error) {
      throw error;
    }

    const row =
      Array.isArray(data)
        ? data[0]
        : data;

    const source =
      row || {};

    const totalDue =
      Number(
        source.total_due ??
        source.due ??
        0
      );

    const totalAllocated =
      Number(
        source.total_allocated ??
        source.allocated ??
        source.total_paid ??
        source.paid ??
        0
      );

    const totalArrears =
      Number(
        source.arrears ??
        Math.max(
          totalDue -
            totalAllocated,
          0
        )
      );

    const totalCredit =
      Number(
        source.credit ??
        Math.max(
          totalAllocated -
            totalDue,
          0
        )
      );

    const records =
      Number(
        source.contribution_records ??
        source.records_count ??
        source.record_count ??
        source.contribution_count ??
        0
      );

    let status =
      source.status ||
      source.contribution_status ||
      null;

    if (!status) {
      if (totalArrears > 0) {
        status =
          "ARREARS";
      } else if (
        totalCredit > 0
      ) {
        status =
          "CREDIT";
      } else {
        status =
          "UP TO DATE";
      }
    }

    const normalizedStatus =
      String(status)
        .trim()
        .toUpperCase();

    const statusClass =
      contributionPositionStatusClass(
        status
      );

    const statusElement =
      byId(
        "viewContributionStatus"
      );

    if (statusElement) {
      statusElement.textContent =
        normalizedStatus;

      statusElement.className =
        `contribution-status-badge ${statusClass}`;
    }

    const totalElement =
      byId(
        "viewContributionTotal"
      );

    if (totalElement) {
      totalElement.textContent =
        `KES ${totalAllocated.toFixed(2)}`;
    }

    const dueElement =
      byId(
        "viewContributionDue"
      );

    if (dueElement) {
      dueElement.textContent =
        `KES ${totalDue.toFixed(2)}`;
    }

    const allocatedElement =
      byId(
        "viewContributionAllocated"
      );

    if (allocatedElement) {
      allocatedElement.textContent =
        `KES ${totalAllocated.toFixed(2)}`;
    }

    const arrearsElement =
      byId(
        "viewContributionArrears"
      );

    if (arrearsElement) {
      arrearsElement.textContent =
        `KES ${totalArrears.toFixed(2)}`;
    }

    const creditElement =
      byId(
        "viewContributionCredit"
      );

    if (creditElement) {
      creditElement.textContent =
        `KES ${totalCredit.toFixed(2)}`;
    }

    const recordsElement =
      byId(
        "viewContributionRecords"
      );

    if (recordsElement) {
      recordsElement.textContent =
        String(records);
    }

    const description =
      byId(
        "viewContributionDescription"
      );

    if (description) {
      if (
        totalArrears > 0
      ) {
        description.textContent =
          `This member has KES ${totalArrears.toFixed(2)} in arrears.`;
      } else if (
        totalCredit > 0
      ) {
        description.textContent =
          `This member has KES ${totalCredit.toFixed(2)} in contribution credit.`;
      } else {
        description.textContent =
          "This member's contributions are fully up to date.";
      }
    }

    const position = {
      member_id:
        memberId,

      total_due:
        totalDue,

      total_allocated:
        totalAllocated,

      arrears:
        totalArrears,

      credit:
        totalCredit,

      contribution_records:
        records,

      status:
        normalizedStatus
    };

    contributionPositions.set(
      String(memberId),
      position
    );

    return position;

  } catch (error) {
    console.error(
      "Failed to load member contribution position:",
      error
    );

    const status =
      byId(
        "viewContributionStatus"
      );

    if (status) {
      status.textContent =
        "UNKNOWN";

      status.className =
        "contribution-status-badge status-unknown";
    }

    const description =
      byId(
        "viewContributionDescription"
      );

    if (description) {
      description.textContent =
        error?.message ||
        "Unable to load contribution position.";
    }

    return null;
  }
}


async function refreshMemberContributionPosition(
  memberId
) {
  return loadMemberContributionPosition(
    memberId
  );
}
/* =========================================================
   OPEN MEMBER MODAL
   ========================================================= */

async function openMemberModal(memberId) {
  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );

  if (!member) {
    showError(
      "Member not found."
    );
    return;
  }

  const modal =
    byId("memberModal");

  if (!modal) {
    showError(
      "Member details modal was not found."
    );
    return;
  }

  /*
   * Store the currently opened member on the modal.
   */

  modal.dataset.memberId =
    String(member.id);

  const initials =
    byId("viewMemberInitials");

  if (initials) {
    initials.textContent =
      getInitials(
        member.name
      );
  }

  const name =
    byId("viewMemberName");

  if (name) {
    name.textContent =
      member.name ||
      "Unnamed member";
  }

  const memberNumber =
    byId("viewMemberNumber");

  if (memberNumber) {
    memberNumber.textContent =
      member.member_number ||
      "—";
  }

  const membershipNumber =
    byId(
      "viewMembershipNumber"
    );

  if (membershipNumber) {
    membershipNumber.textContent =
      member.membership_number ||
      "—";
  }

  const nationalId =
    byId(
      "viewMemberNationalId"
    );

  if (nationalId) {
    nationalId.textContent =
      member.national_id ||
      "—";
  }

  const phone =
    byId("viewMemberPhone");

  if (phone) {
    phone.textContent =
      member.phone ||
      "—";
  }

  const email =
    byId("viewMemberEmail");

  if (email) {
    email.textContent =
      member.email ||
      "—";
  }

  const role =
    byId("viewMemberRole");

  if (role) {
    role.textContent =
      displayRole(
        member.role
      );
  }

  const status =
    byId("viewMemberStatus");

  if (status) {
    status.innerHTML =
      accountStatusHtml(
        member.status
      );
  }

  const loginStatus =
    byId(
      "viewMemberLoginStatus"
    );

  if (loginStatus) {
    loginStatus.innerHTML =
      loginStatusHtml(
        member
      );
  }

  const joinDate =
    byId("viewMemberJoinDate");

  if (joinDate) {
    joinDate.textContent =
      formatDate(
        member.join_date
      );
  }

  const group =
    byId("viewMemberGroup");

  if (group) {
    group.textContent =
      currentGroup?.name ||
      "—";
  }

  /*
   * Reset accounting display before
   * requesting the current position.
   */

  ensureContributionPositionUI();

  setContributionPositionLoading();

  /*
   * Open the modal explicitly.
   * This avoids relying on CSS-only visibility
   * when the HTML contains style="display:none".
   */

  modal.hidden =
    false;

  modal.style.display =
    "flex";

  modal.classList.add(
    "open"
  );

  document.body.classList.add(
    "modal-open"
  );

  /*
   * Reconciliation button.
   */

  let reconcileButton =
    byId(
      "reconcileHistoricalPayments"
    );

  if (
    !reconcileButton
  ) {
    reconcileButton =
      document.createElement(
        "button"
      );

    reconcileButton.id =
      "reconcileHistoricalPayments";

    reconcileButton.type =
      "button";

    reconcileButton.dataset.action =
      "reconcile";

    reconcileButton.textContent =
      "Reconcile Historical Payments";

    const footer =
      modal.querySelector(
        ".modal-footer"
      ) ||
      modal.querySelector(
        ".modal-actions"
      );

    if (footer) {
      footer.appendChild(
        reconcileButton
      );
    }
  }

  if (reconcileButton) {
    reconcileButton.dataset.memberId =
      String(member.id);

    reconcileButton.hidden =
      false;
  }

  /*
   * Load accounting independently so that
   * member details remain visible even if
   * accounting retrieval fails.
   */

  await loadMemberContributionPosition(
    member.id
  );

  /*
   * Focus the close control when available.
   */

  const closeButton =
    byId(
      "closeMemberModal"
    ) ||
    byId(
      "doneMemberModal"
    );

  if (closeButton) {
    window.setTimeout(
      () => {
        closeButton.focus();
      },
      0
    );
  }
}


/* =========================================================
   SEARCH / FILTER
   ========================================================= */

function filterMembers() {
  const input =
    byId("memberSearch");

  const query =
    String(
      input?.value ||
        ""
    )
      .trim()
      .toLowerCase();

  if (!query) {
    renderMembers(
      members
    );

    updateMemberCount();

    return;
  }

  const filtered =
    members.filter(
      member => {
        const searchable =
          [
            member.member_number,
            member.membership_number,
            member.national_id,
            member.name,
            member.phone,
            member.email,
            member.role,
            member.status,
            member.onboarding_status
          ]
            .map(
              value =>
                String(
                  value ??
                    ""
                ).toLowerCase()
            )
            .join(" ");

        return searchable.includes(
          query
        );
      }
    );

  renderMembers(
    filtered
  );

  const resultCount =
    byId(
      "memberResultCount"
    );

  if (resultCount) {
    resultCount.textContent =
      `${filtered.length} ${
        filtered.length === 1
          ? "member"
          : "members"
      }`;
  }
}


function clearMemberSearch() {
  const input =
    byId("memberSearch");

  if (input) {
    input.value =
      "";
  }

  renderMembers(
    members
  );

  updateMemberCount();

  input?.focus();
}


/* =========================================================
   MEMBER ACTION HANDLER
   ========================================================= */

async function handleMemberAction(
  event
) {
  const actionElement =
    event.target.closest(
      "[data-action]"
    );

  if (!actionElement) {
    return;
  }

  /*
   * Do not intercept actions belonging
   * to unrelated controls.
   */

  const action =
    actionElement.dataset.action;

  const memberId =
    actionElement.dataset.memberId ||
    actionElement.closest(
      "[data-member-id]"
    )?.dataset.memberId;

  if (
    !action
  ) {
    return;
  }

  try {
    switch (action) {

      case "view":
        event.preventDefault();

        await openMemberModal(
          memberId
        );

        break;


      case "edit":
        event.preventDefault();

        await openEditMember(
          memberId
        );

        break;


      case "invite":
        event.preventDefault();

        await sendMemberInvitation(
          memberId,
          false
        );

        break;


      case "reconcile":
        event.preventDefault();

        await handleHistoricalReconciliation(
          memberId ||
            byId(
              "memberModal"
            )?.dataset.memberId,
          actionElement
        );

        break;


      case "close":
        event.preventDefault();

        closeMemberModal();

        break;


      default:
        break;
    }

  } catch (error) {
    console.error(
      "Member action failed:",
      error
    );

    showError(
      error?.message ||
        "The requested member action failed."
    );
  }
}


/* =========================================================
   CLOSE MEMBER MODAL
   ========================================================= */

function closeMemberModal() {
  const modal =
    byId("memberModal");

  if (!modal) {
    return;
  }

  modal.hidden =
    true;

  /*
   * Explicitly hide the modal because the
   * HTML currently starts with display:none.
   */

  modal.style.display =
    "none";

  modal.classList.remove(
    "open"
  );

  document.body.classList.remove(
    "modal-open"
  );

  delete modal.dataset.memberId;
}


/* =========================================================
   EVENT BINDING
   ========================================================= */

function bindEvents() {
  if (eventsBound) {
    return;
  }

  /*
   * Add Member
   */

  const addMemberButton =
    byId("addMemberButton");

  if (addMemberButton) {
    addMemberButton.addEventListener(
      "click",
      openAddMember
    );
  }


  /*
   * Close Add/Edit panel
   */

  const closeAddMemberButton =
    byId("closeAddMember");

  if (closeAddMemberButton) {
    closeAddMemberButton.addEventListener(
      "click",
      closeAddMember
    );
  }

  const cancelAddMember =
    byId("cancelAddMember");

  if (cancelAddMember) {
    cancelAddMember.addEventListener(
      "click",
      closeAddMember
    );
  }


  /*
   * Member form
   */

  const form =
    byId("addMemberForm");

  if (form) {
    form.addEventListener(
      "submit",
      event => {
        event.preventDefault();

        saveMember();
      }
    );
  }


  /*
   * Search
   */

  const search =
    byId("memberSearch");

  if (search) {
    search.addEventListener(
      "input",
      () => {
        window.clearTimeout(
          memberSearchTimer
        );

        memberSearchTimer =
          window.setTimeout(
            () => {
              filterMembers();
            },
            150
          );
      }
    );
  }


  /*
   * Clear search
   */

  const clearSearch =
    byId(
      "clearMemberSearch"
    );

  if (clearSearch) {
    clearSearch.addEventListener(
      "click",
      clearMemberSearch
    );
  }


  /*
   * Table and mobile cards use
   * delegated member actions.
   */

  const memberRows =
    byId("memberRows");

  if (memberRows) {
    memberRows.addEventListener(
      "click",
      handleMemberAction
    );
  }

  const memberCards =
    byId("memberCards");

  if (memberCards) {
    memberCards.addEventListener(
      "click",
      handleMemberAction
    );
  }


  /*
   * Modal actions.
   */

  const modal =
    byId("memberModal");

  if (modal) {
    modal.addEventListener(
      "click",
      event => {
        /*
         * Clicking the backdrop closes
         * the modal, but clicking inside
         * the modal content does not.
         */

        if (
          event.target ===
          modal
        ) {
          closeMemberModal();

          return;
        }

        handleMemberAction(
          event
        );
      }
    );
  }


  /*
   * Existing reconciliation button
   * may live outside the delegated
   * action containers.
   */

  const reconcileButton =
    byId(
      "reconcileHistoricalPayments"
    );

  if (reconcileButton) {
    reconcileButton.addEventListener(
      "click",
      event => {
        event.preventDefault();

        const modalMemberId =
          byId(
            "memberModal"
          )?.dataset.memberId;

        handleHistoricalReconciliation(
          modalMemberId,
          reconcileButton
        );
      }
    );
  }


  /*
   * Modal footer close button.
   */

  const doneButton =
    byId(
      "doneMemberModal"
    );

  if (doneButton) {
    doneButton.addEventListener(
      "click",
      closeMemberModal
    );
  }


  /*
   * Historical controls.
   */

  const historicalEnabled =
    byId(
      "historicalEnabled"
    );

  if (historicalEnabled) {
    historicalEnabled.addEventListener(
      "change",
      updateHistoricalControls
    );
  }


  const contributionAmount =
    byId(
      "contributionAmount"
    );

  if (contributionAmount) {
    contributionAmount.addEventListener(
      "input",
      updateContributionPreview
    );
  }


  const firstPeriodRule =
    byId(
      "firstPeriodRule"
    );

  if (firstPeriodRule) {
    firstPeriodRule.addEventListener(
      "change",
      updateContributionPreview
    );

    firstPeriodRule.addEventListener(
      "change",
      updateHistoricalPreview
    );
  }


  const effectiveFrom =
    byId(
      "effectiveFrom"
    );

  if (effectiveFrom) {
    effectiveFrom.addEventListener(
      "change",
      updateHistoricalPreview
    );
  }


  const historicalPaidThrough =
    byId(
      "historicalPaidThrough"
    );

  if (historicalPaidThrough) {
    historicalPaidThrough.addEventListener(
      "change",
      updateHistoricalPreview
    );
  }


  const joinDate =
    byId(
      "memberJoinDate"
    );

  if (joinDate) {
    joinDate.addEventListener(
      "change",
      updateHistoricalPreview
    );
  }


  /*
   * Escape closes whichever modal/panel
   * is currently open.
   */

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key !==
        "Escape"
      ) {
        return;
      }

      const memberModal =
        byId("memberModal");

      if (
        memberModal &&
        !memberModal.hidden &&
        memberModal.style.display !==
          "none"
      ) {
        closeMemberModal();

        return;
      }

      const addPanel =
        byId("addMemberPanel");

      if (
        addPanel &&
        !addPanel.hidden
      ) {
        closeAddMember();
      }
    }
  );

  eventsBound =
    true;
}
/* =========================================================
   INITIALIZE MEMBERS PAGE
   ========================================================= */

async function init() {
  if (initialized) {
    return;
  }

  initialized =
    true;

  try {
    /*
     * -------------------------------------------------------
     * AUTHENTICATION
     * -------------------------------------------------------
     */

    currentUser =
      await requireAuth();

    if (!currentUser) {
      throw new Error(
        "Authentication is required."
      );
    }


    /*
     * -------------------------------------------------------
     * CURRENT MEMBER
     * -------------------------------------------------------
     */

    currentMember =
      await getMyMember();

    if (!currentMember) {
      throw new Error(
        "Unable to determine the current member account."
      );
    }


    /*
     * -------------------------------------------------------
     * CURRENT GROUP
     * -------------------------------------------------------
     */

    currentGroup =
      await getMyGroup();

    groupId =
      currentMember.group_id ||
      currentGroup?.id ||
      null;

    if (!groupId) {
      throw new Error(
        "Unable to determine the current group."
      );
    }


    /*
     * -------------------------------------------------------
     * GROUP NAME
     * -------------------------------------------------------
     */

    const groupName =
      byId("groupName");

    if (groupName) {
      groupName.textContent =
        currentGroup?.name ||
        "—";
    }


    /*
     * -------------------------------------------------------
     * PREPARE PAGE UI
     * -------------------------------------------------------
     */

    ensureNationalIdUI();

    ensureContributionUI();

    ensureContributionPositionUI();

    ensureContributionPositionStyles();

    setDefaultContributionDates();


    /*
     * -------------------------------------------------------
     * CONTRIBUTION TYPE
     * -------------------------------------------------------
     *
     * IMPORTANT:
     * contribution_types does NOT contain is_active.
     * loadMonthlyContributionType() therefore performs
     * only a group_id filter.
     * -------------------------------------------------------
     */

    await loadMonthlyContributionType();


    /*
     * -------------------------------------------------------
     * LOAD MEMBERS
     * -------------------------------------------------------
     */

    await loadMembers();


    /*
     * -------------------------------------------------------
     * LOAD ACCOUNTING POSITIONS
     * -------------------------------------------------------
     */

    await loadMemberContributionPositions();


    /*
     * -------------------------------------------------------
     * RENDER
     * -------------------------------------------------------
     */

    renderMembers(
      members
    );

    updateMemberCount();


    /*
     * -------------------------------------------------------
     * EVENTS
     * -------------------------------------------------------
     */

    bindEvents();


    /*
     * -------------------------------------------------------
     * INITIAL FORM STATE
     * -------------------------------------------------------
     */

    updateContributionPreview();

    updateHistoricalControls();

    updateHistoricalPreview();


    /*
     * -------------------------------------------------------
     * PAGE STATUS
     * -------------------------------------------------------
     */

    const resultCount =
      byId(
        "memberResultCount"
      );

    if (resultCount) {
      resultCount.textContent =
        `${members.length} ${
          members.length === 1
            ? "member"
            : "members"
        }`;
    }

    console.info(
      "CHAMA LIVE: Members page initialized.",
      {
        groupId,
        memberCount:
          members.length
      }
    );

  } catch (error) {
    console.error(
      "Failed to initialize members page:",
      error
    );

    showError(
      error?.message ||
        "Failed to initialize the Members page."
    );

  } finally {
    /*
     * Allow a controlled retry if initialization
     * failed. A successful page remains initialized.
     */

    if (
      !currentMember ||
      !groupId
    ) {
      initialized =
        false;
    }
  }
}


/* =========================================================
   REFRESH MEMBERS
   ========================================================= */

async function refreshMembers() {
  if (!groupId) {
    return;
  }

  try {
    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers(
      members
    );

    updateMemberCount();

    const resultCount =
      byId(
        "memberResultCount"
      );

    if (resultCount) {
      const searchValue =
        String(
          byId(
            "memberSearch"
          )?.value ||
            ""
        ).trim();

      if (searchValue) {
        filterMembers();
      } else {
        resultCount.textContent =
          `${members.length} ${
            members.length === 1
              ? "member"
              : "members"
          }`;
      }
    }

  } catch (error) {
    console.error(
      "Failed to refresh members:",
      error
    );

    showError(
      error?.message ||
        "Failed to refresh members."
    );
  }
}


/* =========================================================
   PAGE ENTRY POINT
   ========================================================= */

export {
  init
};


/* =========================================================
   READY LOG
   ========================================================= */

console.info(
  "CHAMA LIVE: members.js ready"
);

) {
  if (
    !groupId ||
    !memberNumber
  ) {
    return false;
  }

  let query =
    supabase
      .from(
        "members"
      )
      .select(
        "id"
      )
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "member_number",
        memberNumber
      );

  if (
    editingMemberId
  ) {
    query =
      query.neq(
        "id",
        editingMemberId
      );
  }

  const {
    data,
    error
  } =
    await query
      .limit(1);

  if (error) {
    throw error;
  }

  return Boolean(
    data &&
    data.length
  );
}
/* =========================================================
   SAVE MEMBER
========================================================= */

async function saveMember(
  event
) {
  event?.preventDefault();

  clearFormMessage();

  const submitButton =
    byId(
      "saveMemberButton"
    ) ||
    byId(
      "memberSaveButton"
    );

  const values =
    getFormValues();

  try {
    await validateForm(
      values
    );

    const duplicate =
      await checkDuplicateMemberNumber(
        values.memberNumber
      );

    if (duplicate) {
      throw new Error(
        "A member with this member number already exists in this group."
      );
    }

    if (submitButton) {
      submitButton.disabled =
        true;
    }

    let result = null;

    /* -----------------------------------------------------
       EDIT EXISTING MEMBER
    ----------------------------------------------------- */

    if (
      editingMemberId
    ) {
      const {
        error
      } =
        await supabase
          .from(
            "members"
          )
          .update({
            member_number:
              values.memberNumber,

            name:
              values.name,

            national_id:
              values.nationalId ||
              null,

            phone:
              values.phone,

            email:
              values.email ||
              null,

            role:
              values.role,

            status:
              values.status,

            join_date:
              values.joinDate
          })
          .eq(
            "id",
            editingMemberId
          )
          .eq(
            "group_id",
            groupId
          );

      if (error) {
        throw error;
      }

      await loadMembers();

      await loadMemberContributionPositions();

      renderMembers();

      updateMemberCount();

      showFormMessage(
        "Member details updated successfully.",
        "success"
      );

      closeAddMember();

      return;
    }


    /* -----------------------------------------------------
       NEW MEMBER
    ----------------------------------------------------- */

    if (
      values.historicalEnabled
    ) {
      const requestId =
        crypto.randomUUID();

      const {
        data,
        error
      } =
        await supabase.rpc(
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
              values.nationalId,

            p_phone:
              values.phone,

            p_email:
              values.email ||
              null,

            p_role:
              values.role,

            p_status:
              values.status,

            p_join_date:
              values.joinDate,

            p_contribution_type_id:
              monthlyContributionType.id,

            p_contribution_amount:
              values.contributionAmount,

            p_first_period_rule:
              values.firstPeriodRule,

            p_effective_from:
              values.effectiveFrom,

            p_historical_paid_through:
              values.historicalPaidThrough,

            p_historical_payment_method:
              values.historicalPaymentMethod
          }
        );

      if (error) {
        throw error;
      }

      result =
        Array.isArray(data)
          ? data[0]
          : data;

    } else {
      const requestId =
        crypto.randomUUID();

      const {
        data,
        error
      } =
        await supabase.rpc(
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
              values.nationalId,

            p_phone:
              values.phone,

            p_email:
              values.email ||
              null,

            p_role:
              values.role,

            p_status:
              values.status,

            p_join_date:
              values.joinDate,

            p_contribution_type_id:
              monthlyContributionType.id,

            p_contribution_amount:
              values.contributionAmount,

            p_first_period_rule:
              values.firstPeriodRule,

            p_effective_from:
              values.effectiveFrom
          }
        );

      if (error) {
        throw error;
      }

      result =
        Array.isArray(data)
          ? data[0]
          : data;
    }


    /* -----------------------------------------------------
       ONBOARDING EVENT
    ----------------------------------------------------- */

    try {
      sessionStorage.setItem(
        "chama_live_onboarding_event",
        JSON.stringify({
          type:
            "new-member",
          member_id:
            result?.member_id ||
            result?.id ||
            null,
          group_id:
            groupId,
          created_at:
            new Date().toISOString()
        })
      );
    } catch {
      /* sessionStorage is optional */
    }


    /* -----------------------------------------------------
       REFRESH MEMBER LIST + ACCOUNTING POSITION
    ----------------------------------------------------- */

    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();


    /* -----------------------------------------------------
       SUCCESS MESSAGE
    ----------------------------------------------------- */

    const message =
      contributionResultMessage(
        result
      );

    showFormMessage(
      message
        ? `Member created successfully. ${message}`
        : "Member created successfully.",
      "success"
    );

    closeAddMember();

  } catch (error) {
    console.error(
      "CHAMA LIVE: Save member error",
      error
    );

    showFormMessage(
      error?.message ||
        "Could not save the member.",
      "error"
    );

  } finally {
    if (submitButton) {
      submitButton.disabled =
        false;
    }
  }
}


/* =========================================================
   HISTORICAL RECONCILIATION
========================================================= */

async function reconcileMemberHistoricalPayments(
  memberId,
  throughDate = null
) {
  if (!memberId) {
    throw new Error(
      "Member ID is required."
    );
  }

  const {
    data,
    error
  } =
    await supabase.rpc(
      "reconcile_member_historical_payments",
      {
        p_member_id:
          memberId,

        p_through_date:
          throughDate ||
          null
      }
    );

  if (error) {
    throw error;
  }

  return Array.isArray(data)
    ? data[0]
    : data;
}


/* =========================================================
   HISTORICAL RECONCILIATION HANDLER
========================================================= */

async function handleHistoricalReconciliation(
  memberId
) {
  const member =
    members.find(
      item =>
        String(
          item.id
        ) ===
        String(
          memberId
        )
    );

  if (!member) {
    showError(
      new Error(
        "Member could not be found."
      )
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

  try {
    showStatus(
      "Reconciling historical payments..."
    );

    await reconcileMemberHistoricalPayments(
      member.id
    );

    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();

    showStatus("");

    await openMemberModal(
      member.id
    );

  } catch (error) {
    showStatus("");

    showError(
      error
    );
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
        String(
          item.id
        ) ===
        String(
          memberId
        )
    );

  if (!member) {
    throw new Error(
      "Member could not be found."
    );
  }

  const email =
    String(
      member.email ||
      ""
    )
      .trim()
      .toLowerCase();

  if (!email) {
    throw new Error(
      "This member does not have an email address."
    );
  }

  const {
    data: sessionData,
    error: sessionError
  } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (
    !sessionData?.session
  ) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  const {
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

  await loadMembers();

  await loadMemberContributionPositions();

  renderMembers();

  updateMemberCount();

  if (
    reopenModal
  ) {
    await openMemberModal(
      member.id
    );
  }
}


/* =========================================================
   CLOSE ADD MEMBER
========================================================= */

function closeAddMember() {
  const panel =
    byId(
      "addMemberPanel"
    );

  if (panel) {
    panel.hidden =
      true;
  }

  editingMemberId =
    null;

  clearFormMessage();
}


/* =========================================================
   OPEN EDIT MEMBER
========================================================= */

async function openEditMember(
  memberId
) {
  const member =
    members.find(
      item =>
        String(
          item.id
        ) ===
        String(
          memberId
        )
    );

  if (!member) {
    showError(
      new Error(
        "Member could not be found."
      )
    );
    return;
  }

  editingMemberId =
    member.id;

  const panel =
    byId(
      "addMemberPanel"
    );

  const title =
    byId(
      "memberFormTitle"
    );

  const description =
    byId(
      "memberFormDescription"
    );

  const form =
    byId(
      "addMemberForm"
    );

  if (panel) {
    panel.hidden =
      false;
  }

  if (title) {
    title.textContent =
      "Edit Member";
  }

  if (description) {
    description.textContent =
      "Update the member's profile details. Contribution accounting remains managed by the existing accounting system.";
  }

  if (form) {
    form.reset();
  }

  ensureNationalIdUI();
  ensureContributionUI();

  const setValue =
    (
      id,
      value
    ) => {
      const element =
        byId(id);

      if (element) {
        element.value =
          value ??
          "";
      }
    };

  setValue(
    "memberNumber",
    member.member_number
  );

  setValue(
    "memberName",
    member.name
  );

  setValue(
    "memberNationalId",
    member.national_id
  );

  setValue(
    "memberPhone",
    member.phone
  );

  setValue(
    "memberEmail",
    member.email
  );

  setValue(
    "memberRole",
    member.role ||
      "member"
  );

  setValue(
    "memberStatus",
    member.status ||
      "active"
  );

  setValue(
    "memberJoinDate",
    member.join_date
  );

  const amount =
    byId(
      "memberContributionAmount"
    );

  if (amount) {
    amount.disabled =
      true;
  }

  const firstPeriod =
    byId(
      "memberFirstPeriodRule"
    );

  if (firstPeriod) {
    firstPeriod.disabled =
      true;
  }

  const effectiveFrom =
    byId(
      "memberContributionEffectiveFrom"
    );

  if (effectiveFrom) {
    effectiveFrom.disabled =
      true;
  }

  const historicalEnabled =
    byId(
      "memberHistoricalEnabled"
    );

  if (historicalEnabled) {
    historicalEnabled.value =
      "false";

    historicalEnabled.disabled =
      true;
  }

  updateHistoricalControls();

  clearFormMessage();

  byId(
    "memberNumber"
  )?.focus();

  panel?.scrollIntoView({
    behavior:
      "smooth",
    block:
      "start"
  });
}
/* =========================================================
   PART 5 — MEMBER ACCOUNTING / CONTRIBUTION POSITION
   ---------------------------------------------------------
   Read-only contribution position display.

   Canonical RPC:
     get_member_contribution_position(uuid)

   IMPORTANT:
   - No contribution/payment writes here.
   - No RPC replacement.
   - No reconciliation function declaration here.
   - Keep exactly one copy of each function in members.js.
   ========================================================= */


/* ---------------------------------------------------------
   CONTRIBUTION POSITION UI
   --------------------------------------------------------- */

function ensureContributionPositionUI() {
  const modal =
    byId("viewMemberModal");

  if (!modal) {
    return null;
  }

  let panel =
    byId("memberContributionPosition");

  if (panel) {
    return panel;
  }

  panel =
    document.createElement("section");

  panel.id =
    "memberContributionPosition";

  panel.className =
    "member-contribution-position";

  panel.innerHTML = `
    <div class="member-contribution-position-header">
      <div>
        <h3>
          Contribution Accounting
        </h3>

        <p>
          Current contribution position for this member.
        </p>
      </div>

      <span
        id="memberContributionPositionStatus"
        class="member-contribution-position-status status-unknown"
      >
        Loading…
      </span>
    </div>

    <div
      id="memberContributionPositionDescription"
      class="member-contribution-position-description"
    >
      Loading contribution position…
    </div>

    <div class="member-contribution-position-grid">

      <div class="member-contribution-metric metric-due">
        <span class="member-contribution-metric-label">
          Total Due
        </span>

        <strong
          id="memberContributionPositionDue"
        >
          —
        </strong>
      </div>

      <div class="member-contribution-metric metric-paid">
        <span class="member-contribution-metric-label">
          Total Paid
        </span>

        <strong
          id="memberContributionPositionAllocated"
        >
          —
        </strong>
      </div>

      <div class="member-contribution-metric metric-arrears">
        <span class="member-contribution-metric-label">
          Total Arrears
        </span>

        <strong
          id="memberContributionPositionArrears"
        >
          —
        </strong>
      </div>

      <div class="member-contribution-metric metric-credit">
        <span class="member-contribution-metric-label">
          Total Credit
        </span>

        <strong
          id="memberContributionPositionCredit"
        >
          —
        </strong>
      </div>

      <div class="member-contribution-metric metric-records">
        <span class="member-contribution-metric-label">
          Contribution Records
        </span>

        <strong
          id="memberContributionPositionRecords"
        >
          —
        </strong>
      </div>

    </div>
  `;

  const actions =
    modal.querySelector(
      ".modal-actions"
    );

  if (actions) {
    actions.before(panel);
  } else {
    const detailGrid =
      modal.querySelector(
        ".member-detail-grid"
      );

    if (detailGrid) {
      detailGrid.after(panel);
    } else {
      modal.appendChild(panel);
    }
  }

  return panel;
}


/* ---------------------------------------------------------
   CONTRIBUTION POSITION STYLES
   --------------------------------------------------------- */

function ensureContributionPositionStyles() {
  if (
    byId(
      "memberContributionPositionStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "memberContributionPositionStyles";

  style.textContent = `
    .member-contribution-position {
      margin-top: 18px;
      padding: 18px;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      background: #ffffff;
    }

    .member-contribution-position-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 10px;
    }

    .member-contribution-position-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 800;
    }

    .member-contribution-position-header p {
      margin: 4px 0 0;
      color: #64748b;
      font-size: 12px;
    }

    .member-contribution-position-status {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 28px;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      white-space: nowrap;
    }

    .member-contribution-position-status.status-arrears {
      background: #fee2e2;
      color: #b91c1c;
    }

    .member-contribution-position-status.status-credit {
      background: #dbeafe;
      color: #1d4ed8;
    }

    .member-contribution-position-status.status-up-to-date {
      background: #dcfce7;
      color: #15803d;
    }

    .member-contribution-position-status.status-unknown {
      background: #f1f5f9;
      color: #64748b;
    }

    .member-contribution-position-description {
      margin-bottom: 14px;
      padding: 10px 12px;
      border-radius: 10px;
      background: #f8fafc;
      color: #475569;
      font-size: 12px;
      line-height: 1.5;
    }

    .member-contribution-position-grid {
      display: grid;
      grid-template-columns:
        repeat(5, minmax(0, 1fr));
      gap: 10px;
    }

    .member-contribution-metric {
      min-width: 0;
      padding: 13px 12px;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
    }

    .member-contribution-metric-label {
      display: block;
      margin-bottom: 6px;
      color: #64748b;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    .member-contribution-metric strong {
      display: block;
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
    }

    .member-contribution-metric.metric-due {
      border-left: 4px solid #64748b;
    }

    .member-contribution-metric.metric-paid {
      border-left: 4px solid #2563eb;
    }

    .member-contribution-metric.metric-arrears {
      border-left: 4px solid #dc2626;
    }

    .member-contribution-metric.metric-credit {
      border-left: 4px solid #16a34a;
    }

    .member-contribution-metric.metric-records {
      border-left: 4px solid #7c3aed;
    }

    .member-contribution-metric.metric-paid strong {
      color: #1d4ed8;
    }

    .member-contribution-metric.metric-arrears strong {
      color: #b91c1c;
    }

    .member-contribution-metric.metric-credit strong {
      color: #15803d;
    }

    @media (max-width: 850px) {
      .member-contribution-position-grid {
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 560px) {
      .member-contribution-position {
        padding: 14px;
      }

      .member-contribution-position-header {
        flex-direction: column;
      }

      .member-contribution-position-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
  `;

  document.head.appendChild(style);
}


/* ---------------------------------------------------------
   POSITION LOADING STATE
   --------------------------------------------------------- */

function setContributionPositionLoading() {
  ensureContributionPositionUI();

  const status =
    byId(
      "memberContributionPositionStatus"
    );

  const description =
    byId(
      "memberContributionPositionDescription"
    );

  const due =
    byId(
      "memberContributionPositionDue"
    );

  const allocated =
    byId(
      "memberContributionPositionAllocated"
    );

  const arrears =
    byId(
      "memberContributionPositionArrears"
    );

  const credit =
    byId(
      "memberContributionPositionCredit"
    );

  const records =
    byId(
      "memberContributionPositionRecords"
    );

  if (status) {
    status.textContent =
      "Loading…";

    status.className =
      "member-contribution-position-status status-unknown";
  }

  if (description) {
    description.textContent =
      "Loading contribution position…";
  }

  if (due) {
    due.textContent =
      "—";
  }

  if (allocated) {
    allocated.textContent =
      "—";
  }

  if (arrears) {
    arrears.textContent =
      "—";
  }

  if (credit) {
    credit.textContent =
      "—";
  }

  if (records) {
    records.textContent =
      "—";
  }
}


/* ---------------------------------------------------------
   POSITION STATUS CLASS
   --------------------------------------------------------- */

function contributionPositionStatusClass(
  status
) {
  const value =
    String(
      status || ""
    )
      .trim()
      .toLowerCase();

  if (
    value === "arrears"
  ) {
    return "status-arrears";
  }

  if (
    value === "credit"
  ) {
    return "status-credit";
  }

  if (
    value === "up_to_date"
  ) {
    return "status-up-to-date";
  }

  return "status-unknown";
}


/* ---------------------------------------------------------
   READ MEMBER CONTRIBUTION POSITION
   --------------------------------------------------------- */

async function loadMemberContributionPosition(
  memberId
) {
  ensureContributionPositionUI();
  ensureContributionPositionStyles();
  setContributionPositionLoading();

  if (!memberId) {
    throw new Error(
      "Member ID is required."
    );
  }

  const {
    data,
    error
  } =
    await supabase.rpc(
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

  const position =
    Array.isArray(data)
      ? data[0]
      : data;

  if (!position) {
    throw new Error(
      "No contribution position was returned for this member."
    );
  }

  const status =
    String(
      position.status ||
        ""
    )
      .trim()
      .toLowerCase();

  const due =
    Number(
      position.total_due ??
      position.due ??
      0
    );

  const allocated =
    Number(
      position.total_allocated ??
      position.allocated ??
      position.total_paid ??
      position.paid ??
      0
    );

  const arrears =
    Number(
      position.arrears ??
      0
    );

  const credit =
    Number(
      position.credit ??
      0
    );

  const records =
    Number(
      position.contribution_records ??
      position.records_count ??
      position.record_count ??
      position.contribution_count ??
      0
    );

  const statusElement =
    byId(
      "memberContributionPositionStatus"
    );

  const description =
    byId(
      "memberContributionPositionDescription"
    );

  const dueElement =
    byId(
      "memberContributionPositionDue"
    );

  const allocatedElement =
    byId(
      "memberContributionPositionAllocated"
    );

  const arrearsElement =
    byId(
      "memberContributionPositionArrears"
    );

  const creditElement =
    byId(
      "memberContributionPositionCredit"
    );

  const recordsElement =
    byId(
      "memberContributionPositionRecords"
    );

  if (statusElement) {
    statusElement.textContent =
      contributionStatusLabel(
        status
      );

    statusElement.className =
      `member-contribution-position-status ${contributionPositionStatusClass(status)}`;
  }

  if (description) {
    if (
      status === "arrears"
    ) {
      description.textContent =
        `Member has paid ${formatMoney(allocated)} against ${formatMoney(due)} due, leaving ${formatMoney(arrears)} in arrears.`;
    } else if (
      status === "credit"
    ) {
      description.textContent =
        `Member has contributed ${formatMoney(allocated)} and currently has ${formatMoney(credit)} in credit.`;
    } else if (
      status === "up_to_date"
    ) {
      description.textContent =
        `Member has contributed ${formatMoney(allocated)} against ${formatMoney(due)} due and is up to date.`;
    } else if (
      status === "plan_not_set"
    ) {
      description.textContent =
        "No contribution plan has been established for this member.";
    } else {
      description.textContent =
        `Contribution position: ${contributionStatusLabel(status)}.`;
    }
  }

  if (dueElement) {
    dueElement.textContent =
      formatMoney(due);
  }

  if (allocatedElement) {
    allocatedElement.textContent =
      formatMoney(allocated);
  }

  if (arrearsElement) {
    arrearsElement.textContent =
      formatMoney(arrears);
  }

  if (creditElement) {
    creditElement.textContent =
      formatMoney(credit);
  }

  if (recordsElement) {
    recordsElement.textContent =
      Number.isFinite(records)
        ? records.toLocaleString(
            "en-KE"
          )
        : "0";
  }

  return position;
}


/* ---------------------------------------------------------
   REFRESH POSITION AFTER RECONCILIATION
   --------------------------------------------------------- */

async function refreshMemberContributionPosition(
  memberId
) {
  if (!memberId) {
    return null;
  }

  try {
    return await loadMemberContributionPosition(
      memberId
    );
  } catch (error) {
    console.error(
      "CHAMA LIVE: Could not refresh member contribution position",
      error
    );

    throw error;
  }
}


/* ---------------------------------------------------------
   OPEN MEMBER MODAL
   --------------------------------------------------------- */

async function openMemberModal(
  memberId
) {
  ensureNationalIdUI();
  ensureContributionPositionUI();
  ensureContributionPositionStyles();

  const member =
    members.find(
      item =>
        String(item.id) ===
        String(memberId)
    );

  if (!member) {
    showError(
      "Member could not be found."
    );

    return;
  }

  const modal =
    byId("viewMemberModal");

  if (!modal) {
    return;
  }

  const name =
    byId("viewMemberName");

  const memberNumber =
    byId("viewMemberNumber");

  const nationalId =
    byId("viewMemberNationalId");

  const phone =
    byId("viewMemberPhone");

  const email =
    byId("viewMemberEmail");

  const role =
    byId("viewMemberRole");

  const status =
    byId("viewMemberStatus");

  const joinDate =
    byId("viewMemberJoinDate");

  if (name) {
    name.textContent =
      member.name ||
      "—";
  }

  if (memberNumber) {
    memberNumber.textContent =
      member.member_number ||
      member.membership_number ||
      "—";
  }

  if (nationalId) {
    nationalId.textContent =
      member.national_id ||
      "—";
  }

  if (phone) {
    phone.textContent =
      member.phone ||
      "—";
  }

  if (email) {
    email.textContent =
      member.email ||
      "—";
  }

  if (role) {
    role.textContent =
      member.role ||
      "member";
  }

  if (status) {
    status.textContent =
      member.status ||
      "—";
  }

  if (joinDate) {
    joinDate.textContent =
      member.join_date ||
      "—";
  }

  modal.hidden = false;

  setContributionPositionLoading();

  try {
    await loadMemberContributionPosition(
      member.id
    );
  } catch (error) {
    console.error(
      "CHAMA LIVE: Member contribution position unavailable",
      error
    );

    const positionStatus =
      byId(
        "memberContributionPositionStatus"
      );

    const description =
      byId(
        "memberContributionPositionDescription"
      );

    if (positionStatus) {
      positionStatus.textContent =
        "Unavailable";

      positionStatus.className =
        "member-contribution-position-status status-unknown";
    }

    if (description) {
      description.textContent =
        error?.message ||
        "Contribution position could not be loaded.";
    }
  }

  let reconcileButton =
    byId(
      "reconcileHistoricalPayments"
    );

  if (!reconcileButton) {
    reconcileButton =
      document.createElement(
        "button"
      );

    reconcileButton.type =
      "button";

    reconcileButton.id =
      "reconcileHistoricalPayments";

    reconcileButton.className =
      "btn btn-secondary";

    reconcileButton.dataset.action =
      "reconcile";

    reconcileButton.textContent =
      "Reconcile Historical Payments";

    const actions =
      modal.querySelector(
        ".modal-actions"
      );

    if (actions) {
      actions.prepend(
        reconcileButton
      );
    }
  }

  const closeButton =
    modal.querySelector(
      "[data-close-member-modal]"
    );

  if (closeButton) {
    closeButton.focus();
  }
}

/* =========================================================
   MEMBER SEARCH
========================================================= */

let memberSearchTimer =
  null;

function filterMembers(
  searchTerm
) {
  const term =
    String(
      searchTerm ||
      ""
    )
      .trim()
      .toLowerCase();

  if (!term) {
    return members;
  }

  return members.filter(
    member => {
      const values = [
        member.member_number,
        member.membership_number,
        member.national_id,
        member.name,
        member.phone,
        member.email,
        member.role,
        member.status,
        member.onboarding_status
      ];

      return values.some(
        value =>
          String(
            value ||
            ""
          )
            .toLowerCase()
            .includes(
              term
            )
      );
    }
  );
}


/* =========================================================
   MEMBER ACTION HANDLER
========================================================= */

async function handleMemberAction(
  event
) {
  const button =
    event.target.closest(
      "[data-action]"
    );

  if (!button) {
    return;
  }

  const action =
    button.dataset.action;

  const memberId =
    button.dataset.memberId;

  if (!action) {
    return;
  }

  try {
    if (
      action ===
      "view"
    ) {
      await openMemberModal(
        memberId
      );

      return;
    }

    if (
      action ===
      "edit"
    ) {
      await openEditMember(
        memberId
      );

      return;
    }

    if (
      action ===
      "invite"
    ) {
      button.disabled =
        true;

      await sendMemberInvitation(
        memberId,
        false
      );

      return;
    }

    if (
      action ===
      "reconcile"
    ) {
      await handleHistoricalReconciliation(
        memberId
      );

      return;
    }

    if (
      action ===
      "close"
    ) {
      closeMemberModal();

      return;
    }

  } catch (error) {
    console.error(
      "CHAMA LIVE: Member action error",
      error
    );

    showError(
      error
    );

  } finally {
    if (
      action ===
      "invite"
    ) {
      button.disabled =
        false;
    }
  }
}


/* =========================================================
   CLOSE MEMBER MODAL
========================================================= */

function closeMemberModal() {
  const modal =
    byId(
      "memberModal"
    );

  if (!modal) {
    return;
  }

  modal.hidden =
    true;

  modal.classList.remove(
    "open"
  );
}


/* =========================================================
   BIND EVENTS
========================================================= */

function bindEvents() {
  const addButton =
    byId(
      "addMemberButton"
    ) ||
    byId(
      "addMember"
    );

  addButton?.addEventListener(
    "click",
    () =>
      openAddMember()
  );

  const closeAddButton =
    byId(
      "closeAddMember"
    );

  closeAddButton?.addEventListener(
    "click",
    closeAddMember
  );

  const cancelAddButton =
    byId(
      "cancelAddMember"
    );

  cancelAddButton?.addEventListener(
    "click",
    closeAddMember
  );

  const form =
    byId(
      "addMemberForm"
    );

  form?.addEventListener(
    "submit",
    saveMember
  );

  const search =
    byId(
      "memberSearch"
    );

  search?.addEventListener(
    "input",
    event => {
      clearTimeout(
        memberSearchTimer
      );

      memberSearchTimer =
        setTimeout(
          () => {
            const filtered =
              filterMembers(
                event.target.value
              );

            renderMembers(
              filtered
            );
          },
          150
        );
    }
  );

  const clearSearch =
    byId(
      "clearMemberSearch"
    );

  clearSearch?.addEventListener(
    "click",
    () => {
      if (search) {
        search.value =
          "";
      }

      renderMembers(
        members
      );
    }
  );

  const rows =
    byId(
      "memberRows"
    );

  rows?.addEventListener(
    "click",
    handleMemberAction
  );

  const cards =
    byId(
      "memberCards"
    );

  cards?.addEventListener(
    "click",
    handleMemberAction
  );

  const modal =
    byId(
      "memberModal"
    );

  modal?.addEventListener(
    "click",
    event => {
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

  const modalClose =
    modal?.querySelectorAll(
      "[data-action='close'], .modal-close"
    );

  modalClose?.forEach(
    button => {
      button.addEventListener(
        "click",
        closeMemberModal
      );
    }
  );

  byId(
    "memberHistoricalEnabled"
  )?.addEventListener(
    "change",
    updateHistoricalControls
  );

  byId(
    "memberHistoricalPaidThrough"
  )?.addEventListener(
    "change",
    updateHistoricalPreview
  );

  byId(
    "memberContributionAmount"
  )?.addEventListener(
    "input",
    () => {
      updateContributionPreview();
      updateHistoricalPreview();
    }
  );

  byId(
    "memberJoinDate"
  )?.addEventListener(
    "change",
    () => {
      const effectiveFrom =
        byId(
          "memberContributionEffectiveFrom"
        );

      if (
        effectiveFrom &&
        effectiveFrom.dataset.auto ===
          "true"
      ) {
        effectiveFrom.value =
          byId(
            "memberJoinDate"
          )?.value ||
          "";

        updateHistoricalPreview();
      }
    }
  );

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
        byId(
          "memberModal"
        );

      if (
        memberModal &&
        !memberModal.hidden
      ) {
        closeMemberModal();

        return;
      }

      const panel =
        byId(
          "addMemberPanel"
        );

      if (
        panel &&
        !panel.hidden
      ) {
        closeAddMember();
      }
    }
  );
}


/* =========================================================
   INIT
========================================================= */

export async function init() {
  if (initialized) {
    return;
  }

  initialized =
    true;

  try {
    clearError();

    showStatus(
      "Loading members..."
    );

    currentUser =
      await requireAuth();

    currentMember =
      await getMyMember();

    if (
      !currentMember?.group_id
    ) {
      throw new Error(
        "Your member record has no group."
      );
    }

    groupId =
      currentMember.group_id;

    currentGroup =
      await getMyGroup();

    if (!currentGroup) {
      throw new Error(
        "Group information could not be found."
      );
    }

    const groupName =
      byId(
        "membersGroupName"
      );

    if (groupName) {
      groupName.textContent =
        currentGroup.name ||
        currentGroup.group_name ||
        "Your Group";
    }

    ensureNationalIdUI();

    ensureContributionUI();

    ensureContributionStatusStyles();

    await loadMonthlyContributionType();

    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();

    bindEvents();

    showStatus("");

  } catch (error) {
    initialized =
      false;

    showStatus("");

    showError(
      error
    );
  }
}


/* =========================================================
   REFRESH MEMBERS
========================================================= */

export async function refreshMembers() {
  if (!groupId) {
    return;
  }

  try {
    await loadMembers();

    await loadMemberContributionPositions();

    renderMembers();

    updateMemberCount();

  } catch (error) {
    showError(
      error
    );
  }
}


/* =========================================================
   PAGE BOOT
========================================================= */

export const loadPage =
  init;

console.log(
  "CHAMA LIVE: members.js ready"
);

























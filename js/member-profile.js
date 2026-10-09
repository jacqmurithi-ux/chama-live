/* =========================================================
   CHAMA LIVE — MEMBER ACCOUNTING
   ---------------------------------------------------------
   MEMBER PORTAL

   PURPOSE
   ---------------------------------------------------------
   Read-only canonical contribution accounting.

   ACCOUNTING CHAIN
   ---------------------------------------------------------
   Obligation
        ↓
   Payment
        ↓
   Allocation
        ↓
   Arrears / Credit

   CANONICAL READ RPCs
   ---------------------------------------------------------
   • get_canonical_member_monthly_status()
   • get_member_contribution_position()

   SECURITY
   ---------------------------------------------------------
   • Authentication/context is owned by member-layout.js.
   • No member ID is accepted from the URL.
   • No direct accounting-table reads are performed.
   • No accounting rows are inserted or updated.
   • No refresh/write RPC is called.

   FEATURE BOOT
   ---------------------------------------------------------
   member-layout.js calls:

     initMemberAccounting(context)

========================================================= */

import {
  supabase
} from "./supabase.js";


/* =========================================================
   STATE
========================================================= */

const state = {

  context: null,

  currentUser: null,

  currentMember: null,

  currentGroup: null,

  groupId: null,

  memberId: null,

  accountingMonth: null,

  monthlyRows: [],

  cumulativePosition: null,

  initialized: false,

  statementMemberId: null

};


/* =========================================================
   ELEMENTS
========================================================= */

const els = {

  accountingMonth:
    document.getElementById(
      "accountingMonth"
    ),

  memberFilter:
    document.getElementById(
      "memberFilter"
    ),

  statusFilter:
    document.getElementById(
      "statusFilter"
    ),

  searchMember:
    document.getElementById(
      "searchMember"
    ),

  refreshButton:
    document.getElementById(
      "refreshButton"
    ),

  resetButton:
    document.getElementById(
      "resetButton"
    ),

  printButton:
    document.getElementById(
      "printButton"
    ),

  csvButton:
    document.getElementById(
      "csvButton"
    ),

  excelButton:
    document.getElementById(
      "excelButton"
    ),

  closeStatementButton:
    document.getElementById(
      "closeStatementButton"
    ),

  groupLabel:
    document.getElementById(
      "groupLabel"
    ),

  statusMessage:
    document.getElementById(
      "statusMessage"
    ),

  memberAccountingBody:
    document.getElementById(
      "memberAccountingBody"
    ),

  tablePeriod:
    document.getElementById(
      "tablePeriod"
    ),

  statementSection:
    document.getElementById(
      "statementSection"
    ),

  statementTitle:
    document.getElementById(
      "statementTitle"
    ),

  statementMeta:
    document.getElementById(
      "statementMeta"
    ),

  statementBody:
    document.getElementById(
      "statementBody"
    ),

  statementDue:
    document.getElementById(
      "statementDue"
    ),

  statementPaid:
    document.getElementById(
      "statementPaid"
    ),

  statementOutstanding:
    document.getElementById(
      "statementOutstanding"
    ),

  statementCredit:
    document.getElementById(
      "statementCredit"
    ),

  statMembers:
    document.getElementById(
      "statMembers"
    ),

  statDue:
    document.getElementById(
      "statDue"
    ),

  statApplied:
    document.getElementById(
      "statApplied"
    ),

  statOutstanding:
    document.getElementById(
      "statOutstanding"
    ),

  statCredit:
    document.getElementById(
      "statCredit"
    ),

  statAttention:
    document.getElementById(
      "statAttention"
    ),

  memberCumulativePosition:
    document.getElementById(
      "memberCumulativePosition"
    ),

  memberCumulativePositionContent:
    document.getElementById(
      "memberCumulativePositionContent"
    ),

  cumulativeStatus:
    document.getElementById(
      "cumulativeStatus"
    ),

  cumulativeDue:
    document.getElementById(
      "cumulativeDue"
    ),

  cumulativeAllocated:
    document.getElementById(
      "cumulativeAllocated"
    ),

  cumulativeArrears:
    document.getElementById(
      "cumulativeArrears"
    ),

  cumulativeCredit:
    document.getElementById(
      "cumulativeCredit"
    )

};


/* =========================================================
   HELPERS
========================================================= */

function firstRpcRow(data) {

  if (Array.isArray(data)) {
    return data[0] || null;
  }

  return data || null;
}


function normalizeRows(data) {

  if (Array.isArray(data)) {
    return data;
  }

  if (data) {
    return [data];
  }

  return [];
}


function displayValue(value) {

  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return "—";
  }

  return String(value);
}


function numericValue(value) {

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}


function formatMoney(value) {

  const amount =
    numericValue(value);

  return (
    "KSh " +
    amount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    )
  );
}


function formatDate(value) {

  if (!value) {
    return "—";
  }

  const raw =
    String(value);

  const date =
    new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? `${raw}T00:00:00`
        : raw
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return raw;
  }

  return date.toLocaleDateString(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );
}


function currentMonthValue() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}`;
}


function memberName(member) {

  if (!member) {
    return "Member";
  }

  return (
    member.name ||
    member.full_name ||
    member.member_name ||
    member.member_number ||
    "Member"
  );
}


function memberIdOf(member) {

  return (
    member?.id ||
    member?.member_id ||
    null
  );
}


function rowMemberId(row) {

  return (
    row?.member_id ||
    row?.id ||
    null
  );
}


function rowMemberName(row) {

  return (
    row?.member_name ||
    row?.name ||
    row?.full_name ||
    row?.member_number ||
    "Member"
  );
}


function normalizeStatus(value) {

  const raw =
    String(
      value ?? ""
    )
      .trim()
      .toUpperCase();

  if (
    raw === "ARREARS" ||
    raw === "OVERDUE" ||
    raw === "OUTSTANDING"
  ) {
    return "ARREARS";
  }

  if (
    raw === "CREDIT"
  ) {
    return "CREDIT";
  }

  return "CURRENT";
}


/* =========================================================
   UI
========================================================= */

function setStatus(message, isError = false) {

  if (!els.statusMessage) {
    return;
  }

  els.statusMessage.textContent =
    message || "";

  els.statusMessage.className =
    isError
      ? "member-accounting-message member-accounting-error"
      : "member-accounting-message member-accounting-status";
}


function setGroupLabel() {

  if (!els.groupLabel) {
    return;
  }

  const group =
    state.currentGroup;

  const name =
    group?.name ||
    group?.group_name ||
    group?.group_number ||
    group?.id ||
    "—";

  els.groupLabel.textContent =
    `Group: ${name}`;
}


function setInitialMonth() {

  if (!els.accountingMonth) {
    return;
  }

  if (!els.accountingMonth.value) {
    els.accountingMonth.value =
      currentMonthValue();
  }

  state.accountingMonth =
    els.accountingMonth.value;
}


function renderCumulativePosition(position) {

  state.cumulativePosition =
    position || null;

  if (!position) {

    if (els.cumulativeStatus) {
      els.cumulativeStatus.textContent =
        "—";
    }

    if (els.cumulativeDue) {
      els.cumulativeDue.textContent =
        "—";
    }

    if (els.cumulativeAllocated) {
      els.cumulativeAllocated.textContent =
        "—";
    }

    if (els.cumulativeArrears) {
      els.cumulativeArrears.textContent =
        "—";
    }

    if (els.cumulativeCredit) {
      els.cumulativeCredit.textContent =
        "—";
    }

    return;
  }

  if (els.cumulativeStatus) {
    els.cumulativeStatus.textContent =
      displayValue(
        position.status
      );
  }

  if (els.cumulativeDue) {
    els.cumulativeDue.textContent =
      formatMoney(
        position.total_due
      );
  }

  if (els.cumulativeAllocated) {
    els.cumulativeAllocated.textContent =
      formatMoney(
        position.total_allocated
      );
  }

  if (els.cumulativeArrears) {
    els.cumulativeArrears.textContent =
      formatMoney(
        position.arrears
      );
  }

  if (els.cumulativeCredit) {
    els.cumulativeCredit.textContent =
      formatMoney(
        position.credit
      );
  }
}


/* =========================================================
   RPC — CUMULATIVE MEMBER POSITION
========================================================= */

async function loadCumulativePosition(
  memberId = state.memberId
) {

  if (!memberId) {
    throw new Error(
      "Member context is unavailable."
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
      }
    );

  if (error) {
    throw error;
  }

  const position =
    firstRpcRow(data);

  renderCumulativePosition(
    position
  );

  return position;
}


/* =========================================================
   RPC — CANONICAL MONTHLY STATUS
========================================================= */

async function loadMonthlyStatus() {

  if (!state.groupId) {
    throw new Error(
      "Group context is unavailable."
    );
  }

  if (!state.accountingMonth) {
    setInitialMonth();
  }

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_canonical_member_monthly_status",
      {
        p_group_id:
          state.groupId,

        p_month:
          state.accountingMonth
      }
    );

  if (error) {
    throw error;
  }

  /*
   * Personal Member Portal boundary: officer roles do not grant
   * permission to browse other members' accounting here.
   * Keep only the authenticated member's own row before any
   * filter, summary, statement, export, or print can access it.
   */
  state.monthlyRows =
    normalizeRows(data).filter(
      row =>
        String(rowMemberId(row) ?? "") ===
        String(state.memberId ?? "")
    );

  if (els.memberFilter) {
    const field =
      els.memberFilter.closest(".field, .filter-group, .form-group") ||
      els.memberFilter.parentElement;
    if (field) field.hidden = true;
    els.memberFilter.innerHTML = "";
    const ownOption = document.createElement("option");
    ownOption.value = String(state.memberId);
    ownOption.textContent = "My account";
    els.memberFilter.appendChild(ownOption);
    els.memberFilter.value = String(state.memberId);
  }

  if (els.searchMember) {
    const field =
      els.searchMember.closest(".field, .filter-group, .form-group") ||
      els.searchMember.parentElement;
    if (field) field.hidden = true;
    els.searchMember.value = "";
    els.searchMember.disabled = true;
  }

  if (els.statusFilter) {
    const field =
      els.statusFilter.closest(".field, .filter-group, .form-group") ||
      els.statusFilter.parentElement;
    if (field) field.hidden = true;
    els.statusFilter.value = "";
    els.statusFilter.disabled = true;
  }

  document.querySelectorAll("[data-quick]").forEach(element => {
    const container = element.closest(".quick-filters");
    if (container) container.hidden = true;
    element.disabled = true;
  });

  return state.monthlyRows;
}


/* =========================================================
   FILTERING
========================================================= */

function filteredRows() {

  const search =
    String(
      els.searchMember?.value ||
      ""
    )
      .trim()
      .toLowerCase();

  const status =
    String(
      els.statusFilter?.value ||
      ""
    )
      .trim()
      .toUpperCase();

  // Always fixed to the signed-in member; never trust UI selection.
  const selectedMemberId =
    String(state.memberId ?? "");

  return state.monthlyRows
    .filter(row => {

      if (
        selectedMemberId &&
        String(
          rowMemberId(row)
        ) !== String(
          selectedMemberId
        )
      ) {
        return false;
      }

      if (status) {

        if (
          normalizeStatus(
            row.status
          ) !== status
        ) {
          return false;
        }

      }

      if (search) {

        const haystack =
          [
            rowMemberName(row),
            row?.member_number,
            row?.member_id
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        if (
          !haystack.includes(search)
        ) {
          return false;
        }

      }

      return true;

    });
}


/* =========================================================
   MEMBER FILTER
========================================================= */

function populateMemberFilter() {

  if (!els.memberFilter) {
    return;
  }

  const previous =
    els.memberFilter.value;

  const unique =
    new Map();

  for (
    const row of state.monthlyRows
  ) {

    const id =
      rowMemberId(row);

    if (!id) {
      continue;
    }

    if (
      !unique.has(
        String(id)
      )
    ) {

      unique.set(
        String(id),
        rowMemberName(row)
      );

    }

  }

  els.memberFilter.innerHTML =
    "";

  const ownOption =
    document.createElement(
      "option"
    );

  ownOption.value =
    state.memberId || "";

  ownOption.textContent =
    "My account";

  els.memberFilter.appendChild(
    ownOption
  );

  for (
    const [
      id,
      name
    ] of unique
  ) {

    if (
      String(id) ===
      String(state.memberId)
    ) {
      continue;
    }

    const option =
      document.createElement(
        "option"
      );

    option.value =
      id;

    option.textContent =
      name;

    els.memberFilter.appendChild(
      option
    );

  }

  if (
    previous &&
    Array.from(
      els.memberFilter.options
    ).some(
      option =>
        option.value === previous
    )
  ) {
    els.memberFilter.value =
      previous;
  }

}


/* =========================================================
   RENDER TABLE
========================================================= */

function renderMonthlyTable() {

  if (!els.memberAccountingBody) {
    return;
  }

  const rows =
    filteredRows();

  if (!rows.length) {

    els.memberAccountingBody.innerHTML =
      `
        <tr>
          <td
            colspan="11"
            class="member-accounting-empty"
          >
            No canonical accounting records
            match the selected filters.
          </td>
        </tr>
      `;

    return;
  }

  els.memberAccountingBody.innerHTML =
    rows.map(
      row => {

        const memberId =
          rowMemberId(row);

        const status =
          normalizeStatus(
            row.status
          );

        return `
          <tr data-member-id="${escapeHtml(
            memberId || ""
          )}">

            <td>
              <button
                type="button"
                class="member-statement-link"
                data-member-statement="${escapeHtml(
                  memberId || ""
                )}"
              >
                ${escapeHtml(
                  rowMemberName(row)
                )}
              </button>
            </td>

            <td>
              ${escapeHtml(
                row.period ||
                row.month ||
                state.accountingMonth ||
                "—"
              )}
            </td>

            <td>
              ${formatMoney(
                row.monthly_due
              )}
            </td>

            <td>
              ${formatMoney(
                row.previous_outstanding
              )}
            </td>

            <td>
              ${formatMoney(
                row.previous_credit
              )}
            </td>

            <td>
              ${formatMoney(
                row.current_month_payment
              )}
            </td>

            <td>
              ${formatMoney(
                row.applied_this_month
              )}
            </td>

            <td>
              ${formatMoney(
                row.carry_forward
              )}
            </td>

            <td>
              ${formatMoney(
                row.current_outstanding
              )}
            </td>

            <td>
              ${formatMoney(
                row.total_paid_to_date
              )}
            </td>

            <td>
              <span class="member-accounting-status-badge">
                ${escapeHtml(
                  status
                )}
              </span>
            </td>

          </tr>
        `;

      }
    ).join("");

}


/* =========================================================
   SUMMARY
========================================================= */

function renderSummary() {

  const rows =
    filteredRows();

  const members =
    rows.length;

  const due =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        numericValue(
          row.monthly_due
        ),
      0
    );

  const applied =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        numericValue(
          row.applied_this_month
        ),
      0
    );

  const outstanding =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        numericValue(
          row.current_outstanding
        ),
      0
    );

  const credit =
    rows.reduce(
      (
        total,
        row
      ) =>
        total +
        numericValue(
          row.previous_credit
        ),
      0
    );

  const attention =
    rows.filter(
      row =>
        normalizeStatus(
          row.status
        ) === "ARREARS"
    ).length;

  if (els.statMembers) {
    els.statMembers.textContent =
      String(members);
  }

  if (els.statDue) {
    els.statDue.textContent =
      formatMoney(due);
  }

  if (els.statApplied) {
    els.statApplied.textContent =
      formatMoney(applied);
  }

  if (els.statOutstanding) {
    els.statOutstanding.textContent =
      formatMoney(outstanding);
  }

  if (els.statCredit) {
    els.statCredit.textContent =
      formatMoney(credit);
  }

  if (els.statAttention) {
    els.statAttention.textContent =
      String(attention);
  }

}


/* =========================================================
   STATEMENT
========================================================= */

function openStatement(memberId) {

  if (
    !memberId ||
    String(memberId) !== String(state.memberId)
  ) {
    return;
  }

  const row =
    state.monthlyRows.find(
      item =>
        String(
          rowMemberId(item)
        ) === String(
          memberId
        )
    );

  if (!row) {
    return;
  }

  state.statementMemberId =
    memberId;

  if (els.statementSection) {
    els.statementSection.classList.add(
      "is-visible"
    );
  }

  if (els.statementTitle) {
    els.statementTitle.textContent =
      `${rowMemberName(row)} — Statement`;
  }

  if (els.statementMeta) {
    els.statementMeta.textContent =
      `Accounting month: ${
        row.period ||
        row.month ||
        state.accountingMonth ||
        "—"
      }`;
  }

  if (els.statementDue) {
    els.statementDue.textContent =
      formatMoney(
        row.monthly_due
      );
  }

  if (els.statementPaid) {
    els.statementPaid.textContent =
      formatMoney(
        row.current_month_payment
      );
  }

  if (els.statementOutstanding) {
    els.statementOutstanding.textContent =
      formatMoney(
        row.current_outstanding
      );
  }

  if (els.statementCredit) {
    els.statementCredit.textContent =
      formatMoney(
        row.previous_credit
      );
  }

  if (!els.statementBody) {
    return;
  }

  const statementRows = [

    [
      "Previous Outstanding",
      formatMoney(
        row.previous_outstanding
      )
    ],

    [
      "Previous Credit",
      formatMoney(
        row.previous_credit
      )
    ],

    [
      "Monthly Due",
      formatMoney(
        row.monthly_due
      )
    ],

    [
      "Current Month Payment",
      formatMoney(
        row.current_month_payment
      )
    ],

    [
      "Applied This Month",
      formatMoney(
        row.applied_this_month
      )
    ],

    [
      "Carry Forward",
      formatMoney(
        row.carry_forward
      )
    ],

    [
      "Current Outstanding",
      formatMoney(
        row.current_outstanding
      )
    ],

    [
      "Total Paid To Date",
      formatMoney(
        row.total_paid_to_date
      )
    ],

    [
      "Status",
      normalizeStatus(
        row.status
      )
    ]

  ];

  els.statementBody.innerHTML =
    statementRows
      .map(
        ([label, value]) =>
          `
            <tr>
              <td>
                ${escapeHtml(label)}
              </td>
              <td>
                ${escapeHtml(value)}
              </td>
            </tr>
          `
      )
      .join("");

}


function closeStatement() {

  state.statementMemberId =
    null;

  if (els.statementSection) {
    els.statementSection.classList.remove(
      "is-visible"
    );
  }

}


/* =========================================================
   ESCAPING
========================================================= */

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );

}


/* =========================================================
   EXPORT
========================================================= */

function exportCsv() {

  const rows =
    filteredRows();

  if (!rows.length) {
    return;
  }

  const headers = [

    "Member",
    "Period",
    "Monthly Due",
    "Previous Outstanding",
    "Previous Credit",
    "Current Month Payment",
    "Applied This Month",
    "Carry Forward",
    "Current Outstanding",
    "Total Paid To Date",
    "Status"

  ];

  const csvRows = [
    headers
  ];

  for (
    const row of rows
  ) {

    csvRows.push([

      rowMemberName(row),

      row.period ||
      row.month ||
      state.accountingMonth ||
      "",

      row.monthly_due ?? "",

      row.previous_outstanding ?? "",

      row.previous_credit ?? "",

      row.current_month_payment ?? "",

      row.applied_this_month ?? "",

      row.carry_forward ?? "",

      row.current_outstanding ?? "",

      row.total_paid_to_date ?? "",

      normalizeStatus(
        row.status
      )

    ]);

  }

  const csv =
    csvRows
      .map(
        row =>
          row
            .map(
              value =>
                `"${String(
                  value ?? ""
                ).replace(
                  /"/g,
                  '""'
                )}"`
            )
            .join(",")
      )
      .join("\r\n");

  downloadBlob(
    csv,
    `chama-live-accounting-${
      state.accountingMonth ||
      "report"
    }.csv`,
    "text/csv;charset=utf-8"
  );

}


function exportExcel() {

  /*
   * Preserve the existing Excel control without
   * introducing a new dependency.

   * CSV is the canonical browser-side export.
   * The file opens directly in Excel.
   */

  exportCsv();

}


/* =========================================================
   DOWNLOAD
========================================================= */

function downloadBlob(
  content,
  filename,
  type
) {

  const blob =
    new Blob(
      [content],
      { type }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href =
    url;

  link.download =
    filename;

  document.body.appendChild(
    link
  );

  link.click();

  link.remove();

  URL.revokeObjectURL(
    url
  );

}



/* =========================================================
   MEMBER FINE POSITION — READ ONLY
========================================================= */

async function loadFinePosition() {
  const body = document.getElementById("memberFineRows");
  const totalEl = document.getElementById("memberFineTotal");
  const outstandingEl = document.getElementById("memberFineOutstanding");
  const statusEl = document.getElementById("memberFineStatus");

  if (!body || !state.memberId || !state.groupId) return;

  try {
    const { data, error } = await supabase
      .from("fines")
      .select(
        "id,rule_id,trigger_type,accounting_month,original_amount,calculated_amount,triggered_at,source_type,fine_type,reason,imposed_at"
      )
      .eq("group_id", state.groupId)
      .eq("member_id", state.memberId)
      .order("triggered_at", { ascending: false });

    if (error) throw error;

    const fines = Array.isArray(data) ? data : [];
    const balances = new Map();

    await Promise.all(fines.map(async fine => {
      const result = await supabase.rpc("cl_fine_balance", {
        p_fine_id: fine.id
      });

      if (result.error) throw result.error;

      const row = Array.isArray(result.data)
        ? result.data[0]
        : result.data;

      if (row) balances.set(String(fine.id), row);
    }));

    const total = fines.reduce(
      (sum, fine) =>
        sum + Number(fine.original_amount ?? fine.calculated_amount ?? 0),
      0
    );

    const outstanding = fines.reduce(
      (sum, fine) =>
        sum + Number(
          balances.get(String(fine.id))?.outstanding_amount || 0
        ),
      0
    );

    if (totalEl) totalEl.textContent = formatMoney(total);
    if (outstandingEl) outstandingEl.textContent = formatMoney(outstanding);
    if (statusEl) {
      statusEl.textContent =
        outstanding > 0 ? "FINES OUTSTANDING" : "NO OUTSTANDING FINES";
      statusEl.className =
        outstanding > 0
          ? "member-fine-status outstanding"
          : "member-fine-status settled";
    }

    if (!fines.length) {
      body.innerHTML =
        '<tr><td colspan="7">No fines have been recorded against your account.</td></tr>';
      return;
    }

    body.innerHTML = fines.map(fine => {
      const balance = balances.get(String(fine.id)) || {};
      const manual =
        String(fine.source_type || "").toUpperCase() ===
        "MANUAL_MEMBER_FINE";

      return `
        <tr>
          <td>${escapeHtml(manual ? "Manual" : "Contribution")}</td>
          <td>${escapeHtml(fine.fine_type || (manual ? "Manual fine" : "Contribution fine"))}</td>
          <td>${escapeHtml(fine.reason || (manual ? "Member fine" : "Contribution-related fine"))}</td>
          <td>${escapeHtml(formatDate(fine.imposed_at || fine.triggered_at))}</td>
          <td>${escapeHtml(formatMoney(fine.calculated_amount ?? fine.original_amount))}</td>
          <td>${escapeHtml(formatMoney(balance.allocated_amount || 0))}</td>
          <td>${escapeHtml(formatMoney(balance.outstanding_amount || 0))}</td>
        </tr>
      `;
    }).join("");
  } catch (error) {
    console.warn("Member profile fine position could not be loaded:", error);
    body.innerHTML =
      '<tr><td colspan="7">Fine information could not be loaded.</td></tr>';
  }
}

/* =========================================================
   LOAD
========================================================= */

async function loadAccounting() {

  setStatus(
    "Loading canonical contribution accounting…"
  );

  if (els.memberAccountingBody) {

    els.memberAccountingBody.innerHTML =
      `
        <tr>
          <td
            colspan="11"
            class="member-accounting-empty"
          >
            Loading accounting…
          </td>
        </tr>
      `;

  }

  try {

    await Promise.all([

      loadMonthlyStatus(),

      loadCumulativePosition(),

      loadFinePosition()

    ]);

    populateMemberFilter();

    renderMonthlyTable();

    renderSummary();

    setStatus(
      `Canonical accounting loaded for ${
        state.accountingMonth
      }.`
    );

  } catch (error) {

    console.error(
      "CHAMA LIVE: Member Accounting",
      error
    );

    if (els.memberAccountingBody) {

      els.memberAccountingBody.innerHTML =
        `
          <tr>
            <td
              colspan="11"
              class="member-accounting-empty"
            >
              Unable to load canonical accounting.
            </td>
          </tr>
        `;

    }

    setStatus(
      error?.message ||
      "Unable to load canonical contribution accounting.",
      true
    );

  }

}


/* =========================================================
   RESET
========================================================= */

function resetFilters() {

  if (els.accountingMonth) {
    els.accountingMonth.value =
      currentMonthValue();
  }

  state.accountingMonth =
    els.accountingMonth?.value ||
    currentMonthValue();

  if (els.memberFilter) {
    els.memberFilter.value =
      state.memberId || "";
  }

  if (els.statusFilter) {
    els.statusFilter.value =
      "";
  }

  if (els.searchMember) {
    els.searchMember.value =
      "";
  }

  closeStatement();

  renderMonthlyTable();

  renderSummary();

}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {

  els.accountingMonth?.addEventListener(
    "change",
    async () => {

      state.accountingMonth =
        els.accountingMonth.value;

      await loadAccounting();

    }
  );


  els.memberFilter?.addEventListener(
    "change",
    () => {

      renderMonthlyTable();

      renderSummary();

    }
  );


  els.statusFilter?.addEventListener(
    "change",
    () => {

      renderMonthlyTable();

      renderSummary();

    }
  );


  els.searchMember?.addEventListener(
    "input",
    () => {

      renderMonthlyTable();

      renderSummary();

    }
  );


  els.refreshButton?.addEventListener(
    "click",
    async () => {

      await loadAccounting();

    }
  );


  els.resetButton?.addEventListener(
    "click",
    () => {

      resetFilters();

    }
  );


  els.printButton?.addEventListener(
    "click",
    () => {

      window.print();

    }
  );


  els.csvButton?.addEventListener(
    "click",
    () => {

      exportCsv();

    }
  );


  els.excelButton?.addEventListener(
    "click",
    () => {

      exportExcel();

    }
  );


  els.closeStatementButton?.addEventListener(
    "click",
    () => {

      closeStatement();

    }
  );


  els.memberAccountingBody?.addEventListener(
    "click",
    event => {

      const button =
        event.target.closest(
          "[data-member-statement]"
        );

      if (!button) {
        return;
      }

      const memberId =
        button.getAttribute(
          "data-member-statement"
        );

      if (memberId) {
        openStatement(
          memberId
        );
      }

    }
  );


  document
    .querySelectorAll(
      "[data-quick]"
    )
    .forEach(
      element => {

        element.addEventListener(
          "click",
          () => {

            const value =
              element.getAttribute(
                "data-quick"
              );

            if (
              els.statusFilter &&
              value
            ) {

              els.statusFilter.value =
                value;

              renderMonthlyTable();

              renderSummary();

            }

          }
        );

      }
    );

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initMemberAccounting(
  context
) {

  if (
    state.initialized
  ) {
    return;
  }

  state.initialized =
    true;

  state.context =
    context || null;

  state.currentUser =
    context?.user ||
    context?.currentUser ||
    null;

  state.currentMember =
    context?.member ||
    context?.currentMember ||
    null;

  state.currentGroup =
    context?.group ||
    context?.currentGroup ||
    null;

  state.groupId =
    context?.groupId ||
    state.currentGroup?.id ||
    null;

  state.memberId =
    context?.memberId ||
    state.currentMember?.id ||
    state.currentMember?.member_id ||
    null;

  if (!state.groupId) {

    setStatus(
      "Your group context could not be resolved.",
      true
    );

    return;

  }

  if (!state.memberId) {

    setStatus(
      "Your member context could not be resolved.",
      true
    );

    return;

  }

  setInitialMonth();

  setGroupLabel();

  bindEvents();

  await loadAccounting();

}


/* =========================================================
   MODULE STATUS
========================================================= */

console.log(
  "CHAMA LIVE: member-accounting.js loaded"
);

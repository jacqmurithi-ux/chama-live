/* CHAMA LIVE — Data Migration candidate.
 * NO APPLY / NO DEPLOY.
 *
 * Scope:
 *   - contributions
 *   - expenses
 *
 * Workflow:
 *   Upload → Map → Validate → Preview → Explicit Confirm → Import → Verify
 *
 * Safety:
 *   - group context comes only from authenticated session/member context
 *   - no group_id accepted from import data, URL, or localStorage
 *   - contributions use canonical cl_2b_record_contribution()
 *   - contribution allocations/obligations are never directly written
 *   - financial periods are never created automatically
 *   - closed financial periods are rejected
 */

import {
  supabase,
  getMyMember,
  getMyGroupId,
  money
} from "./auth.js";

const XLSX_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";

const FORBIDDEN = new Set([
  "id",
  "group_id",
  "recorded_by",
  "payment_id",
  "obligation_id",
  "allocation_id",
  "contribution_allocations",
  "contribution_obligations",
  "financial_period_id",
  "financial_period",
  "period_status"
]);

const DEF = {
  contribution: [
    [
      "member_identifier",
      "Member identifier",
      "member_match",
      true
    ],
    [
      "amount",
      "Amount",
      "amount_parse",
      true
    ],
    [
      "contribution_date",
      "Contribution date",
      "date_parse",
      true
    ],
    [
      "payment_method",
      "Payment method",
      "direct",
      true
    ],
    [
      "contribution_type",
      "Contribution type",
      "direct",
      false
    ],
    [
      "reference",
      "Reference",
      "direct",
      false
    ],
    [
      "mpesa_reference",
      "M-Pesa reference",
      "direct",
      false
    ],
    [
      "goal",
      "Goal",
      "direct",
      false
    ],
    [
      "notes",
      "Notes",
      "direct",
      false
    ],
    [
      "month",
      "Source month (cross-check only)",
      "direct",
      false
    ]
  ],

  expense: [
    [
      "description",
      "Description",
      "direct",
      true
    ],
    [
      "amount",
      "Amount",
      "amount_parse",
      true
    ],
    [
      "date",
      "Expense date",
      "date_parse",
      true
    ],
    [
      "category",
      "Category",
      "direct",
      false
    ],
    [
      "approval_status",
      "Approval status",
      "direct",
      false
    ],
    [
      "receipt_url",
      "Receipt/reference",
      "direct",
      false
    ]
  ]
};

const state = {
  member: null,
  groupId: null,
  fileName: "",
  sourceType: "",
  entity: "contribution",
  headers: [],
  rows: [],
  staged: [],
  batchId: null,
  mappings: {},
  results: [],
  imported: []
};

const $ = (id) => document.getElementById(id);

const clean = (v) => String(v ?? "").trim();

const esc = (v) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function msg(text, kind = "info") {
  const el = $("message");

  if (!el) return;

  el.className = `notice ${kind}`;
  el.textContent = text;
}

function step(current) {
  const order = [
    "upload",
    "mapping",
    "validate",
    "preview",
    "import",
    "verify"
  ];

  document.querySelectorAll(".step").forEach((el) => {
    const currentIndex = order.indexOf(current);
    const itemIndex = order.indexOf(el.dataset.step);

    el.classList.toggle(
      "active",
      el.dataset.step === current
    );

    el.classList.toggle(
      "done",
      itemIndex < currentIndex
    );
  });
}

function moneySafe(value) {
  if (typeof money === "function") {
    return money(value);
  }

  return `KSh ${Number(value || 0).toLocaleString(
    "en-KE",
    {
      maximumFractionDigits: 2
    }
  )}`;
}

function num(value) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  const text = clean(value);

  const number = Number(
    text.replace(/[, ]/g, "")
  );

  return text && Number.isFinite(number)
    ? number
    : null;
}

function validIso(value) {
  const d = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === value
  );
}

function date(value) {
  if (
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  ) {
    return value.toISOString().slice(0, 10);
  }

  const text = clean(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return validIso(text) ? text : null;
  }

  const match = text.match(
    /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/
  );

  if (!match) {
    return null;
  }

  const iso =
    `${match[3]}-` +
    `${match[2].padStart(2, "0")}-` +
    `${match[1].padStart(2, "0")}`;

  return validIso(iso) ? iso : null;
}

function month(value) {
  return value ? value.slice(0, 7) : null;
}

function normHeader(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function csv(text) {
  const output = [];

  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];

    if (quoted) {
      if (
        c === '"' &&
        text[i + 1] === '"'
      ) {
        field += '"';
        i += 1;
        continue;
      }

      if (c === '"') {
        quoted = false;
        continue;
      }

      field += c;
      continue;
    }

    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      output.push(row);

      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }

  row.push(field);

  if (row.some((value) => clean(value))) {
    output.push(row);
  }

  return output;
}

async function readFile(file) {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".csv")) {
    return csv(await file.text());
  }

  if (lower.endsWith(".xlsx")) {
    const XLSX = await import(XLSX_URL);

    const workbook = XLSX.read(
      await file.arrayBuffer(),
      {
        type: "array",
        cellDates: true
      }
    );

    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error(
        "Workbook has no sheet."
      );
    }

    return XLSX.utils.sheet_to_json(
      workbook.Sheets[sheetName],
      {
        header: 1,
        defval: ""
      }
    );
  }

  throw new Error(
    "Only CSV and XLSX files are supported."
  );
}

function matrixRows(matrix) {
  if (!matrix.length) {
    throw new Error("File is empty.");
  }

  const headers = matrix[0].map(
    (value, index) =>
      clean(value) || `Column ${index + 1}`
  );

  const rows = matrix
    .slice(1)
    .map((array) =>
      Object.fromEntries(
        headers.map((header, index) => [
          header,
          array[index] ?? ""
        ])
      )
    )
    .filter((row) =>
      Object.values(row).some(
        (value) => clean(value)
      )
    );

  if (!rows.length) {
    throw new Error(
      "File contains no data rows."
    );
  }

  return {
    headers,
    rows
  };
}

function autoMap() {
  const headerMap = new Map(
    state.headers.map((header) => [
      normHeader(header),
      header
    ])
  );

  const aliases = {
    member_identifier: [
      "member_identifier",
      "member_id",
      "member_number",
      "membership_number",
      "member",
      "phone",
      "email",
      "name"
    ],

    amount: [
      "amount",
      "contribution_amount",
      "expense_amount",
      "value"
    ],

    contribution_date: [
      "contribution_date",
      "payment_date",
      "transaction_date",
      "date"
    ],

    payment_method: [
      "payment_method",
      "method",
      "mode"
    ],

    contribution_type: [
      "contribution_type",
      "type"
    ],

    reference: [
      "reference",
      "ref",
      "transaction_reference"
    ],

    mpesa_reference: [
      "mpesa_reference",
      "mpesa_ref",
      "mpesa_code",
      "transaction_code"
    ],

    goal: [
      "goal",
      "goal_name"
    ],

    notes: [
      "notes",
      "note"
    ],

    month: [
      "month",
      "contribution_month"
    ],

    description: [
      "description",
      "expense_description",
      "expense",
      "item"
    ],

    date: [
      "expense_date",
      "date",
      "transaction_date"
    ],

    category: [
      "category",
      "expense_category"
    ],

    approval_status: [
      "approval_status",
      "status"
    ],

    receipt_url: [
      "receipt_url",
      "receipt_reference",
      "receipt"
    ]
  };

  for (const [field] of DEF[state.entity]) {
    const possible = aliases[field]?.find(
      (alias) => headerMap.has(alias)
    );

    if (possible) {
      state.mappings[field] =
        headerMap.get(possible);
    }
  }
}

async function context() {
  state.member = await getMyMember();
  state.groupId = await getMyGroupId();

  if (
    !state.member?.id ||
    !state.groupId
  ) {
    throw new Error(
      "Authenticated member/group context could not be resolved."
    );
  }
}

async function createBatch() {
  const {
    data,
    error
  } = await supabase
    .from("data_import_batches")
    .insert({
      group_id: state.groupId,
      source_name: state.fileName,
      source_type: state.sourceType,
      status: "uploaded",
      created_by: state.member.id,
      summary: {
        candidate: true,
        entity_type: state.entity,
        row_count: state.rows.length
      }
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  state.batchId = data.id;
}

async function stage() {
  const payload = state.rows.map(
    (raw, index) => ({
      batch_id: state.batchId,
      source_sheet: null,
      source_row_number: index + 2,
      entity_type: state.entity,
      raw_data: raw,
      status: "pending"
    })
  );

  const {
    data,
    error
  } = await supabase
    .from("data_import_rows")
    .insert(payload)
    .select(
      "id,source_row_number,raw_data,status"
    );

  if (error) {
    throw error;
  }

  state.staged = data || [];
}

async function saveMaps() {
  for (
    const [field, source]
    of Object.entries(state.mappings)
  ) {
    if (!source) {
      continue;
    }

    if (FORBIDDEN.has(field)) {
      throw new Error(
        `Forbidden mapping: ${field}`
      );
    }

    const type =
      DEF[state.entity].find(
        (item) => item[0] === field
      )?.[2] || "direct";

    const { error } = await supabase
      .from("data_import_mappings")
      .upsert(
        {
          batch_id: state.batchId,
          source_column: source,
          target_field: field,
          mapping_type: type
        },
        {
          onConflict:
            "batch_id,source_column"
        }
      );

    if (error) {
      throw error;
    }
  }
}

function val(raw, field) {
  const source =
    state.mappings[field];

  return source
    ? raw[source]
    : undefined;
}

async function members(identifier) {
  const value = clean(identifier);

  if (!value) {
    return [];
  }

  const columns = [
    "member_number",
    "membership_number",
    "phone",
    "email",
    "name"
  ];

  const matches = [];

  for (const column of columns) {
    let query = supabase
      .from("members")
      .select(
        "id,group_id,member_number,membership_number,name,phone,email,status"
      )
      .eq("group_id", state.groupId);

    query =
      column === "name"
        ? query.ilike(column, value)
        : query.eq(column, value);

    const {
      data,
      error
    } = await query.limit(10);

    if (error) {
      throw error;
    }

    matches.push(...(data || []));
  }

  return [
    ...new Map(
      matches.map((member) => [
        member.id,
        member
      ])
    ).values()
  ];
}

async function goal(value) {
  const text = clean(value);

  if (!text) {
    return {
      goalId: null,
      error: null
    };
  }

  const {
    data,
    error
  } = await supabase
    .from("contribution_goals")
    .select("id,name")
    .eq("group_id", state.groupId)
    .ilike("name", text)
    .limit(10);

  if (error) {
    throw error;
  }

  if (!data?.length) {
    return {
      goalId: null,
      error:
        "Goal could not be resolved within this group."
    };
  }

  if (data.length > 1) {
    return {
      goalId: null,
      error: "Multiple goals matched."
    };
  }

  return {
    goalId: data[0].id,
    error: null
  };
}

async function period(monthValue) {
  const {
    data,
    error
  } = await supabase
    .from("financial_periods")
    .select(
      "id,group_id,month,status"
    )
    .eq("group_id", state.groupId)
    .eq("month", monthValue)
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0] || null;
}

async function validateContribution(raw) {
  const errors = [];
  const warnings = [];

  const memberIdentifier =
    val(raw, "member_identifier");

  const amount =
    num(val(raw, "amount"));

  const contributionDate =
    date(val(raw, "contribution_date"));

  const sourceMonth =
    clean(val(raw, "month"));

  const paymentMethod =
    clean(val(raw, "payment_method"));

  const contributionType =
    clean(
      val(raw, "contribution_type")
    ) || "monthly";

  const reference =
    clean(val(raw, "reference")) || null;

  const mpesaReference =
    clean(
      val(raw, "mpesa_reference")
    ) || null;

  const notes =
    clean(val(raw, "notes")) || null;

  if (!clean(memberIdentifier)) {
    errors.push(
      "Member identifier is required."
    );
  }

  if (
    amount === null ||
    amount <= 0
  ) {
    errors.push(
      "Amount must be greater than zero."
    );
  }

  if (!contributionDate) {
    errors.push(
      "Contribution date is required and valid."
    );
  }

  if (
    ![
      "M-Pesa",
      "Cash",
      "Bank transfer"
    ].includes(paymentMethod)
  ) {
    errors.push(
      "Payment method must be M-Pesa, Cash, or Bank transfer."
    );
  }

  if (
    contributionType !== "monthly"
  ) {
    errors.push(
      "Contribution type must be monthly."
    );
  }

  if (
    sourceMonth &&
    contributionDate &&
    sourceMonth !== month(contributionDate)
  ) {
    errors.push(
      "Source month does not agree with contribution date."
    );
  }

  if (
    mpesaReference &&
    paymentMethod !== "M-Pesa"
  ) {
    errors.push(
      "M-Pesa reference is allowed only for M-Pesa."
    );
  }

  if (
    paymentMethod === "M-Pesa" &&
    reference &&
    mpesaReference &&
    reference !== mpesaReference
  ) {
    errors.push(
      "Reference and M-Pesa reference disagree."
    );
  }

  const matches =
    await members(memberIdentifier);

  if (!matches.length) {
    errors.push(
      "Member not found in current group."
    );
  }

  if (matches.length > 1) {
    errors.push(
      "Multiple member matches; import is blocked."
    );
  }

  const member = matches[0] || null;

  let goalId = null;

  if (val(raw, "goal")) {
    const goalResult =
      await goal(val(raw, "goal"));

    if (goalResult.error) {
      errors.push(goalResult.error);
    }

    goalId = goalResult.goalId;
  }

  if (contributionDate) {
    const periodRow =
      await period(
        month(contributionDate)
      );

    if (!periodRow) {
      errors.push(
        `No financial period exists for ${month(
          contributionDate
        )}; importer will not create one.`
      );
    } else if (
      String(periodRow.status).toLowerCase() ===
      "closed"
    ) {
      errors.push(
        `Closed financial period: ${month(
          contributionDate
        )}.`
      );
    }
  }

  const normalized = {
    member_id: member?.id || null,
    amount,
    contribution_date: contributionDate,
    month: month(contributionDate),
    contribution_type: contributionType,
    payment_method: paymentMethod,
    reference,
    mpesa_reference: mpesaReference,
    goal_id: goalId,
    notes
  };

  if (!reference && !mpesaReference) {
    warnings.push(
      "No payment reference supplied."
    );
  }

  return {
    normalized,
    errors,
    warnings
  };
}

async function validateExpense(raw) {
  const errors = [];
  const warnings = [];

  const description =
    clean(val(raw, "description"));

  const amount =
    num(val(raw, "amount"));

  const expenseDate =
    date(val(raw, "date"));

  const category =
    clean(val(raw, "category"));

  const approvalStatus =
    clean(
      val(raw, "approval_status")
    ) || "pending";

  const receipt =
    clean(
      val(raw, "receipt_url")
    ) || null;

  if (!description) {
    errors.push(
      "Expense description is required."
    );
  }

  if (
    amount === null ||
    amount <= 0
  ) {
    errors.push(
      "Expense amount must be greater than zero."
    );
  }

  if (!expenseDate) {
    errors.push(
      "Expense date is required and valid."
    );
  }

  if (!category) {
    errors.push(
      "Expense category is required."
    );
  }

  if (
    ![
      "pending",
      "approved",
      "rejected"
    ].includes(approvalStatus)
  ) {
    errors.push(
      "Invalid approval status."
    );
  }

  if (expenseDate) {
    const periodRow =
      await period(
        month(expenseDate)
      );

    if (!periodRow) {
      errors.push(
        `No financial period exists for ${month(
          expenseDate
        )}; importer will not create one.`
      );
    } else if (
      String(periodRow.status).toLowerCase() ===
      "closed"
    ) {
      errors.push(
        `Closed financial period: ${month(
          expenseDate
        )}.`
      );
    }
  }

  if (!receipt) {
    warnings.push(
      "Receipt/reference absent."
    );
  }

  return {
    normalized: {
      description,
      amount,
      date: expenseDate,
      category,
      approval_status: approvalStatus,
      receipt_url: receipt
    },
    errors,
    warnings
  };
}

function duplicateKey(normalized) {
  if (
    state.entity === "contribution"
  ) {
    return [
      normalized.member_id,
      normalized.amount,
      normalized.contribution_date,
      normalized.payment_method,
      normalized.reference || "",
      normalized.mpesa_reference || ""
    ]
      .join("|")
      .toLowerCase();
  }

  return [
    normalized.description,
    normalized.amount,
    normalized.date,
    normalized.category
  ]
    .join("|")
    .toLowerCase();
}

async function validate() {
  const required =
    DEF[state.entity].filter(
      (item) =>
        item[3] &&
        !state.mappings[item[0]]
    );

  if (required.length) {
    throw new Error(
      `Required mappings missing: ${required
        .map((item) => item[1])
        .join(", ")}.`
    );
  }

  await saveMaps();

  const seen = new Set();

  state.results = [];

  for (const stagedRow of state.staged) {
    let result;

    try {
      result =
        state.entity === "contribution"
          ? await validateContribution(
              stagedRow.raw_data
            )
          : await validateExpense(
              stagedRow.raw_data
            );

      const key =
        duplicateKey(result.normalized);

      if (seen.has(key)) {
        result.errors.push(
          "Duplicate row inside upload."
        );
      } else {
        seen.add(key);
      }

      result.normalized.__idempotency_key =
        crypto.randomUUID();
    } catch (error) {
      result = {
        normalized: {},
        errors: [
          error.message ||
            "Validation failed."
        ],
        warnings: []
      };
    }

    state.results.push({
      ...result,
      rowId: stagedRow.id,
      row: stagedRow.source_row_number,
      status:
        result.errors.length
          ? "error"
          : result.warnings.length
            ? "warning"
            : "valid"
    });
  }

  for (const result of state.results) {
    const { error } = await supabase
      .from("data_import_rows")
      .update({
        status: result.status,
        normalized_data:
          result.normalized,
        error_message:
          [
            ...result.errors,
            ...result.warnings
          ].join(" | ") || null
      })
      .eq("id", result.rowId)
      .eq("batch_id", state.batchId);

    if (error) {
      throw error;
    }
  }

  const errors =
    state.results.filter(
      (row) => row.status === "error"
    ).length;

  const warnings =
    state.results.filter(
      (row) => row.status === "warning"
    ).length;

  const total =
    state.results.reduce(
      (sum, row) =>
        sum +
        (Number(
          row.normalized.amount
        ) || 0),
      0
    );

  const {
    error: batchError
  } = await supabase
    .from("data_import_batches")
    .update({
      status:
        errors
          ? "validating"
          : "ready",

      summary: {
        candidate: true,
        entity_type: state.entity,
        total_rows:
          state.results.length,
        valid_rows:
          state.results.length -
          errors -
          warnings,
        warning_rows: warnings,
        error_rows: errors,
        total_amount: total,
        ready_to_import:
          errors
            ? 0
            : state.results.length
      }
    })
    .eq("id", state.batchId)
    .eq("group_id", state.groupId);

  if (batchError) {
    throw batchError;
  }

  render();

  step("preview");

  msg(
    errors
      ? `Validation blocked import: ${errors} fatal row(s). No import should proceed.`
      : `Validation passed: ${state.results.length} row(s) ready for review.`,
    errors ? "error" : "success"
  );
}

function render() {
  const errors =
    state.results.filter(
      (row) => row.status === "error"
    ).length;

  const warnings =
    state.results.filter(
      (row) => row.status === "warning"
    ).length;

  const valid =
    state.results.length -
    errors -
    warnings;

  const total =
    state.results.reduce(
      (sum, row) =>
        sum +
        (Number(
          row.normalized.amount
        ) || 0),
      0
    );

  $("stats").innerHTML = [
    ["Rows", state.results.length],
    ["Valid", valid],
    ["Warnings", warnings],
    ["Errors", errors],
    [
      "Duplicates",
      state.results.filter(
        (row) =>
          row.errors.some((message) =>
            /duplicate/i.test(message)
          ) ||
          row.warnings.some((message) =>
            /duplicate/i.test(message)
          )
      ).length
    ],
    ["Amount", moneySafe(total)]
  ]
    .map(
      ([label, value]) =>
        `<div class="stat">
          <span class="muted">${esc(label)}</span>
          <b>${esc(value)}</b>
        </div>`
    )
    .join("");

  $("validationMessage").innerHTML =
    errors
      ? `<div class="notice error">
          Import is blocked until every fatal validation error is resolved.
        </div>`
      : `<div class="notice success">
          No fatal validation errors remain.
          Review every row and the confirmation statement.
        </div>`;

  $("preview").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Source row</th>
          <th>Status</th>
          <th>Normalized data</th>
          <th>Messages</th>
        </tr>
      </thead>

      <tbody>
        ${state.results
          .map(
            (row) => `
              <tr>
                <td>${row.row}</td>

                <td>
                  <span class="pill ${row.status}">
                    ${esc(row.status)}
                  </span>
                </td>

                <td class="mono">
                  ${esc(
                    JSON.stringify(
                      row.normalized
                    )
                  )}
                </td>

                <td>
                  ${esc(
                    [
                      ...row.errors,
                      ...row.warnings
                    ].join(" | ") || "—"
                  )}
                </td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;

  $("confirm").disabled =
    errors > 0 ||
    !state.results.length;

  $("confirmSummary").textContent =
    `Confirming ${state.results.length} ${
      state.entity
    } row(s), total ${moneySafe(
      total
    )}. No closed-period row will import; no financial period will be created.`;
}

async function importContribution(result) {
  const normalized =
    result.normalized;

  /*
   * IMPORTANT:
   * This deliberately calls the exact hardened
   * 11-parameter overload:
   *
   * cl_2b_record_contribution(
   *   uuid,
   *   uuid,
   *   uuid,
   *   numeric,
   *   date,
   *   text,
   *   text,
   *   text,
   *   text,
   *   uuid,
   *   text
   * )
   */

  const {
    data,
    error
  } = await supabase.rpc(
    "cl_2b_record_contribution",
    {
      p_payment_id:
        normalized.__idempotency_key,

      p_group_id:
        state.groupId,

      p_member_id:
        normalized.member_id,

      p_amount:
        normalized.amount,

      p_contribution_date:
        normalized.contribution_date,

      p_contribution_type:
        normalized.contribution_type,

      p_payment_method:
        normalized.payment_method,

      p_reference:
        normalized.reference,

      p_mpesa_reference:
        normalized.mpesa_reference,

      p_goal_id:
        normalized.goal_id,

      p_notes:
        normalized.notes
    }
  );

  if (error) {
    throw error;
  }

  return data;
}

async function importExpense(result) {
  const normalized =
    result.normalized;

  /*
   * Do not supply group_id from imported data.
   * Do not supply recorded_by from imported data.
   *
   * Both are derived from authenticated context.
   * Existing database triggers remain active.
   */

  const {
    data,
    error
  } = await supabase
    .from("expenses")
    .insert({
      group_id:
        state.groupId,

      description:
        normalized.description,

      amount:
        normalized.amount,

      date:
        normalized.date,

      category:
        normalized.category,

      approval_status:
        normalized.approval_status,

      receipt_url:
        normalized.receipt_url,

      recorded_by:
        state.member.id
    })
    .select(
      "id,group_id,amount,date,category,approval_status"
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function runImport() {
  if (
    state.results.some(
      (row) => row.status === "error"
    )
  ) {
    throw new Error(
      "Fatal validation errors remain."
    );
  }

  const start =
    new Date().toISOString();

  const {
    error: batchError
  } = await supabase
    .from("data_import_batches")
    .update({
      status: "importing",
      started_at: start
    })
    .eq("id", state.batchId)
    .eq("group_id", state.groupId);

  if (batchError) {
    throw batchError;
  }

  state.imported = [];

  try {
    for (const result of state.results) {
      const imported =
        state.entity === "contribution"
          ? await importContribution(
              result
            )
          : await importExpense(
              result
            );

      state.imported.push({
        result,
        imported
      });

      const targetId =
        state.entity === "expense"
          ? imported.id
          : (
              imported?.payment_id ||
              imported?.id ||
              result.normalized
                .__idempotency_key
            );

      const {
        error
      } = await supabase
        .from("data_import_rows")
        .update({
          status: "imported",
          target_id: targetId,
          error_message: null
        })
        .eq("id", result.rowId)
        .eq(
          "batch_id",
          state.batchId
        );

      if (error) {
        throw error;
      }
    }

    const {
      error: completeError
    } = await supabase
      .from("data_import_batches")
      .update({
        status: "completed",
        completed_at:
          new Date().toISOString(),

        summary: {
          candidate: true,
          entity_type: state.entity,
          total_rows:
            state.imported.length,
          imported_rows:
            state.imported.length,
          total_amount:
            state.imported.reduce(
              (sum, item) =>
                sum +
                (
                  Number(
                    item.result.normalized
                      .amount
                  ) || 0
                ),
              0
            )
        }
      })
      .eq("id", state.batchId)
      .eq(
        "group_id",
        state.groupId
      );

    if (completeError) {
      throw completeError;
    }

    await verify();
  } catch (error) {
    /*
     * IMPORTANT:
     * The browser executes rows individually.
     * Therefore this is NOT a whole-batch database
     * transaction.
     *
     * If an unexpected runtime error happens after
     * previous rows have committed, those rows remain
     * committed and the batch becomes failed.
     *
     * Validation is therefore intentionally strict
     * before import.
     */

    await supabase
      .from("data_import_batches")
      .update({
        status: "failed",
        completed_at:
          new Date().toISOString()
      })
      .eq("id", state.batchId)
      .eq(
        "group_id",
        state.groupId
      );

    throw error;
  }
}

async function verify() {
  const checks = [];

  for (const item of state.imported) {
    const normalized =
      item.result.normalized;

    let query;

    if (
      state.entity === "expense"
    ) {
      query = supabase
        .from("expenses")
        .select(
          "id,group_id,amount,date,category,approval_status"
        )
        .eq(
          "id",
          item.imported.id
        )
        .eq(
          "group_id",
          state.groupId
        )
        .limit(1);
    } else {
      query = supabase
        .from("contributions")
        .select(
          "id,group_id,member_id,amount,contribution_date,contribution_type,payment_method"
        )
        .eq(
          "id",
          item.imported?.payment_id ||
            item.imported?.id ||
            normalized
              .__idempotency_key
        )
        .eq(
          "group_id",
          state.groupId
        )
        .limit(1);
    }

    const {
      data,
      error
    } = await query;

    checks.push({
      row:
        item.result.row,

      ok:
        !error &&
        !!data?.length,

      detail:
        error?.message ||
        (
          data?.length
            ? "Verified in current group."
            : "Target record not found."
        )
    });
  }

  const failed =
    checks.filter(
      (check) => !check.ok
    ).length;

  $("verifyCard")
    .classList
    .remove("hidden");

  $("verifyResult").innerHTML = `
    <div class="notice ${
      failed
        ? "error"
        : "success"
    }">
      ${
        failed
          ? `${failed} verification check(s) failed.`
          : `All ${checks.length} imported row(s) verified in the current group.`
      }
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Source row</th>
            <th>Verified</th>
            <th>Detail</th>
          </tr>
        </thead>

        <tbody>
          ${checks
            .map(
              (check) => `
                <tr>
                  <td>${check.row}</td>
                  <td>
                    ${
                      check.ok
                        ? "YES"
                        : "NO"
                    }
                  </td>
                  <td>
                    ${esc(check.detail)}
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;

  step("verify");

  msg(
    failed
      ? "Import finished but verification failed; do not treat the batch as reconciled."
      : "Import and verification completed successfully.",
    failed
      ? "error"
      : "success"
  );
}

function renderMapping() {
  $("mapping").innerHTML =
    DEF[state.entity]
      .map(
        ([
          field,
          label,
          mappingType,
          required
        ]) => `
          <div>
            <label>
              ${esc(label)}
              ${required ? "*" : ""}
            </label>

            <select
              data-field="${esc(field)}"
            >
              <option value="">
                — Not mapped —
              </option>

              ${state.headers
                .map(
                  (header) => `
                    <option
                      value="${esc(header)}"
                      ${
                        state.mappings[
                          field
                        ] === header
                          ? "selected"
                          : ""
                      }
                    >
                      ${esc(header)}
                    </option>
                  `
                )
                .join("")}
            </select>

            <p class="note">
              ${esc(mappingType)}
            </p>
          </div>
        `
      )
      .join("");
}

function bind() {
  $("entity").addEventListener(
    "change",
    (event) => {
      state.entity =
        event.target.value;

      state.mappings = {};
    }
  );

  $("file").addEventListener(
    "change",
    (event) => {
      const file =
        event.target.files?.[0];

      $("fileInfo").textContent =
        file
          ? `${file.name} — ${file.size.toLocaleString()} bytes`
          : "";
    }
  );

  $("stage").addEventListener(
    "click",
    async () => {
      try {
        const file =
          $("file").files?.[0];

        if (!file) {
          throw new Error(
            "Select a CSV or XLSX file first."
          );
        }

        state.fileName =
          file.name;

        state.sourceType =
          file.name
            .toLowerCase()
            .endsWith(".xlsx")
            ? "xlsx"
            : "csv";

        const parsed =
          matrixRows(
            await readFile(file)
          );

        state.headers =
          parsed.headers;

        state.rows =
          parsed.rows;

        autoMap();

        await createBatch();
        await stage();
        await saveMaps();

        $("mappingCard")
          .classList
          .remove("hidden");

        renderMapping();

        step("mapping");

        msg(
          `Staged ${state.rows.length} row(s). No target financial record has been imported.`,
          "success"
        );
      } catch (error) {
        console.error(error);

        msg(
          error.message ||
            "Unable to stage file.",
          "error"
        );
      }
    }
  );

  $("mapping").addEventListener(
    "change",
    (event) => {
      const field =
        event.target.dataset.field;

      if (!field) {
        return;
      }

      state.mappings[field] =
        event.target.value ||
        null;
    }
  );

  $("validate").addEventListener(
    "click",
    async () => {
      try {
        await validate();

        $("validationCard")
          .classList
          .remove("hidden");
      } catch (error) {
        console.error(error);

        msg(
          error.message ||
            "Validation failed.",
          "error"
        );
      }
    }
  );

  $("confirm").addEventListener(
    "click",
    () => {
      $("confirmCard")
        .classList
        .remove("hidden");

      $("check").checked = false;
      $("import").disabled = true;

      step("import");
    }
  );

  $("check").addEventListener(
    "change",
    (event) => {
      $("import").disabled =
        !event.target.checked;
    }
  );

  $("import").addEventListener(
    "click",
    async () => {
      try {
        if (!$("check").checked) {
          return;
        }

        await runImport();
      } catch (error) {
        console.error(error);

        msg(
          error.message ||
            "Import failed.",
          "error"
        );
      }
    }
  );
}

(async () => {
  try {
    bind();

    await context();

    msg(
      "Authenticated group context resolved. Candidate is limited to contributions and expenses.",
      "success"
    );
  } catch (error) {
    console.error(error);

    $("stage").disabled = true;

    msg(
      error.message ||
        "Authentication/group context failed.",
      "error"
    );
  }
})();

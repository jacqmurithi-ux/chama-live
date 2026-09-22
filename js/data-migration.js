/* =========================================================
 * CHAMA LIVE — Controlled Data Migration
 *
 * Scope:
 *   - Contributions
 *   - Expenses
 *   - Members — Preview Only
 *
 * Safety boundaries:
 *   - Group context comes only from authenticated member context.
 *   - group_id is never accepted from the migration file.
 *   - Contributions are recorded only through the canonical
 *     cl_2b_record_contribution RPC.
 *   - contribution_allocations are never written directly.
 *   - contribution_obligations are never written directly.
 *   - financial_periods are never created.
 *   - Closed financial periods are blocked.
 *   - No service-role key is used.
 *
 * Member safety:
 *   - Member rows may be staged, mapped, validated and previewed.
 *   - public.members is never inserted or updated by this workflow.
 *   - Existing members are never modified.
 *   - Member authentication identity is never created or changed.
 *   - Member role, status and onboarding status are never changed.
 *
 * Recovery:
 *   - Stable contribution payment UUIDs.
 *   - Stable expense primary-key UUIDs.
 *   - Persistent data_import_rows state.
 *   - Persistent batch state.
 *   - Duplicate/idempotency verification.
 *
 * Important:
 *   Browser processing is NOT one PostgreSQL transaction.
 *   Recovery is therefore persisted-state/idempotency based.
 * ========================================================= */

import {
  supabase,
  getMyMember,
  getMyGroupId,
  money
} from "./auth.js";

const XLSX_URL =
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";

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
  "period_status",
  "auth_user_id",
  "user_id"
]);

const DEF = {
  contribution: [
    ["member_identifier", "Member identifier", "member_match", true],
    ["amount", "Amount", "amount_parse", true],
    ["contribution_date", "Contribution date", "date_parse", true],
    ["payment_method", "Payment method", "direct", true],
    ["contribution_type", "Contribution type", "direct", false],
    ["reference", "Reference", "direct", false],
    ["mpesa_reference", "M-Pesa reference", "direct", false],
    ["goal", "Goal", "direct", false],
    ["notes", "Notes", "direct", false],
    ["month", "Source month (cross-check only)", "direct", false]
  ],

  expense: [
    ["description", "Description", "direct", true],
    ["amount", "Amount", "amount_parse", true],
    ["date", "Expense date", "date_parse", true],
    ["category", "Category", "direct", false],
    ["approval_status", "Approval status", "direct", false],
    ["receipt_url", "Receipt/reference", "direct", false]
  ],

  member: [
    ["member_number", "Member number", "direct", true],
    ["membership_number", "Membership number", "direct", false],
    ["name", "Name", "direct", true],
    ["phone", "Phone", "direct", true],
    ["email", "Email", "direct", false],
    ["role", "Role", "direct", false],
    ["status", "Status", "direct", true],
    ["onboarding_status", "Onboarding status", "direct", false]
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
  imported: [],

  importStartedAt: null,
  importing: false,

  recoveryBatches: [],
  recoveryMode: false
};

const $ = (id) =>
  document.getElementById(id);

const clean = (value) =>
  String(value ?? "").trim();

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function msg(text, kind = "info") {
  const element = $("message");

  if (!element) {
    return;
  }

  element.className = `notice ${kind}`;
  element.textContent = text;
}

function step(currentStep) {
  const order = [
    "upload",
    "mapping",
    "validate",
    "preview",
    "import",
    "verify"
  ];

  document
    .querySelectorAll(".step")
    .forEach((element) => {
      const index =
        order.indexOf(element.dataset.step);

      const currentIndex =
        order.indexOf(currentStep);

      element.classList.toggle(
        "active",
        element.dataset.step === currentStep
      );

      element.classList.toggle(
        "done",
        index !== -1 &&
        currentIndex !== -1 &&
        index < currentIndex
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

  const cleaned = clean(value);

  if (!cleaned) {
    return null;
  }

  const parsed = Number(
    cleaned.replace(/[, ]/g, "")
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function validIso(value) {
  const dateValue =
    new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(dateValue.getTime()) &&
    dateValue.toISOString().slice(0, 10) === value
  );
}

function date(value) {
  if (
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  ) {
    return value.toISOString().slice(0, 10);
  }

  const stringValue = clean(value);

  if (!stringValue) {
    return null;
  }

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(stringValue)
  ) {
    return validIso(stringValue)
      ? stringValue
      : null;
  }

  const match = stringValue.match(
    /^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/
  );

  if (!match) {
    return null;
  }

  const iso =
    `${match[3]}-` +
    `${match[2].padStart(2, "0")}-` +
    `${match[1].padStart(2, "0")}`;

  return validIso(iso)
    ? iso
    : null;
}

function month(value) {
  return value
    ? value.slice(0, 7)
    : null;
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

  for (
    let i = 0;
    i < text.length;
    i += 1
  ) {
    const character = text[i];

    if (quoted) {
      if (
        character === '"' &&
        text[i + 1] === '"'
      ) {
        field += '"';
        i += 1;
        continue;
      }

      if (character === '"') {
        quoted = false;
        continue;
      }

      field += character;
      continue;
    }

    if (character === '"') {
      quoted = true;
      continue;
    }

    if (character === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (character === "\n") {
      row.push(field);
      output.push(row);
      row = [];
      field = "";
      continue;
    }

    if (character !== "\r") {
      field += character;
    }
  }

  row.push(field);

  if (
    row.some((value) => clean(value))
  ) {
    output.push(row);
  }

  return output;
}

async function readFile(file) {
  const fileName =
    file.name.toLowerCase();

  if (fileName.endsWith(".csv")) {
    return csv(await file.text());
  }

  if (fileName.endsWith(".xlsx")) {
    const XLSX =
      await import(XLSX_URL);

    const workbook =
      XLSX.read(
        await file.arrayBuffer(),
        {
          type: "array",
          cellDates: true
        }
      );

    const sheetName =
      workbook.SheetNames[0];

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

  const headers =
    matrix[0].map(
      (value, index) =>
        clean(value) ||
        `Column ${index + 1}`
    );

  const normalizedHeaders =
    headers.map(normHeader);

  const duplicates =
    normalizedHeaders.filter(
      (header, index) =>
        normalizedHeaders.indexOf(header) !== index
    );

  if (duplicates.length) {
    throw new Error(
      "The file contains duplicate column headers after normalization. Rename the duplicate columns and upload again."
    );
  }

  const rows =
    matrix
      .slice(1)
      .map((array) =>
        Object.fromEntries(
          headers.map(
            (header, index) => [
              header,
              array[index] ?? ""
            ]
          )
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
  const aliases = {
    member_identifier: [
      "member_identifier",
      "member_number",
      "membership_number",
      "member_id",
      "phone",
      "phone_number",
      "mobile",
      "mobile_number",
      "name",
      "member_name",
      "full_name"
    ],

    amount: [
      "amount",
      "contribution_amount",
      "expense_amount",
      "value",
      "total"
    ],

    contribution_date: [
      "contribution_date",
      "date",
      "payment_date",
      "transaction_date"
    ],

    payment_method: [
      "payment_method",
      "method",
      "payment"
    ],

    contribution_type: [
      "contribution_type",
      "type",
      "contribution"
    ],

    reference: [
      "reference",
      "transaction_reference",
      "transaction_id",
      "ref"
    ],

    mpesa_reference: [
      "mpesa_reference",
      "mpesa_code",
      "mpesa_receipt",
      "receipt_number"
    ],

    goal: [
      "goal",
      "goal_name",
      "contribution_goal"
    ],

    notes: [
      "notes",
      "note",
      "remarks",
      "description_notes"
    ],

    month: [
      "month",
      "source_month",
      "contribution_month"
    ],

    description: [
      "description",
      "expense_description",
      "details",
      "item"
    ],

    date: [
      "date",
      "expense_date",
      "transaction_date"
    ],

    category: [
      "category",
      "expense_category"
    ],

    approval_status: [
      "approval_status",
      "approval",
      "status"
    ],

    receipt_url: [
      "receipt_url",
      "receipt",
      "receipt_reference",
      "attachment"
    ],

    member_number: [
      "member_number",
      "member_no",
      "member_number_id"
    ],

    membership_number: [
      "membership_number",
      "membership_no"
    ],

    name: [
      "name",
      "member_name",
      "full_name"
    ],

    phone: [
      "phone",
      "phone_number",
      "mobile",
      "mobile_number"
    ],

    email: [
      "email",
      "email_address"
    ],

    role: [
      "role",
      "member_role"
    ],

    status: [
      "status",
      "member_status"
    ],

    onboarding_status: [
      "onboarding_status",
      "onboarding",
      "account_status"
    ]
  };

  const available = new Map(
    state.headers.map((header) => [
      normHeader(header),
      header
    ])
  );

  const mapping = {};

  (DEF[state.entity] || []).forEach(
    ([field]) => {
      const choices =
        aliases[field] || [field];

      const match =
        choices
          .map(normHeader)
          .map((alias) =>
            available.get(alias)
          )
          .find(Boolean);

      if (match) {
        mapping[field] = match;
      }
    }
  );

  state.mappings = mapping;

  return mapping;
}

async function context() {
  const member =
    await getMyMember();

  if (!member?.id) {
    throw new Error(
      "Authenticated member context could not be resolved."
    );
  }

  const groupId =
    member.group_id ||
    await getMyGroupId();

  if (!groupId) {
    throw new Error(
      "Authenticated group context could not be resolved."
    );
  }

  state.member = member;
  state.groupId = groupId;

  return {
    member,
    groupId
  };
}

async function createBatch() {
  const payload = {
    group_id: state.groupId,
    entity_type: state.entity,
    source_file_name: state.fileName,
    source_type: state.sourceType,
    status: "staged",
    created_by: state.member.id
  };

  const {
    data,
    error
  } = await supabase
    .from("data_import_batches")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  state.batchId = data.id;

  return data.id;
}

async function stage() {
  if (!state.batchId) {
    throw new Error(
      "Import batch has not been created."
    );
  }

  const payload = state.staged.map(
    (row) => ({
      batch_id: state.batchId,
      source_row_number:
        row.source_row_number,
      source_data: row.source_data,
      normalized_data:
        row.normalized_data || null,
      validation_status:
        row.validation_status || "pending",
      validation_errors:
        row.validation_errors || [],
      validation_warnings:
        row.validation_warnings || [],
      imported: false
    })
  );

  if (!payload.length) {
    throw new Error(
      "There are no rows to stage."
    );
  }

  const chunkSize = 250;

  for (
    let index = 0;
    index < payload.length;
    index += chunkSize
  ) {
    const chunk =
      payload.slice(
        index,
        index + chunkSize
      );

    const {
      error
    } = await supabase
      .from("data_import_rows")
      .insert(chunk);

    if (error) {
      throw error;
    }
  }
}

async function saveMaps() {
  if (!state.batchId) {
    throw new Error(
      "Import batch has not been created."
    );
  }

  const rows =
    Object.entries(state.mappings)
      .filter(
        ([, sourceColumn]) =>
          clean(sourceColumn)
      )
      .map(
        ([targetField, sourceColumn]) => ({
          batch_id: state.batchId,
          target_field: targetField,
          source_column: sourceColumn
        })
      );

  if (!rows.length) {
    return;
  }

  const {
    error
  } = await supabase
    .from("data_import_mappings")
    .upsert(
      rows,
      {
        onConflict:
          "batch_id,target_field"
      }
    );

  if (error) {
    throw error;
  }
}

function val(raw, field) {
  const sourceColumn =
    state.mappings[field];

  if (!sourceColumn) {
    return "";
  }

  return clean(
    raw[sourceColumn]
  );
}

async function members(identifier) {
  const value = clean(identifier);

  if (!value) {
    return null;
  }

  if (!state.groupId) {
    throw new Error(
      "Group context is required before member lookup."
    );
  }

  const select =
    "id,group_id,member_number,membership_number,name,phone,email,status";

  const attempts = [
    ["member_number", value],
    ["membership_number", value],
    ["phone", value]
  ];

  for (const [
    column,
    candidate
  ] of attempts) {
    const {
      data,
      error
    } = await supabase
      .from("members")
      .select(select)
      .eq("group_id", state.groupId)
      .eq(column, candidate)
      .limit(10);

    if (error) {
      throw error;
    }

    if (data?.length === 1) {
      return data[0];
    }

    if (data?.length > 1) {
      throw new Error(
        `Member lookup returned multiple records for ${column}.`
      );
    }
  }

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select(select)
    .eq("group_id", state.groupId)
    .ilike("name", value)
    .limit(10);

  if (error) {
    throw error;
  }

  if (data?.length === 1) {
    return data[0];
  }

  if (data?.length > 1) {
    throw new Error(
      "Member name lookup returned multiple records."
    );
  }

  return null;
}

async function findExistingMember({
  memberNumber,
  membershipNumber,
  phone,
  email,
  name
}) {
  if (!state.groupId) {
    throw new Error(
      "Group context is required before member lookup."
    );
  }

  const select =
    "id,group_id,member_number,membership_number,name,phone,email,role,status,onboarding_status";

  const candidates = [];

  const addQuery = (
    column,
    value,
    ilike = false
  ) => {
    const cleaned =
      clean(value);

    if (!cleaned) {
      return;
    }

    candidates.push({
      column,
      value: cleaned,
      ilike
    });
  };

  addQuery(
    "member_number",
    memberNumber
  );

  addQuery(
    "membership_number",
    membershipNumber
  );

  addQuery(
    "phone",
    phone
  );

  addQuery(
    "email",
    email
  );

  addQuery(
    "name",
    name,
    true
  );

  const found = new Map();

  for (const candidate of candidates) {
    let query =
      supabase
        .from("members")
        .select(select)
        .eq(
          "group_id",
          state.groupId
        );

    query = candidate.ilike
      ? query.ilike(
          candidate.column,
          candidate.value
        )
      : query.eq(
          candidate.column,
          candidate.value
        );

    const {
      data,
      error
    } = await query.limit(10);

    if (error) {
      throw error;
    }

    (data || []).forEach(
      (member) => {
        if (member?.id) {
          found.set(
            member.id,
            member
          );
        }
      }
    );
  }

  return Array.from(
    found.values()
  );
}

async function goal(value) {
  const name = clean(value);

  if (!name) {
    return null;
  }

  const {
    data,
    error
  } = await supabase
    .from("contribution_goals")
    .select("id,goal_name")
    .eq("group_id", state.groupId)
    .ilike("goal_name", name)
    .limit(10);

  if (error) {
    throw error;
  }

  if (!data?.length) {
    return null;
  }

  if (data.length > 1) {
    throw new Error(
      `Multiple contribution goals matched "${name}".`
    );
  }

  return data[0];
}

async function period(value) {
  const sourceMonth =
    clean(value);

  if (!sourceMonth) {
    return null;
  }

  const normalized =
    /^\d{4}-\d{2}$/.test(sourceMonth)
      ? sourceMonth
      : month(
          date(sourceMonth)
        );

  if (!normalized) {
    return null;
  }

  const {
    data,
    error
  } = await supabase
    .from("financial_periods")
    .select("*")
    .eq("group_id", state.groupId)
    .eq(
      "period_start",
      `${normalized}-01`
    )
    .limit(10);

  if (error) {
    throw error;
  }

  if (!data?.length) {
    return null;
  }

  if (data.length > 1) {
    throw new Error(
      `Multiple financial periods matched ${normalized}.`
    );
  }

  return data[0];
}
/* =========================================================
 * Validation
 * ========================================================= */

async function validateContribution(raw) {
  const errors = [];
  const warnings = [];

  const memberIdentifier =
    val(raw, "member_identifier");

  const amount =
    num(val(raw, "amount"));

  const contributionDate =
    date(val(raw, "contribution_date"));

  const paymentMethod =
    val(raw, "payment_method");

  const contributionType =
    val(raw, "contribution_type");

  const reference =
    val(raw, "reference");

  const mpesaReference =
    val(raw, "mpesa_reference");

  const goalName =
    val(raw, "goal");

  const notes =
    val(raw, "notes");

  const sourceMonth =
    val(raw, "month");

  if (!memberIdentifier) {
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
      "A valid contribution date is required."
    );
  }

  if (!paymentMethod) {
    errors.push(
      "Payment method is required."
    );
  }

  let member = null;

  if (memberIdentifier) {
    member =
      await members(
        memberIdentifier
      );

    if (!member) {
      errors.push(
        `No member matched "${memberIdentifier}".`
      );
    }
  }

  let goalRecord = null;

  if (goalName) {
    goalRecord =
      await goal(goalName);

    if (!goalRecord) {
      errors.push(
        `Contribution goal "${goalName}" was not found.`
      );
    }
  }

  let financialPeriod = null;

  if (sourceMonth) {
    financialPeriod =
      await period(sourceMonth);

    if (!financialPeriod) {
      warnings.push(
        `Source month ${sourceMonth} could not be matched to a financial period.`
      );
    }
  }

  if (
    sourceMonth &&
    contributionDate &&
    !sourceMonth.startsWith(
      month(contributionDate)
    )
  ) {
    warnings.push(
      "Source month does not match the contribution date month."
    );
  }

  const normalized = {
    member_id:
      member?.id || null,

    member_number:
      member?.member_number || null,

    amount,

    contribution_date:
      contributionDate,

    payment_method:
      paymentMethod,

    contribution_type:
      contributionType || null,

    reference:
      reference || null,

    mpesa_reference:
      mpesaReference || null,

    goal_id:
      goalRecord?.id || null,

    goal_name:
      goalRecord?.goal_name || null,

    notes:
      notes || null,

    source_month:
      sourceMonth || null,

    financial_period_id:
      financialPeriod?.id || null
  };

  return {
    normalized,
    errors,
    warnings,
    ok: errors.length === 0
  };
}

async function validateExpense(raw) {
  const errors = [];
  const warnings = [];

  const description =
    val(raw, "description");

  const amount =
    num(val(raw, "amount"));

  const expenseDate =
    date(val(raw, "date"));

  const category =
    val(raw, "category");

  const approvalStatus =
    val(raw, "approval_status");

  const receiptUrl =
    val(raw, "receipt_url");

  if (!description) {
    errors.push(
      "Description is required."
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

  if (!expenseDate) {
    errors.push(
      "A valid expense date is required."
    );
  }

  if (
    approvalStatus &&
    ![
      "pending",
      "approved",
      "rejected"
    ].includes(
      approvalStatus.toLowerCase()
    )
  ) {
    errors.push(
      "Approval status must be pending, approved or rejected."
    );
  }

  if (!category) {
    warnings.push(
      "Expense category is missing."
    );
  }

  const normalized = {
    description:
      description || null,

    amount,

    date:
      expenseDate,

    category:
      category || null,

    approval_status:
      approvalStatus
        ? approvalStatus.toLowerCase()
        : null,

    receipt_url:
      receiptUrl || null
  };

  return {
    normalized,
    errors,
    warnings,
    ok: errors.length === 0
  };
}

async function validateMember(raw) {
  const errors = [];
  const warnings = [];

  const memberNumber =
    val(raw, "member_number");

  const membershipNumber =
    val(raw, "membership_number");

  const name =
    val(raw, "name");

  const phone =
    val(raw, "phone");

  const email =
    val(raw, "email");

  const role =
    val(raw, "role");

  const status =
    val(raw, "status");

  const onboardingStatus =
    val(raw, "onboarding_status");

  if (!memberNumber) {
    errors.push(
      "Member number is required."
    );
  }

  if (!name) {
    errors.push(
      "Member name is required."
    );
  }

  if (!phone) {
    errors.push(
      "Member phone is required."
    );
  }

  if (!status) {
    errors.push(
      "Member status is required."
    );
  }

  if (
    membershipNumber &&
    !/^\d{4}$/.test(
      membershipNumber
    )
  ) {
    errors.push(
      "Membership number must contain exactly four digits."
    );
  }

  const normalizedStatus =
    status.toLowerCase();

  if (
    status &&
    ![
      "active",
      "inactive"
    ].includes(
      normalizedStatus
    )
  ) {
    errors.push(
      "Member status must be active or inactive."
    );
  }

  const normalizedRole =
    role
      ? role.toLowerCase()
      : null;

  if (
    normalizedRole &&
    ![
      "chairperson",
      "admin",
      "treasurer",
      "secretary",
      "member"
    ].includes(
      normalizedRole
    )
  ) {
    errors.push(
      "Member role must be chairperson, admin, treasurer, secretary or member."
    );
  }

  const normalizedOnboardingStatus =
    onboardingStatus
      ? onboardingStatus.toLowerCase()
      : null;

  if (
    normalizedOnboardingStatus &&
    ![
      "pending",
      "invited",
      "active",
      "suspended"
    ].includes(
      normalizedOnboardingStatus
    )
  ) {
    errors.push(
      "Onboarding status must be pending, invited, active or suspended."
    );
  }

  if (!role) {
    warnings.push(
      "Member role is missing. Preview will preserve it as null; no role will be inferred."
    );
  }

  if (!onboardingStatus) {
    warnings.push(
      "Onboarding status is missing. Preview will preserve it as null; no onboarding state will be inferred."
    );
  }

  let existing = [];

  if (
    memberNumber ||
    membershipNumber ||
    phone ||
    email ||
    name
  ) {
    existing =
      await findExistingMember({
        memberNumber,
        membershipNumber,
        phone,
        email,
        name
      });
  }

  if (existing.length > 1) {
    errors.push(
      `Multiple existing members matched this row (${existing.length}). Resolve the identity before previewing it again.`
    );
  }

  if (existing.length === 1) {
    const matched =
      existing[0];

    const identity = [
      matched.member_number
        ? `member #${matched.member_number}`
        : null,

      matched.membership_number
        ? `membership #${matched.membership_number}`
        : null,

      matched.name
        ? matched.name
        : null
    ]
      .filter(Boolean)
      .join(", ");

    warnings.push(
      `Existing member matched (${identity}). No member record will be updated.`
    );
  }

  const normalized = {
    member_number:
      memberNumber || null,

    membership_number:
      membershipNumber || null,

    name:
      name || null,

    phone:
      phone || null,

    email:
      email || null,

    role:
      normalizedRole,

    status:
      normalizedStatus || null,

    onboarding_status:
      normalizedOnboardingStatus,

    __preview_only:
      true
  };

  return {
    normalized,
    errors,
    warnings,
    existing:
      existing.length === 1
        ? existing[0]
        : null,
    ok:
      errors.length === 0
  };
}

function duplicateKey(normalized) {
  if (state.entity === "member") {
    return [
      normalized.member_number,
      normalized.membership_number || "",
      normalized.phone,
      normalized.email || ""
    ]
      .join("|")
      .toLowerCase();
  }

  if (
    state.entity !== "expense"
  ) {
    throw new Error(
      "Unsupported migration entity."
    );
  }

  return [
    normalized.date,
    normalized.amount,
    normalized.description
  ]
    .join("|")
    .toLowerCase();
}

async function validate() {
  if (!state.rows.length) {
    throw new Error(
      "There are no rows to validate."
    );
  }

  state.results = [];

  const duplicateCounts =
    new Map();

  for (
    let index = 0;
    index < state.rows.length;
    index += 1
  ) {
    const raw =
      state.rows[index];

    let result;

    if (
      state.entity ===
      "contribution"
    ) {
      result =
        await validateContribution(
          raw
        );
    } else if (
      state.entity === "expense"
    ) {
      result =
        await validateExpense(
          raw
        );
    } else if (
      state.entity === "member"
    ) {
      result =
        await validateMember(
          raw
        );
    } else {
      throw new Error(
        "Unsupported migration entity."
      );
    }

    const key =
      duplicateKey(
        result.normalized
      );

    if (key) {
      duplicateCounts.set(
        key,
        (duplicateCounts.get(key) || 0) + 1
      );
    }

    state.results.push({
      source_row_number:
        index + 2,

      source_data:
        raw,

      normalized:
        result.normalized,

      errors:
        result.errors || [],

      warnings:
        result.warnings || [],

      existing:
        result.existing || null,

      ok:
        result.ok
    });
  }

  state.results.forEach(
    (result) => {
      const key =
        duplicateKey(
          result.normalized
        );

      if (
        key &&
        duplicateCounts.get(key) > 1
      ) {
        result.warnings.push(
          "Duplicate identity/value detected within this import file."
        );
      }
    }
  );

  state.staged =
    state.results.map(
      (result) => ({
        source_row_number:
          result.source_row_number,

        source_data:
          result.source_data,

        normalized_data:
          result.normalized,

        validation_status:
          result.ok
            ? "valid"
            : "invalid",

        validation_errors:
          result.errors,

        validation_warnings:
          result.warnings
      })
    );

  return {
    total:
      state.results.length,

    errors:
      state.results.filter(
        (row) =>
          row.errors.length > 0
      ).length,

    warnings:
      state.results.filter(
        (row) =>
          row.warnings.length > 0
      ).length,

    ready_to_import:
      state.entity === "member"
        ? 0
        : state.results.filter(
            (row) =>
              row.errors.length === 0
          ).length,

    write_allowed:
      state.entity !== "member",

    preview_only:
      state.entity === "member"
  };
}
/* =========================================================
 * Recovery
 * ========================================================= */

async function loadRecoverableBatches() {
  if (!state.groupId) {
    return [];
  }

  const {
    data,
    error
  } = await supabase
    .from("data_import_batches")
    .select(`
      id,
      entity_type,
      source_file_name,
      source_type,
      status,
      created_at,
      completed_at,
      failed_at
    `)
    .eq(
      "group_id",
      state.groupId
    )
    .in(
      "entity_type",
      [
        "contribution",
        "expense",
        "member"
      ]
    )
    .in(
      "status",
      [
        "staged",
        "validated",
        "importing",
        "failed"
      ]
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    )
    .limit(20);

  if (error) {
    throw error;
  }

  state.recoveryBatches =
    data || [];

  return state.recoveryBatches;
}

function renderRecoveryBatches() {
  const container =
    $("recoveryList");

  if (!container) {
    return;
  }

  if (
    !state.recoveryBatches.length
  ) {
    container.innerHTML =
      `<div class="notice info">No recoverable migration batches were found.</div>`;

    return;
  }

  container.innerHTML =
    state.recoveryBatches
      .map(
        (batch) => `
          <div class="recovery-item">
            <div>
              <strong>${esc(
                batch.source_file_name ||
                "Unnamed file"
              )}</strong>

              <div class="muted">
                ${esc(
                  batch.entity_type
                )}
                ·
                ${esc(
                  batch.status
                )}
              </div>
            </div>

            <button
              type="button"
              class="secondary"
              data-recover-batch="${esc(
                batch.id
              )}"
            >
              Recover
            </button>
          </div>
        `
      )
      .join("");

  container
    .querySelectorAll(
      "[data-recover-batch]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          async () => {
            try {
              await recoverBatch(
                button.dataset
                  .recoverBatch
              );
            } catch (error) {
              console.error(error);

              msg(
                error.message ||
                  "Could not recover the migration batch.",
                "error"
              );
            }
          }
        );
      }
    );
}

let selectedRecoveryBatchId =
  null;

async function loadRecoveryMappings(
  batchId
) {
  const {
    data,
    error
  } = await supabase
    .from("data_import_mappings")
    .select(
      "target_field,source_column"
    )
    .eq(
      "batch_id",
      batchId
    );

  if (error) {
    throw error;
  }

  state.mappings =
    Object.fromEntries(
      (data || []).map(
        (row) => [
          row.target_field,
          row.source_column
        ]
      )
    );

  return state.mappings;
}

async function recoverBatch(
  batchId
) {
  if (!batchId) {
    throw new Error(
      "No migration batch was selected."
    );
  }

  const batch =
    state.recoveryBatches.find(
      (item) =>
        item.id === batchId
    );

  if (!batch) {
    throw new Error(
      "Migration batch could not be found."
    );
  }

  selectedRecoveryBatchId =
    batchId;

  state.recoveryMode =
    true;

  state.batchId =
    batchId;

  state.entity =
    batch.entity_type;

  state.fileName =
    batch.source_file_name || "";

  state.sourceType =
    batch.source_type || "";

  const {
    data: rows,
    error
  } = await supabase
    .from("data_import_rows")
    .select(`
      id,
      source_row_number,
      source_data,
      normalized_data,
      validation_status,
      validation_errors,
      validation_warnings,
      imported
    `)
    .eq(
      "batch_id",
      batchId
    )
    .order(
      "source_row_number",
      {
        ascending: true
      }
    );

  if (error) {
    throw error;
  }

  if (!rows?.length) {
    throw new Error(
      "The selected migration batch contains no staged rows."
    );
  }

  await loadRecoveryMappings(
    batchId
  );

  state.staged =
    rows;

  state.results =
    rows.map(
      (row) => ({
        source_row_number:
          row.source_row_number,

        source_data:
          row.source_data || {},

        normalized:
          row.normalized_data || {},

        errors:
          row.validation_errors || [],

        warnings:
          row.validation_warnings || [],

        existing:
          null,

        ok:
          row.validation_status ===
          "valid",

        imported:
          Boolean(row.imported)
      })
    );

  state.imported =
    rows
      .filter(
        (row) =>
          row.imported
      )
      .map(
        (row) =>
          row.source_row_number
      );

  renderMapping();

  render();

  step("preview");

  msg(
    `Recovered ${state.results.length} staged rows from ${state.fileName}.`,
    "info"
  );
}

async function verifyRecoveredState() {
  if (!selectedRecoveryBatchId) {
    return null;
  }

  const {
    data,
    error
  } = await supabase
    .from("data_import_rows")
    .select(`
      source_row_number,
      validation_status,
      imported
    `)
    .eq(
      "batch_id",
      selectedRecoveryBatchId
    )
    .order(
      "source_row_number",
      {
        ascending: true
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}

/* =========================================================
 * Rendering
 * ========================================================= */

function render() {
  const total =
    state.results.length;

  const errors =
    state.results.filter(
      (row) =>
        row.errors.length > 0
    ).length;

  const warnings =
    state.results.filter(
      (row) =>
        row.warnings.length > 0
    ).length;

  const imported =
    state.results.filter(
      (row) =>
        row.imported ||
        state.imported.includes(
          row.source_row_number
        )
    ).length;

  const remaining =
    Math.max(
      0,
      total - imported
    );

  const totalAmount =
    state.results.reduce(
      (sum, row) => {
        const amount =
          num(
            row.normalized?.amount
          );

        return sum +
          (amount || 0);
      },
      0
    );

  const memberPreview =
    state.entity === "member";

  if ($("totalRows")) {
    $("totalRows").textContent =
      total;
  }

  if ($("errorRows")) {
    $("errorRows").textContent =
      errors;
  }

  if ($("warningRows")) {
    $("warningRows").textContent =
      warnings;
  }

  if ($("importedRows")) {
    $("importedRows").textContent =
      imported;
  }

  if ($("remainingRows")) {
    $("remainingRows").textContent =
      remaining;
  }

  if ($("totalAmount")) {
    $("totalAmount").textContent =
      memberPreview
        ? "—"
        : moneySafe(totalAmount);
  }

  const memberNotice =
    $("memberImportNotice");

  if (memberNotice) {
    memberNotice.classList.toggle(
      "hidden",
      !memberPreview
    );
  }

  const validationMessage =
    $("validationMessage");

  if (validationMessage) {
    if (memberPreview) {
      validationMessage.className =
        "notice info";

      validationMessage.textContent =
        "Members are preview-only. No member record will be inserted or updated, and no role, status, onboarding state, or authentication identity will be changed.";
    } else if (errors > 0) {
      validationMessage.className =
        "notice error";

      validationMessage.textContent =
        `${errors} row(s) contain validation errors. Resolve them before importing.`;
    } else if (warnings > 0) {
      validationMessage.className =
        "notice warn";

      validationMessage.textContent =
        `${warnings} row(s) contain warnings. Review the preview before importing.`;
    } else if (total > 0) {
      validationMessage.className =
        "notice success";

      validationMessage.textContent =
        "Validation passed. Review the preview and confirm the import.";
    } else {
      validationMessage.className =
        "notice info";

      validationMessage.textContent =
        "No validation results are available yet.";
    }
  }

  const confirmButton =
    $("confirmImport");

  if (confirmButton) {
    confirmButton.disabled =
      memberPreview ||
      errors > 0 ||
      !state.results.length ||
      remaining === 0;
  }

  const confirmSummary =
    $("confirmSummary");

  if (confirmSummary) {
    if (memberPreview) {
      confirmSummary.textContent =
        "Members are preview-only. No target member records will be written.";
    } else {
      confirmSummary.textContent =
        `${remaining} row(s) are eligible for import. ${imported} row(s) have already been imported.`;
    }
  }

  const previewBody =
    $("previewBody");

  if (!previewBody) {
    return;
  }

  if (!state.results.length) {
    previewBody.innerHTML = `
      <tr>
        <td
          colspan="7"
          class="muted"
        >
          No preview rows available.
        </td>
      </tr>
    `;

    return;
  }

  previewBody.innerHTML =
    state.results
      .map(
        (row) => {
          const status =
            row.errors.length
              ? "Error"
              : row.warnings.length
                ? "Warning"
                : "Ready";

          const issueText = [
            ...row.errors,
            ...row.warnings
          ].join(" ");

          const normalized =
            row.normalized || {};

          const amount =
            normalized.amount !==
            undefined &&
            normalized.amount !==
            null
              ? moneySafe(
                  normalized.amount
                )
              : "—";

          const identity =
            memberPreview
              ? [
                  normalized.member_number,
                  normalized.name,
                  normalized.phone,
                  normalized.status
                ]
                  .filter(Boolean)
                  .join(" · ")
              : (
                  normalized.member_number ||
                  normalized.description ||
                  "—"
                );

          const importedState =
            row.imported ||
            state.imported.includes(
              row.source_row_number
            );

          return `
            <tr>
              <td>
                ${esc(
                  row.source_row_number
                )}
              </td>

              <td>
                ${esc(identity)}
              </td>

              <td>
                ${memberPreview
                  ? "—"
                  : esc(amount)}
              </td>

              <td>
                ${esc(
                  memberPreview
                    ? normalized.phone ||
                      "—"
                    : normalized.date ||
                      normalized.contribution_date ||
                      "—"
                )}
              </td>

              <td>
                ${esc(
                  memberPreview
                    ? normalized.role ||
                      "—"
                    : normalized.category ||
                      normalized.payment_method ||
                      "—"
                )}
              </td>

              <td>
                ${esc(
                  importedState
                    ? "Imported"
                    : status
                )}
              </td>

              <td>
                ${esc(
                  issueText ||
                    (
                      memberPreview
                        ? "Preview only — no target write."
                        : "Ready"
                    )
                )}
              </td>
            </tr>
          `;
        }
      )
      .join("");
}

/* =========================================================
 * Import
 * ========================================================= */

async function importContribution(result) {
  if (!result?.normalized) {
    throw new Error(
      "Contribution result is missing normalized data."
    );
  }

  const normalized =
    result.normalized;

  if (!normalized.member_id) {
    throw new Error(
      "Contribution member identity is missing."
    );
  }

  if (
    !normalized.amount ||
    normalized.amount <= 0
  ) {
    throw new Error(
      "Contribution amount is invalid."
    );
  }

  if (!normalized.contribution_date) {
    throw new Error(
      "Contribution date is missing."
    );
  }

  const {
    data,
    error
  } = await supabase.rpc(
    "cl_2b_record_contribution",
    {
      p_member_id:
        normalized.member_id,

      p_amount:
        normalized.amount,

      p_contribution_date:
        normalized.contribution_date,

      p_payment_method:
        normalized.payment_method,

      p_contribution_type:
        normalized.contribution_type,

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
  if (!result?.normalized) {
    throw new Error(
      "Expense result is missing normalized data."
    );
  }

  const normalized =
    result.normalized;

  const payload = {
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
      normalized.receipt_url
  };

  const {
    data,
    error
  } = await supabase
    .from("expenses")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const duplicate =
        await supabase
          .from("expenses")
          .select("*")
          .eq(
            "group_id",
            state.groupId
          )
          .eq(
            "date",
            normalized.date
          )
          .eq(
            "amount",
            normalized.amount
          )
          .eq(
            "description",
            normalized.description
          )
          .limit(1)
          .maybeSingle();

      if (duplicate.error) {
        throw duplicate.error;
      }

      if (duplicate.data) {
        return duplicate.data;
      }
    }

    throw error;
  }

  return data;
}

async function markRowImported(
  sourceRowNumber,
  importedRecord
) {
  if (!state.batchId) {
    throw new Error(
      "Import batch is missing."
    );
  }

  const {
    error
  } = await supabase
    .from("data_import_rows")
    .update({
      imported: true,
      imported_at:
        new Date().toISOString(),
      imported_record_id:
        importedRecord?.id || null
    })
    .eq(
      "batch_id",
      state.batchId
    )
    .eq(
      "source_row_number",
      sourceRowNumber
    );

  if (error) {
    throw error;
  }

  state.imported.push(
    sourceRowNumber
  );
}

async function getImportedRows() {
  if (!state.batchId) {
    return [];
  }

  const {
    data,
    error
  } = await supabase
    .from("data_import_rows")
    .select(
      "source_row_number,imported,imported_record_id"
    )
    .eq(
      "batch_id",
      state.batchId
    )
    .eq(
      "imported",
      true
    )
    .order(
      "source_row_number",
      {
        ascending: true
      }
    );

  if (error) {
    throw error;
  }

  return data || [];
}

async function verifyRow(row) {
  if (
    state.entity === "member"
  ) {
    return {
      row:
        row.source_row_number,

      ok: false,

      detail:
        "Member migrations are preview-only; no target member record is written."
    };
  }

  const normalized =
    row.normalized || {};

  if (
    state.entity ===
    "contribution"
  ) {
    if (
      !normalized.member_id ||
      !normalized.contribution_date
    ) {
      return {
        row:
          row.source_row_number,

        ok: false,

        detail:
          "Contribution verification data is incomplete."
      };
    }

    const {
      data,
      error
    } = await supabase
      .from("contributions")
      .select(
        "id,member_id,amount,contribution_date"
      )
      .eq(
        "group_id",
        state.groupId
      )
      .eq(
        "member_id",
        normalized.member_id
      )
      .eq(
        "amount",
        normalized.amount
      )
      .eq(
        "contribution_date",
        normalized.contribution_date
      )
      .limit(10);

    if (error) {
      throw error;
    }

    return {
      row:
        row.source_row_number,

      ok:
        Boolean(
          data?.length
        ),

      detail:
        data?.length
          ? "Contribution target record verified."
          : "Contribution target record was not found."
    };
  }

  if (
    state.entity ===
    "expense"
  ) {
    const {
      data,
      error
    } = await supabase
      .from("expenses")
      .select(
        "id,group_id,date,amount,description"
      )
      .eq(
        "group_id",
        state.groupId
      )
      .eq(
        "date",
        normalized.date
      )
      .eq(
        "amount",
        normalized.amount
      )
      .eq(
        "description",
        normalized.description
      )
      .limit(10);

    if (error) {
      throw error;
    }

    return {
      row:
        row.source_row_number,

      ok:
        Boolean(
          data?.length
        ),

      detail:
        data?.length
          ? "Expense target record verified."
          : "Expense target record was not found."
    };
  }

  return {
    row:
      row.source_row_number,

    ok: false,

    detail:
      "Unsupported migration entity."
  };
}

async function verify() {
  if (
    state.entity === "member"
  ) {
    if ($("verifyCard")) {
      $("verifyCard")
        .classList
        .remove("hidden");
    }

    if ($("verifyResult")) {
      $("verifyResult").innerHTML = `
        <div class="notice info">
          Member preview completed. No target member records were written, so target-record verification is not applicable.
        </div>
      `;
    }

    step("preview");

    return {
      checks: [],
      bad: 0
    };
  }

  const importedRows =
    await getImportedRows();

  const checks = [];
  let bad = 0;

  for (
    const importedRow
    of importedRows
  ) {
    const result =
      state.results.find(
        (row) =>
          row.source_row_number ===
          importedRow.source_row_number
      );

    if (!result) {
      continue;
    }

    const check =
      await verifyRow(result);

    checks.push(check);

    if (!check.ok) {
      bad += 1;
    }
  }

  if ($("verifyCard")) {
    $("verifyCard")
      .classList
      .remove("hidden");
  }

  if ($("verifyResult")) {
    $("verifyResult").innerHTML =
      checks.length
        ? checks
            .map(
              (check) => `
                <div class="notice ${
                  check.ok
                    ? "success"
                    : "error"
                }">
                  Row ${esc(
                    check.row
                  )}: ${esc(
                    check.detail
                  )}
                </div>
              `
            )
            .join("")
        : `
          <div class="notice info">
            No imported rows are available for verification.
          </div>
        `;
  }

  step("verify");

  return {
    checks,
    bad
  };
}

async function markBatchFailed(
  error
) {
  if (!state.batchId) {
    return;
  }

  const message =
    error?.message ||
    String(error);

  const {
    error: updateError
  } = await supabase
    .from("data_import_batches")
    .update({
      status: "failed",
      failed_at:
        new Date().toISOString(),
      error_message:
        message
    })
    .eq(
      "id",
      state.batchId
    )
    .eq(
      "group_id",
      state.groupId
    );

  if (updateError) {
    console.error(
      "Could not mark batch failed:",
      updateError
    );
  }
}

async function markBatchCompleted() {
  if (!state.batchId) {
    return;
  }

  const {
    error
  } = await supabase
    .from("data_import_batches")
    .update({
      status: "completed",
      completed_at:
        new Date().toISOString()
    })
    .eq(
      "id",
      state.batchId
    )
    .eq(
      "group_id",
      state.groupId
    );

  if (error) {
    throw error;
  }
}

/* =========================================================
 * Import runner
 * ========================================================= */

async function runImport() {
  if (
    state.entity === "member"
  ) {
    throw new Error(
      "Member import is permanently blocked in this migration workflow. Members are preview-only."
    );
  }

  if (state.importing) {
    return;
  }

  if (!state.results.length) {
    throw new Error(
      "Validate the migration before importing."
    );
  }

  const invalidRows =
    state.results.filter(
      (row) =>
        row.errors.length > 0
    );

  if (invalidRows.length) {
    throw new Error(
      "Import is blocked while validation errors remain."
    );
  }

  if (!state.batchId) {
    await createBatch();

    await stage();

    await saveMaps();
  }

  state.importing = true;

  state.importStartedAt =
    new Date().toISOString();

  step("import");

  try {
    const importedRows =
      await getImportedRows();

    const alreadyImported =
      new Set(
        importedRows.map(
          (row) =>
            row.source_row_number
        )
      );

    state.imported =
      Array.from(
        alreadyImported
      );

    const remaining =
      state.results.filter(
        (result) =>
          !alreadyImported.has(
            result.source_row_number
          )
      );

    for (
      const result
      of remaining
    ) {
      let importedRecord;

      if (
        state.entity ===
        "contribution"
      ) {
        importedRecord =
          await importContribution(
            result
          );
      } else if (
        state.entity ===
        "expense"
      ) {
        importedRecord =
          await importExpense(
            result
          );
      } else {
        throw new Error(
          "Member import is preview-only. No member target write is permitted."
        );
      }

      await markRowImported(
        result.source_row_number,
        importedRecord
      );

      result.imported = true;

      render();
    }

    await markBatchCompleted();

    await verify();

    msg(
      `Import completed successfully. ${state.imported.length} row(s) are recorded as imported.`,
      "success"
    );

    step("verify");
  } catch (error) {
    await markBatchFailed(
      error
    );

    throw error;
  } finally {
    state.importing = false;
  }
}
/* =========================================================
 * Mapping UI
 * ========================================================= */

function renderMapping() {
  const container =
    $("mappingFields");

  if (!container) {
    return;
  }

  const definitions =
    DEF[state.entity] || [];

  container.innerHTML =
    definitions
      .map(
        ([
          field,
          label,
          ,
          required
        ]) => {
          const selected =
            state.mappings[field] || "";

          const options = [
            `<option value="">Not mapped</option>`,
            ...state.headers.map(
              (header) => `
                <option
                  value="${esc(header)}"
                  ${
                    header === selected
                      ? "selected"
                      : ""
                  }
                >
                  ${esc(header)}
                </option>
              `
            )
          ].join("");

          return `
            <div class="mapping-row">
              <label>
                <span>
                  ${esc(label)}
                  ${
                    required
                      ? " *"
                      : ""
                  }
                </span>

                <select
                  data-map-field="${esc(
                    field
                  )}"
                >
                  ${options}
                </select>
              </label>
            </div>
          `;
        }
      )
      .join("");

  container
    .querySelectorAll(
      "[data-map-field]"
    )
    .forEach(
      (select) => {
        select.addEventListener(
          "change",
          () => {
            const field =
              select.dataset.mapField;

            state.mappings[field] =
              select.value;

            updateMappingState();
          }
        );
      }
    );

  updateMappingState();
}

function updateMappingState() {
  const definitions =
    DEF[state.entity] || [];

  const missingRequired =
    definitions
      .filter(
        ([
          ,
          ,
          ,
          required
        ]) => required
      )
      .filter(
        ([field]) =>
          !state.mappings[field]
      );

  const mappingMessage =
    $("mappingMessage");

  if (mappingMessage) {
    if (missingRequired.length) {
      mappingMessage.className =
        "notice warn";

      mappingMessage.textContent =
        `Required fields not mapped: ${missingRequired
          .map(
            ([field]) =>
              field
          )
          .join(", ")}.`;
    } else {
      mappingMessage.className =
        "notice success";

      mappingMessage.textContent =
        "All required fields are mapped.";
    }
  }

  const continueButton =
    $("continueMapping");

  if (continueButton) {
    continueButton.disabled =
      missingRequired.length > 0;
  }
}

async function saveCurrentMapping() {
  const definitions =
    DEF[state.entity] || [];

  const missingRequired =
    definitions
      .filter(
        ([
          ,
          ,
          ,
          required
        ]) => required
      )
      .filter(
        ([field]) =>
          !state.mappings[field]
      );

  if (missingRequired.length) {
    throw new Error(
      `Map all required fields before continuing: ${missingRequired
        .map(
          ([field]) =>
            field
        )
        .join(", ")}.`
    );
  }

  if (!state.batchId) {
    await createBatch();
  }

  await saveMaps();
}

/* =========================================================
 * Upload / reset
 * ========================================================= */

async function processUpload(file) {
  if (!file) {
    throw new Error(
      "Choose a CSV or XLSX file first."
    );
  }

  const extension =
    file.name
      .toLowerCase()
      .split(".")
      .pop();

  if (
    ![
      "csv",
      "xlsx"
    ].includes(extension)
  ) {
    throw new Error(
      "Only CSV and XLSX files are supported."
    );
  }

  state.fileName =
    file.name;

  state.sourceType =
    extension;

  state.batchId = null;
  state.mappings = {};
  state.results = [];
  state.imported = [];
  state.staged = [];
  state.recoveryMode = false;
  selectedRecoveryBatchId =
    null;

  const matrix =
    await readFile(file);

  const parsed =
    matrixRows(matrix);

  state.headers =
    parsed.headers;

  state.rows =
    parsed.rows;

  autoMap();

  renderMapping();

  render();

  step("mapping");

  msg(
    `${state.rows.length} data row(s) loaded from ${state.fileName}.`,
    "success"
  );
}

function resetForNewUpload() {
  state.fileName = "";
  state.sourceType = "";

  state.headers = [];
  state.rows = [];
  state.staged = [];

  state.batchId = null;
  state.mappings = {};
  state.results = [];
  state.imported = [];

  state.importStartedAt =
    null;

  state.importing =
    false;

  state.recoveryMode =
    false;

  selectedRecoveryBatchId =
    null;

  const fileInput =
    $("fileInput");

  if (fileInput) {
    fileInput.value = "";
  }

  const mappingFields =
    $("mappingFields");

  if (mappingFields) {
    mappingFields.innerHTML = "";
  }

  const previewBody =
    $("previewBody");

  if (previewBody) {
    previewBody.innerHTML = "";
  }

  const memberNotice =
    $("memberImportNotice");

  if (memberNotice) {
    memberNotice.classList.add(
      "hidden"
    );
  }

  const validationMessage =
    $("validationMessage");

  if (validationMessage) {
    validationMessage.className =
      "notice info";

    validationMessage.textContent =
      "Upload a file to begin.";
  }

  render();

  step("upload");

  msg(
    "Ready for a new migration file.",
    "info"
  );
}

/* =========================================================
 * Entity selection
 * ========================================================= */

function setEntity(entity) {
  if (
    ![
      "contribution",
      "expense",
      "member"
    ].includes(entity)
  ) {
    throw new Error(
      "Unsupported migration entity."
    );
  }

  if (state.importing) {
    throw new Error(
      "Wait for the current import to finish before changing the migration type."
    );
  }

  state.entity =
    entity;

  state.headers = [];
  state.rows = [];
  state.staged = [];
  state.batchId = null;
  state.mappings = {};
  state.results = [];
  state.imported = [];

  selectedRecoveryBatchId =
    null;

  const memberNotice =
    $("memberImportNotice");

  if (memberNotice) {
    memberNotice.classList.toggle(
      "hidden",
      entity !== "member"
    );
  }

  const confirmButton =
    $("confirmImport");

  if (confirmButton) {
    confirmButton.disabled =
      entity === "member";
  }

  const entityDescription =
    $("entityDescription");

  if (entityDescription) {
    if (entity === "member") {
      entityDescription.textContent =
        "Members can be mapped, validated and previewed only. No member target record, role, status, onboarding state or authentication identity will be changed.";
    } else if (
      entity === "contribution"
    ) {
      entityDescription.textContent =
        "Contributions are imported through the canonical contribution accounting workflow.";
    } else {
      entityDescription.textContent =
        "Expenses are imported into the authenticated group's expense records.";
    }
  }

  renderMapping();

  render();
}

/* =========================================================
 * Event bindings
 * ========================================================= */

function bind() {
  const fileInput =
    $("fileInput");

  const uploadButton =
    $("uploadButton");

  if (uploadButton) {
    uploadButton.addEventListener(
      "click",
      async () => {
        try {
          const file =
            fileInput?.files?.[0];

          await processUpload(
            file
          );
        } catch (error) {
          console.error(error);

          msg(
            error.message ||
              "Could not process the upload.",
            "error"
          );
        }
      }
    );
  }

  if (fileInput) {
    fileInput.addEventListener(
      "change",
      () => {
        const file =
          fileInput.files?.[0];

        if (file) {
          msg(
            `${file.name} selected. Click upload to process it.`,
            "info"
          );
        }
      }
    );
  }

  document
    .querySelectorAll(
      "[data-entity]"
    )
    .forEach(
      (element) => {
        element.addEventListener(
          "click",
          () => {
            try {
              setEntity(
                element.dataset.entity
              );
            } catch (error) {
              console.error(error);

              msg(
                error.message ||
                  "Could not change migration type.",
                "error"
              );
            }
          }
        );
      }
    );

  const continueMapping =
    $("continueMapping");

  if (continueMapping) {
    continueMapping.addEventListener(
      "click",
      async () => {
        try {
          await saveCurrentMapping();

          const validation =
            await validate();

          await stage();

          render();

          step("preview");

          msg(
            validation.preview_only
              ? "Member validation completed. The records below are preview-only; no member target write is permitted."
              : `Validation completed. ${validation.ready_to_import} row(s) are ready for import.`,
            validation.errors
              ? "warn"
              : "success"
          );
        } catch (error) {
          console.error(error);

          msg(
            error.message ||
              "Validation could not be completed.",
            "error"
          );
        }
      }
    );
  }

  const confirmImport =
    $("confirmImport");

  if (confirmImport) {
    confirmImport.addEventListener(
      "click",
      async () => {
        try {
          if (
            state.entity ===
            "member"
          ) {
            throw new Error(
              "Member import is preview-only. No member records will be written."
            );
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

  const verifyButton =
    $("verifyButton");

  if (verifyButton) {
    verifyButton.addEventListener(
      "click",
      async () => {
        try {
          await verify();

          msg(
            "Verification completed.",
            "success"
          );
        } catch (error) {
          console.error(error);

          msg(
            error.message ||
              "Verification failed.",
            "error"
          );
        }
      }
    );
  }

  const resetButton =
    $("resetMigration");

  if (resetButton) {
    resetButton.addEventListener(
      "click",
      () => {
        resetForNewUpload();
      }
    );
  }

  const loadRecoveryButton =
    $("loadRecovery");

  if (loadRecoveryButton) {
    loadRecoveryButton.addEventListener(
      "click",
      async () => {
        try {
          await loadRecoverableBatches();

          renderRecoveryBatches();

          msg(
            "Recoverable migration batches loaded.",
            "success"
          );
        } catch (error) {
          console.error(error);

          msg(
            error.message ||
              "Could not load recoverable batches.",
            "error"
          );
        }
      }
    );
  }

  const importCheckbox =
    $("confirmImportCheckbox");

  if (importCheckbox) {
    importCheckbox.addEventListener(
      "change",
      () => {
        const confirmButton =
          $("confirmImport");

        if (!confirmButton) {
          return;
        }

        if (
          state.entity ===
          "member"
        ) {
          importCheckbox.checked =
            false;

          confirmButton.disabled =
            true;

          return;
        }

        const errors =
          state.results.filter(
            (row) =>
              row.errors.length > 0
          ).length;

        const imported =
          state.results.filter(
            (row) =>
              row.imported ||
              state.imported.includes(
                row.source_row_number
              )
          ).length;

        const remaining =
          Math.max(
            0,
            state.results.length -
              imported
          );

        confirmButton.disabled =
          !importCheckbox.checked ||
          errors > 0 ||
          !state.results.length ||
          remaining === 0;
      }
    );
  }

  const memberImportNotice =
    $("memberImportNotice");

  if (memberImportNotice) {
    memberImportNotice.classList.toggle(
      "hidden",
      state.entity !== "member"
    );
  }
}
/* =========================================================
 * Initialization
 * ========================================================= */

async function init() {
  try {
    step("upload");

    await context();

    const entitySelect =
      $("entity");

    if (entitySelect) {
      entitySelect.value =
        state.entity;

      entitySelect.addEventListener(
        "change",
        () => {
          try {
            setEntity(
              entitySelect.value
            );
          } catch (error) {
            console.error(error);

            msg(
              error.message ||
                "Could not change migration type.",
              "error"
            );
          }
        }
      );
    }

    const memberNotice =
      $("memberImportNotice");

    if (memberNotice) {
      memberNotice.classList.toggle(
        "hidden",
        state.entity !== "member"
      );
    }

    bind();

    try {
      await loadRecoverableBatches();

      renderRecoveryBatches();
    } catch (recoveryError) {
      console.warn(
        "Recovery batch lookup unavailable:",
        recoveryError
      );
    }

    render();

    msg(
      "Authenticated group context resolved. Contributions and expenses can be imported after validation and explicit confirmation. Members can be mapped, validated and previewed only; no member target write is permitted.",
      "success"
    );
  } catch (error) {
    console.error(error);

    msg(
      error.message ||
        "Could not initialize the migration workflow.",
      "error"
    );

    const controls =
      document.querySelectorAll(
        "button, select, input[type='file']"
      );

    controls.forEach(
      (control) => {
        control.disabled = true;
      }
    );
  }
}

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    init,
    {
      once: true
    }
  );
} else {
  init();
}



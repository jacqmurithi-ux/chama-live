/* =========================================================
   CHAMA LIVE — BILLING

   RESPONSIBILITIES
   ---------------------------------------------------------
   - Read existing subscription/billing state
   - Display authoritative database records
   - Use existing auth/application context
   - Keep billing page read-only

   DOES NOT:
   - create billing records
   - modify subscriptions
   - modify invoices
   - modify payments
   - calculate settlement
   - modify contribution accounting
   - replace database RPCs

   BOOT OWNERSHIP
   ---------------------------------------------------------
   admin-layout.js owns page boot.

   This file exports:
     initBilling()

   This file does NOT auto-run initBilling().
========================================================= */


import {
  supabase,
  getMyApplicationContext
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let currentIsOwner = false;
let currentRole = "";

let subscription = null;
let cycles = [];
let invoices = [];
let payments = [];


/* =========================================================
   ACCESS
========================================================= */

const ADMIN_ROLES = new Set([
  "admin",
  "chairperson",
  "secretary",
  "treasurer"
]);

const MEMBER_DASHBOARD_URL =
  "member-dashboard.html";


function canAccessBilling() {

  return (
    currentIsOwner ||
    ADMIN_ROLES.has(currentRole)
  );

}


function enforceBillingAccess() {

  if (canAccessBilling()) {
    return true;
  }

  window.location.replace(
    MEMBER_DASHBOARD_URL
  );

  return false;

}


/* =========================================================
   DOM
========================================================= */

const statusEl =
  document.getElementById(
    "billingStatus"
  );

const errorEl =
  document.getElementById(
    "billingError"
  );

const billingSummaryGridEl =
  document.getElementById(
    "billingSummaryGrid"
  );

const subscriptionGridEl =
  document.getElementById(
    "subscriptionGrid"
  );

const cycleGridEl =
  document.getElementById(
    "cycleGrid"
  );

const invoiceContainerEl =
  document.getElementById(
    "invoiceContainer"
  );

const paymentContainerEl =
  document.getElementById(
    "paymentContainer"
  );


/* =========================================================
   MESSAGES
========================================================= */

function clearMessages() {

  if (statusEl) {
    statusEl.hidden = true;
    statusEl.textContent = "";
  }

  if (errorEl) {
    errorEl.hidden = true;
    errorEl.textContent = "";
  }

}


function showStatus(message) {

  if (!statusEl) {
    return;
  }

  statusEl.textContent =
    message;

  statusEl.hidden =
    false;

}


function showError(message) {

  if (!errorEl) {
    return;
  }

  errorEl.textContent =
    message;

  errorEl.hidden =
    false;

}


/* =========================================================
   APPLICATION CONTEXT
========================================================= */

async function loadApplicationContext() {

  const {
    user,
    member,
    group,
    isOwner,
    role
  } =
    await getMyApplicationContext();

  currentUser =
    user;

  currentMember =
    member;

  currentGroup =
    group;

  currentIsOwner =
    Boolean(isOwner);

  currentRole =
    String(role || "")
      .trim()
      .toLowerCase();

  return {
    user: currentUser,
    member: currentMember,
    group: currentGroup,
    isOwner: currentIsOwner,
    role: currentRole
  };

}


/* =========================================================
   SUBSCRIPTION
========================================================= */

function normalizeSubscription(row) {

  if (!row) {
    return null;
  }

  return {
    subscription_id: row.subscription_id ?? null,
    group_id: row.group_id ?? null,
    status: row.status ?? null,
    started_at: row.started_at ?? null,
    pricing_tier_code: row.pricing_tier_code ?? null,
    standard_group_amount: row.standard_group_amount ?? null,
    standard_member_login_amount: row.standard_member_login_amount ?? null,
    currency: row.currency ?? "KES"
  };

}



async function loadSubscription() {

  const groupId =
    currentGroup?.id;

  if (!groupId) {
    throw new Error(
      "No group is associated with this account."
    );
  }

  const {
    data,
    error
  } =
    await supabase.rpc(
      "get_group_subscription",
      {
        p_group_id: groupId
      }
    );

  if (error) {
    throw error;
  }

  subscription =
    normalizeSubscription(
      Array.isArray(data)
        ? data[0] || null
        : data || null
    );

  return subscription;

}


/* =========================================================
   CYCLES
========================================================= */

async function loadCycles() {

  const subscriptionId =
    subscription?.subscription_id;

  if (!subscriptionId) {
    cycles = [];
    return cycles;
  }

  const {
    data,
    error
  } =
    await supabase
      .from("subscription_cycles")
      .select("*")
      .eq(
        "subscription_id",
        subscriptionId
      )
      .order(
        "cycle_number",
        {
          ascending: false
        }
      );

  if (error) {
    throw error;
  }

  cycles =
    data || [];

  return cycles;

}


/* =========================================================
   INVOICES
========================================================= */

async function loadInvoices() {

  const subscriptionId =
    subscription?.subscription_id;

  const groupId =
    currentGroup?.id;

  if (!subscriptionId || !groupId) {
    invoices = [];
    return invoices;
  }

  const {
    data,
    error
  } =
    await supabase
      .from("subscription_invoices")
      .select("*")
      .eq(
        "subscription_id",
        subscriptionId
      )
      .eq(
        "group_id",
        groupId
      )
      .order(
        "issued_at",
        {
          ascending: false
        }
      );

  if (error) {
    throw error;
  }

  invoices =
    data || [];

  return invoices;

}


/* =========================================================
   PAYMENTS
========================================================= */

async function loadPayments() {

  const groupId =
    currentGroup?.id;

  if (!groupId) {
    payments = [];
    return payments;
  }

  const {
    data,
    error
  } =
    await supabase
      .from("subscription_payments")
      .select("*")
      .eq(
        "group_id",
        groupId
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      );

  if (error) {
    throw error;
  }

  payments =
    data || [];

  return payments;

}


/* =========================================================
   HELPERS
========================================================= */

function formatAmount(
  amount,
  currency = "KES"
) {

  if (
    amount === null ||
    amount === undefined ||
    amount === ""
  ) {
    return "—";
  }

  const numeric =
    Number(amount);

  if (!Number.isFinite(numeric)) {
    return String(amount);
  }

  try {

    return new Intl.NumberFormat(
      "en-KE",
      {
        style: "currency",
        currency: currency || "KES",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }
    ).format(numeric);

  }

  catch {
    return `${currency || "KES"} ${numeric.toFixed(2)}`;
  }

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
    return String(value);
  }

  return new Intl.DateTimeFormat(
    "en-KE",
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  ).format(date);

}


function text(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  return String(value);

}


function createElement(
  tag,
  className = null,
  content = null
) {

  const element =
    document.createElement(tag);

  if (className) {
    element.className =
      className;
  }

  if (
    content !== null &&
    content !== undefined
  ) {
    element.textContent =
      content;
  }

  return element;

}


function createStatusBadge(status) {

  const badge =
    createElement(
      "span",
      "billing-badge-status"
    );

  badge.textContent =
    text(status);

  return badge;

}


function renderEmpty(
  container,
  message
) {

  if (!container) {
    return;
  }

  container.replaceChildren();

  container.appendChild(
    createElement(
      "div",
      "billing-empty",
      message
    )
  );

}


/* =========================================================
   BILLING SUMMARY
========================================================= */

function renderBillingSummary() {

  if (!billingSummaryGridEl) {
    return;
  }

  billingSummaryGridEl.replaceChildren();

  const currentInvoice =
    invoices[0] || null;

  const lastPayment =
    payments[0] || null;

  const currentCycle =
    cycles[0] || null;

  const cards = [

    [
      "Plan",
      subscription?.pricing_tier_code || "—",
      subscription?.status || ""
    ],

    [
      "Current Invoice",
      currentInvoice?.invoice_number ||
        currentInvoice?.id ||
        "—",
      currentInvoice
        ? formatAmount(
            currentInvoice.total_amount ??
            currentInvoice.amount ??
            currentInvoice.total,
            subscription?.currency
          )
        : ""
    ],

    [
      "Due Date",
      currentInvoice
        ? formatDate(
            currentInvoice.due_at ??
            currentInvoice.due_date
          )
        : "—",
      currentCycle
        ? `Cycle ${text(currentCycle.cycle_number)}`
        : ""
    ],

    [
      "Last Payment",
      lastPayment
        ? formatAmount(
            lastPayment.amount,
            subscription?.currency
          )
        : "—",
      lastPayment
        ? formatDate(
            lastPayment.paid_at ??
            lastPayment.created_at
          )
        : ""
    ]

  ];

  cards.forEach(
    ([label, value, subvalue]) => {

      const card =
        createElement(
          "div",
          "billing-card billing-summary-card"
        );

      card.appendChild(
        createElement(
          "span",
          "billing-label",
          label
        )
      );

      card.appendChild(
        createElement(
          "span",
          "billing-value",
          value
        )
      );

      if (subvalue) {
        card.appendChild(
          createElement(
            "span",
            "billing-subvalue",
            subvalue
          )
        );
      }

      billingSummaryGridEl.appendChild(
        card
      );

    }
  );

}


/* =========================================================
   SUBSCRIPTION
========================================================= */

function renderSubscription() {

  if (!subscriptionGridEl) {
    return;
  }

  subscriptionGridEl.replaceChildren();

  if (!subscription) {

    renderEmpty(
      subscriptionGridEl,
      "No subscription record is currently available for this group."
    );

    return;

  }

  const cards = [

    [
      "Status",
      subscription.status || "—",
      true
    ],

    [
      "Pricing Tier",
      subscription.pricing_tier_code || "—",
      false
    ],

    [
      "Group Amount",
      formatAmount(
        subscription.standard_group_amount,
        subscription.currency
      ),
      false
    ],

    [
      "Member Login",
      formatAmount(
        subscription.standard_member_login_amount,
        subscription.currency
      ),
      false
    ],

    [
      "Currency",
      subscription.currency || "—",
      false
    ],

    [
      "Started",
      formatDate(
        subscription.started_at
      ),
      false
    ]

  ];

  cards.forEach(
    ([label, value, badge]) => {

      const card =
        createElement(
          "div",
          "billing-card"
        );

      card.appendChild(
        createElement(
          "span",
          "billing-label",
          label
        )
      );

      if (badge) {

        card.appendChild(
          createStatusBadge(value)
        );

      }

      else {

        card.appendChild(
          createElement(
            "span",
            "billing-value",
            value
          )
        );

      }

      subscriptionGridEl.appendChild(
        card
      );

    }
  );

}


/* =========================================================
   CYCLES
========================================================= */

function renderCycles() {

  if (!cycleGridEl) {
    return;
  }

  cycleGridEl.replaceChildren();

  if (!cycles.length) {

    renderEmpty(
      cycleGridEl,
      "No billing cycle records are currently available."
    );

    return;

  }

  const currentCycle =
    cycles[0];

  const cards = [

    [
      "Cycle",
      currentCycle?.cycle_number
        ? `Cycle ${currentCycle.cycle_number}`
        : "—"
    ],

    [
      "Status",
      currentCycle?.status || "—"
    ],

    [
      "Starts",
      formatDate(
        currentCycle?.starts_at ??
        currentCycle?.start_date
      )
    ],

    [
      "Ends",
      formatDate(
        currentCycle?.ends_at ??
        currentCycle?.end_date
      )
    ]

  ];

  cards.forEach(
    ([label, value]) => {

      const card =
        createElement(
          "div",
          "billing-card"
        );

      card.appendChild(
        createElement(
          "span",
          "billing-label",
          label
        )
      );

      card.appendChild(
        createElement(
          "span",
          "billing-value",
          value
        )
      );

      cycleGridEl.appendChild(
        card
      );

    }
  );

}


/* =========================================================
   INVOICES
========================================================= */

function renderInvoices() {

  if (!invoiceContainerEl) {
    return;
  }

  invoiceContainerEl.replaceChildren();

  if (!invoices.length) {

    renderEmpty(
      invoiceContainerEl,
      "No invoices are currently available."
    );

    return;

  }

  const wrapper =
    createElement(
      "div",
      "billing-table-wrap"
    );

  const table =
    createElement(
      "table",
      "billing-table"
    );

  const thead =
    document.createElement("thead");

  const headerRow =
    document.createElement("tr");

  [
    "Invoice",
    "Cycle",
    "Status",
    "Issued",
    "Due",
    "Total"
  ].forEach(
    heading => {

      headerRow.appendChild(
        createElement(
          "th",
          null,
          heading
        )
      );

    }
  );

  thead.appendChild(
    headerRow
  );

  table.appendChild(
    thead
  );

  const tbody =
    document.createElement("tbody");

  invoices.forEach(
    invoice => {

      const row =
        document.createElement("tr");

      const invoiceCell =
        document.createElement("td");

      invoiceCell.appendChild(
        createElement(
          "strong",
          null,
          invoice.invoice_number ||
          invoice.id ||
          "—"
        )
      );

      invoiceCell.appendChild(
        createElement(
          "span",
          "billing-subvalue",
          invoice.description ||
          ""
        )
      );

      row.appendChild(
        invoiceCell
      );

      row.appendChild(
        createElement(
          "td",
          null,
          text(
            invoice.cycle_number
          )
        )
      );

      const statusCell =
        document.createElement("td");

      statusCell.appendChild(
        createStatusBadge(
          invoice.status
        )
      );

      row.appendChild(
        statusCell
      );

      row.appendChild(
        createElement(
          "td",
          null,
          formatDate(
            invoice.issued_at ??
            invoice.issued_date
          )
        )
      );

      row.appendChild(
        createElement(
          "td",
          null,
          formatDate(
            invoice.due_at ??
            invoice.due_date
          )
        )
      );

      row.appendChild(
        createElement(
          "td",
          "amount",
          formatAmount(
            invoice.total_amount ??
            invoice.amount ??
            invoice.total,
            subscription?.currency
          )
        )
      );

      tbody.appendChild(
        row
      );

    }
  );

  table.appendChild(
    tbody
  );

  wrapper.appendChild(
    table
  );

  invoiceContainerEl.appendChild(
    wrapper
  );

}


/* =========================================================
   PAYMENTS
========================================================= */

function renderPayments() {

  if (!paymentContainerEl) {
    return;
  }

  paymentContainerEl.replaceChildren();

  if (!payments.length) {

    renderEmpty(
      paymentContainerEl,
      "No payment records are currently available."
    );

    return;

  }

  const wrapper =
    createElement(
      "div",
      "billing-table-wrap"
    );

  const table =
    createElement(
      "table",
      "billing-table"
    );

  const thead =
    document.createElement("thead");

  const headerRow =
    document.createElement("tr");

  [
    "Payment",
    "Invoice",
    "Status",
    "Method",
    "Paid",
    "Amount"
  ].forEach(
    heading => {

      headerRow.appendChild(
        createElement(
          "th",
          null,
          heading
        )
      );

    }
  );

  thead.appendChild(
    headerRow
  );

  table.appendChild(
    thead
  );

  const tbody =
    document.createElement("tbody");

  payments.forEach(
    payment => {

      const row =
        document.createElement("tr");

      const paymentCell =
        document.createElement("td");

      paymentCell.appendChild(
        createElement(
          "strong",
          null,
          payment.id
        )
      );

      paymentCell.appendChild(
        createElement(
          "span",
          "billing-subvalue",
          payment.provider_reference ||
          "—"
        )
      );

      row.appendChild(
        paymentCell
      );

      row.appendChild(
        createElement(
          "td",
          null,
          text(
            payment.invoice_id
          )
        )
      );

      const statusCell =
        document.createElement("td");

      statusCell.appendChild(
        createStatusBadge(
          payment.status
        )
      );

      row.appendChild(
        statusCell
      );

      row.appendChild(
        createElement(
          "td",
          null,
          text(
            payment.payment_method
          )
        )
      );

      row.appendChild(
        createElement(
          "td",
          null,
          formatDate(
            payment.paid_at
          )
        )
      );

      row.appendChild(
        createElement(
          "td",
          "amount",
          formatAmount(
            payment.amount,
            subscription?.currency
          )
        )
      );

      tbody.appendChild(
        row
      );

    }
  );

  table.appendChild(
    tbody
  );

  wrapper.appendChild(
    table
  );

  paymentContainerEl.appendChild(
    wrapper
  );

}


/* =========================================================
   LOAD BILLING
========================================================= */

async function loadBilling() {

  clearMessages();

  showStatus(
    "Checking billing access..."
  );

  await loadApplicationContext();

  if (!enforceBillingAccess()) {
    return;
  }

  showStatus(
    "Loading authoritative billing information..."
  );

  await loadSubscription();

  if (!subscription) {

    renderBillingSummary();
    renderSubscription();
    renderCycles();
    renderInvoices();
    renderPayments();

    showStatus(
      "No subscription record is currently available for this group."
    );

    return;

  }

  await Promise.all([
    loadCycles(),
    loadInvoices(),
    loadPayments()
  ]);

  renderBillingSummary();
  renderSubscription();
  renderCycles();
  renderInvoices();
  renderPayments();

  showStatus(
    "Billing information loaded."
  );

}


/* =========================================================
   ADMIN LAYOUT INITIALIZER
========================================================= */

export async function initBilling() {

  try {

    await loadBilling();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: billing page failed to load",
      error
    );

    showError(
      error?.message ||
      "Unable to load billing information."
    );

  }

}

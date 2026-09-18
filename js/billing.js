/* =========================================================
   CHAMA LIVE — BILLING

   CONTROLLED APPLICATION-LAYER VERSION

   Scope
   ---------------------------------------------------------
   - Reads the existing subscription/billing model.
   - Displays authoritative database state.
   - Uses the existing auth.js application context.
   - Does not calculate settlement state.
   - Does not create billing records.
   - Does not modify contribution/accounting data.
   - Does not introduce replacement RPCs.
   - Database remains the authoritative security boundary.

   Canonical relationship
   ---------------------------------------------------------
   group_subscriptions
        ↓
   subscription_cycles
        ↓
   subscription_invoices
        ↓
   subscription_payments

   Existing RPC intentionally used for subscription lookup:
   - get_group_subscription(uuid)

   This page is read-only.
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

    statusEl.hidden =
      true;

    statusEl.textContent =
      "";

  }


  if (errorEl) {

    errorEl.hidden =
      true;

    errorEl.textContent =
      "";

  }

}


function showStatus(
  message
) {

  if (!statusEl) {
    return;
  }


  statusEl.textContent =
    message;


  statusEl.hidden =
    false;

}


function showError(
  message
) {

  if (!errorEl) {
    return;
  }


  errorEl.textContent =
    message;


  errorEl.hidden =
    false;

}


/* =========================================================
   AUTHORIZATION / APPLICATION CONTEXT
========================================================= */

/*
 * Use the existing centralized application context.
 *
 * Do not independently determine:
 *
 *     owner_user_id
 *     group ownership
 *     member role
 *     current group
 *
 * The database/RLS remains authoritative.
 */

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
    Boolean(
      isOwner
    );


  currentRole =
    String(
      role || ""
    )
      .trim()
      .toLowerCase();


  return {

    user:
      currentUser,

    member:
      currentMember,

    group:
      currentGroup,

    isOwner:
      currentIsOwner,

    role:
      currentRole

  };

}


/* =========================================================
   SUBSCRIPTION
========================================================= */

/*
 * Existing authoritative RPC:
 *
 *     get_group_subscription(uuid)
 *
 * Returned fields include:
 *
 *     subscription_id
 *     group_id
 *     status
 *     started_at
 *     pricing_tier_code
 *     standard_group_amount
 *     standard_member_login_amount
 *     currency
 */

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
        p_group_id:
          groupId
      }
    );


  if (error) {
    throw error;
  }


  subscription =
    Array.isArray(
      data
    )
      ? (
          data[0] ||
          null
        )
      : (
          data ||
          null
        );


  return subscription;

}


/* =========================================================
   DIRECT TABLE READS
========================================================= */

/*
 * These reads retrieve records already created by
 * the authoritative billing model.
 *
 * No settlement logic is recreated here.
 *
 * RLS remains responsible for access control.
 */


/* ---------------------------------------------------------
   CYCLES
--------------------------------------------------------- */

async function loadCycles() {

  const subscriptionId =
    subscription?.subscription_id;


  if (!subscriptionId) {

    cycles =
      [];

    return cycles;

  }


  const {
    data,
    error
  } =
    await supabase

      .from(
        "subscription_cycles"
      )

      .select(
        "*"
      )

      .eq(
        "subscription_id",
        subscriptionId
      )

      .order(
        "cycle_number",
        {
          ascending:
            false
        }
      );


  if (error) {
    throw error;
  }


  cycles =
    data ||
    [];


  return cycles;

}


/* ---------------------------------------------------------
   INVOICES
--------------------------------------------------------- */

async function loadInvoices() {

  const subscriptionId =
    subscription?.subscription_id;


  const groupId =
    currentGroup?.id;


  if (
    !subscriptionId ||
    !groupId
  ) {

    invoices =
      [];

    return invoices;

  }


  const {
    data,
    error
  } =
    await supabase

      .from(
        "subscription_invoices"
      )

      .select(
        "*"
      )

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
          ascending:
            false
        }
      );


  if (error) {
    throw error;
  }


  invoices =
    data ||
    [];


  return invoices;

}


/* ---------------------------------------------------------
   PAYMENTS
--------------------------------------------------------- */

async function loadPayments() {

  const groupId =
    currentGroup?.id;


  if (!groupId) {

    payments =
      [];

    return payments;

  }


  const {
    data,
    error
  } =
    await supabase

      .from(
        "subscription_payments"
      )

      .select(
        "*"
      )

      .eq(
        "group_id",
        groupId
      )

      .order(
        "created_at",
        {
          ascending:
            false
        }
      );


  if (error) {
    throw error;
  }


  payments =
    data ||
    [];


  return payments;

}
 /* =========================================================
   FORMATTING
========================================================= */

function formatAmount(
  amount,
  currency
) {

  if (
    amount === null ||
    amount === undefined
  ) {

    return "—";

  }


  const numericAmount =
    Number(
      amount
    );


  if (
    !Number.isFinite(
      numericAmount
    )
  ) {

    return String(
      amount
    );

  }


  const code =
    String(
      currency ||
      subscription?.currency ||
      "KES"
    )
      .toUpperCase();


  return (
    `${code} ` +
    numericAmount.toLocaleString(
      "en-KE",
      {
        minimumFractionDigits:
          2,

        maximumFractionDigits:
          2
      }
    )
  );

}


function formatDate(
  value
) {

  if (!value) {
    return "—";
  }


  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(
      value
    );

  }


  return date.toLocaleString(
    "en-KE",
    {
      dateStyle:
        "medium",

      timeStyle:
        "short"
    }
  );

}


function text(
  value,
  fallback = "—"
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return fallback;

  }


  return String(
    value
  );

}


function createElement(
  tag,
  className,
  content
) {

  const element =
    document.createElement(
      tag
    );


  if (className) {

    element.className =
      className;

  }


  if (
    content !== undefined
  ) {

    element.textContent =
      content;

  }


  return element;

}


/* =========================================================
   STATUS BADGE
========================================================= */

function createStatusBadge(
  value
) {

  return createElement(
    "span",
    "billing-badge-status",
    text(
      value
    ).replace(
      /_/g,
      " "
    )
  );

}


/* =========================================================
   BILLING OVERVIEW
========================================================= */

function renderBillingSummary() {

  if (!billingSummaryGridEl) {
    return;
  }


  billingSummaryGridEl.replaceChildren();


  const currentInvoice =
    invoices.length > 0
      ? invoices[0]
      : null;


  const lastPayment =
    payments.length > 0
      ? payments[0]
      : null;


  const currentCycle =
    cycles.length > 0
      ? cycles[0]
      : null;


  const cards = [

    [
      "Plan",
      text(
        subscription?.pricing_tier_code
      ),
      text(
        subscription?.status
      )
    ],


    [
      "Current Invoice",

      currentInvoice
        ? formatAmount(
            currentInvoice.total_amount,
            currentInvoice.currency
          )
        : "No invoice",

      currentInvoice
        ? text(
            currentInvoice.status
          )
        : "—"
    ],


    [
      "Due Date",

      currentInvoice
        ? formatDate(
            currentInvoice.due_at
          )
        : "—",

      currentCycle
        ? `Cycle ${text(
            currentCycle.cycle_number
          )}`
        : "—"
    ],


    [
      "Last Payment",

      lastPayment
        ? formatAmount(
            lastPayment.amount,
            subscription?.currency
          )
        : "No payments",

      lastPayment
        ? formatDate(
            lastPayment.paid_at
          )
        : "—"
    ]

  ];


  cards.forEach(
    function (
      [
        label,
        value,
        subvalue
      ]
    ) {

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


      card.appendChild(
        createElement(
          "span",
          "billing-subvalue",
          subvalue
        )
      );


      billingSummaryGridEl.appendChild(
        card
      );

    }
  );

}


/* =========================================================
   SUBSCRIPTION RENDER
========================================================= */

function renderSubscription() {

  if (!subscriptionGridEl) {
    return;
  }


  subscriptionGridEl.replaceChildren();


  if (!subscription) {

    subscriptionGridEl.appendChild(
      createElement(
        "div",
        "billing-empty",
        "No subscription record is available for this group."
      )
    );


    return;

  }


  const cards = [

    [
      "Status",
      subscription.status
    ],


    [
      "Pricing tier",
      subscription.pricing_tier_code
    ],


    [
      "Group amount",

      formatAmount(
        subscription.standard_group_amount,
        subscription.currency
      )
    ],


    [
      "Member login",

      formatAmount(
        subscription.standard_member_login_amount,
        subscription.currency
      )
    ]

  ];


  cards.forEach(
    function (
      [
        label,
        value
      ]
    ) {

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
          text(
            value
          )
        )
      );


      subscriptionGridEl.appendChild(
        card
      );

    }
  );

}


/* =========================================================
   CURRENT CYCLE RENDER
========================================================= */

function renderCycles() {

  if (!cycleGridEl) {
    return;
  }


  cycleGridEl.replaceChildren();


  const currentCycle =
    cycles.length > 0
      ? cycles[0]
      : null;


  if (!currentCycle) {

    cycleGridEl.appendChild(
      createElement(
        "div",
        "billing-empty",
        "No subscription cycle is available."
      )
    );


    return;

  }


  const cards = [

    [
      "Cycle",
      currentCycle.cycle_number
    ],


    [
      "Status",
      currentCycle.status
    ],


    [
      "Starts",
      formatDate(
        currentCycle.starts_at
      )
    ],


    [
      "Ends",
      formatDate(
        currentCycle.ends_at
      )
    ]

  ];


  cards.forEach(
    function (
      [
        label,
        value
      ]
    ) {

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


      if (
        label === "Status"
      ) {

        card.appendChild(
          createStatusBadge(
            value
          )
        );

      }

      else {

        card.appendChild(
          createElement(
            "span",
            "billing-value",
            text(
              value
            )
          )
        );

      }


      cycleGridEl.appendChild(
        card
      );

    }
  );

}
/* =========================================================
   INVOICE RENDER
========================================================= */

function renderInvoices() {

  if (!invoiceContainerEl) {
    return;
  }


  invoiceContainerEl.replaceChildren();


  if (
    !invoices ||
    invoices.length === 0
  ) {

    invoiceContainerEl.appendChild(
      createElement(
        "div",
        "billing-empty",
        "No invoices are available for this subscription."
      )
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
    document.createElement(
      "thead"
    );


  const headerRow =
    document.createElement(
      "tr"
    );


  [
    "Invoice",
    "Cycle",
    "Status",
    "Issued",
    "Due",
    "Total"
  ].forEach(
    function (
      heading
    ) {

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
    document.createElement(
      "tbody"
    );


  invoices.forEach(
    function (
      invoice
    ) {

      const row =
        document.createElement(
          "tr"
        );


      const cycle =
        cycles.find(
          function (
            item
          ) {

            return (
              item.id ===
              invoice.cycle_id
            );

          }
        );


      const invoiceCell =
        document.createElement(
          "td"
        );


      invoiceCell.appendChild(
        createElement(
          "strong",
          null,
          text(
            invoice.invoice_number
          )
        )
      );


      invoiceCell.appendChild(
        createElement(
          "span",
          "billing-subvalue",
          invoice.id
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
            cycle?.cycle_number
          )
        )
      );


      const statusCell =
        document.createElement(
          "td"
        );


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
            invoice.issued_at
          )
        )
      );


      row.appendChild(
        createElement(
          "td",
          null,
          formatDate(
            invoice.due_at
          )
        )
      );


      row.appendChild(
        createElement(
          "td",
          "amount",
          formatAmount(
            invoice.total_amount,
            invoice.currency
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
   PAYMENT RENDER
========================================================= */

function renderPayments() {

  if (!paymentContainerEl) {
    return;
  }


  paymentContainerEl.replaceChildren();


  if (
    !payments ||
    payments.length === 0
  ) {

    paymentContainerEl.appendChild(
      createElement(
        "div",
        "billing-empty",
        "No subscription payments are available."
      )
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
    document.createElement(
      "thead"
    );


  const headerRow =
    document.createElement(
      "tr"
    );


  [
    "Payment",
    "Invoice",
    "Status",
    "Method",
    "Paid",
    "Amount"
  ].forEach(
    function (
      heading
    ) {

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
    document.createElement(
      "tbody"
    );


  payments.forEach(
    function (
      payment
    ) {

      const row =
        document.createElement(
          "tr"
        );


      const paymentCell =
        document.createElement(
          "td"
        );


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
        document.createElement(
          "td"
        );


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
   LOAD ALL BILLING STATE
========================================================= */

async function loadBilling() {

  clearMessages();


  showStatus(
    "Loading authoritative billing information…"
  );


  /*
   * Step 1:
   * Existing centralized application context.
   */

  await loadApplicationContext();


  /*
   * Step 2:
   * Existing authoritative subscription RPC.
   */

  await loadSubscription();


  /*
   * If no subscription exists, there is no valid
   * subscription/cycle/invoice/payment chain to
   * manufacture in the frontend.
   */

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


  /*
   * Step 3:
   * Read existing authoritative records.
   *
   * Only records actually displayed by this page
   * are loaded.
   */

  await Promise.all([
    loadCycles(),
    loadInvoices(),
    loadPayments()
  ]);


  /*
   * Step 4:
   * Render the customer-facing billing view.
   *
   * No settlement calculation is performed.
   * No allocation or credit state is recreated.
   */

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
   INITIALIZER
========================================================= */

async function initBilling() {

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


/* =========================================================
   PAGE BOOT
   ---------------------------------------------------------
   This page owns its own billing initialization.
   No database write is performed.
========================================================= */

initBilling();


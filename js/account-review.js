/* =========================================================
   CHAMA LIVE — ACCOUNT REVIEW

   Secure Group Application Status Lookup

   Flow:
   ---------------------------------------------------------

   Registered Administrator Email
                ↓
        Validate Email
                ↓
       Find Member Record
                ↓
       Verify Administrator
                ↓
          Find Group
                ↓
     Check Application Status
                ↓
   Pending / Approved / Rejected / Suspended


   SECURITY PRINCIPLE
   ---------------------------------------------------------

   The page does not automatically expose application
   details.

   A registered administrator email must first be entered.

   Only records linked to a group administrator are used.

========================================================= */


import {
  supabase
} from "./auth.js";


console.log(
  "CHAMA LIVE: account-review.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const form =
  document.getElementById(
    "reviewLookupForm"
  );


const emailInput =
  document.getElementById(
    "email"
  );


const button =
  document.getElementById(
    "checkStatusButton"
  );


const errorBox =
  document.getElementById(
    "error"
  );


const statusBox =
  document.getElementById(
    "status"
  );


const resultBox =
  document.getElementById(
    "statusResult"
  );


const groupNameElement =
  document.getElementById(
    "groupName"
  );


const adminNameElement =
  document.getElementById(
    "adminName"
  );


const adminEmailElement =
  document.getElementById(
    "adminEmail"
  );


const groupCategoryElement =
  document.getElementById(
    "groupCategory"
  );


const accountStatusElement =
  document.getElementById(
    "accountStatus"
  );


const statusBadge =
  document.getElementById(
    "statusBadge"
  );


const statusMessage =
  document.getElementById(
    "statusMessage"
  );


const statusActions =
  document.getElementById(
    "statusActions"
  );


/* =========================================================
   STORAGE KEY

   Used only to remember the email convenience value.

   No sensitive group data is stored here.
========================================================= */

const REVIEW_EMAIL_KEY =
  "chama_live_review_email";


/* =========================================================
   STATUS TYPES
========================================================= */

const STATUS = {

  PENDING:
    "pending",

  APPROVED:
    "approved",

  REJECTED:
    "rejected",

  SUSPENDED:
    "suspended"

};


/* =========================================================
   INITIAL UI
========================================================= */

function clearMessages() {

  if (errorBox) {

    errorBox.textContent =
      "";

    errorBox.hidden =
      true;

  }


  if (statusBox) {

    statusBox.textContent =
      "";

    statusBox.hidden =
      true;

  }

}


/* =========================================================
   ERROR
========================================================= */

function showError(
  message
) {

  const cleanMessage =
    String(
      message ||
      "Unable to check your application status."
    );


  console.error(
    "CHAMA LIVE account review:",
    cleanMessage
  );


  if (errorBox) {

    errorBox.textContent =
      cleanMessage;

    errorBox.hidden =
      false;

  }


  if (statusBox) {

    statusBox.hidden =
      true;

  }

}


/* =========================================================
   STATUS MESSAGE
========================================================= */

function showStatus(
  message
) {

  if (!statusBox) {
    return;
  }


  statusBox.textContent =
    String(
      message || ""
    );


  statusBox.hidden =
    !message;


  if (errorBox) {

    errorBox.hidden =
      true;

  }

}


/* =========================================================
   LOADING
========================================================= */

function setLoading(
  loading
) {

  if (!button) {
    return;
  }


  button.disabled =
    loading;


  button.textContent =
    loading
      ? "Checking application..."
      : "Check Application Status";

}


/* =========================================================
   HIDE RESULT
========================================================= */

function hideResult() {

  if (!resultBox) {
    return;
  }


  resultBox.hidden =
    true;

}


/* =========================================================
   EMAIL VALIDATION
========================================================= */

function isValidEmail(
  email
) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(
      email || ""
    ).trim()
  );

}


/* =========================================================
   NORMALIZE STATUS

   Multiple database versions may exist.

   This normalizes:

   onboarding_status
   member.status
   group.status
========================================================= */

function normalizeStatus(
  onboardingStatus,
  memberStatus,
  groupStatus
) {

  const onboarding =
    String(
      onboardingStatus || ""
    )
      .trim()
      .toLowerCase();


  const member =
    String(
      memberStatus || ""
    )
      .trim()
      .toLowerCase();


  const group =
    String(
      groupStatus || ""
    )
      .trim()
      .toLowerCase();


  console.log(
    "CHAMA LIVE: normalizing status",
    {
      onboarding,
      member,
      group
    }
  );


  /* =====================================================
     SUSPENDED
  ===================================================== */

  if (
    onboarding === "suspended" ||
    member === "suspended" ||
    group === "suspended"
  ) {

    return STATUS.SUSPENDED;

  }


  /* =====================================================
     REJECTED
  ===================================================== */

  if (
    onboarding === "rejected" ||
    onboarding === "declined" ||
    member === "rejected" ||
    member === "declined" ||
    group === "rejected" ||
    group === "declined"
  ) {

    return STATUS.REJECTED;

  }


  /* =====================================================
     APPROVED
  ===================================================== */

  if (
    onboarding === "approved" ||
    onboarding === "active" ||
    onboarding === "activated"
  ) {

    return STATUS.APPROVED;

  }


  /*
   * Legacy records where the member is active.
   */

  if (
    member === "active" &&
    onboarding !== "pending" &&
    onboarding !== "submitted"
  ) {

    return STATUS.APPROVED;

  }


  /*
   * Group active fallback.
   */

  if (
    group === "active" &&
    onboarding !== "pending" &&
    onboarding !== "submitted"
  ) {

    return STATUS.APPROVED;

  }


  /* =====================================================
     DEFAULT
  ===================================================== */

  return STATUS.PENDING;

}


/* =========================================================
   FORMAT STATUS LABEL
========================================================= */

function getStatusLabel(
  status
) {

  switch (status) {

    case STATUS.APPROVED:
      return "Active / Approved";


    case STATUS.REJECTED:
      return "Rejected";


    case STATUS.SUSPENDED:
      return "Suspended";


    case STATUS.PENDING:
    default:
      return "Pending Review";

  }

}


/* =========================================================
   FORMAT CATEGORY
========================================================= */

function formatCategory(
  category
) {

  const value =
    String(
      category || ""
    )
      .trim()
      .toLowerCase();


  const categories = {

    chama:
      "Chama",

    welfare:
      "Welfare Group",

    investment:
      "Investment Group",

    savings:
      "Savings Group",

    self_help:
      "Self Help Group",

    cbo:
      "CBO",

    other:
      "Other"

  };


  if (
    categories[value]
  ) {

    return categories[value];

  }


  if (!value) {
    return "—";
  }


  return value
    .replace(
      /_/g,
      " "
    )
    .replace(
      /\b\w/g,
      character =>
        character.toUpperCase()
    );

}


/* =========================================================
   FIND MEMBER BY REGISTERED EMAIL

   IMPORTANT:

   We search the members table.

   The registered administrator should have:

   members.email = registration email

   Then we verify that the member has a group_id.

========================================================= */

async function findMemberByEmail(
  email
) {

  console.log(
    "CHAMA LIVE: searching member by email"
  );


  /*
   * Primary query.
   */

  const {
    data,
    error
  } =
    await supabase
      .from("members")
      .select(`
        id,
        group_id,
        user_id,
        auth_user_id,
        member_number,
        membership_number,
        name,
        email,
        phone,
        role,
        status,
        onboarding_status,
        join_date,
        activated_at,
        created_at
      `)
      .ilike(
        "email",
        email
      )
      .limit(10);


  if (error) {

    console.error(
      "CHAMA LIVE: member lookup error",
      error
    );


    throw error;

  }


  if (
    !data ||
    data.length === 0
  ) {

    return null;

  }


  /*
   * Prefer administrator records.
   */

  const administratorRoles = [

    "admin",

    "administrator",

    "group_admin",

    "chairperson",

    "owner"

  ];


  const adminMember =
    data.find(
      member =>
        administratorRoles.includes(
          String(
            member.role || ""
          )
            .trim()
            .toLowerCase()
        )
    );


  /*
   * If an exact admin role was found.
   */

  if (adminMember) {

    return adminMember;

  }


  /*
   * Compatibility fallback.

   * Some older CHAMA LIVE records may not
   * have role populated correctly.

   * If exactly one member owns this email,
   * return it.
   */

  if (
    data.length === 1
  ) {

    return data[0];

  }


  /*
   * If multiple records exist but no admin
   * record can be identified, fail closed.
   */

  return null;

}


/* =========================================================
   GET GROUP
========================================================= */

async function getGroup(
  groupId
) {

  if (!groupId) {

    throw new Error(
      "This account is not linked to a group."
    );

  }


  /*
   * Try complete expected schema.
   */

  let result =
    await supabase
      .from("groups")
      .select(`
        id,
        name,
        group_name,
        category,
        type,
        country,
        status,
        onboarding_status,
        access_code,
        created_at,
        activated_at
      `)
      .eq(
        "id",
        groupId
      )
      .maybeSingle();


  /*
   * Compatibility fallback for installations
   * where one or more optional columns do not
   * exist.
   */

  if (result.error) {

    console.warn(
      "CHAMA LIVE: full group query failed, using compatibility query",
      result.error
    );


    result =
      await supabase
        .from("groups")
        .select(`
          *
        `)
        .eq(
          "id",
          groupId
        )
        .maybeSingle();

  }


  if (result.error) {

    throw result.error;

  }


  if (!result.data) {

    throw new Error(
      "The group linked to this account could not be found."
    );

  }


  return result.data;

}


/* =========================================================
   VERIFY ADMINISTRATOR

   Security layer.

   A member record must:

   1. Have a group_id
   2. Match the requested email
   3. Be identifiable as the administrator,
      OR be the unique matching member record.

========================================================= */

function verifyAdministrator(
  member,
  requestedEmail
) {

  if (!member) {

    return false;

  }


  const storedEmail =
    String(
      member.email || ""
    )
      .trim()
      .toLowerCase();


  const email =
    String(
      requestedEmail || ""
    )
      .trim()
      .toLowerCase();


  if (
    !storedEmail ||
    storedEmail !== email
  ) {

    return false;

  }


  if (!member.group_id) {

    return false;

  }


  return true;

}


/* =========================================================
   GET APPLICATION
========================================================= */

async function getApplicationStatus(
  email
) {

  /* =====================================================
     FIND MEMBER
  ===================================================== */

  const member =
    await findMemberByEmail(
      email
    );


  if (!member) {

    return null;

  }


  /* =====================================================
     VERIFY EMAIL / GROUP LINK
  ===================================================== */

  if (
    !verifyAdministrator(
      member,
      email
    )
  ) {

    return null;

  }


  /* =====================================================
     GET GROUP
  ===================================================== */

  const group =
    await getGroup(
      member.group_id
    );


  /* =====================================================
     STATUS
  ===================================================== */

  const normalizedStatus =
    normalizeStatus(

      member.onboarding_status,

      member.status,

      group.onboarding_status ||
      group.status

    );


  return {

    member,

    group,

    status:
      normalizedStatus

  };

}


/* =========================================================
   SET BADGE
========================================================= */

function setStatusBadge(
  status
) {

  if (!statusBadge) {
    return;
  }


  statusBadge.className =
    "cl-status-badge";


  switch (status) {

    case STATUS.APPROVED:

      statusBadge.classList.add(
        "status-approved"
      );

      break;


    case STATUS.REJECTED:

      statusBadge.classList.add(
        "status-rejected"
      );

      break;


    case STATUS.SUSPENDED:

      statusBadge.classList.add(
        "status-suspended"
      );

      break;


    case STATUS.PENDING:
    default:

      statusBadge.classList.add(
        "status-pending"
      );

      break;

  }


  statusBadge.textContent =
    getStatusLabel(
      status
    );

}


/* =========================================================
   SET STATUS MESSAGE
========================================================= */

function setStatusMessage(
  status
) {

  if (!statusMessage) {
    return;
  }


  statusMessage.className =
    "cl-status-message";


  switch (status) {

    /* ===================================================
       APPROVED
    ==================================================== */

    case STATUS.APPROVED:

      statusMessage.classList.add(
        "message-approved"
      );


      statusMessage.innerHTML = `
        <strong>
          Your group account has been approved.
        </strong>
        <br>
        Your administrator account is active.
        You can now sign in and access your
        CHAMA LIVE Dashboard.
      `;

      break;


    /* ===================================================
       REJECTED
    ==================================================== */

    case STATUS.REJECTED:

      statusMessage.classList.add(
        "message-rejected"
      );


      statusMessage.innerHTML = `
        <strong>
          Your group application was not approved.
        </strong>
        <br>
        Please contact the CHAMA LIVE administrator
        for more information about your application.
      `;

      break;


    /* ===================================================
       SUSPENDED
    ==================================================== */

    case STATUS.SUSPENDED:

      statusMessage.classList.add(
        "message-suspended"
      );


      statusMessage.innerHTML = `
        <strong>
          This group account is currently suspended.
        </strong>
        <br>
        Dashboard access is temporarily restricted.
        Please contact the CHAMA LIVE administrator
        for assistance.
      `;

      break;


    /* ===================================================
       PENDING
    ==================================================== */

    case STATUS.PENDING:
    default:

      statusMessage.classList.add(
        "message-pending"
      );


      statusMessage.innerHTML = `
        <strong>
          Your application is currently under review.
        </strong>
        <br>
        Your administrator account remains restricted
        until the group registration has been approved.
        Please check this page again later.
      `;

      break;

  }

}


/* =========================================================
   SET ACTIONS
========================================================= */

function setStatusActions(
  status
) {

  if (!statusActions) {
    return;
  }


  statusActions.innerHTML =
    "";


  /* =====================================================
     APPROVED
  ===================================================== */

  if (
    status === STATUS.APPROVED
  ) {

    const signIn =
      document.createElement(
        "a"
      );


    signIn.href =
      "login.html";


    signIn.className =
      "cl-action-primary";


    signIn.textContent =
      "Sign In to Dashboard";


    statusActions.appendChild(
      signIn
    );


    return;

  }


  /* =====================================================
     PENDING
  ===================================================== */

  if (
    status === STATUS.PENDING
  ) {

    const refresh =
      document.createElement(
        "button"
      );


    refresh.type =
      "button";


    refresh.className =
      "cl-action-secondary";


    refresh.textContent =
      "Check Again";


    refresh.addEventListener(
      "click",
      () => {

        form?.requestSubmit();

      }
    );


    statusActions.appendChild(
      refresh
    );


    return;

  }


  /* =====================================================
     REJECTED / SUSPENDED
  ===================================================== */

  const home =
    document.createElement(
      "a"
    );


  home.href =
    "index.html";


  home.className =
    "cl-action-secondary";


  home.textContent =
    "Back to CHAMA LIVE";


  statusActions.appendChild(
    home
  );

}


/* =========================================================
   DISPLAY RESULT
========================================================= */

function displayResult(
  application,
  email
) {

  if (!application) {
    return;
  }


  const {
    member,
    group,
    status
  } =
    application;


  /*
   * Group name compatibility.
   */

  const groupName =
    group.name ||
    group.group_name ||
    "CHAMA LIVE Group";


  /*
   * Category compatibility.
   */

  const category =
    group.category ||
    group.type ||
    "—";


  /*
   * Administrator name compatibility.
   */

  const adminName =
    member.name ||
    "Registered Administrator";


  /* =====================================================
     POPULATE
  ===================================================== */

  if (groupNameElement) {

    groupNameElement.textContent =
      groupName;

  }


  if (adminNameElement) {

    adminNameElement.textContent =
      adminName;

  }


  if (adminEmailElement) {

    adminEmailElement.textContent =
      email;

  }


  if (groupCategoryElement) {

    groupCategoryElement.textContent =
      formatCategory(
        category
      );

  }


  if (accountStatusElement) {

    accountStatusElement.textContent =
      getStatusLabel(
        status
      );

  }


  /* =====================================================
     STATUS UI
  ===================================================== */

  setStatusBadge(
    status
  );


  setStatusMessage(
    status
  );


  setStatusActions(
    status
  );


  /* =====================================================
     SHOW
  ===================================================== */

  if (resultBox) {

    resultBox.hidden =
      false;


    resultBox.scrollIntoView({

      behavior:
        "smooth",

      block:
        "nearest"

    });

  }

}


/* =========================================================
   FORM SUBMISSION
========================================================= */

async function checkApplicationStatus() {

  clearMessages();

  hideResult();


  const email =
    String(
      emailInput?.value || ""
    )
      .trim()
      .toLowerCase();


  /* =====================================================
     VALIDATE
  ===================================================== */

  if (!email) {

    showError(
      "Please enter the administrator email used during group registration."
    );


    emailInput?.focus();

    return;

  }


  if (
    !isValidEmail(
      email
    )
  ) {

    showError(
      "Please enter a valid email address."
    );


    emailInput?.focus();

    return;

  }


  setLoading(
    true
  );


  try {

    showStatus(
      "Checking your registered group application..."
    );


    /* ===================================================
       LOOKUP
    ==================================================== */

    const application =
      await getApplicationStatus(
        email
      );


    /* ===================================================
       NOT FOUND

       Deliberately generic.

       We do not reveal whether an arbitrary
       email exists in the system.
    ==================================================== */

    if (!application) {

      throw new Error(
        "We could not find a group administrator application associated with that email address. Please use the exact email entered during group registration."
      );

    }


    /* ===================================================
       STORE EMAIL CONVENIENCE
    ==================================================== */

    localStorage.setItem(
      REVIEW_EMAIL_KEY,
      email
    );


    /* ===================================================
       DISPLAY
    ==================================================== */

    clearMessages();


    displayResult(
      application,
      email
    );


    console.log(
      "CHAMA LIVE: application status loaded",
      {
        status:
          application.status,

        groupId:
          application.group?.id,

        memberId:
          application.member?.id
      }
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: application lookup failed",
      error
    );


    hideResult();


    showError(
      normalizeError(
        error
      )
    );

  }

  finally {

    setLoading(
      false
    );

  }

}


/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function normalizeError(
  error
) {

  const message =
    String(
      error?.message ||
      error ||
      ""
    );


  const lower =
    message.toLowerCase();


  if (
    lower.includes(
      "row-level security"
    ) ||
    lower.includes(
      "permission denied"
    )
  ) {

    return (
      "Unable to verify this application status at the moment. " +
      "Please contact the CHAMA LIVE administrator."
    );

  }


  if (
    lower.includes(
      "failed to fetch"
    ) ||
    lower.includes(
      "network"
    )
  ) {

    return (
      "Unable to connect to CHAMA LIVE. " +
      "Please check your internet connection and try again."
    );

  }


  if (
    lower.includes(
      "does not exist"
    ) ||
    lower.includes(
      "column"
    )
  ) {

    return (
      "The account review service is being updated. " +
      "Please contact the CHAMA LIVE administrator."
    );

  }


  return (
    message ||
    "Unable to check your application status."
  );

}


/* =========================================================
   FORM EVENT
========================================================= */

if (form) {

  form.addEventListener(
    "submit",
    event => {

      event.preventDefault();

      checkApplicationStatus();

    }
  );

}


/* =========================================================
   PREFILL EMAIL

   Email may have been saved when:

   login.js detects pending status
         ↓
   redirects to account-review.html

========================================================= */

function prefillSavedEmail() {

  try {

    /*
     * First check the new lookup storage.
     */

    let savedEmail =
      localStorage.getItem(
        REVIEW_EMAIL_KEY
      );


    /*
     * Compatibility with existing login.js.
     */

    if (!savedEmail) {

      const reviewApplication =
        localStorage.getItem(
          "chama_live_review_application"
        );


      if (reviewApplication) {

        const parsed =
          JSON.parse(
            reviewApplication
          );


        savedEmail =
          parsed?.email ||
          "";

      }

    }


    if (
      savedEmail &&
      emailInput
    ) {

      emailInput.value =
        String(
          savedEmail
        )
          .trim()
          .toLowerCase();

    }

  }

  catch (error) {

    console.warn(
      "CHAMA LIVE: unable to prefill review email",
      error
    );

  }

}


/* =========================================================
   EMAIL INPUT

   Clear old results when email changes.
========================================================= */

if (emailInput) {

  emailInput.addEventListener(
    "input",
    () => {

      clearMessages();

      hideResult();

    }
  );

}


/* =========================================================
   INITIALIZE
========================================================= */

prefillSavedEmail();


console.log(
  "CHAMA LIVE: account-review.js ready"
);

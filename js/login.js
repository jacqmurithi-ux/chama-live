/* =========================================================
   CHAMA LIVE — LOGIN

   Approval-aware authentication.

   Flow:
   ---------------------------------------------------------
   Supabase Auth
        ↓
   Find member
        ↓
   Check onboarding_status
        ↓
   pending  → account-review.html
   rejected → review/rejection message
   approved → dashboard.html

   Group context remains:
        auth user
           ↓
        members
           ↓
        group_id
           ↓
        getMyGroup()
========================================================= */

import {
  supabase,
  BASE_URL
} from "./auth.js";


console.log(
  "CHAMA LIVE: login.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const form =
  document.getElementById(
    "loginForm"
  );


const emailInput =
  document.getElementById(
    "email"
  );


const passwordInput =
  document.getElementById(
    "password"
  );


const button =
  document.getElementById(
    "loginButton"
  );


const errorBox =
  document.getElementById(
    "error"
  );


const successBox =
  document.getElementById(
    "success"
  );


/* =========================================================
   PAGES
========================================================= */

const DASHBOARD =
  `${BASE_URL}/dashboard.html`;


const REVIEW_PAGE =
  `${BASE_URL}/account-review.html`;


/* =========================================================
   ERROR
========================================================= */

function showError(
  message
) {

  const cleanMessage =
    String(
      message ||
      "Unable to sign in."
    );


  console.error(
    "CHAMA LIVE login:",
    cleanMessage
  );


  if (errorBox) {

    errorBox.textContent =
      cleanMessage;

    errorBox.hidden =
      false;

  }

}


/* =========================================================
   CLEAR ERROR
========================================================= */

function clearError() {

  if (errorBox) {

    errorBox.textContent =
      "";

    errorBox.hidden =
      true;

  }


  if (successBox) {

    successBox.textContent =
      "";

    successBox.hidden =
      true;

  }

}


/* =========================================================
   SUCCESS
========================================================= */

function showSuccess(
  message
) {

  if (!successBox) {
    return;
  }


  successBox.textContent =
    String(
      message || ""
    );


  successBox.hidden =
    !message;

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
      ? "Signing in..."
      : "Sign In";

}


/* =========================================================
   LOGIN ERROR
========================================================= */

function normalizeLoginError(
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
      "invalid login credentials"
    )
  ) {

    return (
      "Incorrect email or password. " +
      "Please check your details and try again."
    );

  }


  if (
    lower.includes(
      "email not confirmed"
    )
  ) {

    return (
      "Your email address has not been confirmed. " +
      "Please check your email and confirm your account."
    );

  }


  if (
    lower.includes(
      "too many requests"
    )
  ) {

    return (
      "Too many login attempts. " +
      "Please wait a few minutes and try again."
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
      "Please check your internet connection."
    );

  }


  return (
    message ||
    "Unable to sign in."
  );

}


/* =========================================================
   GET MEMBER FOR AUTH USER
========================================================= */

async function getMemberForUser(
  userId
) {

  let {
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
        role,
        status,
        onboarding_status,
        join_date,
        activated_at
      `)
      .eq(
        "auth_user_id",
        userId
      )
      .limit(1);


  /*
   * Compatibility fallback for
   * older records.
   */

  if (
    (!data || data.length === 0) &&
    !error
  ) {

    const fallback =
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
          role,
          status,
          onboarding_status,
          join_date,
          activated_at
        `)
        .eq(
          "user_id",
          userId
        )
        .limit(1);


    if (fallback.error) {
      throw fallback.error;
    }


    data =
      fallback.data;

  }


  if (error) {
    throw error;
  }


  if (
    !data ||
    data.length === 0
  ) {

    throw new Error(
      "No member record is linked to this account."
    );

  }


  return data[0];

}


/* =========================================================
   CHECK APPROVAL
========================================================= */

async function checkAccountStatus(
  user
) {

  const member =
    await getMemberForUser(
      user.id
    );


  if (!member?.group_id) {

    throw new Error(
      "Your member record is not linked to a group."
    );

  }


  const onboardingStatus =
    String(
      member.onboarding_status ||
      ""
    )
      .trim()
      .toLowerCase();


  const memberStatus =
    String(
      member.status ||
      ""
    )
      .trim()
      .toLowerCase();


  console.log(
    "CHAMA LIVE: account status",
    {
      memberId:
        member.id,

      groupId:
        member.group_id,

      onboardingStatus,

      memberStatus
    }
  );


  /* =====================================================
     REJECTED
  ===================================================== */

  if (
    onboardingStatus ===
      "rejected" ||
    memberStatus ===
      "rejected"
  ) {

    return {

      allowed:
        false,

      reason:
        "rejected",

      member

    };

  }


  /* =====================================================
     PENDING
  ===================================================== */

  if (
    onboardingStatus ===
      "pending" ||
    onboardingStatus ===
      "submitted" ||
    memberStatus ===
      "pending"
  ) {

    return {

      allowed:
        false,

      reason:
        "pending",

      member

    };

  }


  /* =====================================================
     APPROVED / ACTIVE
  ===================================================== */

  if (
    onboardingStatus ===
      "approved" ||
    onboardingStatus ===
      "active"
  ) {

    return {

      allowed:
        memberStatus !==
          "suspended" &&
        memberStatus !==
          "inactive",

      reason:
        "approved",

      member

    };

  }


  /*
   * Legacy active records.
   */

  if (
    memberStatus ===
    "active"
  ) {

    return {

      allowed:
        true,

      reason:
        "approved",

      member

    };

  }


  /*
   * Unknown status:
   * fail closed.
   */

  return {

    allowed:
      false,

    reason:
      "pending",

    member

  };

}


/* =========================================================
   REDIRECT
========================================================= */

function redirect(
  url
) {

  window.location.replace(
    url
  );

}


/* =========================================================
   LOGIN
========================================================= */

async function performLogin() {

  clearError();


  const email =
    emailInput?.value
      .trim()
      .toLowerCase() ||
    "";


  const password =
    passwordInput?.value ||
    "";


  if (!email) {

    showError(
      "Please enter your email address."
    );

    emailInput?.focus();

    return;

  }


  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {

    showError(
      "Please enter a valid email address."
    );

    emailInput?.focus();

    return;

  }


  if (!password) {

    showError(
      "Please enter your password."
    );

    passwordInput?.focus();

    return;

  }


  setLoading(
    true
  );


  try {

    /* ===================================================
       SUPABASE LOGIN
    ================================================== */

    showSuccess(
      "Authenticating..."
    );


    const {
      data,
      error
    } =
      await supabase.auth.signInWithPassword({

        email,

        password

      });


    if (error) {
      throw error;
    }


    if (
      !data?.user ||
      !data?.session
    ) {

      throw new Error(
        "Login was not completed."
      );

    }


    /* ===================================================
       CHECK MEMBER / APPROVAL
    ================================================== */

    showSuccess(
      "Checking your group account..."
    );


    const account =
      await checkAccountStatus(
        data.user
      );


    /* ===================================================
       PENDING
    ================================================== */

    if (
      account.reason ===
      "pending"
    ) {

      await supabase.auth.signOut();


      localStorage.setItem(
        "chama_live_review_application",
        JSON.stringify({

          member_number:
            account.member
              ?.member_number ||
            account.member
              ?.membership_number ||
            null,

          email:
            email

        })
      );


      redirect(
        REVIEW_PAGE
      );


      return;

    }


    /* ===================================================
       REJECTED
    ================================================== */

    if (
      account.reason ===
      "rejected"
    ) {

      await supabase.auth.signOut();


      throw new Error(
        "Your CHAMA LIVE account application was not approved. Please contact the CHAMA LIVE administrator for assistance."
      );

    }


    /* ===================================================
       APPROVED
    ================================================== */

    if (!account.allowed) {

      await supabase.auth.signOut();


      throw new Error(
        "Your account is not currently active. Please contact your group administrator."
      );

    }


    /* ===================================================
       CLEAR PASSWORD
    ================================================== */

    if (passwordInput) {

      passwordInput.value =
        "";

    }


    showSuccess(
      "Account approved. Opening Dashboard..."
    );


    /*
     * Important:
     *
     * Dashboard will independently call:
     *
     * requireAuth()
     * getMyMember()
     * getMyGroup()
     *
     * Therefore group context is NOT passed
     * through the URL.
     */

    redirect(
      DASHBOARD
    );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: login failed",
      error
    );


    showError(
      normalizeLoginError(
        error
      )
    );


    setLoading(
      false
    );

  }

}


/* =========================================================
   EXISTING SESSION
========================================================= */

async function checkExistingSession() {

  try {

    const {
      data,
      error
    } =
      await supabase.auth.getSession();


    if (error) {
      return;
    }


    const session =
      data?.session;


    if (!session?.user) {
      return;
    }


    /*
     * Do NOT automatically trust an existing
     * authenticated session.
     *
     * Check the member approval status.
     */

    const account =
      await checkAccountStatus(
        session.user
      );


    if (
      account.allowed
    ) {

      redirect(
        DASHBOARD
      );


      return;

    }


    if (
      account.reason ===
      "pending"
    ) {

      redirect(
        REVIEW_PAGE
      );


      return;

    }


    /*
     * Unknown/rejected account.
     */

    await supabase.auth.signOut();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: existing session check failed",
      error
    );

  }

}


/* =========================================================
   FORM
========================================================= */

if (form) {

  form.addEventListener(
    "submit",
    event => {

      event.preventDefault();

      performLogin();

    }
  );

}


/* =========================================================
   INITIALIZE
========================================================= */

checkExistingSession();


console.log(
  "CHAMA LIVE: login.js ready"
);

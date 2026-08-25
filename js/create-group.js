import { supabase } from "./supabase.js";


/* =====================================================
   ELEMENTS
===================================================== */

const $ = (id) => document.getElementById(id);

const form = $("createGroupForm");
const statusBox = $("status");
const errorBox = $("error");
const successBox = $("success");

const createButton = $("createGroupButton");

const accessCodeBox = $("accessCode");
const memberNumberBox = $("memberNumber");

const copyCodeButton = $("copyCode");


/* =====================================================
   STORAGE
===================================================== */

const PENDING_KEY =
  "chama_live_pending_group_onboarding";


/* =====================================================
   INIT
===================================================== */

async function init() {

  clearError();

  const pending =
    loadPendingOnboarding();


  /*
   * If the user has already authenticated
   * and previously started onboarding,
   * restore the safe fields.
   */

  if (pending) {

    restorePendingForm(pending);

    showStatus(
      "Your previous group setup was saved. " +
      "Complete the setup below."
    );

  }


  /*
   * If already logged in, don't create
   * another Auth account.
   */

  const {
    data: {
      session
    }
  } = await supabase.auth.getSession();


  if (session?.user) {

    showStatus(
      "You are already signed in. " +
      "Submit the form to create the group."
    );

    if (pending) {

      showStatus(
        "Your saved group setup is ready. " +
        "Click Create Group Account to finish."
      );

    }

  }

}


/* =====================================================
   FORM SUBMIT
===================================================== */

form.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();

    clearError();

    hideSuccess();


    try {

      const values =
        readForm();


      validateForm(
        values
      );


      /*
       * Save only non-sensitive onboarding data.
       *
       * NEVER save the password to localStorage.
       */

      savePendingOnboarding(
        values
      );


      setLoading(
        true
      );


      /*
       * Check whether there is already
       * an authenticated session.
       */

      let {
        data: {
          session
        }
      } =
        await supabase.auth.getSession();


      /*
       * -------------------------------------------------
       * STEP 1
       * CREATE AUTH ACCOUNT IF NOT LOGGED IN
       * -------------------------------------------------
       */

      if (!session?.user) {

        showStatus(
          "Creating your login account..."
        );


        const {
          data,
          error
        } =
          await supabase.auth.signUp({

            email:
              values.email,

            password:
              values.password,

            options: {

              data: {

                full_name:
                  values.adminName

              }

            }

          });


        if (error) {

          throw error;

        }


        session =
          data.session;


        /*
         * Email confirmation may be enabled.
         *
         * In that case Supabase returns a user
         * but no active session.
         */

        if (!session) {

          setLoading(
            false
          );


          showStatus(
            "Your account was created. " +
            "Please check your email and confirm " +
            "your account, then return to this page " +
            "to finish creating the group."
          );


          return;

        }

      }


      /*
       * -------------------------------------------------
       * STEP 2
       * CREATE GROUP + FIRST ADMIN MEMBER
       * -------------------------------------------------
       */

      showStatus(
        "Creating your group..."
      );


      const {
        data,
        error
      } =
        await supabase.rpc(
          "create_group_account",
          {

            p_name:
              values.groupName,

            p_category:
              values.category,

            p_monthly_contribution:
              values.monthlyContribution,

            p_description:
              values.description,

            p_admin_name:
              values.adminName,

            p_admin_phone:
              values.adminPhone,

            p_country:
              values.country

          }
        );


      if (error) {

        throw error;

      }


      const result =
        Array.isArray(data)
          ? data[0]
          : data;


      if (!result) {

        throw new Error(
          "The group was not created. " +
          "No result was returned."
        );

      }


      /*
       * Remove pending onboarding data
       */

      localStorage.removeItem(
        PENDING_KEY
      );


      /*
       * Show result
       */

      accessCodeBox.textContent =
        result.access_code || "—";


      memberNumberBox.textContent =
        result.member_number || "0001";


      form.hidden =
        true;


      errorBox.hidden =
        true;


      successBox.hidden =
        false;


      showStatus(
        "Your CHAMA LIVE group account is ready."
      );


      /*
       * Store group information for
       * optional dashboard welcome.
       */

      localStorage.setItem(
        "chama_live_new_group",
        JSON.stringify({

          group_id:
            result.group_id,

          access_code:
            result.access_code,

          member_id:
            result.member_id,

          member_number:
            result.member_number

        })
      );


    } catch (error) {

      console.error(
        "CREATE GROUP ERROR:",
        error
      );


      showError(
        friendlyError(
          error
        )
      );

    } finally {

      setLoading(
        false
      );

    }

  }
);


/* =====================================================
   READ FORM
===================================================== */

function readForm() {

  return {

    groupName:
      $("groupName").value.trim(),

    category:
      $("category").value.trim(),

    country:
      $("country").value.trim() ||
      "Kenya",

    monthlyContribution:
      Number(
        $("monthlyContribution").value || 0
      ),

    description:
      $("description").value.trim(),

    adminName:
      $("adminName").value.trim(),

    adminPhone:
      normalizePhone(
        $("adminPhone").value
      ),

    email:
      $("email").value.trim().toLowerCase(),

    password:
      $("password").value,

    confirmPassword:
      $("confirmPassword").value

  };

}


/* =====================================================
   VALIDATION
===================================================== */

function validateForm(values) {

  if (!values.groupName) {

    throw new Error(
      "Please enter the group name."
    );

  }


  if (values.groupName.length < 2) {

    throw new Error(
      "Group name is too short."
    );

  }


  if (
    !Number.isFinite(
      values.monthlyContribution
    ) ||
    values.monthlyContribution < 0
  ) {

    throw new Error(
      "Monthly contribution must be zero or greater."
    );

  }


  if (!values.adminName) {

    throw new Error(
      "Please enter the administrator's name."
    );

  }


  if (!values.adminPhone) {

    throw new Error(
      "Please enter the administrator's phone number."
    );

  }


  if (!isValidEmail(values.email)) {

    throw new Error(
      "Please enter a valid email address."
    );

  }


  if (
    values.password.length < 8
  ) {

    throw new Error(
      "Password must contain at least 8 characters."
    );

  }


  if (
    values.password !==
    values.confirmPassword
  ) {

    throw new Error(
      "Passwords do not match."
    );

  }

}


/* =====================================================
   PHONE
===================================================== */

function normalizePhone(phone) {

  let value =
    String(
      phone || ""
    ).trim();


  value =
    value.replace(
      /[\s()-]/g,
      ""
    );


  /*
   * Kenya:
   *
   * 0712345678
   * -> +254712345678
   *
   * 712345678
   * -> +254712345678
   */

  if (
    /^07\d{8}$/.test(
      value
    )
  ) {

    return (
      "+254" +
      value.substring(1)
    );

  }


  if (
    /^01\d{8}$/.test(
      value
    )
  ) {

    return (
      "+254" +
      value.substring(1)
    );

  }


  if (
    /^7\d{8}$/.test(
      value
    )
  ) {

    return (
      "+254" +
      value
    );

  }


  if (
    /^1\d{8}$/.test(
      value
    )
  ) {

    return (
      "+254" +
      value
    );

  }


  return value;

}


/* =====================================================
   EMAIL
===================================================== */

function isValidEmail(email) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );

}


/* =====================================================
   SAVE PENDING DATA
===================================================== */

function savePendingOnboarding(
  values
) {

  const safeData = {

    groupName:
      values.groupName,

    category:
      values.category,

    country:
      values.country,

    monthlyContribution:
      values.monthlyContribution,

    description:
      values.description,

    adminName:
      values.adminName,

    adminPhone:
      values.adminPhone,

    email:
      values.email

  };


  localStorage.setItem(
    PENDING_KEY,
    JSON.stringify(
      safeData
    )
  );

}


/* =====================================================
   LOAD PENDING DATA
===================================================== */

function loadPendingOnboarding() {

  try {

    const raw =
      localStorage.getItem(
        PENDING_KEY
      );


    if (!raw) {

      return null;

    }


    return JSON.parse(
      raw
    );

  } catch {

    localStorage.removeItem(
      PENDING_KEY
    );

    return null;

  }

}


/* =====================================================
   RESTORE FORM
===================================================== */

function restorePendingForm(
  data
) {

  if (
    data.groupName
  ) {

    $("groupName").value =
      data.groupName;

  }


  if (
    data.category
  ) {

    $("category").value =
      data.category;

  }


  if (
    data.country
  ) {

    $("country").value =
      data.country;

  }


  if (
    data.monthlyContribution !==
    undefined
  ) {

    $("monthlyContribution").value =
      data.monthlyContribution;

  }


  if (
    data.description
  ) {

    $("description").value =
      data.description;

  }


  if (
    data.adminName
  ) {

    $("adminName").value =
      data.adminName;

  }


  if (
    data.adminPhone
  ) {

    $("adminPhone").value =
      data.adminPhone;

  }


  if (
    data.email
  ) {

    $("email").value =
      data.email;

  }

}


/* =====================================================
   LOADING
===================================================== */

function setLoading(
  loading
) {

  if (!createButton) {

    return;

  }


  if (loading) {

    createButton.disabled =
      true;

    createButton.dataset.originalText =
      createButton.textContent;

    createButton.textContent =
      "Please wait...";

    form.classList.add(
      "loading"
    );

  } else {

    createButton.disabled =
      false;

    createButton.textContent =
      createButton.dataset.originalText ||
      "Create Group Account";

    form.classList.remove(
      "loading"
    );

  }

}


/* =====================================================
   STATUS
===================================================== */

function showStatus(
  message
) {

  if (!statusBox) {

    return;

  }


  statusBox.textContent =
    message;

  statusBox.hidden =
    false;

}


/* =====================================================
   ERROR
===================================================== */

function clearError() {

  if (!errorBox) {

    return;

  }


  errorBox.hidden =
    true;

  errorBox.textContent =
    "";

}


function showError(
  message
) {

  if (!errorBox) {

    return;

  }


  errorBox.textContent =
    message;

  errorBox.hidden =
    false;


  showStatus(
    "Group setup could not be completed."
  );

}


function hideSuccess() {

  if (successBox) {

    successBox.hidden =
      true;

  }

}


/* =====================================================
   FRIENDLY ERRORS
===================================================== */

function friendlyError(
  error
) {

  const message =
    error?.message ||
    String(error) ||
    "Unable to create the group.";


  if (
    message.includes(
      "User already registered"
    )
  ) {

    return (
      "An account with this email already exists. " +
      "Please sign in first, then return here " +
      "to create the group."
    );

  }


  if (
    message.includes(
      "email rate limit"
    )
  ) {

    return (
      "Too many signup attempts were made. " +
      "Please wait a little while and try again."
    );

  }


  if (
    message.includes(
      "Not authenticated"
    )
  ) {

    return (
      "Your login session is not active. " +
      "Please sign in again and retry."
    );

  }


  if (
    message.includes(
      "create_group_account"
    )
  ) {

    return (
      "The group onboarding service is not available. " +
      "Please contact the system administrator."
    );

  }


  return message;

}


/* =====================================================
   COPY ACCESS CODE
===================================================== */

if (copyCodeButton) {

  copyCodeButton.addEventListener(
    "click",
    async () => {

      const code =
        accessCodeBox.textContent.trim();


      if (!code) {

        return;

      }


      try {

        await navigator.clipboard.writeText(
          code
        );


        copyCodeButton.textContent =
          "Copied!";


        setTimeout(
          () => {

            copyCodeButton.textContent =
              "Copy Access Code";

          },
          1800
        );


      } catch {

        alert(
          `Group access code: ${code}`
        );

      }

    }
  );

}


/* =====================================================
   START
===================================================== */

init();

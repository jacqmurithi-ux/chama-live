import { supabase } from "./supabase.js";

/* =====================================================
   CHAMA LIVE — CREATE GROUP / ONBOARDING

   GitHub Pages:
   https://jacqmurithi-ux.github.io/chama-live/create-group.html
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

const PENDING_KEY =
  "chama_live_pending_group_onboarding";

const NEW_GROUP_KEY =
  "chama_live_new_group";

/*
 * IMPORTANT:
 * This is the exact GitHub Pages page that the
 * Supabase confirmation email must return to.
 */
const CREATE_GROUP_PAGE =
  "https://jacqmurithi-ux.github.io/chama-live/create-group.html";


/* =====================================================
   INITIALIZE
===================================================== */

async function init() {

  clearError();

  hideSuccess();

  const pending =
    loadPendingOnboarding();


  /*
   * Restore group information previously entered
   * before email confirmation.
   */

  if (pending) {

    restorePendingForm(
      pending
    );

  }


  /*
   * Check whether the user is already authenticated.
   */

  const {
    data,
    error
  } =
    await supabase.auth.getSession();


  if (error) {

    console.error(
      "GET SESSION ERROR:",
      error
    );

    showError(
      "Unable to check your login session. " +
      "Please refresh the page and try again."
    );

    return;

  }


  const session =
    data?.session;


  /*
   * User has already confirmed/logged in.
   */

  if (session?.user) {

    if (pending) {

      showStatus(
        "Your saved group setup is ready. " +
        "Click Create Group Account to finish."
      );

    } else {

      showStatus(
        "You are already signed in. " +
        "Submit the form to create the group."
      );

    }

    return;

  }


  /*
   * User is not authenticated.
   */

  if (pending) {

    showStatus(
      "Your group details have been saved. " +
      "Confirm your email, then return here " +
      "to finish creating your group."
    );

  }

}


/* =====================================================
   SUPABASE AUTH STATE
===================================================== */

supabase.auth.onAuthStateChange(
  (event, session) => {

    console.log(
      "AUTH EVENT:",
      event
    );


    if (!session?.user) {

      return;

    }


    const pending =
      loadPendingOnboarding();


    /*
     * After email confirmation Supabase should
     * establish a session and return the user here.
     */

    if (pending) {

      restorePendingForm(
        pending
      );

      showStatus(
        "Email confirmed successfully. " +
        "Your saved group details are ready. " +
        "Click Create Group Account to finish."
      );

    } else if (
      event === "SIGNED_IN"
    ) {

      showStatus(
        "You are signed in. " +
        "Submit the form to create the group."
      );

    }

  }
);


/* =====================================================
   FORM SUBMIT
===================================================== */

if (form) {

  form.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();

      clearError();

      hideSuccess();


      let values;


      try {

        /*
         * Read form.
         */

        values =
          readForm();


        /*
         * Validate.
         */

        validateForm(
          values
        );


        /*
         * Save safe onboarding data.
         *
         * NEVER save the password.
         */

        savePendingOnboarding(
          values
        );


        setLoading(
          true
        );


        /* =============================================
           STEP 1
           CHECK EXISTING SESSION
        ============================================= */

        showStatus(
          "Checking your account..."
        );


        let {
          data: sessionData,
          error: sessionError
        } =
          await supabase.auth.getSession();


        if (sessionError) {

          throw sessionError;

        }


        let session =
          sessionData?.session;


        /* =============================================
           STEP 2
           CREATE AUTH ACCOUNT
        ============================================= */

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

                /*
                 * THIS IS THE IMPORTANT FIX.
                 *
                 * Supabase confirmation email will
                 * redirect to this exact GitHub Pages
                 * create-group page.
                 */

                emailRedirectTo:
                  CREATE_GROUP_PAGE,

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
            data?.session || null;


          /*
           * Email confirmation is enabled.
           *
           * Supabase returns a user but no session.
           *
           * Do NOT attempt to create the group yet.
           */

          if (!session?.user) {

            setLoading(
              false
            );


            showStatus(
              "Your account was created. " +
              "Please check your email and confirm " +
              "your account. After confirmation, " +
              "return to this page to finish creating " +
              "your group."
            );


            return;

          }

        }


        /* =============================================
           STEP 3
           VERIFY AUTHENTICATION
        ============================================= */

        if (!session?.user) {

          throw new Error(
            "Your account is not authenticated. " +
            "Please sign in and try again."
          );

        }


        /* =============================================
           STEP 4
           CREATE GROUP
        ============================================= */

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


        /*
         * RPC may return either an object or
         * an array containing one object.
         */

        const result =
          Array.isArray(data)
            ? data[0]
            : data;


        if (!result) {

          throw new Error(
            "The group was not created. " +
            "The server did not return a group account."
          );

        }


        /* =============================================
           STEP 5
           REMOVE PENDING DATA
        ============================================= */

        localStorage.removeItem(
          PENDING_KEY
        );


        /* =============================================
           STEP 6
           DISPLAY ACCOUNT DETAILS
        ============================================= */

        if (accessCodeBox) {

          accessCodeBox.textContent =
            result.access_code ||
            "—";

        }


        if (memberNumberBox) {

          memberNumberBox.textContent =
            result.member_number ||
            "0001";

        }


        /*
         * Save newly-created group information.
         */

        localStorage.setItem(
          NEW_GROUP_KEY,
          JSON.stringify({

            group_id:
              result.group_id ||
              null,

            access_code:
              result.access_code ||
              null,

            member_id:
              result.member_id ||
              null,

            member_number:
              result.member_number ||
              null

          })
        );


        /*
         * Hide form.
         */

        if (form) {

          form.hidden =
            true;

        }


        if (errorBox) {

          errorBox.hidden =
            true;

        }


        if (successBox) {

          successBox.hidden =
            false;

        }


        showStatus(
          "Your CHAMA LIVE group account is ready."
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

}


/* =====================================================
   READ FORM
===================================================== */

function readForm() {

  return {

    groupName:
      $("groupName")?.value.trim() ||
      "",

    category:
      $("category")?.value.trim() ||
      "",

    country:
      $("country")?.value.trim() ||
      "Kenya",

    monthlyContribution:
      Number(
        $("monthlyContribution")?.value ||
        0
      ),

    description:
      $("description")?.value.trim() ||
      "",

    adminName:
      $("adminName")?.value.trim() ||
      "",

    adminPhone:
      normalizePhone(
        $("adminPhone")?.value ||
        ""
      ),

    email:
      $("email")?.value
        .trim()
        .toLowerCase() ||
      "",

    password:
      $("password")?.value ||
      "",

    confirmPassword:
      $("confirmPassword")?.value ||
      ""

  };

}


/* =====================================================
   VALIDATION
===================================================== */

function validateForm(
  values
) {

  if (!values.groupName) {

    throw new Error(
      "Please enter the group name."
    );

  }


  if (
    values.groupName.length <
    2
  ) {

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


  if (
    !isValidEmail(
      values.email
    )
  ) {

    throw new Error(
      "Please enter a valid email address."
    );

  }


  if (
    values.password.length <
    8
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
   PHONE NORMALIZATION
===================================================== */

function normalizePhone(
  phone
) {

  let value =
    String(
      phone ||
      ""
    ).trim();


  value =
    value.replace(
      /[\s()-]/g,
      ""
    );


  /*
   * 0712345678
   * ->
   * +254712345678
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


  /*
   * 0112345678
   * ->
   * +254112345678
   */

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


  /*
   * 712345678
   * ->
   * +254712345678
   */

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


  /*
   * 112345678
   * ->
   * +254112345678
   */

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
   EMAIL VALIDATION
===================================================== */

function isValidEmail(
  email
) {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );

}


/* =====================================================
   SAVE PENDING ONBOARDING
===================================================== */

function savePendingOnboarding(
  values
) {

  /*
   * IMPORTANT:
   *
   * Password is intentionally NOT stored.
   */

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
   LOAD PENDING ONBOARDING
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


    const parsed =
      JSON.parse(
        raw
      );


    if (
      !parsed ||
      typeof parsed !==
        "object"
    ) {

      localStorage.removeItem(
        PENDING_KEY
      );

      return null;

    }


    return parsed;

  } catch (error) {

    console.error(
      "PENDING DATA ERROR:",
      error
    );


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

  if (!data) {

    return;

  }


  if (
    $("groupName") &&
    data.groupName !==
      undefined
  ) {

    $("groupName").value =
      data.groupName;

  }


  if (
    $("category") &&
    data.category !==
      undefined
  ) {

    $("category").value =
      data.category;

  }


  if (
    $("country") &&
    data.country !==
      undefined
  ) {

    $("country").value =
      data.country;

  }


  if (
    $("monthlyContribution") &&
    data.monthlyContribution !==
      undefined
  ) {

    $("monthlyContribution").value =
      data.monthlyContribution;

  }


  if (
    $("description") &&
    data.description !==
      undefined
  ) {

    $("description").value =
      data.description;

  }


  if (
    $("adminName") &&
    data.adminName !==
      undefined
  ) {

    $("adminName").value =
      data.adminName;

  }


  if (
    $("adminPhone") &&
    data.adminPhone !==
      undefined
  ) {

    $("adminPhone").value =
      data.adminPhone;

  }


  if (
    $("email") &&
    data.email !==
      undefined
  ) {

    $("email").value =
      data.email;

  }

}


/* =====================================================
   LOADING STATE
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


    if (
      !createButton.dataset
        .originalText
    ) {

      createButton.dataset
        .originalText =
        createButton.textContent;

    }


    createButton.textContent =
      "Please wait...";


    if (form) {

      form.classList.add(
        "loading"
      );

    }

  } else {

    createButton.disabled =
      false;


    createButton.textContent =
      createButton.dataset
        .originalText ||
      "Create Group Account";


    if (form) {

      form.classList.remove(
        "loading"
      );

    }

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

  if (errorBox) {

    errorBox.textContent =
      message;

    errorBox.hidden =
      false;

  }


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
    error?.error_description ||
    String(error) ||
    "Unable to create the group.";


  const lower =
    message.toLowerCase();


  /*
   * Existing account.
   */

  if (
    lower.includes(
      "user already registered"
    ) ||
    lower.includes(
      "already registered"
    )
  ) {

    return (
      "An account with this email already exists. " +
      "Please sign in first, then return here " +
      "to create the group."
    );

  }


  /*
   * Email sending rate limit.
   */

  if (
    lower.includes(
      "email rate limit"
    ) ||
    lower.includes(
      "rate limit"
    )
  ) {

    return (
      "Too many signup attempts were made. " +
      "Please wait a little while and try again."
    );

  }


  /*
   * Authentication/JWT error.
   */

  if (
    lower.includes(
      "not authenticated"
    ) ||
    lower.includes(
      "jwt"
    ) ||
    lower.includes(
      "authentication"
    )
  ) {

    return (
      "Your login session is not active. " +
      "Please sign in again and retry."
    );

  }


  /*
   * RPC not found.
   */

  if (
    lower.includes(
      "create_group_account"
    )
  ) {

    return (
      "The group onboarding service is not available. " +
      "Please contact the system administrator."
    );

  }


  /*
   * RLS error.
   */

  if (
    lower.includes(
      "row-level security"
    ) ||
    lower.includes(
      "rls"
    )
  ) {

    return (
      "The group could not be created because " +
      "of a database permission check. " +
      "Please contact the system administrator."
    );

  }


  /*
   * Email not confirmed.
   */

  if (
    lower.includes(
      "email not confirmed"
    )
  ) {

    return (
      "Your email has not been confirmed yet. " +
      "Please open the confirmation email, " +
      "confirm your account, then return to this page."
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
        accessCodeBox?.textContent
          .trim() ||
        "";


      if (
        !code ||
        code === "—"
      ) {

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


      } catch (error) {

        console.error(
          "COPY ERROR:",
          error
        );


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

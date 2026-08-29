```javascript
import { supabase } from "./supabase.js";


/* =====================================================
   CHAMA LIVE — CREATE GROUP ONBOARDING
   GitHub Pages + Supabase Auth

   Production URL:
   https://jacqmurithi-ux.github.io/chama-live/

   Email confirmation returns to:
   https://jacqmurithi-ux.github.io/chama-live/create-group.html
===================================================== */


/* =====================================================
   CONFIGURATION
===================================================== */

const CREATE_GROUP_URL =
  "https://jacqmurithi-ux.github.io/chama-live/create-group.html";

const PENDING_KEY =
  "chama_live_pending_group_onboarding";

const NEW_GROUP_KEY =
  "chama_live_new_group";


/* =====================================================
   ELEMENTS
===================================================== */

const $ = (id) =>
  document.getElementById(id);

const form =
  $("createGroupForm");

const statusBox =
  $("status");

const errorBox =
  $("error");

const successBox =
  $("success");

const createButton =
  $("createGroupButton");

const accessCodeBox =
  $("accessCode");

const memberNumberBox =
  $("memberNumber");

const copyCodeButton =
  $("copyCode");


/* =====================================================
   INITIALIZATION
===================================================== */

async function init() {

  clearError();
  hideSuccess();

  /*
   * Supabase can return from an email confirmation
   * with authentication information in the URL.
   *
   * supabase.js has detectSessionInUrl enabled,
   * but we still give the client a moment to process
   * the callback before checking the session.
   */

  await waitForAuthCallback();


  /*
   * Load previously saved onboarding information.
   */

  const pending =
    loadPendingOnboarding();


  /*
   * Check current authentication state.
   */

  const {
    data: {
      session
    },
    error
  } =
    await supabase.auth.getSession();


  if (error) {

    console.error(
      "GET SESSION ERROR:",
      error
    );

    showError(
      "We could not verify your login session. " +
      "Please refresh the page and try again."
    );

    return;

  }


  /*
   * Restore saved group information.
   */

  if (pending) {

    restorePendingForm(
      pending
    );

  }


  /*
   * -------------------------------------------------
   * USER IS ALREADY AUTHENTICATED
   * -------------------------------------------------
   */

  if (session?.user) {

    /*
     * Email has been confirmed and the user has
     * an active Supabase session.
     */

    prepareAuthenticatedOnboarding();

    showStatus(
      "Your account is confirmed. " +
      "Your saved group details are ready. " +
      "Click Create Group Account to finish."
    );

    return;

  }


  /*
   * -------------------------------------------------
   * USER IS NOT AUTHENTICATED
   * -------------------------------------------------
   */

  prepareUnauthenticatedOnboarding();

  if (pending) {

    showStatus(
      "Your group details have been saved. " +
      "Create your account to continue."
    );

  }

}


/* =====================================================
   AUTH CALLBACK WAIT
===================================================== */

async function waitForAuthCallback() {

  const url =
    window.location.href;

  const hash =
    window.location.hash;

  const search =
    window.location.search;


  const isAuthCallback =
    hash.includes(
      "access_token"
    ) ||
    hash.includes(
      "refresh_token"
    ) ||
    search.includes(
      "code="
    ) ||
    search.includes(
      "token_hash="
    );


  if (!isAuthCallback) {

    return;

  }


  showStatus(
    "Confirming your account..."
  );


  /*
   * Give Supabase Auth enough time to process
   * the callback URL.
   */

  await new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        800
      )
  );


  /*
   * Ask Supabase for the resulting session.
   */

  for (
    let attempt = 0;
    attempt < 5;
    attempt++
  ) {

    const {
      data: {
        session
      }
    } =
      await supabase.auth.getSession();


    if (session?.user) {

      return;

    }


    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          500
        )
    );

  }

}


/* =====================================================
   AUTH STATE LISTENER
===================================================== */

supabase.auth.onAuthStateChange(
  async (
    event,
    session
  ) => {

    console.log(
      "AUTH EVENT:",
      event
    );


    if (
      event ===
      "SIGNED_IN"
    ) {

      if (session?.user) {

        prepareAuthenticatedOnboarding();

        const pending =
          loadPendingOnboarding();

        if (pending) {

          restorePendingForm(
            pending
          );

        }

        showStatus(
          "Your account is confirmed. " +
          "Your group details are ready. " +
          "Click Create Group Account to finish."
        );

      }

    }


    if (
      event ===
      "TOKEN_REFRESHED"
    ) {

      if (session?.user) {

        prepareAuthenticatedOnboarding();

      }

    }

  }
);


/* =====================================================
   AUTHENTICATED FORM MODE
===================================================== */

function prepareAuthenticatedOnboarding() {

  /*
   * Password is NOT needed once the user has
   * authenticated through email confirmation.
   *
   * We deliberately never restore or store passwords.
   */

  const password =
    $("password");

  const confirmPassword =
    $("confirmPassword");


  if (password) {

    password.required =
      false;

    password.value =
      "";

  }


  if (confirmPassword) {

    confirmPassword.required =
      false;

    confirmPassword.value =
      "";

  }


  /*
   * Email should not normally be changed after
   * authentication.
   */

  const email =
    $("email");


  if (email) {

    email.required =
      false;

  }


  /*
   * Change the button state back to normal.
   */

  if (createButton) {

    createButton.disabled =
      false;

  }

}


/* =====================================================
   UNAUTHENTICATED FORM MODE
===================================================== */

function prepareUnauthenticatedOnboarding() {

  const password =
    $("password");

  const confirmPassword =
    $("confirmPassword");


  if (password) {

    password.required =
      true;

  }


  if (confirmPassword) {

    confirmPassword.required =
      true;

  }


  const email =
    $("email");


  if (email) {

    email.required =
      true;

  }

}


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


      try {

        /*
         * Read the form first.
         */

        const values =
          readForm();


        /*
         * Check current authentication BEFORE
         * validating the password.
         */

        let {
          data: {
            session
          },
          error:
            sessionError
        } =
          await supabase.auth.getSession();


        if (sessionError) {

          throw sessionError;

        }


        /*
         * -------------------------------------------------
         * AUTHENTICATED USER
         * -------------------------------------------------
         */

        if (session?.user) {

          /*
           * The password is intentionally not required
           * at this stage.
           */

          validateAuthenticatedForm(
            values
          );

        }


        /*
         * -------------------------------------------------
         * NOT AUTHENTICATED
         * -------------------------------------------------
         */

        else {

          validateForm(
            values
          );

        }


        /*
         * Save only safe onboarding information.
         *
         * Password is NEVER saved.
         */

        savePendingOnboarding(
          values
        );


        setLoading(
          true
        );


        /*
         * -------------------------------------------------
         * STEP 1
         * CREATE AUTH ACCOUNT
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

                },

                /*
                 * THIS IS THE IMPORTANT FIX.
                 *
                 * After email confirmation Supabase
                 * returns the user to this GitHub Pages
                 * onboarding page.
                 */

                emailRedirectTo:
                  CREATE_GROUP_URL

              }

            });


          if (error) {

            throw error;

          }


          console.log(
            "SIGNUP RESULT:",
            data
          );


          session =
            data.session;


          /*
           * Email confirmation is required.
           *
           * Supabase creates the user but does not
           * provide a session until the email is confirmed.
           */

          if (!session) {

            setLoading(
              false
            );


            showStatus(
              "Your account was created. " +
              "Please check your email and confirm " +
              "your account. After confirmation, " +
              "you will return here automatically."
            );


            return;

          }

        }


        /*
         * -------------------------------------------------
         * STEP 2
         * CREATE GROUP
         * -------------------------------------------------
         */

        showStatus(
          "Creating your group..."
        );


        /*
         * Get the latest session one more time.
         */

        const {
          data: {
            session:
              currentSession
          },
          error:
            currentSessionError
        } =
          await supabase.auth.getSession();


        if (currentSessionError) {

          throw currentSessionError;

        }


        if (!currentSession?.user) {

          throw new Error(
            "Your account is not authenticated. " +
            "Please confirm your email and return to " +
            "this page."
          );

        }


        /*
         * -------------------------------------------------
         * CALL SUPABASE RPC
         * -------------------------------------------------
         */

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
         * RPC may return an object or an array.
         */

        const result =
          Array.isArray(data)
            ? data[0]
            : data;


        if (!result) {

          throw new Error(
            "The group was not created. " +
            "No result was returned by the server."
          );

        }


        /*
         * -------------------------------------------------
         * SUCCESS
         * -------------------------------------------------
         */

        localStorage.removeItem(
          PENDING_KEY
        );


        /*
         * Display access code.
         */

        if (accessCodeBox) {

          accessCodeBox.textContent =
            result.access_code ||
            "—";

        }


        /*
         * Display first member number.
         */

        if (memberNumberBox) {

          memberNumberBox.textContent =
            result.member_number ||
            "0001";

        }


        /*
         * Hide form.
         */

        form.hidden =
          true;


        /*
         * Hide errors.
         */

        if (errorBox) {

          errorBox.hidden =
            true;

        }


        /*
         * Show success panel.
         */

        if (successBox) {

          successBox.hidden =
            false;

        }


        showStatus(
          "Your CHAMA LIVE group account is ready."
        );


        /*
         * Save non-sensitive group information
         * for the next page.
         */

        localStorage.setItem(
          NEW_GROUP_KEY,
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


        /*
         * Clear password fields from memory/UI.
         */

        clearPasswordFields();


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
      getValue(
        "groupName"
      ),

    category:
      getValue(
        "category"
      ),

    country:
      getValue(
        "country"
      ) ||
      "Kenya",

    monthlyContribution:
      Number(
        getValue(
          "monthlyContribution"
        ) ||
        0
      ),

    description:
      getValue(
        "description"
      ),

    adminName:
      getValue(
        "adminName"
      ),

    adminPhone:
      normalizePhone(
        getRawValue(
          "adminPhone"
        )
      ),

    email:
      getValue(
        "email"
      ).toLowerCase(),

    password:
      getRawValue(
        "password"
      ),

    confirmPassword:
      getRawValue(
        "confirmPassword"
      )

  };

}


/* =====================================================
   SAFE VALUE HELPERS
===================================================== */

function getValue(id) {

  const element =
    $(id);

  return element
    ? String(
        element.value ||
        ""
      ).trim()
    : "";

}


function getRawValue(id) {

  const element =
    $(id);

  return element
    ? String(
        element.value ||
        ""
      )
    : "";

}


/* =====================================================
   VALIDATION — NEW ACCOUNT
===================================================== */

function validateForm(
  values
) {

  validateCommonFields(
    values
  );


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
   VALIDATION — AUTHENTICATED USER
===================================================== */

function validateAuthenticatedForm(
  values
) {

  validateCommonFields(
    values
  );

}


/* =====================================================
   COMMON VALIDATION
===================================================== */

function validateCommonFields(
  values
) {

  if (
    !values.groupName
  ) {

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
    values.monthlyContribution <
    0
  ) {

    throw new Error(
      "Monthly contribution must be zero or greater."
    );

  }


  if (
    !values.adminName
  ) {

    throw new Error(
      "Please enter the administrator's name."
    );

  }


  if (
    !values.adminPhone
  ) {

    throw new Error(
      "Please enter the administrator's phone number."
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
   * Kenya:
   *
   * 0712345678
   * -> +254712345678
   *
   * 0112345678
   * -> +254112345678
   *
   * 712345678
   * -> +254712345678
   *
   * 112345678
   * -> +254112345678
   */


  if (
    /^07\d{8}$/.test(
      value
    )
  ) {

    return (
      "+254" +
      value.substring(
        1
      )
    );

  }


  if (
    /^01\d{8}$/.test(
      value
    )
  ) {

    return (
      "+254" +
      value.substring(
        1
      )
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
   * Password is intentionally excluded.
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


    const data =
      JSON.parse(
        raw
      );


    if (
      !data ||
      typeof data !==
      "object"
    ) {

      return null;

    }


    return data;

  } catch (
    error
  ) {

    console.error(
      "LOAD PENDING ERROR:",
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

  setValue(
    "groupName",
    data.groupName
  );


  setValue(
    "category",
    data.category
  );


  setValue(
    "country",
    data.country
  );


  if (
    data.monthlyContribution !==
    undefined
  ) {

    setValue(
      "monthlyContribution",
      data.monthlyContribution
    );

  }


  setValue(
    "description",
    data.description
  );


  setValue(
    "adminName",
    data.adminName
  );


  setValue(
    "adminPhone",
    data.adminPhone
  );


  setValue(
    "email",
    data.email
  );


  /*
   * NEVER restore password.
   */

  setValue(
    "password",
    ""
  );


  setValue(
    "confirmPassword",
    ""
  );

}


/* =====================================================
   SET FORM VALUE
===================================================== */

function setValue(
  id,
  value
) {

  const element =
    $(id);


  if (
    element &&
    value !==
    undefined &&
    value !==
    null
  ) {

    element.value =
      value;

  }

}


/* =====================================================
   CLEAR PASSWORDS
===================================================== */

function clearPasswordFields() {

  const password =
    $("password");

  const confirmPassword =
    $("confirmPassword");


  if (password) {

    password.value =
      "";

  }


  if (confirmPassword) {

    confirmPassword.value =
      "";

  }

}


/* =====================================================
   LOADING STATE
===================================================== */

function setLoading(
  loading
) {

  if (
    !createButton
  ) {

    return;

  }


  if (loading) {

    createButton.disabled =
      true;


    createButton.dataset.originalText =
      createButton.textContent;


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
      createButton.dataset.originalText ||
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

  if (
    !statusBox
  ) {

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

  if (
    !errorBox
  ) {

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

  if (
    !errorBox
  ) {

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


/* =====================================================
   SUCCESS
===================================================== */

function hideSuccess() {

  if (
    successBox
  ) {

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
    String(
      error
    ) ||
    "Unable to create the group.";


  const lower =
    message.toLowerCase();


  /*
   * Existing account
   */

  if (
    lower.includes(
      "user already registered"
    )
  ) {

    return (
      "An account with this email already exists. " +
      "Please sign in using that account, then " +
      "return here to create your group."
    );

  }


  /*
   * Rate limit
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
      "Please wait a little while before trying again."
    );

  }


  /*
   * Email confirmation
   */

  if (
    lower.includes(
      "email not confirmed"
    )
  ) {

    return (
      "Your email address has not been confirmed yet. " +
      "Please check your email and click the confirmation link."
    );

  }


  /*
   * Authentication
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
      "Please confirm your email, return to this page, " +
      "and try again."
    );

  }


  /*
   * RPC missing
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
   * Duplicate group/member errors
   */

  if (
    lower.includes(
      "duplicate"
    )
  ) {

    return (
      "This information appears to have already been registered. " +
      "Please check your account or contact the system administrator."
    );

  }


  /*
   * Network
   */

  if (
    lower.includes(
      "failed to fetch"
    ) ||
    lower.includes(
      "network"
    )
  ) {

    return (
      "We could not connect to the CHAMA LIVE server. " +
      "Please check your internet connection and try again."
    );

  }


  return message;

}


/* =====================================================
   COPY ACCESS CODE
===================================================== */

if (
  copyCodeButton
) {

  copyCodeButton.addEventListener(
    "click",
    async () => {

      const code =
        accessCodeBox
          ?.textContent
          ?.trim();


      if (
        !code ||
        code ===
        "—"
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


      } catch (
        error
      ) {

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
   START APPLICATION
===================================================== */

init();
```

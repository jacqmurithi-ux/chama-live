/* =========================================================
   CHAMA LIVE — ACTIVATE ACCOUNT

   File:
   /js/activate-account.js

   Flow:
   Membership Number
        +
   Registered Email
        +
   New Password
        ↓
   Supabase Edge Function
   "activate-account"
        ↓
   Verify member
        ↓
   Create / update Auth account
        ↓
   Link Auth user
        ↓
   Mark member ACTIVE
        ↓
   Redirect to login

   IMPORTANT:
   This file does NOT use auth.js.
   Activation is handled entirely by the Edge Function.
========================================================= */

import { supabase } from "./supabase.js";


/* =========================================================
   ELEMENTS
========================================================= */

const form =
  document.getElementById("activateForm");

const membershipNumber =
  document.getElementById("membershipNumber");

const email =
  document.getElementById("email");

const password =
  document.getElementById("password");

const confirmPassword =
  document.getElementById("confirmPassword");

const button =
  document.getElementById("activateButton");

const errorBox =
  document.getElementById("error");

const successBox =
  document.getElementById("success");


/* =========================================================
   CONFIGURATION
========================================================= */

const LOGIN_URL =
  `${window.location.origin}/login.html`;


/* =========================================================
   LOG
========================================================= */

console.log(
  "CHAMA LIVE: activate-account.js loaded"
);


/* =========================================================
   SHOW ERROR
========================================================= */

function showError(message) {

  console.error(
    "CHAMA LIVE activation error:",
    message
  );

  if (errorBox) {

    errorBox.hidden = false;

    errorBox.textContent =
      String(message || "Unable to activate account.");
  }

  if (successBox) {

    successBox.hidden = true;

    successBox.textContent = "";
  }
}


/* =========================================================
   SHOW SUCCESS
========================================================= */

function showSuccess(message) {

  console.log(
    "CHAMA LIVE activation success:",
    message
  );

  if (successBox) {

    successBox.hidden = false;

    successBox.textContent =
      String(message || "Account activated successfully.");
  }

  if (errorBox) {

    errorBox.hidden = true;

    errorBox.textContent = "";
  }
}


/* =========================================================
   CLEAR MESSAGES
========================================================= */

function clearMessages() {

  if (errorBox) {

    errorBox.hidden = true;

    errorBox.textContent = "";
  }

  if (successBox) {

    successBox.hidden = true;

    successBox.textContent = "";
  }
}


/* =========================================================
   SET BUTTON
========================================================= */

function setButtonLoading(isLoading) {

  if (!button) {
    return;
  }

  button.disabled =
    isLoading;

  button.textContent =
    isLoading
      ? "Activating..."
      : "Activate Account";
}


/* =========================================================
   EXTRACT FUNCTION ERROR
========================================================= */

async function extractFunctionError(result) {

  /*
   * First inspect normal JSON.
   */

  if (
    result &&
    result.data &&
    typeof result.data === "object"
  ) {

    if (
      typeof result.data.error === "string"
    ) {

      return result.data.error;
    }

    if (
      result.data.error &&
      typeof result.data.error === "object"
    ) {

      if (result.data.error.message) {

        return result.data.error.message;
      }

      return JSON.stringify(
        result.data.error
      );
    }

    if (result.data.message) {

      return result.data.message;
    }
  }


  /*
   * Inspect Supabase Functions error.
   */

  if (result?.error) {

    const functionError =
      result.error;

    /*
     * Try response body.
     */

    const context =
      functionError.context;

    if (context) {

      /*
       * JSON
       */

      try {

        const response =
          typeof context.clone === "function"
            ? context.clone()
            : context;

        if (
          typeof response.json === "function"
        ) {

          const body =
            await response.json();

          if (
            typeof body?.error === "string"
          ) {

            return body.error;
          }

          if (
            body?.error?.message
          ) {

            return body.error.message;
          }

          if (body?.message) {

            return body.message;
          }
        }

      }
      catch (jsonError) {

        console.warn(
          "CHAMA LIVE: Could not parse function JSON error",
          jsonError
        );
      }


      /*
       * Text
       */

      try {

        const response =
          typeof context.clone === "function"
            ? context.clone()
            : context;

        if (
          typeof response.text === "function"
        ) {

          const text =
            await response.text();

          if (text) {

            try {

              const parsed =
                JSON.parse(text);

              if (
                typeof parsed?.error ===
                "string"
              ) {

                return parsed.error;
              }

              if (
                parsed?.error?.message
              ) {

                return parsed.error.message;
              }

              if (parsed?.message) {

                return parsed.message;
              }

            }
            catch {

              return text;
            }
          }
        }

      }
      catch (textError) {

        console.warn(
          "CHAMA LIVE: Could not read function error",
          textError
        );
      }
    }


    /*
     * HTTP status.
     */

    if (
      functionError.status
    ) {

      return (
        `Activation request failed (HTTP ${functionError.status}).`
      );
    }


    if (
      functionError.message
    ) {

      return functionError.message;
    }
  }


  return (
    "Unable to activate the account."
  );
}


/* =========================================================
   NORMALIZE ERROR MESSAGE
========================================================= */

function friendlyError(message) {

  const text =
    String(
      message ||
      ""
    ).trim();

  const lower =
    text.toLowerCase();


  if (
    lower.includes(
      "already activated"
    ) ||
    lower.includes(
      "account already active"
    )
  ) {

    return (
      "This account has already been activated. Please sign in."
    );
  }


  if (
    lower.includes(
      "no member"
    ) ||
    lower.includes(
      "member not found"
    ) ||
    lower.includes(
      "no member record"
    ) ||
    lower.includes(
      "membership number"
    ) &&
    lower.includes(
      "email"
    )
  ) {

    return (
      "No member record was found for that membership number and registered email."
    );
  }


  if (
    lower.includes(
      "email does not match"
    ) ||
    lower.includes(
      "email mismatch"
    )
  ) {

    return (
      "The email address does not match the email registered for this member."
    );
  }


  if (
    lower.includes(
      "password"
    ) &&
    (
      lower.includes("8") ||
      lower.includes("short")
    )
  ) {

    return (
      "Password must contain at least 8 characters."
    );
  }


  if (
    lower.includes(
      "invalid email"
    )
  ) {

    return (
      "Please enter a valid email address."
    );
  }


  if (
    lower.includes(
      "not invited"
    ) ||
    lower.includes(
      "invitation"
    ) &&
    lower.includes(
      "not"
    )
  ) {

    return (
      "Your login invitation has not been prepared yet. Please ask your group administrator to send the invitation first."
    );
  }


  if (
    lower.includes(
      "user already registered"
    )
  ) {

    return (
      "An account with this email already exists. Please use the sign-in page."
    );
  }


  if (
    lower.includes(
      "cors"
    )
  ) {

    return (
      "The activation service could not be reached. Please try again in a moment."
    );
  }


  if (
    lower.includes(
      "failed to fetch"
    )
  ) {

    return (
      "Could not connect to the activation service. Please check your internet connection and try again."
    );
  }


  return (
    text ||
    "Unable to activate the account."
  );
}


/* =========================================================
   VALIDATE FORM
========================================================= */

function validateForm() {

  const number =
    String(
      membershipNumber?.value || ""
    ).trim();

  const userEmail =
    String(
      email?.value || ""
    )
      .trim()
      .toLowerCase();

  const pass =
    String(
      password?.value || ""
    );

  const confirm =
    String(
      confirmPassword?.value || ""
    );


  if (!number) {

    throw new Error(
      "Enter your membership number."
    );
  }


  if (!userEmail) {

    throw new Error(
      "Enter your registered email."
    );
  }


  const emailPattern =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


  if (
    !emailPattern.test(
      userEmail
    )
  ) {

    throw new Error(
      "Enter a valid email address."
    );
  }


  if (
    pass.length < 8
  ) {

    throw new Error(
      "Password must contain at least 8 characters."
    );
  }


  if (
    pass !== confirm
  ) {

    throw new Error(
      "Passwords do not match."
    );
  }


  return {

    membership_number:
      number,

    email:
      userEmail,

    password:
      pass
  };
}


/* =========================================================
   ACTIVATE ACCOUNT
========================================================= */

async function activateAccount(payload) {

  console.log(
    "CHAMA LIVE: calling activate-account Edge Function"
  );

  console.log(
    "CHAMA LIVE: membership number:",
    payload.membership_number
  );

  console.log(
    "CHAMA LIVE: email:",
    payload.email
  );


  /*
   * Call Supabase Edge Function.
   *
   * verify_jwt is OFF for this function,
   * so the activation request does not require
   * an already-authenticated Supabase session.
   */

  const result =
    await supabase.functions.invoke(
      "activate-account",
      {
        body: payload
      }
    );


  console.log(
    "CHAMA LIVE: Edge Function result:",
    result
  );


  /*
   * Supabase transport/function error.
   */

  if (
    result.error
  ) {

    const message =
      await extractFunctionError(
        result
      );

    throw new Error(
      message
    );
  }


  /*
   * Function returned an application-level error.
   */

  if (
    result.data?.success === false
  ) {

    const message =
      result.data?.error ||
      result.data?.message ||
      "The activation request was rejected.";

    throw new Error(
      message
    );
  }


  /*
   * Some versions of the Edge Function may
   * return { ok: false } instead.
   */

  if (
    result.data?.ok === false
  ) {

    const message =
      result.data?.error ||
      result.data?.message ||
      "The activation request was rejected.";

    throw new Error(
      message
    );
  }


  /*
   * Successful response.
   */

  return (
    result.data || {
      success: true
    }
  );
}


/* =========================================================
   FORM SUBMIT
========================================================= */

if (!form) {

  console.error(
    "CHAMA LIVE: activateForm was not found."
  );

}
else {

  form.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      clearMessages();


      try {

        /*
         * Validate input.
         */

        const payload =
          validateForm();


        /*
         * Disable button.
         */

        setButtonLoading(
          true
        );


        /*
         * Activate.
         */

        const response =
          await activateAccount(
            payload
          );


        console.log(
          "CHAMA LIVE: account activation completed:",
          response
        );


        /*
         * Clear passwords.
         */

        if (password) {

          password.value = "";
        }

        if (confirmPassword) {

          confirmPassword.value = "";
        }


        /*
         * Success.
         */

        showSuccess(
          response?.message ||
          "Account activated successfully. Redirecting to sign in..."
        );


        /*
         * Redirect.
         */

        setTimeout(
          () => {

            window.location.replace(
              LOGIN_URL
            );

          },
          1500
        );

      }

      catch (err) {

        console.error(
          "CHAMA LIVE: activation failed:",
          err
        );


        const message =
          friendlyError(
            err?.message
          );


        showError(
          message
        );


        setButtonLoading(
          false
        );

      }

    }
  );

}


/* =========================================================
   AUTO-FILL FROM URL
========================================================= */

try {

  const params =
    new URLSearchParams(
      window.location.search
    );


  const urlMembership =
    params.get(
      "membership_number"
    );


  const urlEmail =
    params.get(
      "email"
    );


  if (
    urlMembership &&
    membershipNumber
  ) {

    membershipNumber.value =
      urlMembership.trim();
  }


  if (
    urlEmail &&
    email
  ) {

    email.value =
      urlEmail.trim().toLowerCase();
  }

}

catch (error) {

  console.warn(
    "CHAMA LIVE: URL parameter processing failed:",
    error
  );
}


/* =========================================================
   READY
========================================================= */

console.log(
  "CHAMA LIVE: activate-account.js ready"
);

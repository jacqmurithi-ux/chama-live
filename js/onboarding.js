import { supabase } from "./supabase.js";

const form = document.querySelector("#onboardingForm");
const errorBox = document.querySelector("[data-error]");
const successBox = document.querySelector("[data-success]");
const submitButton = document.querySelector("#submitBtn");

function showError(message) {
  if (!errorBox) return;

  errorBox.textContent = message;
  errorBox.hidden = false;

  if (successBox) {
    successBox.hidden = true;
  }
}

function showSuccess(message) {
  if (!successBox) return;

  successBox.textContent = message;
  successBox.hidden = false;

  if (errorBox) {
    errorBox.hidden = true;
  }
}

function normalizePhone(phone) {
  return String(phone || "")
    .trim()
    .replace(/\s+/g, "");
}

function numberValue(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  return number;
}

if (!form) {
  console.error(
    "CHAMA LIVE: #onboardingForm was not found."
  );
} else {

  form.addEventListener("submit", async event => {

    event.preventDefault();

    if (errorBox) {
      errorBox.hidden = true;
    }

    if (successBox) {
      successBox.hidden = true;
    }

    try {

      /*
       * GET FORM VALUES
       */

      const groupName =
        document.querySelector("#groupName")?.value.trim();

      const category =
        document.querySelector("#category")?.value.trim() || "other";

      const country =
        document.querySelector("#country")?.value.trim() || "Kenya";

      const monthlyContribution =
        numberValue(
          document.querySelector("#monthlyContribution")?.value
        );

      const openingBalance =
        numberValue(
          document.querySelector("#openingBalance")?.value
        );

      const description =
        document.querySelector("#description")?.value.trim() || "";

      const adminName =
        document.querySelector("#adminName")?.value.trim();

      const adminPhone =
        normalizePhone(
          document.querySelector("#adminPhone")?.value
        );

      const email =
        document.querySelector("#email")?.value.trim().toLowerCase();

      const password =
        document.querySelector("#password")?.value;

      const confirmPassword =
        document.querySelector("#confirmPassword")?.value;


      /*
       * VALIDATION
       */

      if (!groupName) {
        throw new Error(
          "Group name is required."
        );
      }

      if (!adminName) {
        throw new Error(
          "Administrator name is required."
        );
      }

      if (!adminPhone) {
        throw new Error(
          "Administrator phone number is required."
        );
      }

      if (!email) {
        throw new Error(
          "Login email is required."
        );
      }

      if (!password) {
        throw new Error(
          "Password is required."
        );
      }

      if (password.length < 8) {
        throw new Error(
          "Password must contain at least 8 characters."
        );
      }

      if (password !== confirmPassword) {
        throw new Error(
          "Passwords do not match."
        );
      }


      /*
       * DISABLE BUTTON
       */

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent =
          "Creating account...";
      }


      /*
       * CREATE SUPABASE AUTH ACCOUNT
       */

      const {
        data: authData,
        error: authError
      } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: adminName,
            phone: adminPhone
          }
        }
      });


      if (authError) {
        throw authError;
      }


      /*
       * CHECK AUTH USER
       */

      const user =
        authData?.user;

      if (!user) {
        throw new Error(
          "The account could not be created."
        );
      }


      /*
       * IMPORTANT
       *
       * If email confirmation is enabled,
       * Supabase may not return a session.
       */

      if (!authData.session) {

        showSuccess(
          "Account created. Please check your email and confirm your account before continuing."
        );

        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent =
            "Create Group Account";
        }

        return;
      }


      /*
       * CREATE GROUP
       */

      if (submitButton) {
        submitButton.textContent =
          "Creating group...";
      }

      const {
        data: onboardingResult,
        error: onboardingError
      } = await supabase.rpc(
        "onboard_new_group",
        {
          p_group_name: groupName,
          p_category: category,
          p_monthly_contribution:
            monthlyContribution,
          p_opening_balance:
            openingBalance,
          p_description:
            description || null,
          p_admin_name:
            adminName,
          p_admin_phone:
            adminPhone,
          p_country:
            country
        }
      );


      if (onboardingError) {
        throw onboardingError;
      }


      /*
       * VERIFY RESULT
       */

      if (
        !onboardingResult ||
        onboardingResult.success !== true
      ) {
        throw new Error(
          "Group creation did not complete successfully."
        );
      }


      /*
       * SUCCESS
       */

      showSuccess(
        `Group created successfully. Your member number is ${onboardingResult.member_number}.`
      );


      /*
       * GO TO DASHBOARD
       */

      setTimeout(() => {
        window.location.href =
          "dashboard.html";
      }, 1200);

    }

    catch (error) {

      console.error(
        "CHAMA LIVE onboarding error:",
        error
      );

      showError(
        error?.message ||
        "Unable to create the group account."
      );

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent =
          "Create Group Account";
      }

    }

  });

}

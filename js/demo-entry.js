const FUNCTION_URL =
  "https://onzaonflquipqmhgslxi.supabase.co/functions/v1/demo-verification";

const TOKEN_KEY =
  "chama_live_demo_token";

const requestForm =
  document.getElementById("demoRequestForm");

const verifyForm =
  document.getElementById("demoVerifyForm");

const message =
  document.getElementById("demoMessage");

const requestButton =
  document.getElementById("requestCodeButton");

const verifyButton =
  document.getElementById("verifyCodeButton");

let challenge = null;

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color =
    isError ? "#a33a32" : "#66756e";
}

async function call(action, body) {
  const response =
    await fetch(FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action,
        ...body
      })
    });

  let data = null;

  try {
    data = await response.json();
  } catch {
    throw new Error("The demo service returned an invalid response.");
  }

  if (!response.ok || !data?.ok) {
    const messages = {
      DEMO_SERVICE_NOT_CONFIGURED:
        "The demo verification service is not configured yet.",
      VALID_NAME_AND_EMAIL_REQUIRED:
        "Please enter a valid name and email.",
      PLEASE_WAIT_BEFORE_REQUESTING_ANOTHER_CODE:
        "Please wait a minute before requesting another code.",
      VERIFICATION_EMAIL_FAILED:
        "We could not send the verification email. Please try again.",
      VERIFICATION_EXPIRED_OR_INVALID:
        "That verification request has expired. Please request a new code.",
      INCORRECT_VERIFICATION_CODE:
        "That code is incorrect.",
      TOO_MANY_VERIFICATION_ATTEMPTS:
        "Too many attempts. Please request a new code."
    };

    throw new Error(
      messages[data?.error] ||
      "Unable to continue with demo verification."
    );
  }

  return data;
}

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  requestButton.disabled = true;
  setMessage("Sending your verification code...");

  try {
    const formData =
      new FormData(requestForm);

    const data =
      await call("request", {
        name: formData.get("name"),
        email: formData.get("email"),
        phone: formData.get("phone")
      });

    challenge =
      data.challenge;

    requestForm.hidden = true;
    verifyForm.hidden = false;

    setMessage(
      "A verification code has been sent to your email."
    );

    document
      .getElementById("verificationCode")
      .focus();

  } catch (error) {
    setMessage(
      error?.message ||
      "Unable to send the verification code.",
      true
    );
  } finally {
    requestButton.disabled = false;
  }
});

verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!challenge) {
    setMessage(
      "Your verification request is missing. Please start again.",
      true
    );
    return;
  }

  verifyButton.disabled = true;
  setMessage("Verifying...");

  try {
    const code =
      document
        .getElementById("verificationCode")
        .value
        .trim();

    const data =
      await call("verify", {
        challenge,
        code
      });

    sessionStorage.setItem(
      TOKEN_KEY,
      data.demo_token
    );

    window.location.replace(
      "/demo-dashboard.html"
    );

  } catch (error) {
    setMessage(
      error?.message ||
      "Unable to verify your code.",
      true
    );
  } finally {
    verifyButton.disabled = false;
  }
});

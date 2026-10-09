const SUPABASE_URL = "https://onzaonflquipqmhgslxi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_0jhKFtRCnOx0WDcO3PwcMg_GGsnN3kc";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/demo-verification`;
const TOKEN_KEY = "chama_live_demo_token";
const EXPIRY_KEY = "chama_live_demo_expires_at";

export function getDemoToken() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const expiresAt = sessionStorage.getItem(EXPIRY_KEY);
  if (!token || !expiresAt || Date.parse(expiresAt) <= Date.now()) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
    return null;
  }
  return token;
}

export async function startDemo() {
  // If this tab already has a session, discard its overrides before starting a fresh one.
  if (sessionStorage.getItem(TOKEN_KEY)) {
    await endDemo({ redirect: false });
  }
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_PUBLISHABLE_KEY
    },
    body: JSON.stringify({ action: "start" })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok || !result.demo_token) {
    throw new Error(result.error || "The demo is temporarily unavailable. Please try again.");
  }
  sessionStorage.setItem(TOKEN_KEY, result.demo_token);
  sessionStorage.setItem(EXPIRY_KEY, result.expires_at);
  return result;
}

export async function endDemo({ redirect = true } = {}) {
  const token = sessionStorage.getItem(TOKEN_KEY);
  try {
    if (token) {
      await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify({ action: "end", demo_token: token }),
        keepalive: true
      });
    }
  } finally {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
    if (redirect) window.location.replace("./");
  }
}

const startButton = document.querySelector("#startDemo");
if (startButton) {
  startButton.addEventListener("click", async () => {
    const errorBox = document.querySelector("#demoStartError");
    startButton.disabled = true;
    startButton.textContent = "Opening sandbox…";
    if (errorBox) errorBox.hidden = true;
    try {
      await startDemo();
      window.location.assign("./app.html");
    } catch (error) {
      if (errorBox) {
        errorBox.textContent = error instanceof Error ? error.message : "Could not open the demo.";
        errorBox.hidden = false;
      }
      startButton.disabled = false;
      startButton.textContent = "Try again";
    }
  });
}
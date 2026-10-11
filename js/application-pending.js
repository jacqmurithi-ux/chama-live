import { supabase } from "./supabase.js";
import { getCurrentUser, getMyApplicationContext } from "./auth.js";

const status = document.getElementById("status");
const signOutButton = document.getElementById("signOutButton");

function setStatus(message) {
  if (status) status.textContent = message;
}

async function init() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      window.location.replace("login.html");
      return;
    }

    const metadata = user.user_metadata || {};
    if (metadata.chama_onboarding !== true) {
      window.location.replace("login.html");
      return;
    }

    /*
     * If approval has already created a canonical member and group,
     * send the user to the appropriate portal instead of showing a
     * stale pending-review message.
     */
    try {
      const context = await getMyApplicationContext();
      const role = String(context?.role || "").trim().toLowerCase();
      const adminRoles = new Set(["admin", "administrator", "chairperson", "secretary", "treasurer"]);
      if (context?.isOwner === true || adminRoles.has(role)) {
        window.location.replace("dashboard.html");
        return;
      }
      if (role === "member") {
        window.location.replace("member-dashboard.html");
        return;
      }
    } catch (_) {
      // Expected before approval: the applicant has no group member record yet.
    }

    setStatus("Your email is confirmed, but automatic group setup could not be verified. Sign in again; if the issue persists, contact support.");
  } catch (error) {
    console.error("CHAMA LIVE applicant access check failed:", error);
    setStatus("Your session could not be verified. Please return to sign-in and try again.");
  }
}

signOutButton?.addEventListener("click", async () => {
  signOutButton.disabled = true;
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
    window.location.replace("login.html");
  } catch (error) {
    console.error("CHAMA LIVE applicant sign-out failed:", error);
    setStatus("Sign-out failed. Please try again.");
    signOutButton.disabled = false;
  }
});

init();

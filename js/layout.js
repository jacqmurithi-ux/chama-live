import { supabase } from "./supabase.js";

export async function boot() {

  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) {
    console.error("CHAMA LIVE session error:", error);
    window.location.href = "./login.html";
    return false;
  }

  if (!session) {
    window.location.href = "./login.html";
    return false;
  }

  const logoutButton = document.querySelector("#logout");

  if (logoutButton) {

    logoutButton.addEventListener("click", async () => {

      logoutButton.disabled = true;
      logoutButton.textContent = "Signing out...";

      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Sign out error:", error);
        logoutButton.disabled = false;
        logoutButton.textContent = "Sign out";
        return;
      }

      window.location.href = "./login.html";

    });

  }

  return true;
}

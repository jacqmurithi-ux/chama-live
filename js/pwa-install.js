/* CHAMA LIVE PWA install prompt and service-worker registration.
 * Progressive enhancement only: normal site navigation remains available if unsupported.
 */
(() => {
  "use strict";

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .catch((error) => {
          console.warn("CHAMA LIVE offline support could not be enabled.", error);
        });
    });
  }

  let installPrompt = null;
  let installButton = null;

  function ensureInstallButton() {
    if (installButton || !document.body) return;
    installButton = document.createElement("button");
    installButton.type = "button";
    installButton.textContent = "Install ChamaLive";
    installButton.setAttribute("aria-label", "Install CHAMA LIVE on this device");
    installButton.hidden = true;
    installButton.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:9999",
      "border:0",
      "border-radius:999px",
      "padding:13px 18px",
      "background:#0a7d3b",
      "color:#fff",
      "font:600 14px/1.2 Inter,system-ui,sans-serif",
      "box-shadow:0 8px 24px rgba(0,0,0,.18)",
      "cursor:pointer"
    ].join(";");
    installButton.addEventListener("click", async () => {
      if (!installPrompt) return;
      installButton.disabled = true;
      try {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        installButton.hidden = true;
      } catch (error) {
        console.warn("CHAMA LIVE installation prompt was not completed.", error);
      } finally {
        installButton.disabled = false;
      }
    });
    document.body.appendChild(installButton);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    ensureInstallButton();
    if (installButton) installButton.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    if (installButton) installButton.hidden = true;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureInstallButton, { once: true });
  } else {
    ensureInstallButton();
  }
})();

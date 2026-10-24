/* CHAMA LIVE clean URL support. Legacy .html routes remain compatible for auth and bookmarks. */
(() => {
  "use strict";
  const pages = new Set(["/activate-account.html","/add-member.html","/admin-getting-started.html","/admin-login.html","/admin-members.html","/admin-my-account.html","/assets.html","/billing.html","/confirm.html","/contributions.html","/dashboard.html","/data-migration.html","/documents.html","/expenses.html","/faq.html","/fines.html","/forgot-password.html","/group-management.html","/group-settings.html","/loans.html","/login.html","/meetings.html","/member-accounting.html","/member-activities.html","/member-assets.html","/member-contributions.html","/member-dashboard.html","/member-getting-started.html","/member-login.html","/member-milestones.html","/member-my-account.html","/member-profile.html","/members.html","/merry-go-round.html","/milestones.html","/monthly-closing.html","/offline.html","/plans-activities.html","/platform-admin-login.html","/platform-admin.html","/pricing.html","/privacy.html","/reports.html","/reset-password.html","/signup.html","/sitemap.html","/terms.html","/tour.html","/welfare.html"]);
  const cleanPath = (path) => path === "/index.html" ? "/" : pages.has(path) ? path.slice(0, -5) + "/" : path;
  function normalizeLinks(root = document) {
    root.querySelectorAll?.("a[href],area[href]").forEach((link) => {
      const raw = link.getAttribute("href");
      if (!raw) return;
      if (raw.startsWith("#")) {
        link.setAttribute("href", cleanPath(location.pathname) + raw);
        return;
      }
      try {
        const url = new URL(raw, document.baseURI);
        if (url.origin !== location.origin) return;
        const clean = cleanPath(url.pathname);
        if (clean !== url.pathname) link.setAttribute("href", clean + url.search + url.hash);
      } catch (_) {}
    });
    root.querySelectorAll?.("form[action]").forEach((form) => {
      try {
        const url = new URL(form.getAttribute("action"), document.baseURI);
        if (url.origin !== location.origin) return;
        const clean = cleanPath(url.pathname);
        if (clean !== url.pathname) form.setAttribute("action", clean + url.search + url.hash);
      } catch (_) {}
    });
  }
  normalizeLinks();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) normalizeLinks(node);
      });
      else if (record.type === "attributes") normalizeLinks(record.target.parentElement || document);
    }
  });
  observer.observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: ["href", "action"]
  });
})();
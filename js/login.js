/* =========================================================
   VISIBLE PORTAL DIAGNOSTIC
========================================================= */

function showPortalDiagnostic(context, destination) {

  let diagnostic =
    document.getElementById(
      "portalDiagnostic"
    );

  if (!diagnostic) {

    diagnostic =
      document.createElement("div");

    diagnostic.id =
      "portalDiagnostic";

    diagnostic.style.marginTop =
      "16px";

    diagnostic.style.padding =
      "12px";

    diagnostic.style.border =
      "1px solid #999";

    diagnostic.style.borderRadius =
      "8px";

    diagnostic.style.fontSize =
      "14px";

    diagnostic.style.lineHeight =
      "1.5";

    diagnostic.style.background =
      "#f5f5f5";

    diagnostic.style.color =
      "#111";

    if (form) {
      form.appendChild(diagnostic);
    }
  }

  const role =
    String(
      context?.role || "NONE"
    ).trim();

  const isOwner =
    context?.isOwner === true;

  diagnostic.innerHTML = `
    <strong>Portal diagnostic</strong><br>
    Role: <strong>${role}</strong><br>
    Owner: <strong>${isOwner ? "Yes" : "No"}</strong><br>
    Destination: <strong>${destination}</strong>
  `;

  diagnostic.hidden = false;
}

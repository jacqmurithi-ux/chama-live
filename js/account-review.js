/* =========================================================
   CHAMA LIVE — ACCOUNT REVIEW
========================================================= */

console.log(
  "CHAMA LIVE: account-review.js loaded"
);


/* =========================================================
   ELEMENT
========================================================= */

const details =
  document.getElementById(
    "applicationDetails"
  );


/* =========================================================
   LOAD APPLICATION
========================================================= */

function loadApplication() {

  if (!details) {
    return;
  }


  let application = null;


  try {

    const raw =
      localStorage.getItem(
        "chama_live_review_application"
      );


    if (raw) {

      application =
        JSON.parse(
          raw
        );

    }

  }

  catch (error) {

    console.error(
      "Unable to read application details",
      error
    );

  }


  if (!application) {

    details.innerHTML =
      `
        <p class="muted">
          Your application has been submitted.
          Please sign in after your account has
          been approved.
        </p>
      `;

    return;

  }


  details.innerHTML =
    `
      <div class="cl-detail-row">
        <span>Member number</span>
        <strong>
          ${escapeHtml(
            application.member_number ||
            "—"
          )}
        </strong>
      </div>

      <div class="cl-detail-row">
        <span>Email</span>
        <strong>
          ${escapeHtml(
            application.email ||
            "—"
          )}
        </strong>
      </div>

      <div class="cl-detail-row">
        <span>Application</span>
        <strong>
          Pending Review
        </strong>
      </div>
    `;

}


/* =========================================================
   ESCAPE
========================================================= */

function escapeHtml(
  value
) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


/* =========================================================
   INIT
========================================================= */

loadApplication();


console.log(
  "CHAMA LIVE: account-review.js ready"
);

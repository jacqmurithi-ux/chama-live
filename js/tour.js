/* =========================================================
   CHAMA LIVE TOUR
   Read-only onboarding experience.

   This file:
   - Reads the existing application context.
   - Determines administrator/member experience.
   - Displays role-aware tour slides.
   - Stores completion in localStorage.
   - Does NOT write to Supabase.
   - Does NOT create/update financial records.
========================================================= */

import {
  getMyApplicationContext
} from "./auth.js";


/* =========================================================
   CONSTANTS
========================================================= */

const TOUR_STORAGE_KEY =
  "chama_live_tour_completed_v1";


const DASHBOARD_URL =
  "dashboard.html";


/* =========================================================
   DOM
========================================================= */

const loadingEl =
  document.getElementById("tourLoading");

const errorEl =
  document.getElementById("tourError");

const errorMessageEl =
  document.getElementById("tourErrorMessage");

const roleBadgeEl =
  document.getElementById("tourRoleBadge");

const stepLabelEl =
  document.getElementById("tourStepLabel");

const tourLabelEl =
  document.getElementById("tourTourLabel");

const progressEl =
  document.getElementById("tourProgress");

const cardEl =
  document.getElementById("tourCard");

const iconEl =
  document.getElementById("tourIcon");

const eyebrowEl =
  document.getElementById("tourEyebrow");

const titleEl =
  document.getElementById("tourTitle");

const descriptionEl =
  document.getElementById("tourDescription");

const visualEl =
  document.getElementById("tourVisual");

const detailsEl =
  document.getElementById("tourDetails");

const dotsEl =
  document.getElementById("tourDots");

const backButton =
  document.getElementById("backButton");

const nextButton =
  document.getElementById("nextButton");

const skipTopButton =
  document.getElementById("skipTourTop");


/* =========================================================
   STATE
========================================================= */

let context = null;

let slides = [];

let currentSlide =
  0;


/* =========================================================
   HTML HELPERS
========================================================= */

function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function featureGrid(items) {

  return `
    <div class="tour-feature-grid">

      ${items.map(item => `
        <div class="tour-feature">

          <div class="tour-feature-icon">
            ${item.icon}
          </div>

          <div>
            <strong>
              ${escapeHtml(item.title)}
            </strong>

            <span>
              ${escapeHtml(item.text)}
            </span>
          </div>

        </div>
      `).join("")}

    </div>
  `;
}


function detailList(items) {

  return `
    <ul class="tour-detail-list">

      ${items.map(item => `
        <li>
          ${escapeHtml(item)}
        </li>
      `).join("")}

    </ul>
  `;
}


function exampleStats(items) {

  return `
    <div class="tour-example">

      ${items.map(item => `
        <div class="tour-example-stat">

          <span>
            ${escapeHtml(item.label)}
          </span>

          <strong>
            ${escapeHtml(item.value)}
          </strong>

        </div>
      `).join("")}

    </div>
  `;
}


function flow(items) {

  return `
    <div class="tour-flow">

      ${items.map((item, index) => `
        <div class="tour-flow-item">

          <span>
            ${item.icon}
          </span>

          <strong>
            ${escapeHtml(item.title)}
          </strong>

          ${
            index < items.length - 1
              ? `<div class="tour-flow-arrow">→</div>`
              : ""
          }

        </div>
      `).join("")}

    </div>
  `;
}


function roleGrid(activeRole) {

  const roles = [
    {
      icon: "👑",
      title: "Owner / Super Admin",
      text: "Group administration and platform control.",
      key: "owner"
    },
    {
      icon: "🧑‍💼",
      title: "Chairperson",
      text: "Leadership, approvals and group oversight.",
      key: "chairperson"
    },
    {
      icon: "💰",
      title: "Treasurer",
      text: "Contributions, payments and financial records.",
      key: "treasurer"
    },
    {
      icon: "📝",
      title: "Secretary",
      text: "Members, meetings, minutes and announcements.",
      key: "secretary"
    },
    {
      icon: "👥",
      title: "Committee",
      text: "Committee responsibilities and group activities.",
      key: "committee"
    },
    {
      icon: "👤",
      title: "Member",
      text: "Personal participation and financial information.",
      key: "member"
    }
  ];

  return `
    <div class="tour-role-grid">

      ${roles.map(role => {

        const active =
          activeRole === role.key ||
          (
            activeRole === "admin" &&
            role.key === "owner"
          );

        return `
          <div
            class="
              tour-role-card
              ${active ? "active" : ""}
            "
          >

            <strong>
              ${role.icon}
              ${escapeHtml(role.title)}
            </strong>

            <span>
              ${escapeHtml(role.text)}
            </span>

          </div>
        `;
      }).join("")}

    </div>
  `;
}


/* =========================================================
   COMMON SLIDES
========================================================= */

function getWelcomeSlides() {

  return [

    {
      icon: "👋",
      eyebrow: "WELCOME",
      title: "Welcome to CHAMA LIVE",
      description:
        "Welcome to your digital Chama. Manage your group's activities, records and information in one connected place.",

      visual:
        featureGrid([
          {
            icon: "👥",
            title: "Members",
            text: "Organize your group"
          },
          {
            icon: "💰",
            title: "Contributions",
            text: "Track member payments"
          },
          {
            icon: "🧾",
            title: "Expenses",
            text: "Record group spending"
          },
          {
            icon: "📊",
            title: "Reports",
            text: "Understand your records"
          }
        ]),

      details: detailList([
        "Learn how CHAMA LIVE works before entering your dashboard.",
        "Your access depends on your role in the Chama.",
        "You can skip the tour at any time."
      ])
    },


    {
      icon: "🔄",
      eyebrow: "HOW IT WORKS",
      title: "How your Chama works",
      description:
        "CHAMA LIVE helps your group record and manage its activities while your actual group money remains in your group's M-Pesa or bank account.",

      visual:
        flow([
          {
            icon: "👥",
            title: "Members"
          },
          {
            icon: "💰",
            title: "Contributions"
          },
          {
            icon: "🏦",
            title: "Group Funds"
          },
          {
            icon: "📊",
            title: "Records"
          }
        ]),

      details: detailList([
        "Create and maintain your member records.",
        "Record expected and received contributions.",
        "Reconcile payments against your group's records.",
        "Manage expenses, loans, meetings and reports.",
        "CHAMA LIVE is a management and reconciliation system — not your group's bank account."
      ])
    },


    {
      icon: "🧩",
      eyebrow: "YOUR ROLE",
      title: "One group, different roles",
      description:
        "Everyone gets the access and information relevant to their responsibilities.",

      visual:
        roleGrid(
          context?.isOwner
            ? "owner"
            : normalizeRole(context?.role)
        ),

      details:
        detailList([
          "Owner / Super Admin — group administration.",
          "Chairperson — leadership and approvals.",
          "Treasurer — financial records and reconciliation.",
          "Secretary — members, meetings and minutes.",
          "Committee — assigned group responsibilities.",
          "Member — personal participation and statements."
        ])
    }

  ];
}


/* =========================================================
   ADMINISTRATOR SLIDES
========================================================= */

function getAdministratorSlides() {

  const role =
    normalizeRole(context?.role);

  const roleName =
    context?.isOwner
      ? "Owner / Super Admin"
      : formatRole(role);


  return [

    {
      icon: "🏠",
      eyebrow: roleName.toUpperCase(),
      title: "Your Dashboard",
      description:
        "Your Chama at a glance. Start here to understand what is happening in your group.",

      visual:
        exampleStats([
          {
            label: "Total members",
            value: "24"
          },
          {
            label: "Contributions",
            value: "KSh 42,000"
          },
          {
            label: "Expenses",
            value: "KSh 8,500"
          },
          {
            label: "Outstanding",
            value: "KSh 8,000"
          }
        ]),

      details:
        detailList([
          "Total members",
          "Contributions",
          "Expenses",
          "Group balance",
          "Outstanding contributions",
          "Pending tasks",
          "Recent activity"
        ])
    },


    {
      icon: "👥",
      eyebrow: "MEMBERS",
      title: "Manage your members",
      description:
        "Keep your group's membership records organized and give people the right level of access.",

      visual:
        featureGrid([
          {
            icon: "➕",
            title: "Add members",
            text: "Create member records"
          },
          {
            icon: "✉️",
            title: "Invite members",
            text: "Give members portal access"
          },
          {
            icon: "🛡️",
            title: "Assign roles",
            text: "Control responsibilities"
          },
          {
            icon: "👤",
            title: "Profiles",
            text: "View member information"
          }
        ]),

      details:
        detailList([
          "Add and manage members.",
          "Invite members to the portal.",
          "Assign appropriate roles.",
          "View membership status.",
          "View individual contribution records.",
          "Disable portal access when necessary.",
          "A registered member does not automatically need a portal account."
        ])
    },


    {
      icon: "💰",
      eyebrow: "CONTRIBUTIONS",
      title: "Track what members contribute",
      description:
        "Understand what is expected, what has been received and what remains outstanding.",

      visual:
        exampleStats([
          {
            label: "Expected",
            value: "KSh 50,000"
          },
          {
            label: "Received",
            value: "KSh 42,000"
          },
          {
            label: "Outstanding",
            value: "KSh 8,000"
          }
        ]),

      details:
        detailList([
          "Set contribution rules.",
          "Record payments.",
          "View expected contributions.",
          "See paid, partial and outstanding members.",
          "Track arrears.",
          "Reconcile payments.",
          "Issue receipts."
        ])
    },


    {
      icon: "📱",
      eyebrow: "PAYMENTS",
      title: "Payments & reconciliation",
      description:
        "Connect payments to the right member and verify the contribution record.",

      visual:
        flow([
          {
            icon: "💳",
            title: "Member pays"
          },
          {
            icon: "📥",
            title: "Payment received"
          },
          {
            icon: "🔎",
            title: "Match"
          },
          {
            icon: "✓",
            title: "Verify"
          }
        ]),

      details:
        detailList([
          "M-Pesa payments",
          "Bank payments",
          "Cash or manual entries",
          "Payment references",
          "Unmatched transactions",
          "Payment verification",
          "Receipt records",
          "CHAMA LIVE manages the records and reconciliation; group funds remain in the group's financial account."
        ])
    },


    {
      icon: "🧾",
      eyebrow: "EXPENSES",
      title: "Know where group money goes",
      description:
        "Record expenses clearly and maintain an understandable approval trail.",

      visual:
        exampleStats([
          {
            label: "Expense",
            value: "Office supplies"
          },
          {
            label: "Amount",
            value: "KSh 2,500"
          },
          {
            label: "Approved",
            value: "Treasurer"
          }
        ]),

      details:
        detailList([
          "Record expenses.",
          "Upload supporting documents.",
          "Request or approve expenses.",
          "Categorize spending.",
          "Track who approved an expense.",
          "View expense history."
        ])
    },


    {
      icon: "💳",
      eyebrow: "LOANS",
      title: "Manage member loans",
      description:
        "If your group uses loans, keep disbursements, repayments and balances organized.",

      visual:
        featureGrid([
          {
            icon: "➕",
            title: "Create loans",
            text: "Record loan details"
          },
          {
            icon: "💸",
            title: "Disbursements",
            text: "Record money issued"
          },
          {
            icon: "📅",
            title: "Schedules",
            text: "Track repayments"
          },
          {
            icon: "👥",
            title: "Guarantors",
            text: "Maintain guarantees"
          }
        ]),

      details:
        detailList([
          "Create member loans.",
          "Record disbursements.",
          "Set repayment schedules.",
          "Track outstanding balances.",
          "Manage guarantors.",
          "Record repayments.",
          "Identify overdue loans."
        ])
    },


    {
      icon: "📅",
      eyebrow: "MEETINGS",
      title: "Keep your group organized",
      description:
        "Bring meetings, attendance, agendas and decisions into one place.",

      visual:
        featureGrid([
          {
            icon: "📅",
            title: "Schedule",
            text: "Plan upcoming meetings"
          },
          {
            icon: "👥",
            title: "Attendance",
            text: "Record participation"
          },
          {
            icon: "📝",
            title: "Minutes",
            text: "Keep meeting records"
          },
          {
            icon: "✓",
            title: "Decisions",
            text: "Track resolutions"
          }
        ]),

      details:
        detailList([
          "Schedule meetings.",
          "Record attendance.",
          "Add agendas.",
          "Record minutes.",
          "Track decisions.",
          "Share meeting information."
        ])
    },


    {
      icon: "📊",
      eyebrow: "REPORTS",
      title: "Turn records into useful information",
      description:
        "Reports help your leadership understand the group's financial and operational records.",

      visual:
        featureGrid([
          {
            icon: "💰",
            title: "Contributions",
            text: "Contribution reports"
          },
          {
            icon: "👤",
            title: "Statements",
            text: "Member statements"
          },
          {
            icon: "🧾",
            title: "Expenses",
            text: "Expense reports"
          },
          {
            icon: "📊",
            title: "Summary",
            text: "Financial overview"
          }
        ]),

      details:
        detailList([
          "Contribution reports.",
          "Member statements.",
          "Expense reports.",
          "Loan reports.",
          "Income and expenditure.",
          "Group financial summaries.",
          "Audit history."
        ])
    },


    {
      icon: "⚙️",
      eyebrow: "SETTINGS",
      title: "Control how your Chama operates",
      description:
        "Group administrators can configure the information and rules used by CHAMA LIVE.",

      visual:
        featureGrid([
          {
            icon: "🏢",
            title: "Group",
            text: "Group information"
          },
          {
            icon: "💰",
            title: "Rules",
            text: "Contribution settings"
          },
          {
            icon: "👥",
            title: "Roles",
            text: "User access"
          },
          {
            icon: "🔔",
            title: "Notifications",
            text: "Stay informed"
          },
          {
            icon: "🔐",
            title: "Security",
            text: "Account controls"
          },
          {
            icon: "💳",
            title: "Subscription",
            text: "Billing settings"
          }
        ]),

      details:
        detailList([
          "Group information.",
          "Contribution rules.",
          "Payment details.",
          "User roles.",
          "Notifications.",
          "Security.",
          "Subscription.",
          "Documents and audit information."
        ])
    },


    {
      icon: "🎉",
      eyebrow: "READY",
      title: "You're ready!",
      description:
        "Your CHAMA LIVE experience starts with a clear view of your group's activities.",

      visual:
        flow([
          {
            icon: "👥",
            title: "Members"
          },
          {
            icon: "💰",
            title: "Contributions"
          },
          {
            icon: "🧾",
            title: "Expenses"
          },
          {
            icon: "📊",
            title: "Reports"
          }
        ]),

      details:
        detailList([
          "Start from your dashboard.",
          "Use the tools relevant to your role.",
          "Keep your group's records organized.",
          "Return to the tour later if you need a refresher."
        ]),

      final: true
    }

  ];
}


/* =========================================================
   MEMBER SLIDES
========================================================= */

function getMemberSlides() {

  return [

    {
      icon: "👋",
      eyebrow: "MEMBER PORTAL",
      title: "Welcome to your Member Portal",
      description:
        "Everything about your participation in the Chama, in one place.",

      visual:
        featureGrid([
          {
            icon: "💰",
            title: "My Contributions",
            text: "Track your payments"
          },
          {
            icon: "🧾",
            title: "My Statement",
            text: "View your history"
          },
          {
            icon: "💳",
            title: "My Loans",
            text: "Track your balance"
          },
          {
            icon: "📅",
            title: "Meetings",
            text: "Stay involved"
          }
        ]),

      details:
        detailList([
          "See information relevant to your participation.",
          "Track your own financial records.",
          "Stay informed about meetings and announcements."
        ])
    },


    {
      icon: "🏠",
      eyebrow: "MY DASHBOARD",
      title: "See your Chama status",
      description:
        "Your member dashboard gives you a quick view of your participation.",

      visual:
        exampleStats([
          {
            label: "My contributions",
            value: "KSh 1,000"
          },
          {
            label: "Outstanding",
            value: "KSh 500"
          },
          {
            label: "Loan balance",
            value: "KSh 8,000"
          },
          {
            label: "Meetings",
            value: "2 upcoming"
          }
        ]),

      details:
        detailList([
          "My contributions.",
          "Amount outstanding.",
          "Loan balance.",
          "Upcoming meetings.",
          "Announcements.",
          "Recent activity."
        ])
    },


    {
      icon: "💰",
      eyebrow: "MY CONTRIBUTIONS",
      title: "Track your payments",
      description:
        "See what you were expected to contribute, what you paid and your current status.",

      visual:
        `
        <div class="tour-example">

          <div class="tour-example-stat">
            <span>September</span>
            <strong>✓ KSh 1,000</strong>
          </div>

          <div class="tour-example-stat">
            <span>October</span>
            <strong>Partial · KSh 500</strong>
          </div>

        </div>
        `,

      details:
        detailList([
          "View contribution periods.",
          "See expected amounts.",
          "See payments recorded for you.",
          "Identify paid, partial and outstanding periods.",
          "Use available contribution actions when enabled."
        ])
    },


    {
      icon: "🧾",
      eyebrow: "MY STATEMENT",
      title: "Know your financial history",
      description:
        "Your statement brings your recorded Chama financial activity together.",

      visual:
        featureGrid([
          {
            icon: "💰",
            title: "Contributions",
            text: "Your contribution history"
          },
          {
            icon: "🧾",
            title: "Payments",
            text: "Recorded payments"
          },
          {
            icon: "🧾",
            title: "Receipts",
            text: "Your receipts"
          },
          {
            icon: "💳",
            title: "Loans",
            text: "Loans and repayments"
          }
        ]),

      details:
        detailList([
          "Contributions.",
          "Payments.",
          "Receipts.",
          "Loans.",
          "Repayments.",
          "Outstanding amounts.",
          "Download your statement when the feature is available."
        ])
    },


    {
      icon: "💳",
      eyebrow: "MY LOANS",
      title: "Manage your loan information",
      description:
        "See the information your Chama has recorded about your loans.",

      visual:
        exampleStats([
          {
            label: "Loan amount",
            value: "KSh 20,000"
          },
          {
            label: "Outstanding",
            value: "KSh 8,000"
          },
          {
            label: "Next payment",
            value: "KSh 2,000"
          }
        ]),

      details:
        detailList([
          "Loan amount.",
          "Outstanding balance.",
          "Repayment schedule.",
          "Next payment.",
          "Guarantors.",
          "Loan history."
        ])
    },


    {
      icon: "📅",
      eyebrow: "MEETINGS",
      title: "Stay involved",
      description:
        "Keep up with your Chama's meetings and decisions.",

      visual:
        featureGrid([
          {
            icon: "📅",
            title: "Upcoming",
            text: "See scheduled meetings"
          },
          {
            icon: "📝",
            title: "Agenda",
            text: "Know what is planned"
          },
          {
            icon: "📄",
            title: "Minutes",
            text: "Review meeting records"
          },
          {
            icon: "✓",
            title: "Attendance",
            text: "Check your participation"
          }
        ]),

      details:
        detailList([
          "See upcoming meetings.",
          "View meeting details.",
          "See agendas.",
          "View minutes.",
          "Check attendance records."
        ])
    },


    {
      icon: "📢",
      eyebrow: "ANNOUNCEMENTS",
      title: "Stay informed",
      description:
        "Administrators can share important Chama information with members.",

      visual:
        `
        <div class="tour-feature-grid">

          <div class="tour-feature">

            <div class="tour-feature-icon">
              📢
            </div>

            <div>
              <strong>
                Monthly meeting
              </strong>

              <span>
                Saturday, 10:00 AM
              </span>
            </div>

          </div>

          <div class="tour-feature">

            <div class="tour-feature-icon">
              💰
            </div>

            <div>
              <strong>
                September contribution
              </strong>

              <span>
                Deadline: 30 September
              </span>
            </div>

          </div>

        </div>
        `,

      details:
        detailList([
          "Meeting announcements.",
          "Contribution reminders.",
          "Important group notices.",
          "Other information shared by administrators."
        ])
    },


    {
      icon: "👤",
      eyebrow: "MY PROFILE",
      title: "Manage your account",
      description:
        "Keep your personal account information and security settings up to date.",

      visual:
        featureGrid([
          {
            icon: "👤",
            title: "Personal details",
            text: "Name and contact information"
          },
          {
            icon: "🔐",
            title: "Security",
            text: "Password and login controls"
          },
          {
            icon: "🔔",
            title: "Notifications",
            text: "Choose what you receive"
          },
          {
            icon: "📱",
            title: "Contact",
            text: "Keep details current"
          }
        ]),

      details:
        detailList([
          "Name.",
          "Phone.",
          "Email.",
          "Password or PIN where supported.",
          "Notification preferences.",
          "Login and security settings."
        ])
    },


    {
      icon: "🎉",
      eyebrow: "READY",
      title: "You're ready!",
      description:
        "Your Member Portal is ready. Start by checking your dashboard.",

      visual:
        flow([
          {
            icon: "🏠",
            title: "Dashboard"
          },
          {
            icon: "💰",
            title: "Contributions"
          },
          {
            icon: "🧾",
            title: "Statement"
          },
          {
            icon: "📅",
            title: "Meetings"
          }
        ]),

      details:
        detailList([
          "Check your contribution status.",
          "Review your statement.",
          "Keep up with loans and meetings.",
          "Stay informed through announcements."
        ]),

      final: true
    }

  ];
}


/* =========================================================
   ROLE HELPERS
========================================================= */

function normalizeRole(role) {

  return String(role || "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
}


function isAdministratorRole(role) {

  const adminRoles = new Set([
    "owner",
    "super_admin",
    "admin",
    "administrator",
    "chairperson",
    "chairman",
    "treasurer",
    "secretary",
    "committee"
  ]);

  return adminRoles.has(role);
}


function formatRole(role) {

  const names = {
    owner: "Owner / Super Admin",
    super_admin: "Owner / Super Admin",
    admin: "Administrator",
    administrator: "Administrator",
    chairperson: "Chairperson",
    chairman: "Chairperson",
    treasurer: "Treasurer",
    secretary: "Secretary",
    committee: "Committee",
    member: "Member"
  };

  return names[role] || "Administrator";
}


/* =========================================================
   TOUR TYPE
========================================================= */

function buildTour() {

  const role =
    normalizeRole(context?.role);

  const administrator =
    Boolean(context?.isOwner) ||
    isAdministratorRole(role);

  if (administrator) {

    slides =
      [
        ...getWelcomeSlides(),
        ...getAdministratorSlides()
      ];

    roleBadgeEl.textContent =
      context?.isOwner
        ? "Owner / Super Admin"
        : formatRole(role);

    tourLabelEl.textContent =
      "Administrator tour";

  } else {

    slides =
      [
        ...getWelcomeSlides().slice(0, 2),
        ...getMemberSlides()
      ];

    roleBadgeEl.textContent =
      "Member";

    tourLabelEl.textContent =
      "Member tour";
  }
}


/* =========================================================
   RENDER
========================================================= */

function renderSlide() {

  const slide =
    slides[currentSlide];

  if (!slide) {
    return;
  }


  cardEl.classList.remove(
    "tour-card"
  );

  /*
   * Force a small animation restart.
   */
  void cardEl.offsetWidth;

  cardEl.classList.add(
    "tour-card"
  );


  const total =
    slides.length;

  const current =
    currentSlide + 1;


  stepLabelEl.textContent =
    `${String(current).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;


  progressEl.style.width =
    `${(current / total) * 100}%`;


  iconEl.textContent =
    slide.icon;

  eyebrowEl.textContent =
    slide.eyebrow;

  titleEl.textContent =
    slide.title;

  descriptionEl.textContent =
    slide.description;


  visualEl.innerHTML =
    slide.visual || "";


  detailsEl.innerHTML =
    slide.details || "";


  backButton.disabled =
    currentSlide === 0;


  if (slide.final) {

    nextButton.textContent =
      "Go to Dashboard →";

  } else {

    nextButton.textContent =
      "Next →";
  }


  renderDots();
}


/* =========================================================
   DOTS
========================================================= */

function renderDots() {

  dotsEl.innerHTML =
    slides.map((slide, index) => `
      <button
        class="tour-dot ${index === currentSlide ? "active" : ""}"
        type="button"
        aria-label="Go to slide ${index + 1}"
        aria-current="${index === currentSlide ? "step" : "false"}"
        data-tour-index="${index}"
      ></button>
    `).join("");


  dotsEl
    .querySelectorAll("[data-tour-index]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const index =
            Number(
              button.dataset.tourIndex
            );

          if (
            Number.isInteger(index) &&
            index >= 0 &&
            index < slides.length
          ) {

            currentSlide =
              index;

            renderSlide();
          }

        }
      );

    });
}


/* =========================================================
   NAVIGATION
========================================================= */

function nextSlide() {

  if (
    currentSlide <
    slides.length - 1
  ) {

    currentSlide += 1;

    renderSlide();

    return;
  }


  finishTour();
}


function previousSlide() {

  if (
    currentSlide > 0
  ) {

    currentSlide -= 1;

    renderSlide();
  }
}


/* =========================================================
   FINISH / SKIP
========================================================= */

function finishTour() {

  try {

    localStorage.setItem(
      TOUR_STORAGE_KEY,
      "true"
    );

  } catch (error) {

    /*
     * localStorage failure should not prevent
     * the user from entering the application.
     */

    console.warn(
      "CHAMA LIVE tour state could not be saved:",
      error
    );
  }


  window.location.href =
    DASHBOARD_URL;
}


function skipTour() {

  finishTour();
}


/* =========================================================
   KEYBOARD
========================================================= */

function handleKeyboard(event) {

  if (
    event.key === "ArrowRight"
  ) {

    event.preventDefault();

    nextSlide();

  } else if (
    event.key === "ArrowLeft"
  ) {

    event.preventDefault();

    previousSlide();

  } else if (
    event.key === "Escape"
  ) {

    event.preventDefault();

    skipTour();
  }
}


/* =========================================================
   TOUCH / SWIPE
========================================================= */

let touchStartX =
  null;


function handleTouchStart(event) {

  if (
    !event.touches ||
    !event.touches.length
  ) {
    return;
  }

  touchStartX =
    event.touches[0].clientX;
}


function handleTouchEnd(event) {

  if (
    touchStartX === null ||
    !event.changedTouches ||
    !event.changedTouches.length
  ) {

    touchStartX = null;

    return;
  }


  const touchEndX =
    event.changedTouches[0].clientX;

  const distance =
    touchEndX - touchStartX;


  touchStartX = null;


  if (
    Math.abs(distance) < 50
  ) {
    return;
  }


  if (distance < 0) {

    nextSlide();

  } else {

    previousSlide();
  }
}


/* =========================================================
   ERROR HANDLING
========================================================= */

function showError(message) {

  if (loadingEl) {
    loadingEl.hidden = true;
  }

  if (errorMessageEl) {
    errorMessageEl.textContent =
      message;
  }

  if (errorEl) {
    errorEl.hidden = false;
  }
}


/* =========================================================
   INITIALIZATION
========================================================= */

async function initializeTour() {

  try {

    /*
     * The tour intentionally does not make any
     * database writes. It only retrieves the
     * existing authenticated application context.
     */

    context =
      await getMyApplicationContext();


    if (
      !context ||
      !context.user
    ) {

      throw new Error(
        "Your session could not be verified."
      );
    }


    buildTour();

    currentSlide = 0;

    renderSlide();


    if (loadingEl) {
      loadingEl.hidden = true;
    }


  } catch (error) {

    console.error(
      "CHAMA LIVE tour initialization failed:",
      error
    );


    showError(
      error?.message ||
      "The tour could not verify your application context."
    );
  }
}


/* =========================================================
   EVENTS
========================================================= */

nextButton.addEventListener(
  "click",
  nextSlide
);


backButton.addEventListener(
  "click",
  previousSlide
);


skipTopButton.addEventListener(
  "click",
  skipTour
);


document.addEventListener(
  "keydown",
  handleKeyboard
);


cardEl.addEventListener(
  "touchstart",
  handleTouchStart,
  {
    passive: true
  }
);


cardEl.addEventListener(
  "touchend",
  handleTouchEnd,
  {
    passive: true
  }
);


/* =========================================================
   START
========================================================= */

initializeTour();

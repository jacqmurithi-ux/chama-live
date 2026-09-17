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

      details:
        detailList([
          "Start the tour with your current CHAMA LIVE role.",
          "Use the navigation to move between the pages available to your account.",
          "The tour explains the main workflow before you begin entering records.",
          "You can use the Back, Next, slide dots, keyboard arrows or swipe gestures to navigate.",
          "You can skip the tour at any time and go directly to the dashboard."
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

      details:
        detailList([
          "Start by keeping the member register accurate.",
          "Record contributions and other financial activity against the correct member or group record.",
          "Record expenses, loans and other activities using their dedicated pages.",
          "Use reports and statements to review information already recorded.",
          "Reconcile application records against the group's actual financial records.",
          "CHAMA LIVE is a management and reconciliation system — it is not the group's bank account."
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
          "Owner / Super Admin — group administration and overall control.",
          "Chairperson — leadership, oversight and approvals where permitted.",
          "Treasurer — financial records, contributions and reconciliation.",
          "Secretary — members, meetings, minutes and group communication.",
          "Committee — assigned group responsibilities and activities.",
          "Member — personal participation, financial information and group updates.",
          "Your actual available pages and actions are determined by your account permissions."
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
        "Use the dashboard as your starting point. It gives you a quick view of the group's current records and activity.",

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
          "OPEN — Click Dashboard in the navigation to return to the group overview.",
          "CHECK — Review total members, contributions, expenses, balance and outstanding amounts shown for your group.",
          "REVIEW — Check recent activity and any pending items before starting your work.",
          "USE — Select the relevant navigation item when you need to work on members, contributions, expenses, meetings or reports.",
          "EXPECT — The dashboard gives you a summary; detailed records are managed on the individual pages.",
          "TIP — If a dashboard figure looks unexpected, open the relevant detailed page and verify the underlying records."
        ])
    },


    {
      icon: "👥",
      eyebrow: "MEMBERS",
      title: "Manage your members",
      description:
        "The Members page is where you maintain the group's member register and manage member access.",

      visual:
        featureGrid([
          {
            icon: "➕",
            title: "Add Member",
            text: "Create a member record"
          },
          {
            icon: "✏️",
            title: "Edit",
            text: "Update member information"
          },
          {
            icon: "🛡️",
            title: "Role",
            text: "Assign responsibilities"
          },
          {
            icon: "✉️",
            title: "Invite",
            text: "Provide portal access"
          }
        ]),

      details:
        detailList([
          "OPEN — Click Members in the navigation.",
          "ADD — Click Add Member to create a new member record.",
          "ENTER — Enter the member's required personal/contact information and select the appropriate role.",
          "SAVE — Save the member record and confirm that the new member appears in the member list.",
          "CHECK — Review the member's status, role, contact information and group association.",
          "ACCESS — If portal access is required, use the available invitation/access action for that member.",
          "EXPECT — The member should appear in the group's member register with the appropriate status.",
          "IMPORTANT — A registered member does not automatically need a portal account."
        ])
    },


    {
      icon: "💰",
      eyebrow: "CONTRIBUTIONS",
      title: "Record member contributions",
      description:
        "Use Contributions to record what members are expected to contribute, what has been received and what remains outstanding.",

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
          "OPEN — Click Contributions in the navigation.",
          "SELECT — Choose the member whose contribution you are recording.",
          "ENTER — Enter the contribution amount, contribution date and contribution type as required.",
          "PAYMENT — Select the applicable payment method and enter the payment/reference information when available.",
          "SAVE — Save the contribution record and confirm that it appears in the member's contribution history.",
          "CHECK — Verify the member, amount, date, payment method and reference before relying on the record.",
          "RECONCILE — Compare recorded payments with the group's actual M-Pesa, bank or cash records.",
          "EXPECT — The member's contribution history and relevant totals should reflect the newly recorded transaction."
        ])
    },


    {
      icon: "📱",
      eyebrow: "PAYMENTS",
      title: "Payments & reconciliation",
      description:
        "Use the payment workflow to make sure received payments are connected to the correct member and contribution record.",

      visual:
        flow([
          {
            icon: "💳",
            title: "Member pays"
          },
          {
            icon: "📥",
            title: "Receive"
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
          "OPEN — Go to the payment/contribution workflow available to your group.",
          "IDENTIFY — Confirm who made the payment before assigning it to a member.",
          "ENTER — Record the amount, payment date, payment method and available transaction/reference information.",
          "MATCH — Connect the payment to the correct member and applicable contribution record.",
          "CHECK — Confirm that the amount and reference agree with the original payment evidence.",
          "VERIFY — Review the resulting member contribution/history record after reconciliation.",
          "HANDLE — Do not silently assign an uncertain payment; investigate unmatched or ambiguous transactions first.",
          "EXPECT — A correctly reconciled payment should be traceable from the payment information to the appropriate member record.",
          "IMPORTANT — CHAMA LIVE manages records and reconciliation; the group's actual funds remain in the group's financial account."
        ])
    },


    {
      icon: "🧾",
      eyebrow: "EXPENSES",
      title: "Record and review expenses",
      description:
        "Use Expenses to document group spending and keep a clear record of what was spent, why it was spent and how it was approved.",

      visual:
        exampleStats([
          {
            label: "Description",
            value: "Office supplies"
          },
          {
            label: "Amount",
            value: "KSh 2,500"
          },
          {
            label: "Status",
            value: "Approved"
          }
        ]),

      details:
        detailList([
          "OPEN — Click Expenses in the navigation.",
          "ADD — Start the expense entry available on the page.",
          "ENTER — Enter the expense date, description, category and amount.",
          "SUPPORT — Add supporting information or documents when the page provides that option.",
          "SAVE — Save the expense and confirm that it appears in the expense history.",
          "CHECK — Verify the date, description, category, amount and approval status.",
          "APPROVE — Follow your group's approval process where approval is required.",
          "EXPECT — The expense should become part of the group's recorded spending history and relevant summaries."
        ])
    },


    {
      icon: "💳",
      eyebrow: "LOANS",
      title: "Manage member loans",
      description:
        "If your group provides loans, use the loan workflow to keep loan amounts, repayments and outstanding balances organized.",

      visual:
        featureGrid([
          {
            icon: "➕",
            title: "Create",
            text: "Record loan details"
          },
          {
            icon: "💸",
            title: "Disburse",
            text: "Record money issued"
          },
          {
            icon: "📅",
            title: "Repay",
            text: "Track scheduled payments"
          },
          {
            icon: "📊",
            title: "Balance",
            text: "Review outstanding amounts"
          }
        ]),

      details:
        detailList([
          "OPEN — Click Loans or the loan function available in your navigation.",
          "SELECT — Select the member receiving or repaying the loan.",
          "ENTER — Record the loan amount, applicable dates, repayment information and other required loan details.",
          "CHECK — Review the member, principal amount, repayment schedule and any guarantor information before saving.",
          "SAVE — Save the loan record and confirm that the loan appears against the correct member.",
          "RECORD — Record repayments using the appropriate loan repayment workflow.",
          "REVIEW — Check the outstanding balance and repayment history after each recorded transaction.",
          "EXPECT — The member's loan record should show the loan history, repayments and remaining balance."
        ])
    },


    {
      icon: "📅",
      eyebrow: "MEETINGS",
      title: "Organize meetings and decisions",
      description:
        "Use Meetings to keep a structured record of meetings, attendance, agendas, minutes and resolutions.",

      visual:
        featureGrid([
          {
            icon: "📅",
            title: "Schedule",
            text: "Create the meeting"
          },
          {
            icon: "👥",
            title: "Attendance",
            text: "Record participation"
          },
          {
            icon: "📝",
            title: "Minutes",
            text: "Record what happened"
          },
          {
            icon: "✓",
            title: "Resolutions",
            text: "Track decisions"
          }
        ]),

      details:
        detailList([
          "OPEN — Click Meetings in the navigation.",
          "CREATE — Add the meeting date, title, venue and other required meeting information.",
          "PLAN — Add the agenda or topics that members need to discuss.",
          "RECORD — After the meeting, update attendance and record the minutes.",
          "DECIDE — Record important decisions or resolutions made by the group.",
          "CHECK — Confirm the meeting date, title, attendance, minutes and resolutions are complete.",
          "SAVE — Save the meeting record so it becomes part of the group's history.",
          "EXPECT — The meeting should remain available as a reference for future review."
        ])
    },


    {
      icon: "📊",
      eyebrow: "REPORTS",
      title: "Turn records into useful information",
      description:
        "Reports help leadership review the information already recorded in CHAMA LIVE.",

      visual:
        featureGrid([
          {
            icon: "💰",
            title: "Contributions",
            text: "Review contribution records"
          },
          {
            icon: "👤",
            title: "Statements",
            text: "Review member history"
          },
          {
            icon: "🧾",
            title: "Expenses",
            text: "Review group spending"
          },
          {
            icon: "📊",
            title: "Summary",
            text: "Review group information"
          }
        ]),

      details:
        detailList([
          "OPEN — Click Reports in the navigation.",
          "SELECT — Choose the report or reporting view relevant to the information you need.",
          "FILTER — Where filters are available, select the appropriate member, period, category or other criteria.",
          "REVIEW — Check that the report covers the intended period and uses the expected records.",
          "COMPARE — Compare report figures against the detailed contribution, expense, loan or member records when reconciliation is required.",
          "EXPORT — Use an available export/download action when you need a copy of the report.",
          "EXPECT — The report should summarize records already stored in CHAMA LIVE; it should not be treated as a replacement for verifying source records."
        ])
    },


    {
      icon: "⚙️",
      eyebrow: "GROUP MANAGEMENT",
      title: "Control how your Chama operates",
      description:
        "Group Management is where administrators can review and maintain the group-level settings and controls available to their account.",

      visual:
        featureGrid([
          {
            icon: "🏢",
            title: "Group",
            text: "Review group information"
          },
          {
            icon: "💰",
            title: "Rules",
            text: "Review contribution settings"
          },
          {
            icon: "👥",
            title: "Roles",
            text: "Review user responsibilities"
          },
          {
            icon: "💳",
            title: "Billing",
            text: "Open subscription information"
          }
        ]),

      details:
        detailList([
          "OPEN — Click Group Management in the navigation.",
          "REVIEW — Check the group name, group information and other configuration displayed for your group.",
          "UPDATE — Use only the settings and controls that your role is authorized to change.",
          "ROLES — Review member roles carefully because roles determine responsibilities and access.",
          "BILLING — When billing is available from Group Management, open the billing section to review subscription/payment information.",
          "CHECK — After any permitted configuration change, review the displayed information to confirm it is correct.",
          "EXPECT — Group Management should provide the central place for authorized group-level configuration.",
          "IMPORTANT — Do not change a setting simply to test it in a live group. Confirm the intended value before saving."
        ])
    },


    {
      icon: "🎉",
      eyebrow: "READY",
      title: "You're ready!",
      description:
        "You now have the basic workflow for managing your Chama in CHAMA LIVE.",

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
          "START — Begin from the Dashboard and review the current state of your group.",
          "MEMBERS — Keep the member register accurate before recording member activity.",
          "FINANCE — Record contributions, payments, expenses and loans against the correct records.",
          "OPERATIONS — Keep meetings, attendance, minutes and resolutions organized.",
          "REVIEW — Use reports and detailed pages to check the information you have recorded.",
          "CONTROL — Use Group Management for authorized group-level settings and administration.",
          "NEXT — Click Go to Dashboard when you are ready to start working with your actual group records.",
          "REMEMBER — Accurate records depend on entering the correct member, date, amount and reference information."
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
          "Use the Member Portal to review information relevant to your own participation.",
          "Check your financial records and contribution status.",
          "Review meetings, announcements and other information shared with members.",
          "Your available actions depend on the permissions assigned to your account."
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
          "OPEN — Start from your Member Dashboard.",
          "CHECK — Review your contribution total, outstanding amount and loan information.",
          "REVIEW — Check upcoming meetings and announcements.",
          "COMPARE — If a figure appears incorrect, contact the appropriate group administrator rather than changing financial records yourself.",
          "EXPECT — The dashboard provides a summary of your current member information."
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
          "OPEN — Go to your contribution information.",
          "CHECK — Review the contribution period and expected amount.",
          "REVIEW — Check payments recorded against your member account.",
          "IDENTIFY — Look for paid, partial or outstanding periods.",
          "VERIFY — Compare your personal payment evidence with the record shown in CHAMA LIVE.",
          "EXPECT — Your contribution history should show the transactions recorded for your member account.",
          "CONTACT — If a payment is missing or incorrect, contact the group administrator responsible for financial records."
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
          "OPEN — Open your member statement.",
          "REVIEW — Check contributions, payments, receipts and loan activity shown for your account.",
          "CHECK — Review dates and amounts against your own records.",
          "IDENTIFY — Note any missing, duplicate or unexpected transactions.",
          "DOWNLOAD — Download your statement when that feature is available.",
          "EXPECT — The statement should provide a consolidated view of the financial records associated with your member account."
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
          "OPEN — Open your loan information.",
          "CHECK — Review the original loan amount and outstanding balance.",
          "REVIEW — Check the repayment schedule and next payment information.",
          "CHECK GUARANTORS — Review guarantor information where it is displayed.",
          "COMPARE — Compare recorded repayments with your own payment records.",
          "EXPECT — The loan information should show the records maintained by your Chama.",
          "CONTACT — Ask the responsible group administrator about discrepancies."
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
          "OPEN — Go to Meetings.",
          "CHECK — Review upcoming meeting dates, times and venues.",
          "REVIEW — Read the agenda so you know what is planned.",
          "AFTER MEETING — Review minutes and decisions when they are published.",
          "ATTENDANCE — Check your recorded participation where available.",
          "EXPECT — Meeting information should help you stay informed about group activities."
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
          "OPEN — Review announcements available to your member account.",
          "READ — Check meeting announcements, contribution reminders and other group notices.",
          "CHECK — Pay attention to dates, deadlines and instructions included in each notice.",
          "KEEP — Follow important group communication so you do not miss meetings or required actions.",
          "EXPECT — Announcements provide information shared by authorized group administrators."
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
          "OPEN — Open your profile or account settings.",
          "REVIEW — Check your name, phone number and email information.",
          "UPDATE — Change personal information only where the application allows you to do so.",
          "SECURITY — Review available login and security controls.",
          "NOTIFICATIONS — Review notification preferences when available.",
          "CHECK — Save permitted changes and confirm that the updated information is displayed correctly.",
          "EXPECT — Your account information should remain consistent with the member record maintained by the group."
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
          "START — Check your dashboard.",
          "FINANCE — Review your contribution status and statement.",
          "LOANS — Review loan information when applicable.",
          "MEETINGS — Keep up with meetings and group decisions.",
          "NOTICES — Check announcements regularly.",
          "PROFILE — Keep your personal account information current.",
          "NEXT — Click Go to Dashboard to enter the application."
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

  let stage =
    "AUTH USER / MEMBER / GROUP CONTEXT";


  try {

    console.info(
      "[TOUR-DIAG] CONTEXT START"
    );


    context =
      await getMyApplicationContext();


    console.info(
      "[TOUR-DIAG] CONTEXT COMPLETE",
      {
        userId:
          context?.user?.id ?? null,

        memberId:
          context?.member?.id ?? null,

        groupId:
          context?.group?.id ?? null,

        role:
          context?.role ?? null,

        isOwner:
          context?.isOwner ?? false
      }
    );


    if (
      !context ||
      !context.user
    ) {

      throw new Error(
        "Application context did not contain an authenticated user."
      );
    }


    /* =====================================================
       TOUR COMPLETION

       IMPORTANT:
       A completed tour does NOT redirect the user away.

       The tour must remain accessible whenever the user
       explicitly opens tour.html from Getting Started.

       Completion is still recorded by finishTour().
    ===================================================== */


    stage =
      "TOUR BUILD";


    console.info(
      "[TOUR-DIAG] BUILD START"
    );


    buildTour();


    console.info(
      "[TOUR-DIAG] BUILD COMPLETE",
      {
        slideCount:
          Array.isArray(slides)
            ? slides.length
            : null
      }
    );


    if (
      !Array.isArray(slides) ||
      slides.length === 0
    ) {

      throw new Error(
        "Tour build returned no slides."
      );
    }


    stage =
      "TOUR RENDER";


    currentSlide =
      0;


    console.info(
      "[TOUR-DIAG] RENDER START",
      {
        slide:
          currentSlide
      }
    );


    renderSlide();


    console.info(
      "[TOUR-DIAG] RENDER COMPLETE"
    );


    if (loadingEl) {
      loadingEl.hidden = true;
    }


    console.info(
      "[TOUR-DIAG] INITIALIZATION COMPLETE"
    );


  } catch (error) {

    console.error(
      "CHAMA LIVE tour initialization failed.",
      {
        stage,
        error,
        message:
          error?.message ?? null,
        name:
          error?.name ?? null,
        stack:
          error?.stack ?? null
      }
    );


    const message =
      error?.message ||
      `Tour initialization failed during ${stage}.`;


    showError(
      `${stage}: ${message}`
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

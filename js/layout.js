import {
  requireAuth,
  getMyMember,
  signOut,
  normalizeRole
} from "./auth.js";


/* =====================================================
   PAGE PERMISSIONS
===================================================== */

const PAGE_PERMISSIONS = {

  "dashboard.html": [
    "admin",
    "chairperson",
    "treasurer",
    "secretary",
    "member"
  ],

  "members.html": [
    "admin",
    "chairperson",
    "secretary"
  ],

  "contributions.html": [
    "admin",
    "chairperson",
    "treasurer",
    "secretary",
    "member"
  ],

  "expenses.html": [
    "admin",
    "chairperson",
    "treasurer",
    "secretary"
  ],

  "meetings.html": [
    "admin",
    "chairperson",
    "secretary",
    "member"
  ],

  "reports.html": [
    "admin",
    "chairperson",
    "treasurer",
    "secretary"
  ],

  "monthly-closing.html": [
    "admin",
    "chairperson",
    "treasurer"
  ],

  "group-management.html": [
    "admin",
    "chairperson"
  ],

  "add-member.html": [
    "admin",
    "chairperson",
    "secretary"
  ]

};


/* =====================================================
   NAVIGATION PERMISSIONS
===================================================== */

const NAV_PERMISSIONS = {

  "members.html": [
    "admin",
    "chairperson",
    "secretary"
  ],

  "contributions.html": [
    "admin",
    "chairperson",
    "treasurer",
    "secretary",
    "member"
  ],

  "expenses.html": [
    "admin",
    "chairperson",
    "treasurer",
    "secretary"
  ],

  "meetings.html": [
    "admin",
    "chairperson",
    "secretary",
    "member"
  ],

  "reports.html": [
    "admin",
    "chairperson",
    "treasurer",
    "secretary"
  ],

  "monthly-closing.html": [
    "admin",
    "chairperson",
    "treasurer"
  ],

  "group-management.html": [
    "admin",
    "chairperson"
  ]

};


/* =====================================================
   HELPERS
===================================================== */

function currentPage() {

  let page =
    window.location.pathname
      .split("/")
      .pop();

  if (!page) {

    page =
      "dashboard.html";

  }

  return page;

}


function allowed(
  role,
  roles
) {

  return roles
    .map(normalizeRole)
    .includes(
      normalizeRole(role)
    );

}


/* =====================================================
   BOOT
===================================================== */

export async function boot() {

  try {

    const session =
      await requireAuth();


    if (!session) {

      return null;

    }


    const member =
      await getMyMember();


    if (!member) {

      throw new Error(
        "Your account is not linked to a member."
      );

    }


    const role =
      normalizeRole(
        member.role
      );


    /*
     * Store useful identity information
     * for the current page.
     */

    document.body.dataset.role =
      role;

    document.body.dataset.groupId =
      member.group_id;

    document.body.dataset.memberId =
      member.id;


    /*
     * Display user information if
     * corresponding elements exist.
     */

    setText(
      "currentUser",
      member.name
    );

    setText(
      "currentRole",
      formatRole(role)
    );

    setText(
      "currentMemberNumber",
      member.membership_number ||
      member.member_number ||
      "—"
    );


    /*
     * Group information.
     */

    await loadGroupName(
      member.group_id
    );


    /*
     * Configure navigation.
     */

    applyNavigationPermissions(
      role
    );


    /*
     * Protect current page.
     */

    protectCurrentPage(
      role
    );


    /*
     * Sign out button.
     */

    const logout =
      document.getElementById(
        "logout"
      );


    if (logout) {

      logout.addEventListener(
        "click",
        async () => {

          logout.disabled =
            true;

          logout.textContent =
            "Signing out...";

          try {

            await signOut();

          } catch (error) {

            console.error(
              error
            );

            logout.disabled =
              false;

            logout.textContent =
              "Sign out";

          }

        }
      );

    }


    /*
     * Make role available to
     * other scripts.
     */

    window.chamaUser = {

      id:
        member.id,

      memberId:
        member.id,

      groupId:
        member.group_id,

      name:
        member.name,

      email:
        member.email,

      phone:
        member.phone,

      role,

      membershipNumber:
        member.membership_number ||
        member.member_number,

      onboardingStatus:
        member.onboarding_status

    };


    return member;


  } catch (error) {

    console.error(
      "CHAMA LIVE boot:",
      error
    );


    showBootError(
      error
    );


    return null;

  }

}


/* =====================================================
   NAVIGATION
===================================================== */

function applyNavigationPermissions(
  role
) {

  const links =
    document.querySelectorAll(
      ".nav a"
    );


  links.forEach(
    link => {

      const href =
        link.getAttribute(
          "href"
        );


      if (!href) {

        return;

      }


      const page =
        href
          .split("/")
          .pop()
          .split("?")[0];


      const permissions =
        NAV_PERMISSIONS[
          page
        ];


      /*
       * Pages without explicit
       * permissions remain visible.
       */

      if (
        permissions &&
        !allowed(
          role,
          permissions
        )
      ) {

        link.remove();

      }

    }
  );

}


/* =====================================================
   CURRENT PAGE PROTECTION
===================================================== */

function protectCurrentPage(
  role
) {

  const page =
    currentPage();


  const permissions =
    PAGE_PERMISSIONS[
      page
    ];


  if (
    !permissions
  ) {

    return;

  }


  if (
    !allowed(
      role,
      permissions
    )
  ) {

    window.location.replace(
      "dashboard.html"
    );

  }

}


/* =====================================================
   GROUP NAME
===================================================== */

async function loadGroupName(
  groupId
) {

  if (!groupId) {

    return;

  }


  /*
   * Import here to avoid circular
   * auth/layout dependencies.
   */

  const {
    supabase
  } = await import(
    "./supabase.js"
  );


  const {
    data,
    error
  } = await supabase

    .from("groups")

    .select(
      "name"
    )

    .eq(
      "id",
      groupId
    )

    .maybeSingle();


  if (
    error
  ) {

    console.error(
      "Group lookup:",
      error
    );

    return;

  }


  if (data) {

    setText(
      "groupName",
      data.name
    );

    setText(
      "currentGroup",
      data.name
    );

    document.title =
      `${data.name} — CHAMA LIVE`;

  }

}


/* =====================================================
   SET TEXT
===================================================== */

function setText(
  id,
  value
) {

  const element =
    document.getElementById(
      id
    );


  if (element) {

    element.textContent =
      value ?? "";

  }

}


/* =====================================================
   FORMAT ROLE
===================================================== */

function formatRole(
  role
) {

  return String(
    role || ""
  )
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      char =>
        char.toUpperCase()
    );

}


/* =====================================================
   BOOT ERROR
===================================================== */

function showBootError(
  error
) {

  const message =
    error?.message ||
    "Unable to load your account.";


  const errorElement =
    document.getElementById(
      "error"
    );


  if (errorElement) {

    errorElement.hidden =
      false;

    errorElement.textContent =
      message;

    return;

  }


  /*
   * If the page has no error
   * element, show a small message.
   */

  console.error(
    message
  );

}

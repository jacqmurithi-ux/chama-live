import {
  requireAuth,
  getMyMember,
  logout
} from "./auth.js";


let currentMember =
  null;


const permissions = {

  dashboard: [
    "admin",
    "chairperson",
    "treasurer",
    "secretary",
    "member"
  ],

  members: [
    "admin",
    "chairperson",
    "secretary"
  ],

  contributions: [
    "admin",
    "chairperson",
    "treasurer",
    "secretary",
    "member"
  ],

  expenses: [
    "admin",
    "chairperson",
    "treasurer"
  ],

  meetings: [
    "admin",
    "chairperson",
    "secretary",
    "member"
  ],

  reports: [
    "admin",
    "chairperson",
    "treasurer",
    "secretary"
  ],

  "monthly-closing": [
    "admin",
    "chairperson",
    "treasurer"
  ],

  "group-management": [
    "admin",
    "chairperson"
  ]

};


export async function boot() {

  try {

    const session =
      await requireAuth();


    if (!session) {
      return null;
    }


    currentMember =
      await getMyMember();


    if (!currentMember) {
      return null;
    }


    applyUserDetails();

    applyNavigation();

    setupLogout();


    return currentMember;


  } catch (err) {

    console.error(
      "Layout:",
      err
    );

    return null;

  }

}


/* =====================================================
   USER DETAILS
===================================================== */

function applyUserDetails() {

  const name =
    currentMember?.name ||
    "Member";


  const role =
    formatRole(
      currentMember?.role
    );


  document
    .querySelectorAll(
      "#currentUser, #userName, #memberName, [data-user-name]"
    )
    .forEach(
      element => {

        element.textContent =
          name;

      }
    );


  document
    .querySelectorAll(
      "#currentRole, #userRole, #memberRole, [data-user-role]"
    )
    .forEach(
      element => {

        element.textContent =
          role;

      }
    );


  document
    .querySelectorAll(
      "#memberNumber, [data-member-number]"
    )
    .forEach(
      element => {

        element.textContent =
          currentMember
            ?.membership_number ||
          currentMember
            ?.member_number ||
          "—";

      }
    );

}


/* =====================================================
   NAVIGATION
===================================================== */

function applyNavigation() {

  const role =
    String(
      currentMember?.role ||
      "member"
    ).toLowerCase();


  document
    .querySelectorAll(
      ".nav a"
    )
    .forEach(
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
            .replace(
              ".html",
              ""
            );


        const allowed =
          permissions[page];


        if (
          allowed &&
          !allowed.includes(
            role
          )
        ) {

          link.remove();

        }

      }
    );

}


/* =====================================================
   LOGOUT
===================================================== */

function setupLogout() {

  document
    .querySelectorAll(
      "#logout, [data-action='logout']"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async event => {

            event.preventDefault();


            button.disabled =
              true;

            button.textContent =
              "Signing out...";


            try {

              await logout();

            } catch (err) {

              console.error(
                err
              );

              button.disabled =
                false;

              button.textContent =
                "Sign out";

            }

          }
        );

      }
    );

}


/* =====================================================
   HELPERS
===================================================== */

function formatRole(
  role
) {

  return String(
    role || "member"
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


export function getCurrentMember() {

  return currentMember;

}


export function getCurrentRole() {

  return String(
    currentMember?.role ||
    "member"
  ).toLowerCase();

}


export function canAccess(
  page
) {

  return (
    permissions[page] ||
    []
  ).includes(
    getCurrentRole()
  );

}


export {
  permissions
};

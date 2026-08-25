
import { supabase } from "./supabase.js";

/*
=====================================================
 CHAMA LIVE AUTH + RBAC
=====================================================

Database model assumed:

members
---------
id
group_id
user_id / auth_user_id
member_number
name
phone
email
role
status

Roles:
- admin
- chairperson
- treasurer
- secretary
- member
- other

IMPORTANT:
Authorization is determined from the members table,
NOT from user-editable user_metadata.
*/


/* =====================================================
   ROLE DEFINITIONS
===================================================== */

export const ROLES = {
  ADMIN: "admin",
  CHAIRPERSON: "chairperson",
  TREASURER: "treasurer",
  SECRETARY: "secretary",
  MEMBER: "member"
};


/* =====================================================
   ROLE GROUPS
===================================================== */

export const MANAGEMENT_ROLES = [
  ROLES.ADMIN,
  ROLES.CHAIRPERSON
];

export const FINANCE_ROLES = [
  ROLES.ADMIN,
  ROLES.CHAIRPERSON,
  ROLES.TREASURER
];

export const RECORD_ROLES = [
  ROLES.ADMIN,
  ROLES.CHAIRPERSON,
  ROLES.SECRETARY,
  ROLES.TREASURER
];


/* =====================================================
   CURRENT USER
===================================================== */

let cachedUser = null;
let cachedMember = null;


/* =====================================================
   GET AUTHENTICATED USER
===================================================== */

export async function getCurrentUser() {

  const {
    data: {
      user
    },
    error
  } = await supabase.auth.getUser();

  if (error) {
    console.error("getCurrentUser error:", error);
    return null;
  }

  cachedUser = user || null;

  return cachedUser;
}


/* =====================================================
   REQUIRE AUTHENTICATION
===================================================== */

export async function requireAuth(
  redirect = true
) {

  const user = await getCurrentUser();

  if (!user) {

    if (redirect) {
      window.location.href = "login.html";
    }

    return null;
  }

  return user;
}


/* =====================================================
   GET MY MEMBER RECORD
===================================================== */

export async function getMyMember(
  options = {}
) {

  const {
    redirect = true
  } = options;

  const user = await requireAuth(
    redirect
  );

  if (!user) {
    return null;
  }


  if (cachedMember) {
    return cachedMember;
  }


  /*
   * Your database has used auth_user_id
   * in the existing member structure.
   *
   * We first try auth_user_id.
   */

  let {
    data: member,
    error
  } = await supabase

    .from("members")

    .select(`
      id,
      group_id,
      auth_user_id,
      member_number,
      name,
      phone,
      email,
      role,
      status,
      join_date,
      created_at
    `)

    .eq(
      "auth_user_id",
      user.id
    )

    .maybeSingle();


  /*
   * Some older installations may use user_id.
   *
   * If auth_user_id does not find a record,
   * try user_id.
   */

  if (
    !member &&
    !error
  ) {

    const fallback =
      await supabase

        .from("members")

        .select(`
          id,
          group_id,
          user_id,
          member_number,
          name,
          phone,
          email,
          role,
          status,
          join_date,
          created_at
        `)

        .eq(
          "user_id",
          user.id
        )

        .maybeSingle();


    if (fallback.error) {

      console.error(
        "Member lookup error:",
        fallback.error
      );

    } else {

      member =
        fallback.data;

    }

  }


  if (error) {

    /*
     * If auth_user_id does not exist in the
     * database schema, try the fallback query.
     */

    if (
      String(error.message || "")
        .toLowerCase()
        .includes("auth_user_id")
    ) {

      const fallback =
        await supabase

          .from("members")

          .select("*")

          .eq(
            "user_id",
            user.id
          )

          .maybeSingle();


      if (fallback.error) {

        console.error(
          "Fallback member lookup error:",
          fallback.error
        );

        if (redirect) {
          showAuthError(
            fallback.error.message
          );
        }

        return null;
      }

      member =
        fallback.data;

    } else {

      console.error(
        "Member lookup error:",
        error
      );

      if (redirect) {
        showAuthError(
          error.message
        );
      }

      return null;
    }

  }


  if (!member) {

    console.error(
      "Authenticated user has no member record."
    );

    if (redirect) {

      showAuthError(
        "Your account is authenticated, but your member record has not been added to this group. Please contact your group administrator."
      );

    }

    return null;
  }


  /*
   * Disabled members should not access the app.
   */

  if (
    member.status &&
    member.status !== "active"
  ) {

    if (redirect) {

      await supabase.auth.signOut({
        scope: "local"
      });

      window.location.href =
        "login.html?error=inactive";

    }

    return null;
  }


  cachedMember =
    member;

  return member;
}


/* =====================================================
   GET CURRENT GROUP
===================================================== */

export async function getMyGroup() {

  const member =
    await getMyMember();

  if (!member) {
    return null;
  }


  const {
    data: group,
    error
  } = await supabase

    .from("groups")

    .select("*")

    .eq(
      "id",
      member.group_id
    )

    .maybeSingle();


  if (error) {

    console.error(
      "Group lookup error:",
      error
    );

    return null;
  }


  return group || null;
}


/* =====================================================
   GET CURRENT ROLE
===================================================== */

export async function getMyRole() {

  const member =
    await getMyMember();

  if (!member) {
    return null;
  }

  return normalizeRole(
    member.role
  );
}


/* =====================================================
   NORMALIZE ROLE
===================================================== */

export function normalizeRole(
  role
) {

  return String(
    role || "member"
  )
    .trim()
    .toLowerCase()
    .replaceAll(
      " ",
      "_"
    );
}


/* =====================================================
   ROLE CHECK
===================================================== */

export async function hasRole(
  roles
) {

  const role =
    await getMyRole();

  if (!role) {
    return false;
  }


  const allowed =
    Array.isArray(roles)
      ? roles
      : [roles];


  return allowed
    .map(normalizeRole)
    .includes(role);
}


/* =====================================================
   ADMIN CHECK
===================================================== */

export async function isAdmin() {
  return hasRole(
    ROLES.ADMIN
  );
}


/* =====================================================
   CHAIRPERSON CHECK
===================================================== */

export async function isChairperson() {

  return hasRole(
    ROLES.CHAIRPERSON
  );

}


/* =====================================================
   GROUP MANAGEMENT CHECK
===================================================== */

export async function canManageGroup() {

  return hasRole(
    MANAGEMENT_ROLES
  );

}


/* =====================================================
   FINANCE CHECK
===================================================== */

export async function canManageFinance() {

  return hasRole(
    FINANCE_ROLES
  );

}


/* =====================================================
   RECORD MANAGEMENT CHECK
===================================================== */

export async function canManageRecords() {

  return hasRole(
    RECORD_ROLES
  );

}


/* =====================================================
   REQUIRE ROLE
===================================================== */

export async function requireRole(
  roles,
  options = {}
) {

  const {
    redirect = true,
    redirectTo = "dashboard.html"
  } = options;


  const member =
    await getMyMember({
      redirect
    });


  if (!member) {
    return null;
  }


  const role =
    normalizeRole(
      member.role
    );


  const allowed =
    (
      Array.isArray(roles)
        ? roles
        : [roles]
    )
      .map(normalizeRole);


  if (
    !allowed.includes(role)
  ) {

    if (redirect) {

      window.location.href =
        redirectTo;

    }

    return null;
  }


  return member;
}


/* =====================================================
   REQUIRE GROUP MANAGEMENT
===================================================== */

export async function requireGroupManagement() {

  return requireRole(
    MANAGEMENT_ROLES
  );

}


/* =====================================================
   REQUIRE FINANCE
===================================================== */

export async function requireFinanceRole() {

  return requireRole(
    FINANCE_ROLES
  );

}


/* =====================================================
   REQUIRE RECORD MANAGEMENT
===================================================== */

export async function requireRecordRole() {

  return requireRole(
    RECORD_ROLES
  );

}


/* =====================================================
   CLEAR CACHE
===================================================== */

export function clearAuthCache() {

  cachedUser = null;
  cachedMember = null;

}


/* =====================================================
   LOGOUT
===================================================== */

export async function logout() {

  clearAuthCache();


  const {
    error
  } = await supabase.auth.signOut({
    scope: "local"
  });


  if (error) {

    console.error(
      "Logout error:",
      error
    );

    throw error;
  }


  window.location.href =
    "login.html";

}


/* =====================================================
   AUTH STATE LISTENER
===================================================== */

export function watchAuth(
  callback
) {

  return supabase.auth.onAuthStateChange(
    async (
      event,
      session
    ) => {

      /*
       * Clear cached records whenever
       * authentication changes.
       */

      if (
        event === "SIGNED_OUT" ||
        event === "USER_DELETED"
      ) {

        clearAuthCache();

      }


      if (typeof callback === "function") {

        await callback(
          event,
          session
        );

      }

    }
  );

}


/* =====================================================
   DISPLAY ROLE
===================================================== */

export function roleLabel(
  role
) {

  const labels = {

    admin:
      "Administrator",

    chairperson:
      "Chairperson",

    treasurer:
      "Treasurer",

    secretary:
      "Secretary",

    member:
      "Member"

  };


  const normalized =
    normalizeRole(role);


  return (
    labels[normalized] ||
    normalized
      .replaceAll(
        "_",
        " "
      )
      .replace(
        /^\w/,
        c => c.toUpperCase()
      )
  );

}


/* =====================================================
   AUTH ERROR
===================================================== */

function showAuthError(
  message
) {

  console.error(
    message
  );


  /*
   * Keep error handling simple so this works
   * even on pages without an #error element.
   */

  const error =
    document.getElementById(
      "error"
    );


  if (error) {

    error.hidden =
      false;

    error.textContent =
      message;

    return;
  }


  alert(message);

}


/* =====================================================
   EXPORT USER + MEMBER SNAPSHOT
===================================================== */

export async function getAuthContext() {

  const user =
    await getCurrentUser();

  if (!user) {
    return null;
  }


  const member =
    await getMyMember({
      redirect: false
    });


  if (!member) {
    return null;
  }


  return {

    user,

    member,

    groupId:
      member.group_id,

    role:
      normalizeRole(
        member.role
      ),

    roleLabel:
      roleLabel(
        member.role
      )

  };

}

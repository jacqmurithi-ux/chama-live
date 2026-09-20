/* =========================================================
   CHAMA LIVE — MY PROFILE
   ---------------------------------------------------------
   MEMBER PORTAL

   PURPOSE
   ---------------------------------------------------------
   Read-only view of the authenticated member's profile.

   SECURITY
   ---------------------------------------------------------
   • Member identity comes from auth.js.
   • No member ID is accepted from the URL.
   • No profile data is written from this page.
   • Database/RLS remains authoritative.

   NO INSERT
   NO UPDATE
   NO DELETE
   NO RPC
   NO SCHEMA CHANGE
========================================================= */

import {
  getMyMember
} from "./auth.js";


/* =========================================================
   STATE
========================================================= */

const state = {
  member: null,
  initialized: false
};


/* =========================================================
   ELEMENTS
========================================================= */

const els = {
  loading:
    document.getElementById(
      "memberProfileLoading"
    ),

  error:
    document.getElementById(
      "memberProfileError"
    ),

  content:
    document.getElementById(
      "memberProfileContent"
    ),

  avatar:
    document.getElementById(
      "memberProfileAvatar"
    ),

  name:
    document.getElementById(
      "memberProfileName"
    ),

  number:
    document.getElementById(
      "memberProfileNumber"
    ),

  status:
    document.getElementById(
      "memberProfileStatus"
    ),

  nameValue:
    document.getElementById(
      "memberProfileNameValue"
    ),

  numberValue:
    document.getElementById(
      "memberProfileNumberValue"
    ),

  role:
    document.getElementById(
      "memberProfileRole"
    ),

  statusValue:
    document.getElementById(
      "memberProfileStatusValue"
    ),

  group:
    document.getElementById(
      "memberProfileGroup"
    ),

  created:
    document.getElementById(
      "memberProfileCreated"
    )
};


/* =========================================================
   HELPERS
========================================================= */

function displayValue(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return "—";
  }

  return String(value);
}


function displayStatus(value) {
  const status =
    displayValue(
      value
    );

  if (
    status === "—"
  ) {
    return status;
  }

  return (
    status.charAt(0).toUpperCase() +
    status.slice(1)
  );
}


function displayRole(value) {
  const role =
    displayValue(
      value
    );

  if (
    role === "—"
  ) {
    return role;
  }

  return role
    .replace(/_/g, " ")
    .replace(/\b\w/g, letter =>
      letter.toUpperCase()
    );
}


function initials(name) {
  const value =
    String(
      name ?? ""
    ).trim();

  if (!value) {
    return "M";
  }

  const parts =
    value
      .split(/\s+/)
      .filter(Boolean);

  if (
    parts.length === 1
  ) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
}


function formatDate(value) {
  if (!value) {
    return "—";
  }

  const raw =
    String(value);

  const date =
    new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(raw)
        ? `${raw}T00:00:00`
        : raw
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return raw;
  }

  return date.toLocaleDateString(
    "en-KE",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );
}


/* =========================================================
   UI STATE
========================================================= */

function showLoading() {
  if (els.loading) {
    els.loading.hidden = false;
  }

  if (els.error) {
    els.error.hidden = true;
  }

  if (els.content) {
    els.content.hidden = true;
  }
}


function showError(message) {
  if (els.loading) {
    els.loading.hidden = true;
  }

  if (els.content) {
    els.content.hidden = true;
  }

  if (els.error) {
    els.error.textContent =
      message ||
      "Unable to load your profile.";

    els.error.hidden = false;
  }
}


function showContent() {
  if (els.loading) {
    els.loading.hidden = true;
  }

  if (els.error) {
    els.error.hidden = true;
  }

  if (els.content) {
    els.content.hidden = false;
  }
}


/* =========================================================
   RENDER PROFILE
========================================================= */

function renderProfile() {
  const member =
    state.member;

  if (!member) {
    throw new Error(
      "Your member profile could not be found."
    );
  }

  const name =
    displayValue(
      member.name
    );

  const memberNumber =
    displayValue(
      member.member_number
    );

  const status =
    displayStatus(
      member.status
    );

  const role =
    displayRole(
      member.role
    );

  if (els.avatar) {
    els.avatar.textContent =
      initials(
        member.name
      );
  }

  if (els.name) {
    els.name.textContent =
      name;
  }

  if (els.number) {
    els.number.textContent =
      memberNumber === "—"
        ? "Member"
        : `Member #${memberNumber}`;
  }

  if (els.status) {
    els.status.textContent =
      status;
  }

  if (els.nameValue) {
    els.nameValue.textContent =
      name;
  }

  if (els.numberValue) {
    els.numberValue.textContent =
      memberNumber;
  }

  if (els.role) {
    els.role.textContent =
      role;
  }

  if (els.statusValue) {
    els.statusValue.textContent =
      status;
  }

  if (els.group) {
    els.group.textContent =
      displayValue(
        member.group_name ||
        member.group?.name
      );
  }

  if (els.created) {
    els.created.textContent =
      formatDate(
        member.created_at
      );
  }
}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initMemberProfile() {
  if (
    state.initialized
  ) {
    return;
  }

  state.initialized =
    true;

  showLoading();

  try {

    const member =
      await getMyMember();

    state.member =
      member || null;

    if (!state.member) {
      throw new Error(
        "No member profile is associated with your account."
      );
    }

    renderProfile();

    showContent();

  } catch (error) {

    console.error(
      "CHAMA LIVE: Member Profile",
      error
    );

    showError(
      error?.message ||
      "Unable to load your profile."
    );
  }
}


/* =========================================================
   MODULE STATUS
========================================================= */

console.log(
  "CHAMA LIVE: member-profile.js loaded"
);

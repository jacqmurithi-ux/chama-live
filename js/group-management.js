/* =========================================================
   CHAMA LIVE — GROUP MANAGEMENT
   FINAL SCHEMA-ALIGNED VERSION

   IMPORTANT DATABASE ALIGNMENT
   ---------------------------------------------------------
   groups.category           -> group type/category
   groups.monthly_contribution
   groups.country
   groups.name

   THERE IS NO groups.type COLUMN.

   Group context:
       currentMember.group_id

   Therefore:
       member -> group_id -> groups.id

   No schema redesign required.
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: group-management.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const form =
  document.getElementById("groupForm");

const groupNameInput =
  document.getElementById("groupName");

const groupTypeInput =
  document.getElementById("groupType");

const countryInput =
  document.getElementById("country");

const monthlyContributionInput =
  document.getElementById(
    "monthlyContribution"
  );

const saveButton =
  document.getElementById("saveGroup");

const groupIdEl =
  document.getElementById("groupId");

const memberCountEl =
  document.getElementById("memberCount");

const currentGroupNameEl =
  document.getElementById("currentGroupName");


/* =========================================================
   STATE
========================================================= */

let currentUser = null;

let currentMember = null;

let groupId = null;

let group = null;

let initialized = false;


/* =========================================================
   HELPERS
========================================================= */

function money(value) {

  return new Intl.NumberFormat(
    "en-KE",
    {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }
  ).format(
    Number(value || 0)
  );

}


/* =========================================================
   STATUS
========================================================= */

function showStatus(message) {

  if (!statusEl) {

    return;

  }


  statusEl.textContent =
    message || "";

  statusEl.hidden =
    !message;

}


function showError(error) {

  console.error(
    "CHAMA LIVE Group Management:",
    error
  );


  if (!errorEl) {

    return;

  }


  let message =
    error?.message ||
    "Unable to process group information.";


  /*
     Make the common schema problem clearer.
  */

  if (
    message.includes(
      "groups.type"
    )
  ) {

    message =
      "Group Management is using an outdated database field. The group type is stored as 'category'.";

  }


  errorEl.textContent =
    message;

  errorEl.hidden =
    false;

}


function clearError() {

  if (!errorEl) {

    return;

  }


  errorEl.textContent =
    "";

  errorEl.hidden =
    true;

}


/* =========================================================
   LOAD GROUP
========================================================= */

async function loadGroup() {

  if (!groupId) {

    throw new Error(
      "No group is associated with this account."
    );

  }


  /*
     IMPORTANT:

     Use groups.category.

     DO NOT use groups.type.
  */

  const {
    data,
    error
  } =
    await supabase
      .from("groups")
      .select(`
        id,
        name,
        category,
        country,
        monthly_contribution,
        created_at
      `)
      .eq(
        "id",
        groupId
      )
      .single();


  if (error) {

    throw error;

  }


  if (!data) {

    throw new Error(
      "Group record could not be found."
    );

  }


  group =
    data;


  console.log(
    "CHAMA LIVE: group loaded",
    group
  );

}


/* =========================================================
   LOAD MEMBER COUNT
========================================================= */

async function loadMemberCount() {

  if (!groupId) {

    return;

  }


  const {
    count,
    error
  } =
    await supabase
      .from("members")
      .select(
        "id",
        {
          count: "exact",
          head: true
        }
      )
      .eq(
        "group_id",
        groupId
      );


  if (error) {

    throw error;

  }


  if (memberCountEl) {

    memberCountEl.textContent =
      Number(count || 0);

  }

}


/* =========================================================
   RENDER GROUP
========================================================= */

function renderGroup() {

  if (!group) {

    return;

  }


  if (groupNameInput) {

    groupNameInput.value =
      group.name ||
      "";

  }


  /*
     DATABASE FIELD:

         category

     UI FIELD:

         groupType
  */

  if (groupTypeInput) {

    const category =
      String(
        group.category ||
        "chama"
      )
        .trim()
        .toLowerCase();


    /*
       Only select an existing option.

       This prevents the form from silently
       showing a blank value if the database
       contains an unexpected category.
    */

    const optionExists =
      Array.from(
        groupTypeInput.options
      ).some(
        option =>
          option.value ===
          category
      );


    if (optionExists) {

      groupTypeInput.value =
        category;

    }
    else {

      /*
         Keep the first/default option
         when an unknown legacy value exists.
      */

      groupTypeInput.value =
        "other";

    }

  }


  if (countryInput) {

    countryInput.value =
      group.country ||
      "Kenya";

  }


  if (
    monthlyContributionInput
  ) {

    monthlyContributionInput.value =
      Number(
        group.monthly_contribution ||
        0
      );

  }


  if (groupIdEl) {

    groupIdEl.textContent =
      group.id ||
      "—";

  }


  if (currentGroupNameEl) {

    currentGroupNameEl.textContent =
      group.name ||
      "—";

  }

}


/* =========================================================
   SAVE GROUP
========================================================= */

async function saveGroup(
  event
) {

  event.preventDefault();


  try {

    clearError();

    showStatus("");


    if (!groupId) {

      throw new Error(
        "No group is associated with this account."
      );

    }


    const name =
      String(
        groupNameInput?.value ||
        ""
      )
        .trim();


    /*
       UI calls this Group Type.

       DATABASE stores it in:

           groups.category
    */

    const category =
      String(
        groupTypeInput?.value ||
        ""
      )
        .trim()
        .toLowerCase();


    const country =
      String(
        countryInput?.value ||
        ""
      )
        .trim();


    const monthlyContribution =
      Number(
        monthlyContributionInput?.value ||
        0
      );


    /* -------------------------------------------------------
       VALIDATION
    ------------------------------------------------------- */

    if (!name) {

      throw new Error(
        "Please enter the group name."
      );

    }


    if (!category) {

      throw new Error(
        "Please select the group type."
      );

    }


    if (!country) {

      throw new Error(
        "Please enter the country."
      );

    }


    if (
      !Number.isFinite(
        monthlyContribution
      ) ||
      monthlyContribution < 0
    ) {

      throw new Error(
        "Please enter a valid monthly contribution."
      );

    }


    if (saveButton) {

      saveButton.disabled =
        true;

      saveButton.textContent =
        "Saving...";

    }


    showStatus(
      "Saving group information..."
    );


    /*
       IMPORTANT DATABASE PAYLOAD

       category, NOT type.
    */

    const payload = {

      name:
        name,

      category:
        category,

      country:
        country,

      monthly_contribution:
        monthlyContribution

    };


    console.log(
      "CHAMA LIVE: updating group",
      {
        groupId,
        payload
      }
    );


    const {
      data,
      error
    } =
      await supabase
        .from("groups")
        .update(
          payload
        )
        .eq(
          "id",
          groupId
        )
        .select(`
          id,
          name,
          category,
          country,
          monthly_contribution,
          created_at
        `)
        .single();


    if (error) {

      throw error;

    }


    if (!data) {

      throw new Error(
        "Group information was not updated."
      );

    }


    group =
      data;


    renderGroup();


    showStatus(
      "Group information updated successfully."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      3000
    );

  }
  catch (error) {

    showStatus("");

    showError(
      error
    );

  }
  finally {

    if (saveButton) {

      saveButton.disabled =
        false;

      saveButton.textContent =
        "Save Changes";

    }

  }

}


/* =========================================================
   INITIALIZE
========================================================= */

export async function initPage() {

  if (initialized) {

    console.warn(
      "CHAMA LIVE: group management already initialized"
    );

    return;

  }


  initialized =
    true;


  try {

    clearError();

    showStatus(
      "Loading group information..."
    );


    /* -------------------------------------------------------
       AUTHENTICATION
    ------------------------------------------------------- */

    currentUser =
      await requireAuth();


    if (!currentUser) {

      throw new Error(
        "You are not signed in."
      );

    }


    /* -------------------------------------------------------
       MEMBER CONTEXT
    ------------------------------------------------------- */

    currentMember =
      await getMyMember();


    if (!currentMember) {

      throw new Error(
        "No member record is linked to this account."
      );

    }


    /* -------------------------------------------------------
       GROUP CONTEXT
       
       THIS IS THE COMMON CHAMA LIVE CONTEXT.

       currentMember.group_id
              ↓
       groups.id
    ------------------------------------------------------- */

    groupId =
      currentMember.group_id;


    if (!groupId) {

      throw new Error(
        "Your member record is not linked to a group."
      );

    }


    console.log(
      "CHAMA LIVE: group management context",
      {
        userId:
          currentUser.id,

        memberId:
          currentMember.id,

        groupId:
          groupId
      }
    );


    /* -------------------------------------------------------
       EVENTS
    ------------------------------------------------------- */

    form?.addEventListener(
      "submit",
      saveGroup
    );


    /* -------------------------------------------------------
       DATA
    ------------------------------------------------------- */

    await loadGroup();

    await loadMemberCount();


    renderGroup();


    showStatus(
      "Group information ready."
    );


    setTimeout(
      () => {

        showStatus("");

      },
      2000
    );


    console.log(
      "CHAMA LIVE: group management initialized"
    );

  }
  catch (error) {

    initialized =
      false;

    showStatus("");

    showError(
      error
    );

  }

}


/* =========================================================
   PUBLIC ALIAS
========================================================= */

export const initGroupManagement =
  initPage;


/* =========================================================
   AUTO BOOT
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => {

      initPage();

    },
    {
      once: true
    }
  );

}
else {

  initPage();

}


console.log(
  "CHAMA LIVE: group-management.js ready"
);

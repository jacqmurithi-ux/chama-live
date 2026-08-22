"use strict";

/*
 * ============================================================
 * CHAMA LIVE
 * SUPABASE DATA LAYER
 * PART 1 OF 3
 * ============================================================
 *
 * This file handles database operations for:
 *
 * - Groups
 * - Members
 * - Contributions
 * - Goals
 * - Expenses
 *
 * IMPORTANT:
 *
 * It uses the ONE Supabase client created by:
 *
 *     js/supabase-client.js
 *
 * Authentication comes from:
 *
 *     js/supabase-auth.js
 *
 * ============================================================
 */


/* ============================================================
   GET DATABASE CLIENT
   ============================================================ */

function dataClient() {

  if (
    typeof window.getSupabaseClient !== "function"
  ) {

    throw new Error(
      "Supabase client is missing. Make sure js/supabase-client.js loads first."
    );

  }


  const client =
    window.getSupabaseClient();


  if (
    !client
  ) {

    throw new Error(
      "Supabase client is not initialized."
    );

  }


  return client;

}


/* ============================================================
   REQUIRE AUTHENTICATED USER
   ============================================================ */

async function dataUser() {

  if (
    typeof window.getCurrentUser !== "function"
  ) {

    throw new Error(
      "Authentication module is missing. Make sure js/supabase-auth.js loads first."
    );

  }


  const user =
    await window.getCurrentUser();


  if (
    !user
  ) {

    throw new Error(
      "You are not signed in."
    );

  }


  return user;

}


/* ============================================================
   GET GROUP ID
   ============================================================ */

async function dataGroupId() {

  /*
   * Use the authentication module's group resolver.
   */

  if (
    typeof window.getCurrentGroupId !== "function"
  ) {

    throw new Error(
      "getCurrentGroupId() is unavailable. Check js/supabase-auth.js."
    );

  }


  return await window.getCurrentGroupId();

}


/* ============================================================
   NORMALIZE ARRAY
   ============================================================ */

function normalizeArray(
  value
) {

  return Array.isArray(value)
    ? value
    : [];

}


/* ============================================================
   DATABASE ERROR HELPER
   ============================================================ */

function databaseError(
  error,
  operation
) {

  if (
    !error
  ) {

    return null;

  }


  console.error(
    "Chama Live database error:",
    operation,
    error
  );


  /*
   * Supabase errors normally contain:
   *
   * message
   * details
   * hint
   * code
   */

  let message =
    error.message ||
    "Database operation failed.";


  if (
    error.code
  ) {

    message +=
      " [" +
      error.code +
      "]";

  }


  return new Error(
    message
  );

}


/* ============================================================
   FETCH GROUP
   ============================================================ */

async function fetchGroup() {

  const client =
    dataClient();


  const user =
    await dataUser();


  /*
   * First attempt:
   * group ID from authenticated account.
   */

  let groupId =
    null;


  try {

    groupId =
      await dataGroupId();

  } catch (error) {

    console.warn(
      "Could not resolve group ID:",
      error
    );

  }


  /*
   * If we have a group ID, fetch the group.
   */

  if (
    groupId
  ) {

    const result =
      await client
        .from("groups")
        .select("*")
        .eq(
          "id",
          groupId
        )
        .maybeSingle();


    if (
      result.error
    ) {

      throw databaseError(
        result.error,
        "fetchGroup by group_id"
      );

    }


    if (
      result.data
    ) {

      return result.data;

    }

  }


  /*
   * Fallback:
   * Some Chama Live schemas may identify the
   * group through a group_members relationship.
   */

  try {

    const result =
      await client
        .from("groups")
        .select("*")
        .eq(
          "created_by",
          user.id
        )
        .maybeSingle();


    if (
      !result.error &&
      result.data
    ) {

      return result.data;

    }

  } catch (error) {

    console.warn(
      "Group creator fallback failed:",
      error
    );

  }


  /*
   * Nothing found.
   */

  throw new Error(
    "No Chama group could be found for your account."
  );

}


/* ============================================================
   FETCH MEMBERS
   ============================================================ */

async function fetchMembers() {

  const client =
    dataClient();


  const groupId =
    await dataGroupId();


  if (
    !groupId
  ) {

    throw new Error(
      "No group is linked to the current account."
    );

  }


  /*
   * Query members belonging to this group.
   *
   * We deliberately select the fields used by
   * Contributions and Members pages.
   */

  const result =
    await client
      .from("members")
      .select(`
        id,
        group_id,
        name,
        member_number,
        email,
        phone,
        role,
        status,
        created_at
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "name",
        {
          ascending:true
        }
      );


  if (
    result.error
  ) {

    throw databaseError(
      result.error,
      "fetchMembers"
    );

  }


  return normalizeArray(
    result.data
  );

}


/* ============================================================
   FETCH ONE MEMBER
   ============================================================ */

async function fetchMember(
  memberId
) {

  const client =
    dataClient();


  const groupId =
    await dataGroupId();


  if (
    !memberId
  ) {

    throw new Error(
      "Member ID is required."
    );

  }


  const result =
    await client
      .from("members")
      .select("*")
      .eq(
        "id",
        memberId
      )
      .eq(
        "group_id",
        groupId
      )
      .maybeSingle();


  if (
    result.error
  ) {

    throw databaseError(
      result.error,
      "fetchMember"
    );

  }


  return result.data || null;

}


/* ============================================================
   FETCH ACTIVE MEMBERS
   ============================================================ */

async function fetchActiveMembers() {

  const members =
    await fetchMembers();


  return members.filter(
    function(member) {

      /*
       * Treat null status as active so older
       * records are not accidentally hidden.
       */

      if (
        !member.status
      ) {

        return true;

      }


      return (
        String(
          member.status
        )
        .toLowerCase()
        ===
        "active"
      );

    }
  );

}


/* ============================================================
   EXPORT PART 1
   ============================================================ */

window.fetchGroup =
  fetchGroup;


window.fetchMembers =
  fetchMembers;


window.fetchMember =
  fetchMember;


window.fetchActiveMembers =
  fetchActiveMembers;


/* ============================================================
   DATA LAYER READY
   ============================================================ */

console.log(
  "Chama Live: supabase-data.js Part 1 loaded."
);
/* ============================================================
   CHAMA LIVE
   SUPABASE DATA LAYER
   PART 2 OF 3
   ============================================================
*/


/* ============================================================
   FETCH CONTRIBUTIONS
   ============================================================ */

async function fetchContributions() {

  const client =
    dataClient();


  const groupId =
    await dataGroupId();


  if (!groupId) {

    throw new Error(
      "No group is linked to the current account."
    );

  }


  /*
   * Load contributions belonging to this group.
   *
   * We request the related member and goal records
   * so contributions.html can display:
   *
   * Member
   * Goal
   * Amount
   * Month
   * Method
   * Reference
   * Recorded date
   */

  const result =
    await client
      .from("contributions")
      .select(`
        id,
        group_id,
        member_id,
        amount,
        month,
        goal_id,
        payment_method,
        reference,
        created_at,
        members (
          id,
          name,
          member_number
        ),
        goals (
          id,
          goal_name
        )
      `)
      .eq(
        "group_id",
        groupId
      )
      .order(
        "created_at",
        {
          ascending:false
        }
      );


  if (
    result.error
  ) {

    throw databaseError(
      result.error,
      "fetchContributions"
    );

  }


  return normalizeArray(
    result.data
  );

}


/* ============================================================
   FETCH CONTRIBUTION BY ID
   ============================================================ */

async function fetchContribution(
  contributionId
) {

  const client =
    dataClient();


  const groupId =
    await dataGroupId();


  if (
    !contributionId
  ) {

    throw new Error(
      "Contribution ID is required."
    );

  }


  const result =
    await client
      .from("contributions")
      .select(`
        id,
        group_id,
        member_id,
        amount,
        month,
        goal_id,
        payment_method,
        reference,
        created_at,
        members (
          id,
          name,
          member_number
        ),
        goals (
          id,
          goal_name
        )
      `)
      .eq(
        "id",
        contributionId
      )
      .eq(
        "group_id",
        groupId
      )
      .maybeSingle();


  if (
    result.error
  ) {

    throw databaseError(
      result.error,
      "fetchContribution"
    );

  }


  return result.data || null;

}


/* ============================================================
   FETCH GOALS
   ============================================================ */

async function fetchGoals(
  options = {}
) {

  const client =
    dataClient();


  const groupId =
    await dataGroupId();


  if (!groupId) {

    throw new Error(
      "No group is linked to the current account."
    );

  }


  const activeOnly =
    options.activeOnly !== false;


  /*
   * Start with the basic query.
   *
   * We avoid depending on a specific optional
   * column until the query is built.
   */

  let query =
    client
      .from("goals")
      .select("*")
      .eq(
        "group_id",
        groupId
      );


  /*
   * If activeOnly is requested, try the common
   * "status" column first.
   *
   * If the database does not have status, we
   * gracefully fall back to all goals.
   */

  if (
    activeOnly
  ) {

    const activeResult =
      await query
        .eq(
          "status",
          "active"
        )
        .order(
          "created_at",
          {
            ascending:false
          }
        );


    if (
      !activeResult.error
    ) {

      return normalizeArray(
        activeResult.data
      );

    }


    /*
     * Fallback for schemas without status.
     */

    console.warn(
      "Goals status filter unavailable; loading all group goals."
    );

  }


  const result =
    await client
      .from("goals")
      .select("*")
      .eq(
        "group_id",
        groupId
      )
      .order(
        "created_at",
        {
          ascending:false
        }
      );


  if (
    result.error
  ) {

    throw databaseError(
      result.error,
      "fetchGoals"
    );

  }


  return normalizeArray(
    result.data
  );

}


/* ============================================================
   FETCH ONE GOAL
   ============================================================ */

async function fetchGoal(
  goalId
) {

  const client =
    dataClient();


  const groupId =
    await dataGroupId();


  if (
    !goalId
  ) {

    throw new Error(
      "Goal ID is required."
    );

  }


  const result =
    await client
      .from("goals")
      .select("*")
      .eq(
        "id",
        goalId
      )
      .eq(
        "group_id",
        groupId
      )
      .maybeSingle();


  if (
    result.error
  ) {

    throw databaseError(
      result.error,
      "fetchGoal"
    );

  }


  return result.data || null;

}


/* ============================================================
   FETCH MEMBER CONTRIBUTIONS
   ============================================================ */

async function fetchMemberContributions(
  memberId
) {

  const client =
    dataClient();


  const groupId =
    await dataGroupId();


  if (
    !memberId
  ) {

    throw new Error(
      "Member ID is required."
    );

  }


  const result =
    await client
      .from("contributions")
      .select(`
        id,
        group_id,
        member_id,
        amount,
        month,
        goal_id,
        payment_method,
        reference,
        created_at,
        goals (
          id,
          goal_name
        )
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "member_id",
        memberId
      )
      .order(
        "created_at",
        {
          ascending:false
        }
      );


  if (
    result.error
  ) {

    throw databaseError(
      result.error,
      "fetchMemberContributions"
    );

  }


  return normalizeArray(
    result.data
  );

}


/* ============================================================
   CALCULATE MEMBER CONTRIBUTION TOTAL
   ============================================================ */

async function getMemberContributionTotal(
  memberId
) {

  const contributions =
    await fetchMemberContributions(
      memberId
    );


  return contributions.reduce(
    function(total, contribution) {

      return (
        total +
        Number(
          contribution.amount || 0
        )
      );

    },
    0
  );

}


/* ============================================================
   CALCULATE GROUP CONTRIBUTION TOTAL
   ============================================================ */

async function getContributionTotal() {

  const contributions =
    await fetchContributions();


  return contributions.reduce(
    function(total, contribution) {

      return (
        total +
        Number(
          contribution.amount || 0
        )
      );

    },
    0
  );

}


/* ============================================================
   FETCH CONTRIBUTIONS FOR A MONTH
   ============================================================ */

async function fetchContributionsByMonth(
  month
) {

  const client =
    dataClient();


  const groupId =
    await dataGroupId();


  if (!month) {

    throw new Error(
      "Contribution month is required."
    );

  }


  const result =
    await client
      .from("contributions")
      .select(`
        id,
        group_id,
        member_id,
        amount,
        month,
        goal_id,
        payment_method,
        reference,
        created_at,
        members (
          id,
          name,
          member_number
        ),
        goals (
          id,
          goal_name
        )
      `)
      .eq(
        "group_id",
        groupId
      )
      .eq(
        "month",
        month
      )
      .order(
        "created_at",
        {
          ascending:false
        }
      );


  if (
    result.error
  ) {

    throw databaseError(
      result.error,
      "fetchContributionsByMonth"
    );

  }


  return normalizeArray(
    result.data
  );

}


/* ============================================================
   EXPORT PART 2
   ============================================================ */

window.fetchContributions =
  fetchContributions;


window.fetchContribution =
  fetchContribution;


window.fetchGoals =
  fetchGoals;


window.fetchGoal =
  fetchGoal;


window.fetchMemberContributions =
  fetchMemberContributions;


window.getMemberContributionTotal =
  getMemberContributionTotal;


window.getContributionTotal =
  getContributionTotal;


window.fetchContributionsByMonth =
  fetchContributionsByMonth;


/* ============================================================
   STATUS
   ============================================================ */

console.log(
  "Chama Live: supabase-data.js Part 2 loaded."
);
/* ============================================================
   CHAMA LIVE
   SUPABASE DATA LAYER
   PART 3 OF 3
   ============================================================
 */


/* ============================================================
   RECORD CONTRIBUTION
   ============================================================ */

async function recordContribution(
  contribution
) {

  const client =
    dataClient();


  const user =
    await dataUser();


  const groupId =
    await dataGroupId();


  if (!groupId) {

    throw new Error(
      "No Chama group is linked to your account."
    );

  }


  if (
    !contribution
  ) {

    throw new Error(
      "Contribution details are missing."
    );

  }


  const memberId =
    contribution.memberId;


  const amount =
    Number(
      contribution.amount
    );


  const month =
    String(
      contribution.month || ""
    ).trim();


  const method =
    String(
      contribution.method || "M-Pesa"
    ).trim();


  const reference =
    contribution.reference
      ? String(
          contribution.reference
        ).trim()
      : null;


  const goalId =
    contribution.goalId ||
    null;


  /* ==========================================================
     VALIDATION
     ========================================================== */

  if (!memberId) {

    throw new Error(
      "Please select a member."
    );

  }


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    throw new Error(
      "Contribution amount must be greater than zero."
    );

  }


  if (!month) {

    throw new Error(
      "Contribution month is required."
    );

  }


  /* ==========================================================
     VERIFY MEMBER BELONGS TO CURRENT GROUP
     ========================================================== */

  const memberResult =
    await client
      .from("members")
      .select(`
        id,
        group_id,
        name
      `)
      .eq(
        "id",
        memberId
      )
      .eq(
        "group_id",
        groupId
      )
      .maybeSingle();


  if (
    memberResult.error
  ) {

    throw databaseError(
      memberResult.error,
      "verify contribution member"
    );

  }


  if (
    !memberResult.data
  ) {

    throw new Error(
      "The selected member does not belong to your group."
    );

  }


  /* ==========================================================
     VERIFY GOAL IF PROVIDED
     ========================================================== */

  if (
    goalId
  ) {

    const goalResult =
      await client
        .from("goals")
        .select(`
          id,
          group_id,
          goal_name
        `)
        .eq(
          "id",
          goalId
        )
        .eq(
          "group_id",
          groupId
        )
        .maybeSingle();


    if (
      goalResult.error
    ) {

      throw databaseError(
        goalResult.error,
        "verify contribution goal"
      );

    }


    if (
      !goalResult.data
    ) {

      throw new Error(
        "The selected goal does not belong to your group."
      );

    }

  }


  /* ==========================================================
     PREPARE DATABASE RECORD
     ========================================================== */

  const row = {

    group_id:
      groupId,

    member_id:
      memberId,

    amount:
      amount,

    month:
      month,

    goal_id:
      goalId,

    payment_method:
      method,

    reference:
      reference

  };


  /*
   * If your contributions table has a recorded_by
   * column, it can be added later.
   *
   * We intentionally do not include it here because
   * the core Chama Live contribution structure should
   * not fail simply because that optional column does
   * not exist.
   */


  /* ==========================================================
     INSERT
     ========================================================== */

  const result =
    await client
      .from("contributions")
      .insert(
        row
      )
      .select(`
        id,
        group_id,
        member_id,
        amount,
        month,
        goal_id,
        payment_method,
        reference,
        created_at
      `)
      .single();


  if (
    result.error
  ) {

    throw databaseError(
      result.error,
      "recordContribution"
    );

  }


  /* ==========================================================
     SUCCESS
     ========================================================== */

  console.log(
    "Chama Live: Contribution recorded:",
    result.data
  );


  return result.data;

}


/* ============================================================
   DELETE CONTRIBUTION
   ============================================================ */

async function deleteContribution(
  contributionId
) {

  const client =
    dataClient();


  const groupId =
    await dataGroupId();


  if (
    !contributionId
  ) {

    throw new Error(
      "Contribution ID is required."
    );

  }


  /*
   * Restrict deletion to the current group.
   */

  const result =
    await client
      .from("contributions")
      .delete()
      .eq(
        "id",
        contributionId
      )
      .eq(
        "group_id",
        groupId
      );


  if (
    result.error
  ) {

    throw databaseError(
      result.error,
      "deleteContribution"
    );

  }


  return true;

}


/* ============================================================
   UPDATE CONTRIBUTION
   ============================================================ */

async function updateContribution(
  contributionId,
  updates
) {

  const client =
    dataClient();


  const groupId =
    await dataGroupId();


  if (
    !contributionId
  ) {

    throw new Error(
      "Contribution ID is required."
    );

  }


  if (
    !updates ||
    typeof updates !== "object"
  ) {

    throw new Error(
      "Contribution updates are missing."
    );

  }


  const allowed =
    {};


  /*
   * Only allow fields that belong to a contribution.
   */

  if (
    updates.memberId !== undefined
  ) {

    allowed.member_id =
      updates.memberId;

  }


  if (
    updates.amount !== undefined
  ) {

    const amount =
      Number(
        updates.amount
      );


    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {

      throw new Error(
        "Contribution amount must be greater than zero."
      );

    }


    allowed.amount =
      amount;

  }


  if (
    updates.month !== undefined
  ) {

    allowed.month =
      String(
        updates.month
      ).trim();

  }


  if (
    updates.goalId !== undefined
  ) {

    allowed.goal_id =
      updates.goalId ||
      null;

  }


  if (
    updates.method !== undefined
  ) {

    allowed.payment_method =
      String(
        updates.method
      ).trim();

  }


  if (
    updates.reference !== undefined
  ) {

    allowed.reference =
      updates.reference
        ? String(
            updates.reference
          ).trim()
        : null;

  }


  if (
    Object.keys(allowed).length === 0
  ) {

    throw new Error(
      "No contribution changes were provided."
    );

  }


  /*
   * Update only within the current group.
   */

  const result =
    await client
      .from("contributions")
      .update(
        allowed
      )
      .eq(
        "id",
        contributionId
      )
      .eq(
        "group_id",
        groupId
      )
      .select(`
        id,
        group_id,
        member_id,
        amount,
        month,
        goal_id,
        payment_method,
        reference,
        created_at
      `)
      .single();


  if (
    result.error
  ) {

    throw databaseError(
      result.error,
      "updateContribution"
    );

  }


  return result.data;

}


/* ============================================================
   GROUP CONTRIBUTION SUMMARY
   ============================================================ */

async function getContributionSummary() {

  const contributions =
    await fetchContributions();


  let total =
    0;


  const memberTotals =
    {};


  contributions.forEach(
    function(contribution) {

      const amount =
        Number(
          contribution.amount || 0
        );


      total +=
        amount;


      const memberId =
        contribution.member_id;


      if (
        memberId
      ) {

        if (
          !memberTotals[memberId]
        ) {

          memberTotals[memberId] =
            0;

        }


        memberTotals[memberId] +=
          amount;

      }

    }
  );


  return {

    total:
      total,

    count:
      contributions.length,

    memberTotals:
      memberTotals

  };

}


/* ============================================================
   EXPORT PART 3
   ============================================================ */

window.recordContribution =
  recordContribution;


window.deleteContribution =
  deleteContribution;


window.updateContribution =
  updateContribution;


window.getContributionSummary =
  getContributionSummary;


/* ============================================================
   FINAL DATA-LAYER CHECK
   ============================================================ */

(function () {

  const requiredFunctions = [

    "fetchGroup",

    "fetchMembers",

    "fetchContributions",

    "fetchGoals",

    "recordContribution"

  ];


  const missing =
    requiredFunctions.filter(
      function(name) {

        return typeof window[name] !== "function";

      }
    );


  if (
    missing.length
  ) {

    console.error(
      "Chama Live DATA ERROR: Missing functions:",
      missing
    );

  } else {

    console.log(
      "Chama Live: supabase-data.js loaded successfully."
    );

  }

})();


/*
 * ============================================================
 * END OF supabase-data.js
 * ============================================================
 */

/* =========================================================
   CHAMA LIVE — ADD MEMBER RPC LAYER

   File:
   /js/add-member-rpc.js

   IMPORTANT
   ---------------------------------------------------------
   This module:
     - uses the existing Supabase client
     - performs no direct accounting-table writes
     - does not import members.js
     - does not modify database objects

   Backend remains authoritative.
========================================================= */

import {
  supabase
} from "./supabase.js";


/* =========================================================
   CONTRIBUTION TYPE FIELDS
========================================================= */

const CONTRIBUTION_TYPE_FIELDS =
  "id, group_id, name, code, created_at";


/* =========================================================
   LOAD GROUP CONTRIBUTION TYPES
========================================================= */

export async function loadContributionTypes(
  groupId
) {

  if (!groupId) {

    throw new Error(
      "Group ID is required to load contribution types."
    );

  }


  const {
    data,
    error
  } =
    await supabase
      .from("contribution_types")
      .select(
        CONTRIBUTION_TYPE_FIELDS
      )
      .eq(
        "group_id",
        groupId
      );


  if (error) {

    console.error(
      "[CHAMA LIVE] Contribution type lookup failed:",
      error
    );

    throw error;

  }


  return Array.isArray(data)
    ? data
    : [];

}


/* =========================================================
   FIND CANONICAL MONTHLY TYPE
========================================================= */

export function findMonthlyContributionType(
  contributionTypes
) {

  const types =
    Array.isArray(
      contributionTypes
    )
      ? contributionTypes
      : [];


  const monthly =
    types.filter(
      type => {

        const name =
          String(
            type?.name || ""
          )
            .trim()
            .toLowerCase();

        const code =
          String(
            type?.code || ""
          )
            .trim()
            .toLowerCase();


        return (
          name === "monthly" ||
          code === "monthly"
        );

      }
    );


  if (
    monthly.length === 0
  ) {

    const error =
      new Error(
        "The group's Monthly contribution type could not be found."
      );

    error.code =
      "CONTRIBUTION_TYPE_NOT_SUPPORTED";

    throw error;

  }


  /*
   * The Add Member UI supports exactly one canonical
   * Monthly contribution type.
   *
   * Prefer an exact name match where available.
   */

  const exactName =
    monthly.find(
      type =>
        String(
          type?.name || ""
        )
          .trim()
          .toLowerCase() ===
        "monthly"
    );


  if (exactName) {

    return exactName;

  }


  return monthly[0];

}


/* =========================================================
   CHECK MEMBER-MANAGEMENT PERMISSION
========================================================= */

export async function canManageMembers(
  groupId
) {

  if (!groupId) {

    throw new Error(
      "Group ID is required."
    );

  }


  const {
    data,
    error
  } =
    await supabase.rpc(
      "can_manage_members",
      {
        p_group_id:
          groupId
      }
    );


  if (error) {

    console.error(
      "[CHAMA LIVE] can_manage_members failed:",
      error
    );

    throw error;

  }


  /*
   * PostgreSQL boolean RPC normally arrives as boolean.
   * The extra handling protects against a scalar returned
   * through a compatibility representation.
   */

  if (
    data === true ||
    data === false
  ) {

    return data;

  }


  if (
    Array.isArray(data) &&
    data.length > 0
  ) {

    const first =
      data[0];

    if (
      typeof first ===
      "boolean"
    ) {

      return first;

    }

    if (
      first &&
      typeof first === "object"
    ) {

      const value =
        Object.values(
          first
        )[0];

      return value === true;

    }

  }


  return Boolean(data);

}


/* =========================================================
   CREATE MEMBER — NORMAL
========================================================= */

export async function createMemberWithContributionPlan(
  pMember,
  pContributionPlan
) {

  return await supabase.rpc(
    "create_member_with_contribution_plan",
    {
      p_member:
        pMember,

      p_contribution_plan:
        pContributionPlan
    }
  );

}


/* =========================================================
   CREATE MEMBER — HISTORICAL
========================================================= */

export async function createMemberWithHistoricalContributions(
  pMember,
  pContributionPlan,
  pHistorical,
  pRequestId
) {

  return await supabase.rpc(
    "create_member_with_historical_contributions",
    {
      p_member:
        pMember,

      p_contribution_plan:
        pContributionPlan,

      p_historical:
        pHistorical,

      p_request_id:
        pRequestId
    }
  );

}


/* =========================================================
   CREATE MEMBER DISPATCH
   ---------------------------------------------------------
   Historical OFF:
     create_member_with_contribution_plan()

   Historical ON:
     create_member_with_historical_contributions()
========================================================= */

export async function createMember(
  {
    pMember,
    pContributionPlan,
    historicalEnabled,
    pHistorical,
    requestId
  }
) {

  if (
    historicalEnabled
  ) {

    return createMemberWithHistoricalContributions(
      pMember,
      pContributionPlan,
      pHistorical,
      requestId
    );

  }


  return createMemberWithContributionPlan(
    pMember,
    pContributionPlan
  );

}

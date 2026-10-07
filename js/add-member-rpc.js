/* =========================================================
   CHAMA LIVE — ADD MEMBER RPC BOUNDARY

   This module:
   - reads the group's canonical Monthly contribution type
   - checks add-member authorization
   - builds the two RPC payloads
   - calls ONLY the existing backend RPCs

   It does NOT:
   - insert into members
   - insert contribution rules
   - insert contributions
   - insert allocations
   - insert obligations
========================================================= */

import {
  supabase
} from "./supabase.js";


const MONTHLY_CODE = "monthly";


const MONTHLY_NAME = "monthly";


/* =========================================================
   CANONICAL MONTHLY CONTRIBUTION TYPE
========================================================= */

export async function loadAddMemberMonthlyType(
  groupId
) {

  if (!groupId) {

    throw new Error(
      "GROUP_ID_REQUIRED"
    );

  }


  const {
    data,
    error
  } =
    await supabase
      .from("contribution_types")
      .select(
        "id, group_id, name, code"
      )
      .eq(
        "group_id",
        groupId
      )
      .or(
        "code.eq.monthly,name.ilike.Monthly"
      );


  if (error) {

    console.error(
      "CHAMA LIVE: Monthly contribution type lookup failed.",
      error
    );

    throw error;

  }


  const candidates =
    Array.isArray(data)
      ? data
      : [];


  const exactCode =
    candidates.filter(
      row =>
        String(
          row?.code || ""
        )
          .trim()
          .toLowerCase() ===
        MONTHLY_CODE
    );


  if (
    exactCode.length === 1
  ) {

    return exactCode[0];

  }


  const exactName =
    candidates.filter(
      row =>
        String(
          row?.name || ""
        )
          .trim()
          .toLowerCase() ===
        MONTHLY_NAME
    );


  if (
    exactName.length === 1
  ) {

    return exactName[0];

  }


  if (
    candidates.length === 0
  ) {

    const error =
      new Error(
        "CONTRIBUTION_TYPE_NOT_SUPPORTED"
      );

    error.code =
      "CONTRIBUTION_TYPE_NOT_SUPPORTED";

    error.details =
      "No canonical Monthly contribution type exists for this group.";

    throw error;

  }


  const error =
    new Error(
      "CONTRIBUTION_TYPE_NOT_SUPPORTED"
    );

  error.code =
    "CONTRIBUTION_TYPE_NOT_SUPPORTED";

  error.details =
    "More than one possible Monthly contribution type was returned.";

  throw error;

}


/* =========================================================
   MEMBER MANAGEMENT AUTHORIZATION
========================================================= */

export async function checkAddMemberPermission(
  groupId
) {

  if (!groupId) {

    return false;

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
      "CHAMA LIVE: can_manage_members failed.",
      error
    );

    throw error;

  }


  return data === true;

}


/* =========================================================
   PAYLOAD BUILDER
========================================================= */

export function buildAddMemberPayload(
  values
) {

  const p_member = {

    member_number:
      values.member_number,

    membership_number:
      values.membership_number,

    name:
      values.name,

    phone:
      values.phone,

    email:
      values.email || null,

    national_id:
      values.national_id || null,

    role:
      values.role,

    status:
      values.status,

    onboarding_status:
      values.onboarding_status,

    join_date:
      values.join_date,

    actual_position:
      values.actual_position || null,

    actual_position_name:
      values.actual_position === "other"
        ? (
            values.actual_position_name ||
            null
          )
        : null,

    actual_position_effective_from:
      values.actual_position
        ? (
            values.actual_position_effective_from ||
            values.join_date
          )
        : null

  };


  const p_contribution_plan = [

    {

      contribution_type_id:
        values.contribution_type_id,

      amount:
        values.amount,

      frequency:
        "monthly",

      effective_from:
        values.effective_from,

      effective_to:
        values.effective_to ||
        null,

      first_period_rule:
        values.first_period_rule,

      status:
        values.rule_status

    }

  ];


  const p_historical = {

    enabled:
      true,

    monthly_amount:
      values.amount,

    paid_through:
      values.paid_through,

    payment_method:
      values.payment_method

  };


  return {
    p_member,
    p_contribution_plan,
    p_historical
  };

}


/* =========================================================
   ORDINARY MEMBER CREATION
========================================================= */

export async function createMemberWithPlan(
  payload
) {

  return supabase.rpc(
    "create_member_with_contribution_plan",
    {
      p_member:
        payload.p_member,

      p_contribution_plan:
        payload.p_contribution_plan
    }
  );

}


/* =========================================================
   HISTORICAL MEMBER CREATION
========================================================= */

export async function createMemberWithHistorical(
  payload,
  requestId
) {

  return supabase.rpc(
    "create_member_with_historical_contributions",
    {
      p_member:
        payload.p_member,

      p_contribution_plan:
        payload.p_contribution_plan,

      p_historical:
        payload.p_historical,

      p_request_id:
        requestId
    }
  );

}


/* =========================================================
   PUBLIC SMOKE TEST
   ---------------------------------------------------------
   No mutation is performed.
========================================================= */

export async function runAddMemberSmokeTest() {

  const {
    data: sessionData,
    error: sessionError
  } =
    await supabase.auth.getSession();


  if (sessionError) {

    throw sessionError;

  }


  const session =
    sessionData?.session;


  if (!session?.user) {

    return {
      session: false,
      group_id: null,
      monthly_contribution_type_id: null,
      can_manage_members: false
    };

  }


  const {
    data: member,
    error: memberError
  } =
    await supabase.rpc(
      "get_my_member"
    );


  if (memberError) {

    throw memberError;

  }


  const resolvedMember =
    Array.isArray(member)
      ? member[0]
      : member;


  const groupId =
    resolvedMember?.group_id ||
    null;


  if (!groupId) {

    return {
      session: true,
      group_id: null,
      monthly_contribution_type_id: null,
      can_manage_members: false
    };

  }


  const monthly =
    await loadAddMemberMonthlyType(
      groupId
    );


  const canManage =
    await checkAddMemberPermission(
      groupId
    );


  return {

    session: true,

    user_id:
      session.user.id,

    group_id:
      groupId,

    monthly_contribution_type_id:
      monthly.id,

    monthly_contribution_type_name:
      monthly.name,

    can_manage_members:
      canManage

  };

}

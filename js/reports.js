/* =========================================================
   CHAMA LIVE — REPORTS
   COMPLETE SCHEMA-ALIGNED VERSION

   DATABASE RULES
   ---------------------------------------------------------
   members.name              -> member display name
   members.id                -> member primary key

   contributions.member_id   -> contributing member
   contributions.recorded_by -> recording member
   contributions.contribution_date -> contribution date

   expenses.recorded_by      -> recording member
   expenses.approval_status  -> pending / approved / rejected

   meetings.date             -> meeting date
   meetings.status           -> upcoming / completed / cancelled

   IMPORTANT
   ---------------------------------------------------------
   This page does NOT use members.full_name.
   It uses members.name.

   No database schema changes are required.
========================================================= */

import { supabase } from "./supabase.js";

import {
  requireAuth,
  getMyMember
} from "./auth.js";


console.log(
  "CHAMA LIVE: reports.js loaded"
);


/* =========================================================
   ELEMENTS
========================================================= */

const statusEl =
  document.getElementById("status");

const errorEl =
  document.getElementById("error");

const fromDateInput =
  document.getElementById("fromDate");

const toDateInput =
  document.getElementById("toDate");

const applyFiltersButton =
  document.getElementById("applyFilters");

const resetFiltersButton =
  document.getElementById("resetFilters");


/* FINANCIAL */

const totalContributionsEl =
  document.getElementById(
    "totalContributions"
  );

const approvedExpensesEl =
  document.getElementById(
    "approvedExpenses"
  );

const currentBalanceEl =
  document.getElementById(
    "currentBalance"
  );

const pendingExpensesEl =
  document.getElementById(
    "pendingExpenses"
  );

const rejectedExpensesEl =
  document.getElementById(
    "rejectedExpenses"
  );

const activeMembersEl =
  document.getElementById(
    "activeMembers"
  );


/* MEETINGS */

const totalMeetingsEl =
  document.getElementById(
    "totalMeetings"
  );

const upcomingMeetingsEl =
  document.getElementById(
    "upcomingMeetings"
  );

const completedMeetingsEl =
  document.getElementById(
    "completedMeetings"
  );

const cancelledMeetingsEl =
  document.getElementById(
    "cancelledMeetings"
  );


/* TABLES */

const contributionBreakdownRows =
  document.getElementById(
    "contributionBreakdownRows"
  );

const expenseBreakdownRows =
  document.getElementById(
    "expenseBreakdownRows"
  );

const contributionReportRows =
  document.getElementById(
    "contributionReportRows"
  );

const expenseReportRows =
  document.getElementById(
    "expenseReportRows"
  );


/* =========================================================
   STATE
========================================================= */

let currentUser =
  null;

let currentMember =
  null;

let groupId =
  null;

let group =
  null;

let members =
  [];

let contributions =
  [];

let expenses =
  [];

let meetings =
  [];

let initialized =
  false;


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
   HTML ESCAPE
========================================================= */

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}


/* =========================================================
   STATUS
========================================================= */

function showStatus(message) {

  if (!

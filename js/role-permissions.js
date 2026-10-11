/* =========================================================
   CHAMA LIVE — SHARED ROLE PERMISSIONS (CANDIDATE ONLY)

   This module is the single frontend policy vocabulary for
   page/action permissions. Backend RLS/RPC checks remain
   authoritative. Unknown page/action pairs default to read-only.

   DOM contract:
     data-permission-page="members"
     data-permission-action="edit"
   or data-permission-page="expenses"
      data-permission-action="approve"

   Controls marked with the contract are disabled, not removed,
   when the current role cannot perform that action. Read-only
   pages remain visible and data-loading is not blocked.

   Platform administration is deliberately separate from group
   office roles. Do not infer platform-admin status from
   members.role === "admin".
========================================================= */

const normalize = value => String(value ?? "").trim().toLowerCase();

const ROLE_ALIASES = new Map([
  ["administrator", "admin"],
  ["vice-chairperson", "vice chairperson"],
  ["vice chair", "vice chairperson"],
  ["vice secretary", "vice secretary"]
]);

export function normalizeGroupRole(member = {}) {
  // Actual office is the preferred source for vice-office holders;
  // the technical membership role remains a separate field.
  const raw = normalize(
    member.actual_position_name ||
    member.actual_position ||
    member.role ||
    "member"
  );
  return ROLE_ALIASES.get(raw) || raw;
}

const GROUP_MANAGEMENT = new Set([
  "admin", "chairperson", "vice chairperson",
  "treasurer", "secretary", "vice secretary"
]);

const CHAIR_SLOT = new Set(["chairperson", "vice chairperson"]);
const SECRETARY_SLOT = new Set(["secretary", "vice secretary"]);
const MEMBER_RECORDS_FULL = new Set(["admin", "chairperson", "vice chairperson", "treasurer"]);

const POLICY = {
  dashboard: {
    view: GROUP_MANAGEMENT,
    export: GROUP_MANAGEMENT
  },
  reports: {
    view: GROUP_MANAGEMENT,
    export: GROUP_MANAGEMENT
  },
  members: {
    view: GROUP_MANAGEMENT,
    search: GROUP_MANAGEMENT,
    filter: GROUP_MANAGEMENT,
    create: new Set(["admin", "chairperson", "vice chairperson", "treasurer"]),
    edit: MEMBER_RECORDS_FULL,
    delete: MEMBER_RECORDS_FULL,
    invite: new Set(["admin", "chairperson", "vice chairperson", "treasurer"])
  },
  "plans-activities": {
    view: GROUP_MANAGEMENT, create: GROUP_MANAGEMENT,
    edit: GROUP_MANAGEMENT, delete: GROUP_MANAGEMENT
  },
  meetings: {
    view: GROUP_MANAGEMENT, create: GROUP_MANAGEMENT,
    edit: GROUP_MANAGEMENT, delete: GROUP_MANAGEMENT
  },
  assets: {
    view: GROUP_MANAGEMENT, create: GROUP_MANAGEMENT,
    edit: GROUP_MANAGEMENT, delete: GROUP_MANAGEMENT
  },
  contributions: {
    view: GROUP_MANAGEMENT,
    create: new Set(["treasurer"]),
    record: new Set(["treasurer"]),
    verify: new Set(["treasurer"]),
    approve: new Set(["treasurer"]),
    reject: new Set(["treasurer"]),
    reverse: new Set(["treasurer"]),
    settings: new Set(["treasurer"])
  },
  expenses: {
    view: GROUP_MANAGEMENT,
    create: new Set(["chairperson", "vice chairperson", "treasurer", "secretary", "vice secretary"]),
    edit: new Set(["treasurer"]),
    delete: new Set(["treasurer"]),
    // An individual role can submit its own slot only. Full
    // three-slot completion is enforced by backend workflow.
    "approve-chair": CHAIR_SLOT,
    "approve-treasurer": new Set(["treasurer"]),
    "approve-secretary": SECRETARY_SLOT
  },
  fines: {
    view: GROUP_MANAGEMENT,
    create: new Set(["secretary", "vice secretary", "treasurer"]),
    adjust: new Set(["treasurer"]),
    waive: new Set(["treasurer"]),
    allocate: new Set(["treasurer"]),
    "generate-contribution": new Set(["treasurer"])
  },
  "monthly-closing": {
    view: GROUP_MANAGEMENT,
    close: new Set(["treasurer"]),
    reopen: new Set(["treasurer"])
  },
  "data-migration": {
    view: new Set(["admin", "treasurer"]),
    import: new Set(["treasurer"]),
    post: new Set(["treasurer"])
  },
  "group-management": {
    view: GROUP_MANAGEMENT,
    // Treasury settings are separately protected by backend RPCs.
    edit: new Set(["admin", "chairperson", "vice chairperson"]),
    "edit-contribution-settings": new Set(["treasurer"])
  },
  welfare: {
    view: GROUP_MANAGEMENT, create: GROUP_MANAGEMENT,
    edit: GROUP_MANAGEMENT, delete: GROUP_MANAGEMENT
  },
  milestones: {
    view: GROUP_MANAGEMENT, create: GROUP_MANAGEMENT,
    edit: GROUP_MANAGEMENT, delete: GROUP_MANAGEMENT
  }
};

const roleCan = (role, page, action) => {
  const rule = POLICY[page]?.[action];
  return rule instanceof Set && rule.has(role);
};

export function canWrite(page, action, member, options = {}) {
  // Platform Admin is a distinct authority, supplied only by a
  // verified platform-admin guard—not inferred from group role.
  if (options.isVerifiedPlatformAdmin === true) return true;
  const role = normalizeGroupRole(member);
  return roleCan(role, normalize(page), normalize(action));
}

export function pageHasReadOnlyAccess(page, member, options = {}) {
  if (options.isVerifiedPlatformAdmin === true) return false;
  const role = normalizeGroupRole(member);
  const rules = POLICY[normalize(page)];
  if (!rules) return true;
  return Object.keys(rules).every(action => !roleCan(role, normalize(page), action) || action === "view");
}

function ensureBadge(root) {
  if (root.querySelector("[data-role-view-only-badge]")) return;
  const badge = document.createElement("span");
  badge.dataset.roleViewOnlyBadge = "true";
  badge.className = "role-view-only-badge";
  badge.textContent = "View only";
  badge.setAttribute("role", "status");
  badge.style.cssText = "display:inline-flex;align-items:center;margin-inline-start:.5rem;padding:.2rem .5rem;border:1px solid #d0d5dd;border-radius:999px;color:#475467;background:#f8fafc;font-size:.75rem;font-weight:600";
  const heading = root.querySelector("h1, [data-page-title]");
  (heading || root.firstElementChild || root).appendChild(badge);
}

function disableControl(control) {
  if ("disabled" in control) {
    control.disabled = true;
  } else {
    control.setAttribute("aria-disabled", "true");
    control.setAttribute("tabindex", "-1");
  }
  control.dataset.permissionDenied = "true";
  control.title = control.title || "You have view-only access.";
}

export function applyRolePermissions({
  page,
  member,
  root = document,
  isVerifiedPlatformAdmin = false
} = {}) {
  const pageKey = normalize(page);
  const context = { isVerifiedPlatformAdmin };
  let deniedCount = 0;

  root.querySelectorAll("[data-permission-action]").forEach(control => {
    const declaredPage = normalize(control.dataset.permissionPage || pageKey);
    if (declaredPage !== pageKey) return;
    const action = normalize(control.dataset.permissionAction);
    if (!canWrite(pageKey, action, member, context)) {
      disableControl(control);
      deniedCount++;
    }
  });

  // A page is never hidden solely because the role is read-only.
  // Page modules should mark mutation forms/buttons explicitly.
  if (pageHasReadOnlyAccess(pageKey, member, context)) {
    ensureBadge(root);
  }

  return { page: pageKey, deniedCount };
}

export function getRolePermissionPolicy() {
  return Object.fromEntries(
    Object.entries(POLICY).map(([page, actions]) => [
      page,
      Object.fromEntries(
        Object.entries(actions).map(([action, roles]) => [
          action, [...roles]
        ])
      )
    ])
  );
}

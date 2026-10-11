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
  ["vice_chairperson", "vice chairperson"],
  ["vice chair", "vice chairperson"],
  ["vice secretary", "vice secretary"],
  ["vice_secretary", "vice secretary"]
]);

export function getGroupRoles(member = {}) {
  // A group administrator is not a platform administrator and must
  // never satisfy one of the three expense approval slots.
  const technicalRole = normalize(member.role || "member");
  const officeRole = normalize(member.actual_position_name || member.actual_position);
  const normalizeRole = raw => ROLE_ALIASES.get(raw) || raw;
  // Group Admin is a distinct group role: never inherit a declared
  // office role that could grant treasury or approval-slot authority.
  if (technicalRole === "admin") return new Set(["admin"]);
  const normalizedOffice = normalizeRole(officeRole);
  const officialOfficeRoles = new Set([
    "chairperson", "vice chairperson", "treasurer",
    "secretary", "vice secretary"
  ]);
  const roles = new Set([normalizeRole(technicalRole)]);
  if (normalizedOffice) roles.add(normalizedOffice);
  // A member who holds a recognized office is not treated as an ordinary
  // member for group-portal permissions. Member-portal permissions explicitly
  // list official roles where their own evidence/profile actions are allowed.
  if (officialOfficeRoles.has(normalizedOffice) && normalizeRole(technicalRole) === "member") {
    roles.delete("member");
  }
  return roles;
}

export function normalizeGroupRole(member = {}) {
  const roles = getGroupRoles(member);
  return roles.has("admin") ? "admin" : [...roles][0] || "member";
}

const GROUP_MANAGEMENT = new Set([
  "admin", "chairperson", "vice chairperson",
  "treasurer", "secretary", "vice secretary"
]);

const CHAIR_SLOT = new Set(["chairperson", "vice chairperson"]);
const SECRETARY_SLOT = new Set(["secretary", "vice secretary"]);
const MEMBER_RECORDS_FULL = new Set(["admin", "chairperson", "vice chairperson", "treasurer"]);

const MEMBER_PORTAL_ROLES = new Set([
  "member", "admin", "chairperson", "vice chairperson",
  "treasurer", "secretary", "vice secretary"
]);

const POLICY = {
  "member-dashboard": { view: MEMBER_PORTAL_ROLES },
  "member-accounting": { view: MEMBER_PORTAL_ROLES },
  "member-contributions": {
    view: MEMBER_PORTAL_ROLES,
    "submit-evidence": MEMBER_PORTAL_ROLES
  },
  "member-activities": { view: MEMBER_PORTAL_ROLES },
  "member-assets": { view: MEMBER_PORTAL_ROLES },
  "member-milestones": { view: MEMBER_PORTAL_ROLES },
  "member-profile": {
    view: MEMBER_PORTAL_ROLES,
    "edit-own": MEMBER_PORTAL_ROLES
  },
  "member-getting-started": { view: MEMBER_PORTAL_ROLES },
  "add-member": {
    view: GROUP_MANAGEMENT,
    create: new Set(["admin", "chairperson", "vice chairperson", "treasurer"]),
    "historical-payment": new Set(["treasurer"])
  },
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
    "submit-evidence": new Set(["member"]),
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
    // The current schema has only one approval_status field. Until a
    // distinct-person three-slot backend workflow exists, all approval,
    // edit and delete actions fail closed in the UI.
    edit: new Set(),
    delete: new Set(),
    "approve-chair": new Set(),
    "approve-treasurer": new Set(),
    "approve-secretary": new Set()
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

const roleCan = (roles, page, action, member) => {
  const rule = POLICY[page]?.[action];
  if (!(rule instanceof Set)) return false;

  // Platform administrators and group administrators cannot act as
  // any of the three required expense approver slots.
  if (
    normalize(page) === "expenses" &&
    ["approve-chair", "approve-treasurer", "approve-secretary"].includes(normalize(action)) &&
    (roles.has("admin") || member?.is_platform_admin === true)
  ) return false;

  return [...roles].some(role => rule.has(role));
};

export function canWrite(page, action, member, options = {}) {
  // Platform admin is intentionally not a group-office permission.
  // A verified platform-admin guard does not satisfy group approvals.
  const roles = getGroupRoles(member);
  if (
    options.isVerifiedPlatformAdmin === true &&
    normalize(page) === "expenses" &&
    ["approve-chair", "approve-treasurer", "approve-secretary"].includes(normalize(action))
  ) return false;
  return roleCan(roles, normalize(page), normalize(action), member);
}

export function pageHasReadOnlyAccess(page, member, options = {}) {
  if (options.isVerifiedPlatformAdmin === true) return false;
  const roles = getGroupRoles(member);
  const rules = POLICY[normalize(page)];
  if (!rules) return true;
  const readActions = new Set(["view", "search", "filter", "export"]);
  return !Object.keys(rules).some(action =>
    !readActions.has(action) && roleCan(roles, normalize(page), action, member)
  );
}

function ensureBadge(root) {
  if (!root) return;
  const isControl = ["FORM", "BUTTON", "FIELDSET", "DETAILS"].includes(root.tagName);
  const container = isControl ? root.parentElement : root;
  if (container?.querySelector?.("[data-role-view-only-badge]")) return;
  const badge = document.createElement("span");
  badge.dataset.roleViewOnlyBadge = "true";
  badge.className = "role-view-only-badge";
  badge.textContent = "View only";
  badge.setAttribute("role", "status");
  badge.style.cssText = "display:inline-flex;align-items:center;margin-inline-start:.5rem;padding:.2rem .5rem;border:1px solid #d0d5dd;border-radius:999px;color:#475467;background:#f8fafc;font-size:.75rem;font-weight:600";
  if (isControl && root.parentElement) {
    root.insertAdjacentElement("beforebegin", badge);
    return;
  }
  const heading = root.querySelector?.("h1, [data-page-title]");
  (heading || root.firstElementChild || root).appendChild(badge);
}

function disableControl(control) {
  if (control.tagName === "FORM") {
    // Bind the submit guard once; it blocks Enter/script submissions before
    // page-level handlers can issue requests.
    if (control.dataset.permissionSubmitGuarded !== "true") {
      control.addEventListener("submit", event => {
        event.preventDefault();
        event.stopImmediatePropagation();
      }, { capture: true });
      control.dataset.permissionSubmitGuarded = "true";
    }
    control.querySelectorAll("input, select, textarea, button").forEach(field => {
      field.disabled = true;
      field.setAttribute("aria-disabled", "true");
    });
  } else if (["DETAILS", "FIELDSET"].includes(control.tagName)) {
    control.querySelectorAll("input, select, textarea, button").forEach(field => {
      field.disabled = true;
      field.setAttribute("aria-disabled", "true");
    });
    control.setAttribute("aria-disabled", "true");
  } else if ("disabled" in control) {
    control.disabled = true;
    control.setAttribute("aria-disabled", "true");
  } else {
    control.setAttribute("aria-disabled", "true");
    control.setAttribute("tabindex", "-1");
  }
  control.dataset.permissionDenied = "true";
  control.title = control.title || "You have view-only access.";
}

const permissionObservers = new WeakMap();

export function applyRolePermissions({
  page,
  member,
  root = document,
  isVerifiedPlatformAdmin = false
} = {}) {
  const pageKey = normalize(page);
  const context = { isVerifiedPlatformAdmin };
  let deniedCount = 0;

  const enforce = control => {
    if (!control || !control.dataset) return;
    const declaredPage = normalize(control.dataset.permissionPage || pageKey);
    if (declaredPage !== pageKey) return;
    const action = normalize(control.dataset.permissionAction);
    if (!canWrite(pageKey, action, member, context)) {
      const alreadyDenied = control.dataset.permissionDenied === "true";
      disableControl(control);
      if (["FORM", "DETAILS", "FIELDSET"].includes(control.tagName)) ensureBadge(control);
      if (!alreadyDenied) deniedCount++;
    }
  };

  const scan = node => {
    if (!node || node.nodeType !== 1) return;
    // Dynamic descendants of a denied form must remain disabled even if a
    // page renderer inserts them after the first permission pass.
    const deniedForm = node.closest?.('form[data-permission-denied="true"]');
    if (deniedForm) {
      if (node.matches?.("input, select, textarea, button")) {
        node.disabled = true;
        node.setAttribute("aria-disabled", "true");
      }
      node.querySelectorAll?.("input, select, textarea, button").forEach(field => {
        field.disabled = true;
        field.setAttribute("aria-disabled", "true");
      });
    }
    if (node.matches?.("[data-permission-action]")) enforce(node);
    node.querySelectorAll?.("[data-permission-action]").forEach(enforce);
  };

  root.querySelectorAll("[data-permission-action]").forEach(enforce);

  // Observe dynamically rendered rows/modals/actions. Each page root gets one
  // observer, and controls are still authorized using the same closed policy.
  if (typeof MutationObserver !== "undefined" && !permissionObservers.has(root)) {
    const target = root === document ? document.documentElement : root;
    if (target) {
      const observer = new MutationObserver(records => {
        for (const record of records) {
          record.addedNodes.forEach(scan);
        }
      });
      observer.observe(target, { childList: true, subtree: true });
      permissionObservers.set(root, observer);
    }
  }

  // A page is never hidden solely because the role is read-only.
  if (pageHasReadOnlyAccess(pageKey, member, context)) ensureBadge(root);

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

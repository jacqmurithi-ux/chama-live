/* =========================================================
   CHAMA LIVE — GROUP MANAGEMENT

   RESPONSIBILITIES
   ---------------------------------------------------------
   - Load authenticated group context
   - Display group information
   - Update group information
   - Display member count
   - Display subscription state
   - Manage monthly contribution cycle
   - Keep contribution cycle changes prospective
   - Manage administrator actual group position
   - Provide entry point for initial officer onboarding

   GROUP TYPE
   ---------------------------------------------------------
   - Chama
   - CBO
   - Other
   - Other reveals a custom group-type field
   - Custom group type is stored in groups.category

   REMOVED
   ---------------------------------------------------------
   - Contribution Initiatives
   - Initiative creation
   - Initiative member configuration
   - Initiative activation
   - Initiative RPC calls
   - Initiative DOM/event handlers

   IMPORTANT
   ---------------------------------------------------------
   - admin-layout.js remains the page-shell boot owner
   - No database schema changes are performed here
   - Group Type maps to groups.category
   - Monthly Closing Day selector remains openable
   - Saving the contribution cycle remains permission-controlled
   - Actual position changes use set_member_actual_position()
   - No direct position-column writes are performed
   - Initial actual-position effective date = member.join_date
   - No module-level auto-boot
   ========================================================= */

import {
    supabase,
    getMyApplicationContext
} from "./auth.js";


/* =========================================================
   CONSTANTS
   ========================================================= */

const ACTUAL_POSITION_VALUES = new Set([
    "chairperson",
    "vice_chairperson",
    "treasurer",
    "secretary",
    "vice_secretary",
    "committee_member",
    "member",
    "other"
]);

const STANDARD_GROUP_TYPES = new Set([
    "Chama",
    "CBO"
]);


/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;
let currentMember = null;
let currentGroup = null;

let currentIsOwner = false;
let currentRole = null;
let canManageGroup = false;

let subscription = null;
let contributionSettings = null;

let initializationPromise = null;
let eventsBound = false;


/* =========================================================
   DOM REFERENCES
   ========================================================= */

const dom = {
    statusMessage: document.getElementById("statusMessage"),
    errorMessage: document.getElementById("errorMessage"),

    adminLoading: document.getElementById("adminLoading"),
    managementContent: document.getElementById("managementContent"),
    permissionMessage: document.getElementById("permissionMessage"),

    groupNameDisplay: document.getElementById(
        "groupNameDisplay"
    ),

    groupCategoryDisplay: document.getElementById(
        "groupCategoryDisplay"
    ),

    groupCountryDisplay: document.getElementById(
        "groupCountryDisplay"
    ),

    memberCountDisplay: document.getElementById(
        "memberCountDisplay"
    ),

    permissionBadge: document.getElementById(
        "permissionBadge"
    ),

    groupForm: document.getElementById("groupForm"),

    groupName: document.getElementById(
        "groupName"
    ),

    groupCategory: document.getElementById(
        "groupCategory"
    ),

    groupCategoryOtherField: document.getElementById(
        "groupCategoryOtherField"
    ),

    groupCategoryOther: document.getElementById(
        "groupCategoryOther"
    ),

    groupCountry: document.getElementById(
        "groupCountry"
    ),

    monthlyContribution: document.getElementById(
        "monthlyContribution"
    ),

    saveGroup: document.getElementById(
        "saveGroup"
    ),

    /* -----------------------------------------------------
       LEADERSHIP SETUP
       ----------------------------------------------------- */

    leadershipSetupCard:
        document.getElementById(
            "leadershipSetupCard"
        ),

    leadershipSetupStatus:
        document.getElementById(
            "leadershipSetupStatus"
        ),

    adminActualPosition:
        document.getElementById(
            "adminActualPosition"
        ),

    adminActualPositionNameField:
        document.getElementById(
            "adminActualPositionNameField"
        ),

    adminActualPositionName:
        document.getElementById(
            "adminActualPositionName"
        ),

    saveAdminActualPosition:
        document.getElementById(
            "saveAdminActualPosition"
        ),

    addInitialOfficerLink:
        document.getElementById(
            "addInitialOfficerLink"
        ),

    /* -----------------------------------------------------
       CONTRIBUTION CALENDAR
       ----------------------------------------------------- */

    contributionCalendarForm:
        document.getElementById(
            "contributionCalendarForm"
        ),

    monthlyClosingDay:
        document.getElementById(
            "monthlyClosingDay"
        ),

    saveContributionCalendar:
        document.getElementById(
            "saveContributionCalendar"
        ),

    currentContributionCycle:
        document.getElementById(
            "currentContributionCycle"
        ),

    currentContributionOpeningDate:
        document.getElementById(
            "currentContributionOpeningDate"
        ),

    currentContributionClosingDate:
        document.getElementById(
            "currentContributionClosingDate"
        ),

    /* -----------------------------------------------------
       SUBSCRIPTION
       ----------------------------------------------------- */

    subscriptionPanel:
        document.getElementById(
            "subscriptionPanel"
        ),

    subscriptionStatus:
        document.getElementById(
            "subscriptionStatus"
        ),

    subscriptionPlan:
        document.getElementById(
            "subscriptionPlan"
        ),

    subscriptionEndDate:
        document.getElementById(
            "subscriptionEndDate"
        ),

    subscriptionAmount:
        document.getElementById(
            "subscriptionAmount"
        ),

    /* -----------------------------------------------------
       GROUP CONTEXT
       ----------------------------------------------------- */

    contextGroupName:
        document.getElementById(
            "contextGroupName"
        ),

    contextRole:
        document.getElementById(
            "contextRole"
        ),

    contextAccess:
        document.getElementById(
            "contextAccess"
        ),

    contextCountry:
        document.getElementById(
            "contextCountry"
        )
};


/* =========================================================
   MESSAGE HELPERS
   ========================================================= */

function clearMessages() {
    if (dom.statusMessage) {
        dom.statusMessage.textContent = "";
        dom.statusMessage.className =
            "status-message";
    }

    if (dom.errorMessage) {
        dom.errorMessage.textContent = "";
        dom.errorMessage.className =
            "status-message error";
    }
}


function showStatus(message) {
    if (!dom.statusMessage) {
        return;
    }

    dom.statusMessage.textContent =
        message;

    dom.statusMessage.className =
        "status-message visible success";
}


function showError(message) {
    if (!dom.errorMessage) {
        return;
    }

    dom.errorMessage.textContent =
        message;

    dom.errorMessage.className =
        "status-message visible error";
}


/* =========================================================
   FORMATTING
   ========================================================= */

function formatDate(value) {
    if (!value) {
        return "—";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "—";
    }

    return new Intl.DateTimeFormat(
        "en-KE",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    ).format(date);
}


function formatDateRange(
    startDate,
    endDate
) {
    if (
        !startDate ||
        !endDate
    ) {
        return "—";
    }

    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}


function formatMoney(value) {
    const amount =
        Number(value);

    if (
        !Number.isFinite(amount)
    ) {
        return "—";
    }

    return new Intl.NumberFormat(
        "en-KE",
        {
            style: "currency",
            currency: "KES",
            maximumFractionDigits: 2
        }
    ).format(amount);
}


function formatSubscriptionDate(
    value
) {
    if (!value) {
        return "—";
    }

    return formatDate(value);
}


function formatSubscriptionAmount(
    value
) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "—";
    }

    return formatMoney(value);
}


/* =========================================================
   GROUP TYPE
   ========================================================= */

/**
 * Returns true when the supplied category is one of the
 * predefined group types.
 */
function isStandardGroupType(category) {
    return STANDARD_GROUP_TYPES.has(
        String(category || "").trim()
    );
}


/**
 * Updates the custom Group Type field visibility.
 *
 * Only "Other" exposes the custom input.
 */
function updateGroupCategoryUI() {
    const category =
        dom.groupCategory?.value
            ?.trim() ||
        "";

    const isOther =
        category === "Other";

    if (dom.groupCategoryOtherField) {
        dom.groupCategoryOtherField.hidden =
            !isOther;
    }

    if (dom.groupCategoryOther) {
        dom.groupCategoryOther.required =
            isOther;

        if (!isOther) {
            dom.groupCategoryOther.value =
                "";
        }
    }
}


/**
 * Loads an existing groups.category value into the
 * Group Type controls.
 *
 * Standard values remain selected directly.
 *
 * Any existing non-standard category is represented
 * by:
 *
 *     Select = Other
 *     Custom  = stored category
 */
function renderGroupCategory(
    category
) {
    const normalized =
        String(category || "").trim();

    if (!dom.groupCategory) {
        return;
    }

    if (isStandardGroupType(normalized)) {
        dom.groupCategory.value =
            normalized;

        if (dom.groupCategoryOther) {
            dom.groupCategoryOther.value =
                "";
        }
    } else if (normalized) {
        dom.groupCategory.value =
            "Other";

        if (dom.groupCategoryOther) {
            dom.groupCategoryOther.value =
                normalized;
        }
    } else {
        dom.groupCategory.value =
            "";
        
        if (dom.groupCategoryOther) {
            dom.groupCategoryOther.value =
                "";
        }
    }

    updateGroupCategoryUI();
}


/**
 * Returns the actual category that should be persisted.
 *
 * Chama/CBO:
 *     selected value
 *
 * Other:
 *     custom group type
 */
function getGroupCategoryValue() {
    const selectedCategory =
        dom.groupCategory?.value
            ?.trim() ||
        "";

    if (selectedCategory !== "Other") {
        return selectedCategory;
    }

    return dom.groupCategoryOther?.value
        ?.trim() || "";
}


/**
 * Validates Group Type and returns the value
 * that should be persisted.
 */
function validateGroupCategory() {
    const selectedCategory =
        dom.groupCategory?.value
            ?.trim() ||
        "";

    if (!selectedCategory) {
        return {
            valid: false,
            value: "",
            message:
                "Group type is required."
        };
    }

    if (selectedCategory === "Other") {
        const customCategory =
            dom.groupCategoryOther?.value
                ?.trim() ||
            "";

        if (!customCategory) {
            return {
                valid: false,
                value: "",
                message:
                    "Specify the group type when selecting Other."
            };
        }

        if (customCategory.length > 100) {
            return {
                valid: false,
                value: "",
                message:
                    "The specified group type must be 100 characters or fewer."
            };
        }

        return {
            valid: true,
            value: customCategory,
            message: ""
        };
    }

    if (
        !isStandardGroupType(
            selectedCategory
        )
    ) {
        return {
            valid: false,
            value: "",
            message:
                "Select a valid group type."
        };
    }

    return {
        valid: true,
        value: selectedCategory,
        message: ""
    };
}


/* =========================================================
   AUTHORIZATION CONTEXT
   ---------------------------------------------------------
   Canonical getMyApplicationContext() contract:

   {
       user,
       member,
       group,
       isOwner,
       role
   }

   Group management permissions:

   - Owner         → management access
   - Admin         → management access
   - Administrator → management access
   - Member        → view only
   ========================================================= */

async function loadAuthorizationContext() {
    const context =
        await getMyApplicationContext();

    if (!context) {
        throw new Error(
            "Unable to load your group management context."
        );
    }

    currentUser =
        context.user ||
        null;

    currentMember =
        context.member ||
        null;

    currentGroup =
        context.group ||
        null;

    currentRole =
        context.role ||
        currentMember?.role ||
        null;

    currentIsOwner =
        Boolean(
            context.isOwner
        );

    const normalizedRole =
        String(
            currentRole || ""
        )
            .trim()
            .toLowerCase();

    canManageGroup =
        Boolean(
            currentIsOwner ||
            normalizedRole === "owner" ||
            normalizedRole === "admin" ||
            normalizedRole === "administrator"
        );

    if (!currentGroup?.id) {
        throw new Error(
            "No group is associated with your account."
        );
    }
}


/* =========================================================
   AUTHORIZATION UI
   ========================================================= */

function applyAuthorizationUI() {
    const editable =
        Boolean(
            canManageGroup
        );


    /* ------------------------------------------------------
       GROUP INFORMATION
       ------------------------------------------------------ */

    if (dom.groupName) {
        dom.groupName.disabled =
            !editable;
    }

    if (dom.groupCategory) {
        dom.groupCategory.disabled =
            !editable;
    }

    if (dom.groupCategoryOther) {
        dom.groupCategoryOther.disabled =
            !editable;
    }

    if (dom.groupCountry) {
        dom.groupCountry.disabled =
            !editable;
    }

    if (dom.monthlyContribution) {
        dom.monthlyContribution.disabled =
            !editable;
    }


    /* ------------------------------------------------------
       LEADERSHIP SETUP
       ------------------------------------------------------ */

    if (dom.adminActualPosition) {
        dom.adminActualPosition.disabled =
            !editable;
    }

    if (dom.adminActualPositionName) {
        dom.adminActualPositionName.disabled =
            !editable;
    }

    if (dom.saveAdminActualPosition) {
        dom.saveAdminActualPosition.disabled =
            !editable;
    }

    if (dom.addInitialOfficerLink) {
        if (editable) {
            dom.addInitialOfficerLink.removeAttribute(
                "aria-disabled"
            );

            dom.addInitialOfficerLink.tabIndex =
                0;
        } else {
            dom.addInitialOfficerLink.setAttribute(
                "aria-disabled",
                "true"
            );

            dom.addInitialOfficerLink.tabIndex =
                -1;
        }
    }


    /* ------------------------------------------------------
       MONTHLY CONTRIBUTION CYCLE
       ------------------------------------------------------ */

    if (dom.monthlyClosingDay) {
        dom.monthlyClosingDay.disabled =
            false;

        dom.monthlyClosingDay.removeAttribute(
            "disabled"
        );

        dom.monthlyClosingDay.removeAttribute(
            "aria-disabled"
        );
    }


    /* ------------------------------------------------------
       SAVE BUTTONS
       ------------------------------------------------------ */

    if (dom.saveGroup) {
        dom.saveGroup.disabled =
            !editable;
    }

    if (
        dom.saveContributionCalendar
    ) {
        dom.saveContributionCalendar.disabled =
            !editable;
    }


    /* ------------------------------------------------------
       PERMISSION BADGE
       ------------------------------------------------------ */

    if (dom.permissionBadge) {
        if (editable) {
            dom.permissionBadge.textContent =
                currentIsOwner
                    ? "Owner"
                    : "Administrator";
        } else {
            dom.permissionBadge.textContent =
                "View only";
        }
    }


    /* ------------------------------------------------------
       CONTEXT ROLE
       ------------------------------------------------------ */

    if (dom.contextRole) {
        dom.contextRole.textContent =
            currentRole ||
            "—";
    }


    /* ------------------------------------------------------
       CONTEXT ACCESS
       ------------------------------------------------------ */

    if (dom.contextAccess) {
        dom.contextAccess.textContent =
            editable
                ? "Group management"
                : "View only";
    }


    /* ------------------------------------------------------
       PERMISSION MESSAGE
       ------------------------------------------------------ */

    if (dom.permissionMessage) {
        if (editable) {
            dom.permissionMessage.classList.add(
                "hidden"
            );
        } else {
            dom.permissionMessage.classList.remove(
                "hidden"
            );
        }
    }


    /*
     * Re-apply Group Type visibility after permission
     * state changes.
     */
    updateGroupCategoryUI();
}


/* =========================================================
   GROUP RENDERING
   ========================================================= */

function renderGroup() {
    if (!currentGroup) {
        return;
    }

    const groupName =
        currentGroup.name ||
        "—";

    const category =
        currentGroup.category ||
        "—";

    const country =
        currentGroup.country ||
        "—";

    const monthlyAmount =
        currentGroup.monthly_contribution ??
        0;


    if (dom.groupNameDisplay) {
        dom.groupNameDisplay.textContent =
            groupName;
    }

    if (dom.groupCategoryDisplay) {
        dom.groupCategoryDisplay.textContent =
            category;
    }

    if (dom.groupCountryDisplay) {
        dom.groupCountryDisplay.textContent =
            country;
    }


    if (dom.groupName) {
        dom.groupName.value =
            currentGroup.name ||
            "";
    }


    /*
     * Handle both standard and custom group types.
     */
    renderGroupCategory(
        currentGroup.category
    );


    if (dom.groupCountry) {
        dom.groupCountry.value =
            currentGroup.country ||
            "Kenya";
    }

    if (dom.monthlyContribution) {
        dom.monthlyContribution.value =
            monthlyAmount;
    }


    if (dom.contextGroupName) {
        dom.contextGroupName.textContent =
            groupName;
    }

    if (dom.contextCountry) {
        dom.contextCountry.textContent =
            country;
    }
}


/* =========================================================
   LEADERSHIP SETUP
   ========================================================= */

function updateActualPositionNameUI() {
    const position =
        dom.adminActualPosition?.value
            ?.trim()
            .toLowerCase() ||
        "";

    const isOther =
        position === "other";


    if (
        dom.adminActualPositionNameField
    ) {
        dom.adminActualPositionNameField.hidden =
            !isOther;
    }


    if (
        !isOther &&
        dom.adminActualPositionName
    ) {
        dom.adminActualPositionName.value =
            "";
    }
}


/* =========================================================
   LEADERSHIP STATUS
   ========================================================= */

function renderLeadershipSetup() {
    const position =
        currentMember?.actual_position ||
        "";

    const positionName =
        currentMember?.actual_position_name ||
        "";


    if (dom.adminActualPosition) {
        const normalizedPosition =
            String(position)
                .trim()
                .toLowerCase();

        dom.adminActualPosition.value =
            ACTUAL_POSITION_VALUES.has(
                normalizedPosition
            )
                ? normalizedPosition
                : "";
    }


    if (dom.adminActualPositionName) {
        dom.adminActualPositionName.value =
            positionName;
    }


    updateActualPositionNameUI();


    const hasPosition =
        ACTUAL_POSITION_VALUES.has(
            String(position)
                .trim()
                .toLowerCase()
        );


    if (
        dom.leadershipSetupStatus
    ) {
        if (hasPosition) {
            const normalizedPosition =
                String(position)
                    .trim()
                    .toLowerCase();

            let displayPosition =
                normalizedPosition
                    .replaceAll(
                        "_",
                        " "
                    );

            displayPosition =
                displayPosition
                    .replace(
                        /\b\w/g,
                        (character) =>
                            character.toUpperCase()
                    );


            if (
                normalizedPosition ===
                "other" &&
                positionName
            ) {
                displayPosition =
                    positionName;
            }


            dom.leadershipSetupStatus.textContent =
                `Actual position recorded: ${displayPosition}.`;

            dom.leadershipSetupStatus.className =
                "leadership-status recorded";

        } else {
            dom.leadershipSetupStatus.textContent =
                "Your actual group position has not been recorded.";

            dom.leadershipSetupStatus.className =
                "leadership-status pending";
        }
    }
}


/* =========================================================
   LOAD LEADERSHIP SETUP
   ---------------------------------------------------------
   Read-only load.

   No direct write to actual_position or
   actual_position_name occurs here.
   ========================================================= */

async function loadLeadershipSetup() {
    if (
        !currentMember?.id ||
        !currentGroup?.id
    ) {
        return;
    }


    const {
        data,
        error
    } = await supabase
        .from("members")
        .select(
            "actual_position, actual_position_name, join_date"
        )
        .eq(
            "id",
            currentMember.id
        )
        .eq(
            "group_id",
            currentGroup.id
        )
        .maybeSingle();


    if (error) {
        console.error(
            "Failed to load leadership setup:",
            error
        );

        renderLeadershipSetup();

        return;
    }


    if (data) {
        currentMember = {
            ...currentMember,
            ...data
        };
    }


    renderLeadershipSetup();
}


/* =========================================================
   SAVE ADMIN ACTUAL POSITION
   ---------------------------------------------------------
   Canonical mutation boundary:

       set_member_actual_position(
           p_member_id,
           p_actual_position,
           p_actual_position_name,
           p_effective_from
       )

   IMPORTANT:
   - No direct UPDATE of members.actual_position.
   - No direct UPDATE of members.actual_position_name.
   - Initial effective date = currentMember.join_date.
   ========================================================= */

async function saveAdminActualPosition() {
    if (!canManageGroup) {
        showError(
            "You do not have permission to change the actual group position."
        );

        return;
    }


    if (
        !currentMember?.id ||
        !currentGroup?.id
    ) {
        showError(
            "No member or group context is available."
        );

        return;
    }


    const position =
        dom.adminActualPosition?.value
            ?.trim()
            .toLowerCase() ||
        "";

    const positionName =
        dom.adminActualPositionName?.value
            ?.trim() ||
        "";


    if (
        !ACTUAL_POSITION_VALUES.has(
            position
        )
    ) {
        showError(
            "Select a valid actual group position."
        );

        return;
    }


    if (
        position === "other" &&
        !positionName
    ) {
        showError(
            "Enter the name of the actual position."
        );

        return;
    }


    const effectiveFrom =
        currentMember.join_date ||
        null;


    if (!effectiveFrom) {
        showError(
            "The administrator's join date is required before recording the actual position."
        );

        return;
    }


    if (
        dom.saveAdminActualPosition
    ) {
        dom.saveAdminActualPosition.disabled =
            true;

        dom.saveAdminActualPosition.textContent =
            "Saving...";
    }


    clearMessages();


    try {
        const {
            data,
            error
        } = await supabase.rpc(
            "set_member_actual_position",
            {
                p_member_id:
                    currentMember.id,

                p_actual_position:
                    position,

                p_actual_position_name:
                    position === "other"
                        ? positionName
                        : null,

                p_effective_from:
                    effectiveFrom
            }
        );


        if (error) {
            throw error;
        }


        if (
            data &&
            typeof data === "object"
        ) {
            const returnedMember =
                data.member ||
                data;


            if (
                returnedMember &&
                typeof returnedMember ===
                    "object"
            ) {
                currentMember = {
                    ...currentMember,

                    ...(returnedMember.actual_position !==
                        undefined
                        ? {
                            actual_position:
                                returnedMember.actual_position
                        }
                        : {}),

                    ...(returnedMember.actual_position_name !==
                        undefined
                        ? {
                            actual_position_name:
                                returnedMember.actual_position_name
                        }
                        : {})
                };
            }
        }


        currentMember = {
            ...currentMember,

            actual_position:
                position,

            actual_position_name:
                position === "other"
                    ? positionName
                    : null
        };


        renderLeadershipSetup();


        showStatus(
            "Your actual group position was recorded successfully."
        );

    } catch (error) {
        console.error(
            "Failed to save actual group position:",
            error
        );


        showError(
            error?.message ||
            "Unable to save the actual group position."
        );

    } finally {
        if (
            dom.saveAdminActualPosition
        ) {
            dom.saveAdminActualPosition.disabled =
                !canManageGroup;

            dom.saveAdminActualPosition.textContent =
                "Save Actual Position";
        }
    }
}


/* =========================================================
   MEMBER COUNT
   ========================================================= */

async function loadMemberCount() {
    if (!currentGroup?.id) {
        return;
    }

    const {
        count,
        error
    } = await supabase
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
            currentGroup.id
        )
        .eq(
            "status",
            "active"
        );

    if (error) {
        console.error(
            "Failed to load member count:",
            error
        );

        if (dom.memberCountDisplay) {
            dom.memberCountDisplay.textContent =
                "—";
        }

        return;
    }

    if (dom.memberCountDisplay) {
        dom.memberCountDisplay.textContent =
            String(
                count ?? 0
            );
    }
}


/* =========================================================
   MONTHLY CONTRIBUTION CYCLE
   ========================================================= */

function getCurrentCycle(
    closingDay
) {
    const day =
        Number(closingDay);

    if (
        !Number.isInteger(day) ||
        day < 1 ||
        day > 28
    ) {
        return null;
    }

    const today =
        new Date();

    let closingYear =
        today.getFullYear();

    let closingMonth =
        today.getMonth();


    if (
        today.getDate() >
        day
    ) {
        closingMonth += 1;
    }


    const closingDate =
        new Date(
            closingYear,
            closingMonth,
            day
        );


    const openingDate =
        new Date(
            closingDate
        );

    openingDate.setDate(
        openingDate.getDate() - 29
    );


    return {
        openingDate,
        closingDate
    };
}


/* =========================================================
   CONTRIBUTION PREVIEW
   ========================================================= */

function updateContributionPreview() {
    if (!dom.monthlyClosingDay) {
        return;
    }

    const closingDay =
        Number(
            dom.monthlyClosingDay.value
        );

    const cycle =
        getCurrentCycle(
            closingDay
        );


    if (!cycle) {
        if (
            dom.currentContributionCycle
        ) {
            dom.currentContributionCycle.textContent =
                "—";
        }

        if (
            dom.currentContributionOpeningDate
        ) {
            dom.currentContributionOpeningDate.textContent =
                "—";
        }

        if (
            dom.currentContributionClosingDate
        ) {
            dom.currentContributionClosingDate.textContent =
                "—";
        }

        return;
    }


    if (
        dom.currentContributionCycle
    ) {
        dom.currentContributionCycle.textContent =
            formatDateRange(
                cycle.openingDate,
                cycle.closingDate
            );
    }


    if (
        dom.currentContributionOpeningDate
    ) {
        dom.currentContributionOpeningDate.textContent =
            formatDate(
                cycle.openingDate
            );
    }


    if (
        dom.currentContributionClosingDate
    ) {
        dom.currentContributionClosingDate.textContent =
            formatDate(
                cycle.closingDate
            );
    }
}


/* =========================================================
   SUBSCRIPTION
   ========================================================= */

async function loadSubscription() {
    if (!currentGroup?.id) {
        return;
    }

    const {
        data,
        error
    } = await supabase.rpc(
        "get_group_subscription",
        {
            p_group_id:
                currentGroup.id
        }
    );


    if (error) {
        console.error(
            "Failed to load group subscription:",
            error
        );

        subscription =
            null;

        renderSubscription();

        return;
    }


    if (Array.isArray(data)) {
        subscription =
            data.length > 0
                ? data[0]
                : null;
    } else {
        subscription =
            data;
    }


    renderSubscription();
}


function renderSubscription() {
    const value =
        subscription ||
        {};


    const status =
        value.status ||
        value.subscription_status ||
        "—";


    const plan =
        value.plan_name ||
        value.pricing_tier_code ||
        value.plan ||
        "—";


    const endDate =
        value.end_date ||
        value.current_period_end ||
        value.renewal_date ||
        null;


    const amount =
        value.amount ||
        value.monthly_amount ||
        value.standard_group_amount ||
        null;


    if (dom.subscriptionStatus) {
        dom.subscriptionStatus.textContent =
            String(status);
    }


    if (dom.subscriptionPlan) {
        dom.subscriptionPlan.textContent =
            String(plan);
    }


    if (dom.subscriptionEndDate) {
        dom.subscriptionEndDate.textContent =
            formatSubscriptionDate(
                endDate
            );
    }


    if (dom.subscriptionAmount) {
        dom.subscriptionAmount.textContent =
            formatSubscriptionAmount(
                amount
            );
    }
}


/* =========================================================
   MONTHLY CLOSING DAY OPTIONS
   ========================================================= */

function populateClosingDayOptions() {
    if (!dom.monthlyClosingDay) {
        return;
    }


    const existingValue =
        contributionSettings?.monthly_closing_day ??
        dom.monthlyClosingDay.value ??
        28;


    dom.monthlyClosingDay.innerHTML =
        "";


    for (
        let day = 1;
        day <= 28;
        day += 1
    ) {
        const option =
            document.createElement(
                "option"
            );

        option.value =
            String(day);

        option.textContent =
            String(day);

        dom.monthlyClosingDay.appendChild(
            option
        );
    }


    const normalized =
        Number(
            existingValue
        );


    dom.monthlyClosingDay.value =
        Number.isInteger(
            normalized
        ) &&
        normalized >= 1 &&
        normalized <= 28
            ? String(normalized)
            : "28";


    dom.monthlyClosingDay.disabled =
        false;

    dom.monthlyClosingDay.removeAttribute(
        "disabled"
    );

    dom.monthlyClosingDay.removeAttribute(
        "aria-disabled"
    );


    updateContributionPreview();
}


/* =========================================================
   CONTRIBUTION SETTINGS
   ========================================================= */

async function loadContributionSettings() {
    if (!currentGroup?.id) {
        return;
    }


    const {
        data,
        error
    } = await supabase.rpc(
        "get_group_contribution_settings",
        {
            p_group_id:
                currentGroup.id
        }
    );


    if (error) {
        console.error(
            "Failed to load contribution settings:",
            error
        );


        contributionSettings = {
            monthly_closing_day:
                28
        };


        populateClosingDayOptions();

        return;
    }


    if (Array.isArray(data)) {
        contributionSettings =
            data.length > 0
                ? data[0]
                : {
                    monthly_closing_day:
                        28
                };
    } else {
        contributionSettings =
            data || {
                monthly_closing_day:
                    28
            };
    }


    populateClosingDayOptions();
}


function renderContributionSettings() {
    populateClosingDayOptions();
}


/* =========================================================
   SAVE CONTRIBUTION SETTINGS
   ========================================================= */

async function saveContributionSettings() {
    if (!canManageGroup) {
        showError(
            "You do not have permission to change the contribution cycle."
        );

        return;
    }


    if (!currentGroup?.id) {
        showError(
            "No group is available."
        );

        return;
    }


    const closingDay =
        Number(
            dom.monthlyClosingDay?.value
        );


    if (
        !Number.isInteger(
            closingDay
        ) ||
        closingDay < 1 ||
        closingDay > 28
    ) {
        showError(
            "Choose a monthly closing day from 1 to 28."
        );

        return;
    }


    if (
        dom.saveContributionCalendar
    ) {
        dom.saveContributionCalendar.disabled =
            true;

        dom.saveContributionCalendar.textContent =
            "Saving...";
    }


    clearMessages();


    try {
        const {
            error
        } = await supabase.rpc(
            "update_group_contribution_settings",
            {
                p_group_id:
                    currentGroup.id,

                p_monthly_closing_day:
                    closingDay
            }
        );


        if (error) {
            throw error;
        }


        contributionSettings = {
            ...(contributionSettings || {}),

            monthly_closing_day:
                closingDay
        };


        renderContributionSettings();


        showStatus(
            "Contribution cycle updated successfully."
        );

    } catch (error) {
        console.error(
            "Failed to save contribution settings:",
            error
        );


        showError(
            error?.message ||
            "Unable to update the contribution cycle."
        );

    } finally {
        if (dom.monthlyClosingDay) {
            dom.monthlyClosingDay.disabled =
                false;

            dom.monthlyClosingDay.removeAttribute(
                "disabled"
            );

            dom.monthlyClosingDay.removeAttribute(
                "aria-disabled"
            );
        }


        if (
            dom.saveContributionCalendar
        ) {
            dom.saveContributionCalendar.disabled =
                !canManageGroup;

            dom.saveContributionCalendar.textContent =
                "Save Contribution Cycle";
        }
    }
}


/* =========================================================
   SAVE GROUP
   ========================================================= */

async function saveGroup() {
    if (!canManageGroup) {
        showError(
            "You do not have permission to update group information."
        );

        return;
    }


    if (!currentGroup?.id) {
        showError(
            "No group is available."
        );

        return;
    }


    const name =
        dom.groupName?.value.trim();


    const categoryValidation =
        validateGroupCategory();


    const country =
        dom.groupCountry?.value.trim();


    const monthlyContribution =
        Number(
            dom.monthlyContribution?.value
        );


    if (!name) {
        showError(
            "Group name is required."
        );

        return;
    }


    if (!categoryValidation.valid) {
        showError(
            categoryValidation.message
        );

        return;
    }


    if (!country) {
        showError(
            "Country is required."
        );

        return;
    }


    if (
        !Number.isFinite(
            monthlyContribution
        ) ||
        monthlyContribution < 0
    ) {
        showError(
            "Enter a valid monthly contribution amount."
        );

        return;
    }


    if (dom.saveGroup) {
        dom.saveGroup.disabled =
            true;

        dom.saveGroup.textContent =
            "Saving...";
    }


    clearMessages();


    try {
        const {
            data,
            error
        } = await supabase
            .from("groups")
            .update({
                name,

                /*
                 * Existing schema contract:
                 * Group Type → groups.category
                 */
                category:
                    categoryValidation.value,

                country,

                monthly_contribution:
                    monthlyContribution
            })
            .eq(
                "id",
                currentGroup.id
            )
            .select()
            .single();


        if (error) {
            throw error;
        }


        currentGroup = {
            ...currentGroup,

            ...(data || {}),

            name,

            category:
                categoryValidation.value,

            country,

            monthly_contribution:
                monthlyContribution
        };


        renderGroup();


        showStatus(
            "Group information updated successfully."
        );

    } catch (error) {
        console.error(
            "Failed to save group:",
            error
        );


        showError(
            error?.message ||
            "Unable to update group information."
        );

    } finally {
        if (dom.saveGroup) {
            dom.saveGroup.disabled =
                !canManageGroup;

            dom.saveGroup.textContent =
                "Save Group Information";
        }
    }
}


/* =========================================================
   EVENT HANDLERS
   ========================================================= */

function bindEvents() {
    if (eventsBound) {
        return;
    }

    eventsBound = true;


    /* ------------------------------------------------------
       GROUP INFORMATION
       ------------------------------------------------------ */

    if (dom.groupForm) {
        dom.groupForm.addEventListener(
            "submit",
            async (event) => {
                event.preventDefault();

                await saveGroup();
            }
        );
    }


    if (dom.groupCategory) {
        dom.groupCategory.addEventListener(
            "change",
            () => {
                updateGroupCategoryUI();
            }
        );
    }


    /* ------------------------------------------------------
       LEADERSHIP SETUP
       ------------------------------------------------------ */

    if (
        dom.adminActualPosition
    ) {
        dom.adminActualPosition.addEventListener(
            "change",
            () => {
                updateActualPositionNameUI();
            }
        );
    }


    if (
        dom.saveAdminActualPosition
    ) {
        dom.saveAdminActualPosition.addEventListener(
            "click",
            async () => {
                await saveAdminActualPosition();
            }
        );
    }


    if (
        dom.addInitialOfficerLink
    ) {
        dom.addInitialOfficerLink.addEventListener(
            "click",
            (event) => {
                if (!canManageGroup) {
                    event.preventDefault();

                    showError(
                        "You do not have permission to add initial officers."
                    );
                }
            }
        );
    }


    /* ------------------------------------------------------
       CONTRIBUTION CALENDAR
       ------------------------------------------------------ */

    if (
        dom.contributionCalendarForm
    ) {
        dom.contributionCalendarForm.addEventListener(
            "submit",
            async (event) => {
                event.preventDefault();

                await saveContributionSettings();
            }
        );
    }


    if (dom.monthlyClosingDay) {
        dom.monthlyClosingDay.addEventListener(
            "change",
            () => {
                updateContributionPreview();
            }
        );
    }
}


/* =========================================================
   INITIALIZATION
   ---------------------------------------------------------
   BOOT OWNERSHIP
   ---------------------------------------------------------
   admin-layout.js is the sole page-shell boot owner.

   This module:
   - exports initGroupManagement()
   - does not call itself at module scope
   - binds events once
   - protects repeated initialization with
     initializationPromise
   ========================================================= */

export async function initGroupManagement() {
    if (initializationPromise) {
        return initializationPromise;
    }


    initializationPromise =
        (async () => {
            clearMessages();


            try {
                /*
                 * Bind page events exactly once.
                 */
                bindEvents();


                /*
                 * Load authentication context.
                 */
                await loadAuthorizationContext();


                /*
                 * Render group.
                 */
                renderGroup();


                /*
                 * Load and render administrator
                 * actual-position state.
                 */
                await loadLeadershipSetup();


                /*
                 * Apply permissions.
                 */
                applyAuthorizationUI();


                /*
                 * Load remaining data.
                 */
                await Promise.all([
                    loadMemberCount(),
                    loadSubscription(),
                    loadContributionSettings()
                ]);


                renderContributionSettings();


                /*
                 * Apply permissions one final time.
                 *
                 * The closing-day selector is explicitly
                 * kept enabled by applyAuthorizationUI().
                 */
                applyAuthorizationUI();


                if (dom.adminLoading) {
                    dom.adminLoading.classList.add(
                        "hidden"
                    );
                }


                if (
                    dom.managementContent
                ) {
                    dom.managementContent.classList.remove(
                        "hidden"
                    );
                }

            } catch (error) {
                console.error(
                    "Group management initialization failed:",
                    error
                );


                if (dom.adminLoading) {
                    dom.adminLoading.textContent =
                        "Unable to load group management.";
                }


                showError(
                    error?.message ||
                    "Unable to load group management."
                );
            }
        })();


    return initializationPromise;
}


/* =========================================================
   NO MODULE-LEVEL AUTO-BOOT
   ---------------------------------------------------------
   admin-layout.js calls initGroupManagement().
   ========================================================= */

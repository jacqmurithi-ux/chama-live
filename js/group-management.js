/*
 * ================================================================
 * CHAMA LIVE — GROUP MANAGEMENT
 * ================================================================
 *
 * Responsibilities:
 *
 * - Load authenticated group management context.
 * - Display group information and management permissions.
 * - Allow authorized users to update group information.
 * - Support standard and custom group types through groups.category.
 * - Manage the administrator's actual group position.
 * - Preserve the separation between:
 *      system/application role
 *      actual group position
 * - Manage the monthly contribution closing day.
 * - Display contribution configuration.
 * - Display subscription/account information.
 *
 * IMPORTANT:
 *
 * - admin-layout.js is the sole page-shell boot owner.
 * - This module does NOT auto-boot.
 * - Actual member positions are changed only through the
 *   canonical set_member_actual_position(...) RPC.
 * - No direct writes to actual_position or actual_position_name.
 * - Monthly contribution-cycle selector remains interactive.
 * - Group Type "Other" stores the administrator's custom
 *   group type directly in groups.category.
 * - Contribution configuration added here is READ ONLY.
 * - No direct accounting-table writes are performed by this module.
 *
 * ================================================================
 */

import {
    supabase,
    getMyApplicationContext
} from "./auth.js";


/* ================================================================
   CONSTANTS
================================================================ */

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


const STANDARD_GROUP_TYPES = new Map([
    ["chama", "Chama"],
    ["cbo", "CBO"]
]);


/* ================================================================
   PAGE STATE
================================================================ */

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let currentIsOwner = false;
let currentRole = null;
let canManageGroup = false;

let subscription = null;
let contributionSettings = null;

/*
 * Contribution configuration is intentionally read-only in this
 * first integration gate.
 */
let contributionTypes = [];
let contributionInitiatives = [];
let fineRules = [];

let initializationPromise = null;
let eventsBound = false;


/* ================================================================
   DOM REFERENCES
================================================================ */

const dom = {

    statusMessage:
        document.getElementById("statusMessage"),

    errorMessage:
        document.getElementById("errorMessage"),

    adminLoading:
        document.getElementById("adminLoading"),

    managementContent:
        document.getElementById("managementContent"),

    permissionMessage:
        document.getElementById("permissionMessage"),


    /* ------------------------------------------------------------
       GROUP OVERVIEW
    ------------------------------------------------------------ */

    groupNameDisplay:
        document.getElementById("groupNameDisplay"),

    groupCategoryDisplay:
        document.getElementById("groupCategoryDisplay"),

    groupCountryDisplay:
        document.getElementById("groupCountryDisplay"),

    memberCountDisplay:
        document.getElementById("memberCountDisplay"),

    permissionBadge:
        document.getElementById("permissionBadge"),


    /* ------------------------------------------------------------
       GROUP FORM
    ------------------------------------------------------------ */

    groupForm:
        document.getElementById("groupForm"),

    groupName:
        document.getElementById("groupName"),

    groupCategory:
        document.getElementById("groupCategory"),

    groupCategoryOtherField:
        document.getElementById("groupCategoryOtherField"),

    groupCategoryOther:
        document.getElementById("groupCategoryOther"),

    groupCountry:
        document.getElementById("groupCountry"),

    monthlyContribution:
        document.getElementById("monthlyContribution"),

    saveGroup:
        document.getElementById("saveGroup"),


    /* ------------------------------------------------------------
       LEADERSHIP
    ------------------------------------------------------------ */

    leadershipSetupCard:
        document.getElementById("leadershipSetupCard"),

    leadershipSetupStatus:
        document.getElementById("leadershipSetupStatus"),

    adminActualPosition:
        document.getElementById("adminActualPosition"),

    adminActualPositionNameField:
        document.getElementById("adminActualPositionNameField"),

    adminActualPositionName:
        document.getElementById("adminActualPositionName"),

    saveAdminActualPosition:
        document.getElementById("saveAdminActualPosition"),

    addInitialOfficerLink:
        document.getElementById("addInitialOfficerLink"),


    /* ------------------------------------------------------------
       CONTRIBUTION CALENDAR
    ------------------------------------------------------------ */

    contributionCalendarForm:
        document.getElementById("contributionCalendarForm"),

    monthlyClosingDay:
        document.getElementById("monthlyClosingDay"),

    saveContributionCalendar:
        document.getElementById("saveContributionCalendar"),

    currentContributionCycle:
        document.getElementById("currentContributionCycle"),

    currentContributionOpeningDate:
        document.getElementById("currentContributionOpeningDate"),

    currentContributionClosingDate:
        document.getElementById("currentContributionClosingDate"),


    /* ------------------------------------------------------------
       CONTRIBUTION CONFIGURATION — READ ONLY
    ------------------------------------------------------------ */

    contributionTypesList:
        document.getElementById("contributionTypesList"),

    contributionInitiativesList:
        document.getElementById("contributionInitiativesList"),

    fineRulesList:
        document.getElementById("fineRulesList"),


    /* ------------------------------------------------------------
       SUBSCRIPTION
    ------------------------------------------------------------ */

    subscriptionPanel:
        document.getElementById("subscriptionPanel"),

    subscriptionStatus:
        document.getElementById("subscriptionStatus"),

    subscriptionPlan:
        document.getElementById("subscriptionPlan"),

    subscriptionEndDate:
        document.getElementById("subscriptionEndDate"),

    subscriptionAmount:
        document.getElementById("subscriptionAmount"),


    /* ------------------------------------------------------------
       GROUP CONTEXT
    ------------------------------------------------------------ */

    contextGroupName:
        document.getElementById("contextGroupName"),

    contextRole:
        document.getElementById("contextRole"),

    contextAccess:
        document.getElementById("contextAccess"),

    contextCountry:
        document.getElementById("contextCountry")
};


/* ================================================================
   MESSAGE HELPERS
================================================================ */

function clearMessages() {

    if (dom.statusMessage) {
        dom.statusMessage.textContent = "";
        dom.statusMessage.className = "status-message";
    }

    if (dom.errorMessage) {
        dom.errorMessage.textContent = "";
        dom.errorMessage.className = "status-message error";
    }
}


function showStatus(message, type = "success") {

    if (!dom.statusMessage) {
        return;
    }

    dom.statusMessage.textContent = message;

    dom.statusMessage.className =
        `status-message ${type} visible`;
}


function showError(message) {

    if (!dom.errorMessage) {
        return;
    }

    dom.errorMessage.textContent = message;

    dom.errorMessage.className =
        "status-message error visible";
}


/* ================================================================
   GENERAL HELPERS
================================================================ */

function normalizeValue(value) {

    return String(value ?? "").trim();
}


function normalizeLower(value) {

    return normalizeValue(value).toLowerCase();
}


function formatDate(value) {

    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleDateString(
        undefined,
        {
            year: "numeric",
            month: "short",
            day: "numeric"
        }
    );
}


/* ================================================================
   AUTHORIZATION
================================================================ */

function calculateManagementAccess() {

    const role =
        normalizeLower(currentRole);

    currentRole =
        role || null;

    canManageGroup =
        Boolean(
            currentIsOwner ||
            role === "owner" ||
            role === "admin" ||
            role === "administrator"
        );

    return canManageGroup;
}


function applyAuthorizationUI() {

    calculateManagementAccess();


    if (dom.permissionBadge) {

        dom.permissionBadge.textContent =
            canManageGroup
                ? "Management access"
                : "View only";
    }


    if (dom.permissionMessage) {

        dom.permissionMessage.classList.toggle(
            "hidden",
            canManageGroup
        );
    }


    if (dom.groupName) {
        dom.groupName.disabled =
            !canManageGroup;
    }

    if (dom.groupCategory) {
        dom.groupCategory.disabled =
            !canManageGroup;
    }

    if (dom.groupCategoryOther) {
        dom.groupCategoryOther.disabled =
            !canManageGroup;
    }

    if (dom.groupCountry) {
        dom.groupCountry.disabled =
            !canManageGroup;
    }

    if (dom.monthlyContribution) {
        dom.monthlyContribution.disabled =
            !canManageGroup;
    }

    if (dom.saveGroup) {
        dom.saveGroup.disabled =
            !canManageGroup;
    }


    if (dom.adminActualPosition) {
        dom.adminActualPosition.disabled =
            !canManageGroup;
    }

    if (dom.adminActualPositionName) {
        dom.adminActualPositionName.disabled =
            !canManageGroup;
    }

    if (dom.saveAdminActualPosition) {
        dom.saveAdminActualPosition.disabled =
            !canManageGroup;
    }


    /*
     * IMPORTANT:
     *
     * The monthly closing-day selector remains openable.
     * Permission is enforced when saving.
     */
    if (dom.monthlyClosingDay) {
        dom.monthlyClosingDay.disabled = false;
    }

    if (dom.saveContributionCalendar) {
        dom.saveContributionCalendar.disabled =
            !canManageGroup;
    }
}


/* ================================================================
   GROUP TYPE HELPERS
================================================================ */

/*
 * Finds the actual <option value=""> used by the HTML select.
 *
 * This allows the JavaScript to work whether the HTML values
 * are "Chama", "CBO", "Other" or lowercase equivalents.
 */
function findGroupCategoryOptionValue(value) {

    if (!dom.groupCategory) {
        return "";
    }

    const target =
        normalizeLower(value);

    const option =
        Array.from(
            dom.groupCategory.options
        ).find(
            option =>
                normalizeLower(option.value) === target
        );

    return option
        ? option.value
        : "";
}


/*
 * Sets the Group Type select without assuming
 * the exact case of its option values.
 */
function setGroupCategorySelect(value) {

    if (!dom.groupCategory) {
        return;
    }

    const optionValue =
        findGroupCategoryOptionValue(value);

    dom.groupCategory.value =
        optionValue;
}


/*
 * Shows or hides the custom group-type field.
 *
 * "Other" is a UI choice only.
 * The database stores the actual custom group type
 * directly in groups.category.
 */
function updateGroupCategoryUI() {

    if (!dom.groupCategory) {
        return;
    }

    const selected =
        normalizeLower(
            dom.groupCategory.value
        );

    const isOther =
        selected === "other";


    if (dom.groupCategoryOtherField) {

        dom.groupCategoryOtherField.hidden =
            !isOther;
    }


    if (dom.groupCategoryOther) {

        dom.groupCategoryOther.required =
            isOther;

        if (!isOther) {
            dom.groupCategoryOther.value = "";
        }
    }
}


/*
 * Loads the existing groups.category value into the form.
 *
 * Standard:
 *     Chama
 *     CBO
 *
 * Anything else:
 *     Other + existing value in custom field
 */
function renderGroupCategoryFields() {

    if (!dom.groupCategory) {
        return;
    }

    const category =
        normalizeValue(
            currentGroup?.category
        );

    const normalized =
        normalizeLower(category);


    const isStandard =
        STANDARD_GROUP_TYPES.has(
            normalized
        );


    if (!category) {

        setGroupCategorySelect("");

        if (dom.groupCategoryOther) {
            dom.groupCategoryOther.value = "";
        }

        updateGroupCategoryUI();

        return;
    }


    if (isStandard) {

        setGroupCategorySelect(
            STANDARD_GROUP_TYPES.get(normalized)
        );

        if (dom.groupCategoryOther) {
            dom.groupCategoryOther.value = "";
        }

    } else {

        setGroupCategorySelect("Other");

        /*
         * "Other" itself is not a valid custom category.
         * If an old row contains exactly "Other", leave the
         * custom field empty so the administrator can specify it.
         */
        if (dom.groupCategoryOther) {

            dom.groupCategoryOther.value =
                normalized === "other"
                    ? ""
                    : category;
        }
    }


    updateGroupCategoryUI();
}


/*
 * Converts the form selection into the actual value that
 * should be stored in groups.category.
 */
function getGroupCategoryForSave() {

    const selected =
        normalizeLower(
            dom.groupCategory?.value
        );


    if (selected === "chama") {

        return {
            valid: true,
            value: "Chama"
        };
    }


    if (selected === "cbo") {

        return {
            valid: true,
            value: "CBO"
        };
    }


    if (selected === "other") {

        const custom =
            normalizeValue(
                dom.groupCategoryOther?.value
            );

        if (!custom) {

            return {
                valid: false,
                message:
                    "Please specify the group type when \"Other\" is selected."
            };
        }


        return {
            valid: true,
            value: custom
        };
    }


    return {
        valid: false,
        message:
            "Please select a group type."
    };
}


/* ================================================================
   GROUP RENDERING
================================================================ */

function renderGroup() {

    if (!currentGroup) {
        return;
    }


    const name =
        normalizeValue(
            currentGroup.name
        ) || "—";


    const category =
        normalizeValue(
            currentGroup.category
        ) || "—";


    const country =
        normalizeValue(
            currentGroup.country
        ) || "—";


    const monthlyContribution =
        Number(
            currentGroup.monthly_contribution
        );


    if (dom.groupNameDisplay) {

        dom.groupNameDisplay.textContent =
            name;
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
            currentGroup.name || "";
    }


    if (dom.groupCountry) {

        dom.groupCountry.value =
            currentGroup.country || "";
    }


    if (dom.monthlyContribution) {

        dom.monthlyContribution.value =
            Number.isFinite(monthlyContribution)
                ? monthlyContribution
                : 0;
    }


    renderGroupCategoryFields();


    if (dom.contextGroupName) {

        dom.contextGroupName.textContent =
            name;
    }


    if (dom.contextRole) {

        dom.contextRole.textContent =
            currentRole || "—";
    }


    if (dom.contextAccess) {

        dom.contextAccess.textContent =
            canManageGroup
                ? "Group management"
                : "View only";
    }


    if (dom.contextCountry) {

        dom.contextCountry.textContent =
            country;
    }
}


/* ================================================================
   LEADERSHIP
================================================================ */

function updateActualPositionNameUI() {

    if (!dom.adminActualPosition) {
        return;
    }

    const selected =
        normalizeLower(
            dom.adminActualPosition.value
        );

    const needsCustomName =
        selected === "other";


    if (dom.adminActualPositionNameField) {

        dom.adminActualPositionNameField.hidden =
            !needsCustomName;
    }


    if (dom.adminActualPositionName) {

        dom.adminActualPositionName.required =
            needsCustomName;

        if (!needsCustomName) {
            dom.adminActualPositionName.value = "";
        }
    }
}


function renderLeadershipSetup(positionData) {

    if (!positionData) {

        if (dom.leadershipSetupStatus) {

            dom.leadershipSetupStatus.textContent =
                "Your actual group position has not been recorded.";

            dom.leadershipSetupStatus.className =
                "leadership-status pending";
        }

        return;
    }


    const actualPosition =
        normalizeLower(
            positionData.actual_position
        );


    const actualPositionName =
        normalizeValue(
            positionData.actual_position_name
        );


    if (dom.adminActualPosition) {

        dom.adminActualPosition.value =
            ACTUAL_POSITION_VALUES.has(
                actualPosition
            )
                ? actualPosition
                : "";
    }


    if (dom.adminActualPositionName) {

        dom.adminActualPositionName.value =
            actualPositionName;
    }


    updateActualPositionNameUI();


    if (dom.leadershipSetupStatus) {

        if (actualPosition) {

            let displayPosition =
                actualPosition.replace(
                    /_/g,
                    " "
                );

            displayPosition =
                displayPosition.replace(
                    /\b\w/g,
                    character =>
                        character.toUpperCase()
                );


            if (
                actualPosition === "other" &&
                actualPositionName
            ) {

                displayPosition =
                    actualPositionName;
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
        throw error;
    }


    renderLeadershipSetup(
        data || {
            actual_position: null,
            actual_position_name: null,
            join_date: currentMember.join_date
        }
    );
}


async function saveAdminActualPosition() {

    clearMessages();


    if (!canManageGroup) {

        showError(
            "You do not have permission to update your actual position."
        );

        return;
    }


    if (
        !currentMember?.id ||
        !currentGroup?.id
    ) {

        showError(
            "Your member context is unavailable."
        );

        return;
    }


    const actualPosition =
        normalizeLower(
            dom.adminActualPosition?.value
        );


    if (
        !actualPosition ||
        !ACTUAL_POSITION_VALUES.has(
            actualPosition
        )
    ) {

        showError(
            "Please select your actual group position."
        );

        return;
    }


    let actualPositionName = null;


    if (actualPosition === "other") {

        actualPositionName =
            normalizeValue(
                dom.adminActualPositionName?.value
            );


        if (!actualPositionName) {

            showError(
                "Please enter the name of the actual position."
            );

            return;
        }
    }


    if (dom.saveAdminActualPosition) {
        dom.saveAdminActualPosition.disabled = true;
    }


    try {

        const effectiveFrom =
            currentMember.join_date ||
            new Date().toISOString().slice(0, 10);


        const {
            error
        } = await supabase.rpc(
            "set_member_actual_position",
            {
                p_member_id:
                    currentMember.id,

                p_actual_position:
                    actualPosition,

                p_actual_position_name:
                    actualPositionName,

                p_effective_from:
                    effectiveFrom
            }
        );


        if (error) {
            throw error;
        }


        await loadLeadershipSetup();


        showStatus(
            "Your actual group position has been saved.",
            "success"
        );

    } catch (error) {

        console.error(
            "Failed to save actual position:",
            error
        );

        showError(
            error?.message ||
            "Unable to save your actual group position."
        );

    } finally {

        if (dom.saveAdminActualPosition) {

            dom.saveAdminActualPosition.disabled =
                !canManageGroup;
        }
    }
}


/* ================================================================
   MEMBER COUNT
================================================================ */

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
        );


    if (error) {
        throw error;
    }


    if (dom.memberCountDisplay) {

        dom.memberCountDisplay.textContent =
            Number.isFinite(count)
                ? String(count)
                : "0";
    }
}


/* ================================================================
   CONTRIBUTION CYCLE
================================================================ */

function getCurrentCycle(closingDay) {

    const day =
        Math.min(
            Math.max(
                Number(closingDay) || 28,
                1
            ),
            28
        );


    const today =
        new Date();


    const year =
        today.getFullYear();


    const month =
        today.getMonth();


    const currentMonthClosing =
        new Date(
            year,
            month,
            day
        );


    let cycleYear =
        year;

    let cycleMonth =
        month;


    if (today > currentMonthClosing) {

        cycleMonth += 1;

        if (cycleMonth > 11) {

            cycleMonth = 0;
            cycleYear += 1;
        }
    }


    const closingDate =
        new Date(
            cycleYear,
            cycleMonth,
            day
        );


    const openingDate =
        new Date(
            cycleYear,
            cycleMonth - 1,
            day + 1
        );


    return {
        cycleYear,
        cycleMonth,
        openingDate,
        closingDate
    };
}


function formatCycleMonth(year, month) {

    const date =
        new Date(
            year,
            month,
            1
        );


    return date.toLocaleDateString(
        undefined,
        {
            year: "numeric",
            month: "long"
        }
    );
}


function updateContributionPreview() {

    const closingDay =
        Number(
            dom.monthlyClosingDay?.value
        );


    if (!closingDay) {
        return;
    }


    const {
        cycleYear,
        cycleMonth,
        openingDate,
        closingDate
    } =
        getCurrentCycle(
            closingDay
        );


    if (dom.currentContributionCycle) {

        dom.currentContributionCycle.textContent =
            formatCycleMonth(
                cycleYear,
                cycleMonth
            );
    }


    if (dom.currentContributionOpeningDate) {

        dom.currentContributionOpeningDate.textContent =
            formatDate(
                openingDate
            );
    }


    if (dom.currentContributionClosingDate) {

        dom.currentContributionClosingDate.textContent =
            formatDate(
                closingDate
            );
    }
}


function populateClosingDayOptions(selectedDay) {

    if (!dom.monthlyClosingDay) {
        return;
    }


    dom.monthlyClosingDay.innerHTML = "";


    for (let day = 1; day <= 28; day += 1) {

        const option =
            document.createElement("option");

        option.value =
            String(day);

        option.textContent =
            String(day);

        if (
            Number(selectedDay) === day
        ) {
            option.selected = true;
        }

        dom.monthlyClosingDay.appendChild(
            option
        );
    }


    /*
     * IMPORTANT:
     *
     * Never disable this selector.
     * Permission is enforced only on save.
     */
    dom.monthlyClosingDay.disabled = false;


    updateContributionPreview();
}


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
        throw error;
    }


    contributionSettings =
        Array.isArray(data)
            ? data[0] || null
            : data || null;


    const closingDay =
        Number(
            contributionSettings?.monthly_closing_day
        ) || 28;


    populateClosingDayOptions(
        closingDay
    );
}


async function saveContributionSettings() {

    clearMessages();


    if (!canManageGroup) {

        showError(
            "You do not have permission to update the contribution cycle."
        );

        return;
    }


    const closingDay =
        Number(
            dom.monthlyClosingDay?.value
        );


    if (
        !Number.isInteger(closingDay) ||
        closingDay < 1 ||
        closingDay > 28
    ) {

        showError(
            "Please select a valid closing day from 1 to 28."
        );

        return;
    }


    if (dom.saveContributionCalendar) {
        dom.saveContributionCalendar.disabled = true;
    }


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


        await loadContributionSettings();


        showStatus(
            "Contribution cycle settings saved.",
            "success"
        );

    } catch (error) {

        console.error(
            "Failed to save contribution settings:",
            error
        );

        showError(
            error?.message ||
            "Unable to save contribution cycle settings."
        );

    } finally {

        /*
         * Selector remains openable even after an error.
         */
        if (dom.monthlyClosingDay) {
            dom.monthlyClosingDay.disabled = false;
        }

        if (dom.saveContributionCalendar) {

            dom.saveContributionCalendar.disabled =
                !canManageGroup;
        }
    }
}


/* ================================================================
   CONTRIBUTION CONFIGURATION — READ ONLY
================================================================ */

/*
 * These helpers intentionally render textContent rather than
 * inserting HTML. This keeps this first integration pass
 * presentation-only and avoids introducing HTML injection paths.
 */

function appendEmptyState(container, message) {

    if (!container) {
        return;
    }

    const item =
        document.createElement("div");

    item.className =
        "management-list-empty";

    item.textContent =
        message;

    container.appendChild(
        item
    );
}


function appendTextRow(
    container,
    label,
    value
) {

    const row =
        document.createElement("div");

    row.className =
        "management-list-row";

    const labelElement =
        document.createElement("strong");

    labelElement.textContent =
        label;

    const valueElement =
        document.createElement("span");

    valueElement.textContent =
        value;

    row.append(
        labelElement,
        valueElement
    );

    container.appendChild(
        row
    );
}


/* ---------------------------------------------------------------
   CONTRIBUTION TYPES
---------------------------------------------------------------- */

function renderContributionTypes() {

    const container =
        dom.contributionTypesList;

    if (!container) {
        return;
    }

    container.replaceChildren();


    if (!contributionTypes.length) {

        appendEmptyState(
            container,
            "No contribution types are configured."
        );

        return;
    }


    contributionTypes.forEach(
        type => {

            const item =
                document.createElement("div");

            item.className =
                "management-list-item";


            appendTextRow(
                item,
                "Name",
                normalizeValue(
                    type.name
                ) || "—"
            );


            if (
                normalizeValue(
                    type.code
                )
            ) {

                appendTextRow(
                    item,
                    "Code",
                    normalizeValue(
                        type.code
                    )
                );
            }


            container.appendChild(
                item
            );
        }
    );
}


async function loadContributionTypes() {

    if (!currentGroup?.id) {
        return;
    }


    const {
        data,
        error
    } = await supabase
        .from("contribution_types")
        .select(
            "id, name, code, created_at"
        )
        .eq(
            "group_id",
            currentGroup.id
        )
        .order(
            "created_at",
            {
                ascending: true
            }
        );


    if (error) {
        throw error;
    }


    contributionTypes =
        Array.isArray(data)
            ? data
            : [];


    renderContributionTypes();
}


/* ---------------------------------------------------------------
   CONTRIBUTION INITIATIVES
---------------------------------------------------------------- */

function renderContributionInitiatives() {

    const container =
        dom.contributionInitiativesList;

    if (!container) {
        return;
    }

    container.replaceChildren();


    if (!contributionInitiatives.length) {

        appendEmptyState(
            container,
            "No contribution initiatives are configured."
        );

        return;
    }


    contributionInitiatives.forEach(
        initiative => {

            const item =
                document.createElement("div");

            item.className =
                "management-list-item";


            appendTextRow(
                item,
                "Name",
                normalizeValue(
                    initiative.name
                ) || "—"
            );


            appendTextRow(
                item,
                "Status",
                normalizeValue(
                    initiative.status
                ) || "—"
            );


            appendTextRow(
                item,
                "Frequency",
                normalizeValue(
                    initiative.frequency
                ) || "—"
            );


            appendTextRow(
                item,
                "Start",
                formatDate(
                    initiative.start_date
                )
            );


            appendTextRow(
                item,
                "Closing",
                formatDate(
                    initiative.closing_date
                )
            );


            if (
                initiative.default_amount !== null &&
                initiative.default_amount !== undefined
            ) {

                appendTextRow(
                    item,
                    "Default amount",
                    String(
                        initiative.default_amount
                    )
                );
            }


            container.appendChild(
                item
            );
        }
    );
}


async function loadContributionInitiatives() {

    if (!currentGroup?.id) {
        return;
    }


    const {
        data,
        error
    } = await supabase
        .from("contribution_initiatives")
        .select(
            [
                "id",
                "contribution_type_id",
                "name",
                "description",
                "start_date",
                "closing_date",
                "default_amount",
                "frequency",
                "status",
                "created_at",
                "updated_at"
            ].join(", ")
        )
        .eq(
            "group_id",
            currentGroup.id
        )
        .order(
            "created_at",
            {
                ascending: false
            }
        );


    if (error) {
        throw error;
    }


    contributionInitiatives =
        Array.isArray(data)
            ? data
            : [];


    renderContributionInitiatives();
}


/* ---------------------------------------------------------------
   FINE RULES
---------------------------------------------------------------- */

function renderFineRules() {

    const container =
        dom.fineRulesList;

    if (!container) {
        return;
    }

    container.replaceChildren();


    if (!fineRules.length) {

        appendEmptyState(
            container,
            "No fine rules are visible for your account."
        );

        return;
    }


    fineRules.forEach(
        rule => {

            const item =
                document.createElement("div");

            item.className =
                "management-list-item";


            appendTextRow(
                item,
                "Name",
                normalizeValue(
                    rule.name
                ) || "—"
            );


            appendTextRow(
                item,
                "Trigger",
                normalizeValue(
                    rule.trigger_type
                ) || "—"
            );


            appendTextRow(
                item,
                "Calculation",
                normalizeValue(
                    rule.calculation_method
                ) || "—"
            );


            appendTextRow(
                item,
                "Priority",
                rule.priority === null ||
                rule.priority === undefined
                    ? "—"
                    : String(
                        rule.priority
                    )
            );


            appendTextRow(
                item,
                "Status",
                normalizeValue(
                    rule.status
                ) || "—"
            );


            container.appendChild(
                item
            );
        }
    );
}


async function loadFineRules() {

    if (!currentGroup?.id) {
        return;
    }


    const {
        data,
        error
    } = await supabase
        .from("fine_rules")
        .select(
            [
                "id",
                "name",
                "description",
                "trigger_type",
                "specificity_level",
                "priority",
                "calculation_method",
                "fixed_amount",
                "percentage_rate",
                "minimum_amount",
                "maximum_amount",
                "grace_period_value",
                "grace_period_unit",
                "applicability_mode",
                "effective_from",
                "effective_until",
                "status",
                "created_at"
            ].join(", ")
        )
        .eq(
            "group_id",
            currentGroup.id
        )
        .order(
            "priority",
            {
                ascending: true
            }
        )
        .order(
            "created_at",
            {
                ascending: true
            }
        );


    if (error) {
        throw error;
    }


    fineRules =
        Array.isArray(data)
            ? data
            : [];


    renderFineRules();
}


/* ================================================================
   SUBSCRIPTION
================================================================ */

function formatSubscriptionAmount(
    amount,
    currency = "KES"
) {

    const numericAmount =
        Number(amount);


    if (!Number.isFinite(numericAmount)) {
        return "—";
    }


    return new Intl.NumberFormat(
        "en-KE",
        {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    ).format(numericAmount);
}


function renderSubscription() {

    const record =
        subscription;


    if (!record) {

        if (dom.subscriptionStatus) {

            dom.subscriptionStatus.textContent =
                "No subscription";
        }

        if (dom.subscriptionPlan) {

            dom.subscriptionPlan.textContent =
                "—";
        }

        if (dom.subscriptionEndDate) {

            dom.subscriptionEndDate.textContent =
                "—";
        }

        if (dom.subscriptionAmount) {

            dom.subscriptionAmount.textContent =
                "—";
        }

        return;
    }


    if (dom.subscriptionStatus) {

        dom.subscriptionStatus.textContent =
            normalizeValue(
                record.status
            ) || "—";
    }


    if (dom.subscriptionPlan) {

        dom.subscriptionPlan.textContent =
            normalizeValue(
                record.plan_name ||
                record.plan ||
                record.subscription_plan
            ) || "—";
    }


    if (dom.subscriptionEndDate) {

        dom.subscriptionEndDate.textContent =
            formatDate(
                record.end_date ||
                record.current_period_end ||
                record.renewal_date
            );
    }


    if (dom.subscriptionAmount) {

        dom.subscriptionAmount.textContent =
            formatSubscriptionAmount(
                record.amount,
                record.currency || "KES"
            );
    }
}


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
        throw error;
    }


    subscription =
        Array.isArray(data)
            ? data[0] || null
            : data || null;


    renderSubscription();
}


/* ================================================================
   SAVE GROUP INFORMATION
================================================================ */

async function saveGroupInformation() {

    clearMessages();


    if (!canManageGroup) {

        showError(
            "You do not have permission to update this group."
        );

        return;
    }


    if (!currentGroup?.id) {

        showError(
            "Group context is unavailable."
        );

        return;
    }


    const name =
        normalizeValue(
            dom.groupName?.value
        );


    const country =
        normalizeValue(
            dom.groupCountry?.value
        );


    const monthlyContribution =
        Number(
            dom.monthlyContribution?.value
        );


    if (!name) {

        showError(
            "Please enter the group name."
        );

        return;
    }


    if (!country) {

        showError(
            "Please enter the country."
        );

        return;
    }


    if (
        !Number.isFinite(monthlyContribution) ||
        monthlyContribution < 0
    ) {

        showError(
            "Please enter a valid monthly contribution amount."
        );

        return;
    }


    const categoryResult =
        getGroupCategoryForSave();


    if (!categoryResult.valid) {

        showError(
            categoryResult.message
        );

        return;
    }


    const category =
        categoryResult.value;


    if (dom.saveGroup) {
        dom.saveGroup.disabled = true;
    }


    try {

        const {
            data,
            error
        } = await supabase
            .from("groups")
            .update({
                name,
                category,
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


        currentGroup =
            data || {
                ...currentGroup,
                name,
                category,
                country,
                monthly_contribution:
                    monthlyContribution
            };


        renderGroup();
        applyAuthorizationUI();


        showStatus(
            "Group information saved.",
            "success"
        );

    } catch (error) {

        console.error(
            "Failed to save group information:",
            error
        );

        showError(
            error?.message ||
            "Unable to save group information."
        );

    } finally {

        if (dom.saveGroup) {

            dom.saveGroup.disabled =
                !canManageGroup;
        }
    }
}


/* ================================================================
   EVENT BINDING
================================================================ */

function bindEvents() {

    if (eventsBound) {
        return;
    }


    eventsBound = true;


    if (dom.groupForm) {

        dom.groupForm.addEventListener(
            "submit",
            event => {

                event.preventDefault();

                saveGroupInformation();
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


    if (dom.adminActualPosition) {

        dom.adminActualPosition.addEventListener(
            "change",
            () => {

                updateActualPositionNameUI();
            }
        );
    }


    if (dom.saveAdminActualPosition) {

        dom.saveAdminActualPosition.addEventListener(
            "click",
            () => {

                saveAdminActualPosition();
            }
        );
    }


    if (dom.contributionCalendarForm) {

        dom.contributionCalendarForm.addEventListener(
            "submit",
            event => {

                event.preventDefault();

                saveContributionSettings();
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


/* ================================================================
   PAGE INITIALIZATION
================================================================ */

async function initializeGroupManagement() {

    if (initializationPromise) {
        return initializationPromise;
    }


    initializationPromise =
        (async () => {

            clearMessages();


            if (dom.adminLoading) {

                dom.adminLoading.classList.remove(
                    "hidden"
                );
            }


            if (dom.managementContent) {

                dom.managementContent.classList.add(
                    "hidden"
                );
            }


            bindEvents();


            /*
             * Ensure the Group Type UI is initialized
             * even before group data is loaded.
             */
            updateGroupCategoryUI();


            try {

                const context =
                    await getMyApplicationContext();


                if (!context) {

                    throw new Error(
                        "Unable to load your account context."
                    );
                }


                currentUser =
                    context.user || null;


                currentMember =
                    context.member || null;


                currentGroup =
                    context.group || null;


                currentIsOwner =
                    Boolean(
                        context.isOwner
                    );


                currentRole =
                    context.role ||
                    currentMember?.role ||
                    null;


                if (!currentGroup?.id) {

                    throw new Error(
                        "No active group was found for your account."
                    );
                }


                calculateManagementAccess();


                renderGroup();


                applyAuthorizationUI();


                await Promise.all([
                    loadLeadershipSetup(),
                    loadMemberCount(),
                    loadContributionSettings(),
                    loadSubscription(),

                    /*
                     * READ ONLY:
                     * Contribution configuration loaders.
                     */
                    loadContributionTypes(),
                    loadContributionInitiatives(),
                    loadFineRules()
                ]);


                /*
                 * Re-apply after async data has populated
                 * the page.
                 */
                renderGroup();
                applyAuthorizationUI();


                if (dom.managementContent) {

                    dom.managementContent.classList.remove(
                        "hidden"
                    );
                }


                if (dom.adminLoading) {

                    dom.adminLoading.classList.add(
                        "hidden"
                    );
                }

            } catch (error) {

                console.error(
                    "Failed to initialize group management:",
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


                if (dom.permissionMessage) {

                    dom.permissionMessage.classList.remove(
                        "hidden"
                    );
                }
            }

        })();


    return initializationPromise;
}


/* ================================================================
   PUBLIC MODULE API
================================================================ */

/*
 * admin-layout.js expects the page initializer to be named:
 *
 *     initGroupManagement
 *
 * Keep initializeGroupManagement as the internal function name,
 * but expose the required shell-compatible public name.
 */
export {
    initializeGroupManagement as initGroupManagement,
    saveGroupInformation,
    saveAdminActualPosition,
    saveContributionSettings,
    loadContributionSettings,
    loadLeadershipSetup,
    loadSubscription,

    /*
     * Read-only contribution configuration API.
     *
     * No mutation functions are exported here.
     */
    loadContributionTypes,
    loadContributionInitiatives,
    loadFineRules
};


/*
 * ================================================================
 * NO AUTO-BOOT
 * ================================================================
 *
 * admin-layout.js remains the sole page-shell boot owner.
 *
 * This file intentionally does not call:
 *
 *     initializeGroupManagement();
 *
 * at module scope.
 *
 * ================================================================
 */

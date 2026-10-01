/* ================================================================
   CHAMA LIVE — GROUP MANAGEMENT
   GOVERNED GROUP CONFIGURATION
================================================================ */

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
   STATE
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
 * integration gate.
 */
let contributionTypes = [];
let contributionInitiatives = [];
let fineRules = [];

let initializationPromise = null;
let eventsBound = false;


/* ================================================================
   DOM REFERENCES
================================================================ */

const elements = {
    groupForm:
        document.getElementById("groupForm"),

    groupName:
        document.getElementById("groupName"),

    groupCategory:
        document.getElementById("groupCategory"),

    groupCategoryOther:
        document.getElementById("groupCategoryOther"),

    groupCountry:
        document.getElementById("groupCountry"),

    monthlyContribution:
        document.getElementById("monthlyContribution"),

    groupNameDisplay:
        document.getElementById("groupNameDisplay"),

    groupCategoryDisplay:
        document.getElementById("groupCategoryDisplay"),

    groupCountryDisplay:
        document.getElementById("groupCountryDisplay"),

    memberCount:
        document.getElementById("memberCount"),

    adminPosition:
        document.getElementById("adminPosition"),

    adminPositionName:
        document.getElementById("adminPositionName"),

    adminEffectiveFrom:
        document.getElementById("adminEffectiveFrom"),

    leadershipForm:
        document.getElementById("leadershipForm"),

    closingDay:
        document.getElementById("closingDay"),

    saveContributionSettings:
        document.getElementById("saveContributionSettings"),

    subscriptionStatus:
        document.getElementById("subscriptionStatus"),

    subscriptionPlan:
        document.getElementById("subscriptionPlan"),

    subscriptionAmount:
        document.getElementById("subscriptionAmount"),

    groupContextName:
        document.getElementById("groupContextName"),

    groupContextRole:
        document.getElementById("groupContextRole"),

    permissionMessage:
        document.getElementById("permissionMessage"),

    contributionTypesList:
        document.getElementById("contributionTypesList"),

    contributionInitiativesList:
        document.getElementById("contributionInitiativesList"),

    fineRulesList:
        document.getElementById("fineRulesList")
};


/* ================================================================
   AUTHORIZATION
================================================================ */

function normalizeLower(value) {

    return typeof value === "string"
        ? value.trim().toLowerCase()
        : "";
}


function applyAuthorization() {

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
}


function applyAuthorizationUI() {

    applyAuthorization();

    const disabled =
        !canManageGroup;

    const groupControls = [
        elements.groupName,
        elements.groupCategory,
        elements.groupCountry,
        elements.monthlyContribution
    ];

    groupControls.forEach((control) => {

        if (control) {
            control.disabled =
                disabled;
        }
    });

    const leadershipControls = [
        elements.adminPosition,
        elements.adminPositionName,
        elements.adminEffectiveFrom
    ];

    leadershipControls.forEach((control) => {

        if (control) {
            control.disabled =
                disabled;
        }
    });

    if (elements.saveContributionSettings) {

        elements.saveContributionSettings.disabled =
            disabled;
    }

    if (elements.permissionMessage) {

        elements.permissionMessage.hidden =
            canManageGroup;
    }
}


/* ================================================================
   GROUP CATEGORY HELPERS
================================================================ */

function getStoredGroupCategory() {

    if (!currentGroup) {
        return "";
    }

    return currentGroup.category || "";
}


function getCategoryDisplayValue(category) {

    const normalized =
        normalizeLower(category);

    if (STANDARD_GROUP_TYPES.has(normalized)) {
        return STANDARD_GROUP_TYPES.get(normalized);
    }

    return category || "Other";
}


function setGroupCategoryValue(category) {

    if (!elements.groupCategory) {
        return;
    }

    const normalized =
        normalizeLower(category);

    if (STANDARD_GROUP_TYPES.has(normalized)) {

        elements.groupCategory.value =
            normalized;

        if (elements.groupCategoryOther) {
            elements.groupCategoryOther.value =
                "";
        }

        return;
    }

    elements.groupCategory.value =
        "other";

    if (elements.groupCategoryOther) {
        elements.groupCategoryOther.value =
            category || "";
    }
}


function getGroupCategoryValue() {

    const selected =
        normalizeLower(
            elements.groupCategory?.value
        );

    if (selected === "other") {

        return (
            elements.groupCategoryOther?.value ||
            ""
        ).trim();
    }

    return selected;
}


/* ================================================================
   GROUP RENDERING
================================================================ */

function renderGroup() {

    if (!currentGroup) {
        return;
    }

    if (elements.groupName) {
        elements.groupName.value =
            currentGroup.name || "";
    }

    setGroupCategoryValue(
        getStoredGroupCategory()
    );

    if (elements.groupCountry) {
        elements.groupCountry.value =
            currentGroup.country || "";
    }

    if (elements.monthlyContribution) {
        elements.monthlyContribution.value =
            currentGroup.monthly_contribution ?? "";
    }

    if (elements.groupNameDisplay) {
        elements.groupNameDisplay.textContent =
            currentGroup.name || "—";
    }

    if (elements.groupCategoryDisplay) {
        elements.groupCategoryDisplay.textContent =
            getCategoryDisplayValue(
                currentGroup.category
            );
    }

    if (elements.groupCountryDisplay) {
        elements.groupCountryDisplay.textContent =
            currentGroup.country || "—";
    }

    if (elements.groupContextName) {
        elements.groupContextName.textContent =
            currentGroup.name || "—";
    }

    if (elements.groupContextRole) {
        elements.groupContextRole.textContent =
            currentRole || "—";
    }
}


/* ================================================================
   GROUP INFORMATION
================================================================ */

async function saveGroupInformation(event) {

    if (event) {
        event.preventDefault();
    }

    if (!currentGroup?.id || !canManageGroup) {
        return;
    }

    const name =
        elements.groupName?.value.trim() || "";

    const category =
        getGroupCategoryValue();

    const country =
        elements.groupCountry?.value.trim() || "";

    const monthlyContribution =
        Number(
            elements.monthlyContribution?.value || 0
        );

    if (!name) {
        throw new Error(
            "Group name is required."
        );
    }

    if (!category) {
        throw new Error(
            "Group category is required."
        );
    }

    if (!Number.isFinite(monthlyContribution)) {
        throw new Error(
            "Monthly contribution must be a valid number."
        );
    }

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
        .eq("id", currentGroup.id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    currentGroup =
        data;

    renderGroup();
}


/* ================================================================
   LEADERSHIP
================================================================ */

async function loadLeadershipSetup() {

    if (!currentGroup?.id) {
        return;
    }

    const {
        data,
        error
    } = await supabase
        .from("members")
        .select(
            "id, actual_position, actual_position_name, join_date"
        )
        .eq("group_id", currentGroup.id)
        .eq("id", currentMember?.id)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!data) {
        return;
    }

    if (elements.adminPosition) {
        elements.adminPosition.value =
            ACTUAL_POSITION_VALUES.has(
                normalizeLower(data.actual_position)
            )
                ? normalizeLower(data.actual_position)
                : "other";
    }

    if (elements.adminPositionName) {
        elements.adminPositionName.value =
            data.actual_position_name || "";
    }

    if (elements.adminEffectiveFrom) {
        elements.adminEffectiveFrom.value =
            data.join_date || "";
    }
}


async function saveAdminActualPosition(event) {

    if (event) {
        event.preventDefault();
    }

    if (!currentMember?.id || !canManageGroup) {
        return;
    }

    const actualPosition =
        normalizeLower(
            elements.adminPosition?.value
        );

    const actualPositionName =
        elements.adminPositionName?.value.trim() || "";

    const effectiveFrom =
        elements.adminEffectiveFrom?.value || null;

    if (!ACTUAL_POSITION_VALUES.has(actualPosition)) {
        throw new Error(
            "Invalid actual position."
        );
    }

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
        .eq("group_id", currentGroup.id);

    if (error) {
        throw error;
    }

    if (elements.memberCount) {
        elements.memberCount.textContent =
            String(count ?? 0);
    }
}


/* ================================================================
   CONTRIBUTION SETTINGS
================================================================ */

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

    if (
        elements.closingDay &&
        contributionSettings
    ) {
        elements.closingDay.value =
            contributionSettings.monthly_closing_day ?? "";
    }
}


async function saveContributionSettings(event) {

    if (event) {
        event.preventDefault();
    }

    if (!currentGroup?.id || !canManageGroup) {
        return;
    }

    const closingDay =
        Number(
            elements.closingDay?.value
        );

    if (
        !Number.isInteger(closingDay) ||
        closingDay < 1 ||
        closingDay > 31
    ) {
        throw new Error(
            "Closing day must be between 1 and 31."
        );
    }

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
}


/* ================================================================
   SUBSCRIPTION
================================================================ */

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

    if (elements.subscriptionStatus) {
        elements.subscriptionStatus.textContent =
            subscription?.status || "—";
    }

    if (elements.subscriptionPlan) {
        elements.subscriptionPlan.textContent =
            subscription?.plan_name ||
            subscription?.plan ||
            "—";
    }

    if (elements.subscriptionAmount) {
        elements.subscriptionAmount.textContent =
            subscription?.amount ?? "—";
    }
}


/* ================================================================
   CONTRIBUTION CONFIGURATION — READ ONLY
================================================================ */

/*
 * These helpers intentionally render textContent rather than
 * inserting HTML. This keeps this integration pass
 * presentation-only and avoids introducing HTML injection paths.
 */

function appendEmptyState(container, message) {

    if (!container) {
        return;
    }

    const item =
        document.createElement("div");

    item.className =
        "program-empty";

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
        "program-item-meta";

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


/* ================================================================
   CONTRIBUTION TYPES — READ ONLY
================================================================ */

function renderContributionTypes() {

    const container =
        elements.contributionTypesList;

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

    contributionTypes.forEach((type) => {

        const item =
            document.createElement("div");

        item.className =
            "program-item";

        appendTextRow(
            item,
            "Name",
            type.name || "—"
        );

        if (type.code) {

            appendTextRow(
                item,
                "Code",
                type.code
            );
        }

        container.appendChild(
            item
        );
    });
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


/* ================================================================
   CONTRIBUTION INITIATIVES — READ ONLY
================================================================ */

function renderContributionInitiatives() {

    const container =
        elements.contributionInitiativesList;

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
        (initiative) => {

            const item =
                document.createElement("div");

            item.className =
                "program-item";

            appendTextRow(
                item,
                "Name",
                initiative.name || "—"
            );

            appendTextRow(
                item,
                "Status",
                initiative.status || "—"
            );

            appendTextRow(
                item,
                "Frequency",
                initiative.frequency || "—"
            );

            appendTextRow(
                item,
                "Start",
                initiative.start_date || "—"
            );

            appendTextRow(
                item,
                "Closing",
                initiative.closing_date || "—"
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


/* ================================================================
   FINE RULES — READ ONLY
================================================================ */

function renderFineRules() {

    const container =
        elements.fineRulesList;

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

    fineRules.forEach((rule) => {

        const item =
            document.createElement("div");

        item.className =
            "program-item";

        appendTextRow(
            item,
            "Name",
            rule.name || "—"
        );

        appendTextRow(
            item,
            "Trigger",
            rule.trigger_type || "—"
        );

        appendTextRow(
            item,
            "Calculation",
            rule.calculation_method || "—"
        );

        appendTextRow(
            item,
            "Priority",
            String(
                rule.priority ?? "—"
            )
        );

        appendTextRow(
            item,
            "Status",
            rule.status || "—"
        );

        container.appendChild(
            item
        );
    });
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
   EVENT BINDING
================================================================ */

function bindEvents() {

    if (eventsBound) {
        return;
    }

    eventsBound =
        true;

    elements.groupForm?.addEventListener(
        "submit",
        async (event) => {

            try {
                await saveGroupInformation(
                    event
                );
            } catch (error) {
                console.error(
                    "Failed to save group information:",
                    error
                );
            }
        }
    );

    elements.leadershipForm?.addEventListener(
        "submit",
        async (event) => {

            try {
                await saveAdminActualPosition(
                    event
                );
            } catch (error) {
                console.error(
                    "Failed to save leadership setup:",
                    error
                );
            }
        }
    );

    elements.saveContributionSettings?.addEventListener(
        "click",
        async (event) => {

            try {
                await saveContributionSettings(
                    event
                );
            } catch (error) {
                console.error(
                    "Failed to save contribution settings:",
                    error
                );
            }
        }
    );

    elements.groupCategory?.addEventListener(
        "change",
        () => {

            if (!elements.groupCategoryOther) {
                return;
            }

            elements.groupCategoryOther.disabled =
                elements.groupCategory.value !== "other";
        }
    );
}


/* ================================================================
   INITIALIZATION
================================================================ */

async function initializeGroupManagement() {

    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise =
        (async () => {

            const context =
                await getMyApplicationContext();

            currentUser =
                context?.user || null;

            currentMember =
                context?.member || null;

            currentGroup =
                context?.group || null;

            currentIsOwner =
                Boolean(
                    context?.is_owner
                );

            currentRole =
                context?.role ||
                context?.member?.actual_position ||
                null;

            applyAuthorization();

            renderGroup();

            applyAuthorizationUI();

            bindEvents();

            await Promise.all([
                loadLeadershipSetup(),
                loadMemberCount(),
                loadContributionSettings(),
                loadSubscription(),
                loadContributionTypes(),
                loadContributionInitiatives(),
                loadFineRules()
            ]);
        })();

    return initializationPromise;
}


/* ================================================================
   PUBLIC API
================================================================ */

export {
    initializeGroupManagement as initGroupManagement,
    saveGroupInformation,
    saveAdminActualPosition,
    saveContributionSettings,
    loadContributionSettings,
    loadLeadershipSetup,
    loadSubscription,
    loadContributionTypes,
    loadContributionInitiatives,
    loadFineRules
};

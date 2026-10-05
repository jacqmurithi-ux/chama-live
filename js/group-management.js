/* ================================================================
   CHAMA LIVE — ADMIN GROUP MANAGEMENT
================================================================ */

import { getMyApplicationContext } from "./auth.js";
import { groupManagementApi } from "./api/group-management.js";


/* ================================================================
   CONSTANTS
================================================================ */

const STANDARD_GROUP_TYPES = new Map([
    ["chama", "Chama"],
    ["cbo", "CBO"]
]);


/* ================================================================
   MODULE STATE
================================================================ */

let currentUser = null;
let currentMember = null;
let currentGroup = null;
let currentIsOwner = false;
let currentRole = null;
let canEditGroupDetails = false;
let canEditContributionSettings = false;

let subscription = null;
let contributionSettings = null;

let initializationPromise = null;

let eventsBound = false;


/* ================================================================
   DOM REFERENCES
================================================================ */

const elements = {
    groupForm: null,
    groupName: null,
    groupCategory: null,
    groupCategoryOther: null,
    groupCountry: null,
    monthlyContribution: null,

    groupContextName: null,
    groupContextRole: null,
    permissionMessage: null,

    memberCount: null,

    leadershipStatus: null,
    leadershipList: null,

    closingDay: null,
    saveContributionSettings: null,

    calendarContributionAmount: null,
    calendarClosingDay: null,
    calendarCycleStatus: null,

    subscriptionStatus: null,
    subscriptionPlan: null,
    subscriptionAmount: null,

    groupManagementStatus: null,

};


/* ================================================================
   DOM RESOLUTION
================================================================ */

function refreshDomReferences() {
    elements.groupForm =
        document.getElementById("groupForm");

    elements.groupName =
        document.getElementById("groupName");

    elements.groupCategory =
        document.getElementById("groupCategory");

    elements.groupCategoryOther =
        document.getElementById("groupCategoryOther");

    elements.groupCountry =
        document.getElementById("groupCountry");

    elements.monthlyContribution =
        document.getElementById("monthlyContribution");

    elements.groupContextName =
        document.getElementById("groupContextName");

    elements.groupContextRole =
        document.getElementById("groupContextRole");

    elements.permissionMessage =
        document.getElementById("permissionMessage");

    elements.memberCount =
        document.getElementById("memberCount");

    elements.leadershipStatus =
        document.getElementById("leadershipStatus");

    elements.leadershipList =
        document.getElementById("leadershipList");

    elements.closingDay =
        document.getElementById("closingDay");

    elements.saveContributionSettings =
        document.getElementById("saveContributionSettings");

    elements.calendarContributionAmount =
        document.getElementById("calendarContributionAmount");

    elements.calendarClosingDay =
        document.getElementById("calendarClosingDay");

    elements.calendarCycleStatus =
        document.getElementById("calendarCycleStatus");

    elements.subscriptionStatus =
        document.getElementById("subscriptionStatus");

    elements.subscriptionPlan =
        document.getElementById("subscriptionPlan");

    elements.subscriptionAmount =
        document.getElementById("subscriptionAmount");

    elements.groupManagementStatus =
        document.getElementById("groupManagementStatus");

}


function ensureDomReady() {
    if (document.readyState === "loading") {
        return new Promise((resolve) => {
            document.addEventListener(
                "DOMContentLoaded",
                () => {
                    refreshDomReferences();
                    resolve();
                },
                { once: true }
            );
        });
    }

    refreshDomReferences();

    return Promise.resolve();
}


/* ================================================================
   GENERAL HELPERS
================================================================ */

function normalizeLower(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
}



function applyAuthorization() {
    // Keep each client gate aligned with its distinct backend operation.
    canEditGroupDetails = currentRole === "admin";
    canEditContributionSettings =
        currentRole === "admin" ||
        currentRole === "chairperson";
}


function applyAuthorizationUI() {
    if (elements.groupForm) {
        elements.groupForm
            .querySelectorAll("input, select, textarea, button")
            .forEach((element) => {
                element.disabled = !canEditGroupDetails;
            });
    }

    if (elements.saveContributionSettings) {
        elements.saveContributionSettings.disabled =
            !canEditContributionSettings;
    }

    if (elements.permissionMessage) {
        elements.permissionMessage.hidden = canEditGroupDetails;

        elements.permissionMessage.textContent =
            canEditContributionSettings
                ? "Group details require an admin role. You can manage contribution settings."
                : "You can view group information. Admins can update group details and contribution settings.";
    }
}


/* ================================================================
   CATEGORY HELPERS
================================================================ */

function getGroupCategoryValue() {
    const category =
        normalizeLower(
            elements.groupCategory?.value
        );

    if (category === "other") {
        return (
            elements.groupCategoryOther?.value?.trim() ||
            "other"
        );
    }

    return STANDARD_GROUP_TYPES.has(category)
        ? category
        : category;
}


function setGroupCategoryValue(category) {
    const normalized =
        normalizeLower(category);

    if (elements.groupCategory) {
        if (
            STANDARD_GROUP_TYPES.has(
                normalized
            )
        ) {
            elements.groupCategory.value =
                normalized;
        } else {
            elements.groupCategory.value =
                "other";
        }
    }

    if (elements.groupCategoryOther) {
        elements.groupCategoryOther.value =
            STANDARD_GROUP_TYPES.has(normalized)
                ? ""
                : category || "";
    }

    syncGroupCategoryOtherVisibility();
}


function syncGroupCategoryOtherVisibility() {
    /*
     * HTML uses "otherGroupTypeField".
     * The previous JavaScript selector used
     * "groupCategoryOtherField", which does not exist.
     */
    const wrapper =
        document.getElementById(
            "otherGroupTypeField"
        );

    if (!wrapper) {
        return;
    }

    const isOther =
        normalizeLower(
            elements.groupCategory?.value
        ) === "other";

    wrapper.hidden = !isOther;
}


/* ================================================================
   CONTRIBUTION CYCLE SUMMARY
================================================================ */

function renderContributionCycleSummary() {
    const amount =
        currentGroup?.monthly_contribution;

    const closingDay =
        contributionSettings?.monthly_closing_day;

    if (elements.calendarContributionAmount) {
        elements.calendarContributionAmount.textContent =
            amount !== null &&
            amount !== undefined &&
            amount !== ""
                ? String(amount)
                : "—";
    }

    if (elements.calendarClosingDay) {
        elements.calendarClosingDay.textContent =
            closingDay !== null &&
            closingDay !== undefined &&
            closingDay !== ""
                ? String(closingDay)
                : "—";
    }

    if (elements.calendarCycleStatus) {
        elements.calendarCycleStatus.textContent =
            closingDay !== null &&
            closingDay !== undefined &&
            closingDay !== ""
                ? "Configured"
                : "Not configured";
    }
}


/* ================================================================
   GROUP RENDER
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
        currentGroup.category || ""
    );

    if (elements.groupCountry) {
        elements.groupCountry.value =
            currentGroup.country || "";
    }

    if (elements.monthlyContribution) {
        elements.monthlyContribution.value =
            currentGroup.monthly_contribution ?? "";
    }

    if (elements.groupContextName) {
        elements.groupContextName.textContent =
            currentGroup.name ||
            "Current group";
    }

    if (elements.groupContextRole) {
        elements.groupContextRole.textContent =
            currentRole ||
            "—";
    }

    renderContributionCycleSummary();

    applyAuthorizationUI();
}


/* ================================================================
   GROUP INFORMATION SAVE
================================================================ */

async function saveGroupInformation(event) {
    event?.preventDefault();

    if (!currentGroup?.id) {
        throw new Error(
            "No active group is available."
        );
    }

    if (!canEditGroupDetails) {
        throw new Error(
            "You do not have permission to update group information."
        );
    }

    const name =
        elements.groupName?.value?.trim();

    const category =
        getGroupCategoryValue();

    const country =
        elements.groupCountry?.value?.trim();

    const monthlyContribution =
        Number(
            elements.monthlyContribution?.value || 0
        );

    if (!name) {
        throw new Error(
            "Group name is required."
        );
    }

    if (
        !Number.isFinite(monthlyContribution) ||
        monthlyContribution < 0
    ) {
        throw new Error(
            "Monthly contribution must be a valid non-negative number."
        );
    }

    const { error } =
        await groupManagementApi.updateGroup(currentGroup.id,{name,category,country,monthly_contribution:monthlyContribution});

    if (error) {
        throw error;
    }

    await saveContributionSettings();

    currentGroup = {
        ...currentGroup,
        name,
        category,
        country,
        monthly_contribution:
            monthlyContribution
    };

    renderGroup();

    if (elements.groupManagementStatus) {
        elements.groupManagementStatus.textContent =
            "Group information saved successfully.";

        elements.groupManagementStatus.className =
            "management-status is-visible success";
    }
}


/* ================================================================
   LEADERSHIP SETUP
================================================================ */

async function loadLeadershipSetup() {
    if (!currentGroup?.id || !elements.leadershipList) return;

    const { data, error } = await groupManagementApi.getLeadershipMembers(currentGroup.id);

    if (error) throw error;

    const leadership = Array.isArray(data) ? data : [];
    elements.leadershipList.replaceChildren();

    if (!leadership.length) {
        elements.leadershipStatus.textContent = "No leadership positions are assigned.";
        return;
    }

    leadership.forEach((member) => {
        const item = document.createElement("div");
        item.className = "leadership-item";
        const position = document.createElement("strong");
        position.textContent = (member.actual_position_name || member.actual_position || "Position").replaceAll("_", " ");
        const name = document.createElement("span");
        name.textContent = member.name || "Group member";
        item.append(position, name);
        elements.leadershipList.appendChild(item);
    });

    elements.leadershipStatus.textContent = leadership.length + " leadership assignment" + (leadership.length === 1 ? "" : "s") + ". Manage position changes in Members.";
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
    } = await groupManagementApi.countMembers(currentGroup.id);

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
    } = await groupManagementApi.rpc(
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
            contributionSettings.monthly_closing_day ??
            "";
    }

    renderContributionCycleSummary();
}


async function saveContributionSettings(event) {
    event?.preventDefault();

    if (!currentGroup?.id) {
        throw new Error(
            "No active group is available."
        );
    }

    if (!canEditContributionSettings) {
        throw new Error(
            "You do not have permission to update contribution settings."
        );
    }

    const rawClosingDay =
        elements.closingDay?.value?.trim();

    const closingDay =
        Number(rawClosingDay);

    if (
        !rawClosingDay ||
        !Number.isInteger(closingDay) ||
        closingDay < 1 ||
        closingDay > 28
    ) {
        throw new Error(
            "Closing day must be a whole number between 1 and 28."
        );
    }

    const { error } =
        await groupManagementApi.rpc(
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

    if (elements.groupManagementStatus) {
        elements.groupManagementStatus.textContent =
            "Contribution closing day saved successfully.";

        elements.groupManagementStatus.className =
            "management-status is-visible success";
    }
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
    } = await groupManagementApi.rpc(
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
            subscription?.amount !== null &&
            subscription?.amount !== undefined
                ? String(subscription.amount)
                : "—";
    }
}


/* ================================================================
   APPLICATION CONTEXT
================================================================ */

async function loadApplicationContext() {
    const context =
        await getMyApplicationContext();

    if (!context) {
        throw new Error(
            "Unable to determine the current group context."
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
            context.is_owner ||
            context.isOwner
        );

    currentRole =
        normalizeLower(
            context.role ||
            context.application_role ||
            context.member_role
        );

    if (!currentGroup?.id) {
        throw new Error(
            "Unable to determine the current group."
        );
    }

    applyAuthorization();

    renderGroup();
}


/* ================================================================
   INITIALIZATION ERROR HANDLING
================================================================ */

function reportInitializationError(
    section,
    error
) {
    console.error(
        `[Group Management] Failed to load ${section}:`,
        error
    );

    const message =
        `${section} could not be loaded. ` +
        `${error?.message || "Please refresh and try again."}`;

    if (!elements.groupManagementStatus) {
        return;
    }

    let errors = [];

    try {
        const stored =
            elements.groupManagementStatus
                .dataset
                .initializationErrors;

        if (stored) {
            const parsed =
                JSON.parse(stored);

            if (Array.isArray(parsed)) {
                errors = parsed;
            }
        }
    } catch (parseError) {
        console.warn(
            "[Group Management] Could not parse previous initialization errors.",
            parseError
        );

        errors = [];
    }

    errors.push(message);

    elements.groupManagementStatus
        .dataset
        .initializationErrors =
        JSON.stringify(errors);

    elements.groupManagementStatus.textContent =
        errors.join(" ");

    elements.groupManagementStatus.className =
        "management-status is-visible error";
}


function renderInitializationFailure(error) {
    console.error(
        "[Group Management] Initialization failed:",
        error
    );

    const message =
        error?.message ||
        "Group management could not be initialized.";

    if (elements.permissionMessage) {
        elements.permissionMessage.hidden =
            false;

        elements.permissionMessage.textContent =
            message;
    }

    if (elements.groupContextName) {
        elements.groupContextName.textContent =
            "Unable to load";
    }

    if (elements.groupContextRole) {
        elements.groupContextRole.textContent =
            "—";
    }

    if (elements.groupManagementStatus) {
        elements.groupManagementStatus.textContent =
            message;

        elements.groupManagementStatus.className =
            "management-status is-visible error";
    }
}


/* ================================================================
   EVENT BINDING
================================================================ */

function bindEvents() {
    if (eventsBound) {
        return;
    }

    refreshDomReferences();


    /* ------------------------------------------------------------
       GROUP
    ------------------------------------------------------------ */

    elements.groupForm?.addEventListener(
        "submit",
        async (event) => {
            try {
                await saveGroupInformation(event);
            } catch (error) {
                console.error(
                    "Failed to save group information:",
                    error
                );
            }
        }
    );


    /* ------------------------------------------------------------
       LEADERSHIP
    ------------------------------------------------------------ */

    /* ------------------------------------------------------------
       CONTRIBUTION SETTINGS
    ------------------------------------------------------------ */

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


    /* ------------------------------------------------------------
       CATEGORY OTHER
    ------------------------------------------------------------ */

    elements.groupCategory?.addEventListener(
        "change",
        () => {
            syncGroupCategoryOtherVisibility();
        }
    );

    syncGroupCategoryOtherVisibility();

    eventsBound = true;
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

            await ensureDomReady();

            bindEvents();

            await loadApplicationContext();

            applyAuthorizationUI();

            if (
                elements.groupManagementStatus
            ) {
                delete elements
                    .groupManagementStatus
                    .dataset
                    .initializationErrors;
            }

            const loaders = [
                {
                    section:
                        "leadership",
                    loader:
                        loadLeadershipSetup
                },
                {
                    section:
                        "member count",
                    loader:
                        loadMemberCount
                },
                {
                    section:
                        "contribution settings",
                    loader:
                        loadContributionSettings
                },
                {
                    section:
                        "subscription",
                    loader:
                        loadSubscription
                },
            ];

            const results =
                await Promise.allSettled(
                    loaders.map(
                        async ({
                            section,
                            loader
                        }) => {
                            try {
                                await loader();

                                return {
                                    section,
                                    success:
                                        true
                                };
                            } catch (error) {
                                reportInitializationError(
                                    section,
                                    error
                                );

                                return {
                                    section,
                                    success:
                                        false,
                                    error
                                };
                            }
                        }
                    )
                );

            applyAuthorizationUI();

            const failedSections =
                results
                    .filter(
                        (result) =>
                            result.status ===
                                "fulfilled" &&
                            result.value?.success ===
                                false
                    )
                    .map(
                        (result) =>
                            result.value.section
                    );

            if (failedSections.length) {
                console.warn(
                    "[Group Management] Some sections failed to load:",
                    failedSections
                );
            }

            return {
                success:
                    true,

                partial:
                    failedSections.length > 0,

                failedSections,

                results
            };
        })();

    try {
        return await initializationPromise;
    } catch (error) {
        initializationPromise =
            null;

        renderInitializationFailure(
            error
        );

        throw error;
    }
}


/* ================================================================
   PUBLIC API
================================================================ */

export {
    initializeGroupManagement as initGroupManagement,

    saveGroupInformation,
    saveContributionSettings,

    loadContributionSettings,
    loadLeadershipSetup,
    loadSubscription
};

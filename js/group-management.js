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
   ========================================================= */

import {
    supabase,
    getMyApplicationContext
} from "./auth.js";


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
    groupName: document.getElementById("groupName"),
    groupCategory: document.getElementById("groupCategory"),
    groupCountry: document.getElementById("groupCountry"),

    monthlyContribution: document.getElementById(
        "monthlyContribution"
    ),

    saveGroup: document.getElementById("saveGroup"),

    contributionCalendarForm: document.getElementById(
        "contributionCalendarForm"
    ),

    monthlyClosingDay: document.getElementById(
        "monthlyClosingDay"
    ),

    saveContributionCalendar: document.getElementById(
        "saveContributionCalendar"
    ),

    currentContributionCycle: document.getElementById(
        "currentContributionCycle"
    ),

    currentContributionOpeningDate: document.getElementById(
        "currentContributionOpeningDate"
    ),

    currentContributionClosingDate: document.getElementById(
        "currentContributionClosingDate"
    ),

    subscriptionPanel: document.getElementById(
        "subscriptionPanel"
    ),

    subscriptionStatus: document.getElementById(
        "subscriptionStatus"
    ),

    subscriptionPlan: document.getElementById(
        "subscriptionPlan"
    ),

    subscriptionEndDate: document.getElementById(
        "subscriptionEndDate"
    ),

    subscriptionAmount: document.getElementById(
        "subscriptionAmount"
    ),

    contextGroupName: document.getElementById(
        "contextGroupName"
    ),

    contextRole: document.getElementById(
        "contextRole"
    ),

    contextAccess: document.getElementById(
        "contextAccess"
    ),

    contextCountry: document.getElementById(
        "contextCountry"
    )
};


/* =========================================================
   MESSAGE HELPERS
   ========================================================= */

function clearMessages() {
    if (dom.statusMessage) {
        dom.statusMessage.textContent = "";
        dom.statusMessage.className = "status-message";
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

    dom.statusMessage.textContent = message;

    dom.statusMessage.className =
        "status-message visible success";
}


function showError(message) {
    if (!dom.errorMessage) {
        return;
    }

    dom.errorMessage.textContent = message;

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

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return new Intl.DateTimeFormat("en-KE", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date);
}


function formatDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
        return "—";
    }

    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}


function formatMoney(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "—";
    }

    return new Intl.NumberFormat("en-KE", {
        style: "currency",
        currency: "KES",
        maximumFractionDigits: 2
    }).format(amount);
}


function formatSubscriptionDate(value) {
    if (!value) {
        return "—";
    }

    return formatDate(value);
}


function formatSubscriptionAmount(value) {
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

   - Owner  → editable
   - Admin  → editable
   - Member → view only
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

    canManageGroup =
        Boolean(
            currentIsOwner ||
            ["owner", "admin"].includes(
                String(
                    currentRole || ""
                )
                    .trim()
                    .toLowerCase()
            )
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
        Boolean(canManageGroup);

    if (dom.groupName) {
        dom.groupName.disabled =
            !editable;
    }

    if (dom.groupCategory) {
        dom.groupCategory.disabled =
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

    if (dom.monthlyClosingDay) {
        dom.monthlyClosingDay.disabled =
            !editable;
    }

    if (dom.saveGroup) {
        dom.saveGroup.disabled =
            !editable;
    }

    if (dom.saveContributionCalendar) {
        dom.saveContributionCalendar.disabled =
            !editable;
    }

    if (dom.permissionBadge) {
        dom.permissionBadge.textContent =
            editable
                ? currentIsOwner
                    ? "Owner"
                    : "Administrator"
                : "View only";
    }

    if (dom.contextRole) {
        dom.contextRole.textContent =
            currentRole || "—";
    }

    if (dom.contextAccess) {
        dom.contextAccess.textContent =
            editable
                ? "Group management"
                : "View only";
    }

    if (!editable && dom.permissionMessage) {
        dom.permissionMessage.classList.remove(
            "hidden"
        );
    }
}


/* =========================================================
   GROUP RENDERING
   ========================================================= */

function renderGroup() {
    if (!currentGroup) {
        return;
    }

    const groupName =
        currentGroup.name || "—";

    const category =
        currentGroup.category || "—";

    const country =
        currentGroup.country || "—";

    const monthlyAmount =
        currentGroup.monthly_contribution ?? 0;

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
            currentGroup.name || "";
    }

    if (dom.groupCategory) {
        dom.groupCategory.value =
            currentGroup.category || "";
    }

    if (dom.groupCountry) {
        dom.groupCountry.value =
            currentGroup.country || "Kenya";
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
        .select("id", {
            count: "exact",
            head: true
        })
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
            String(count ?? 0);
    }
}


/* =========================================================
   MONTHLY CONTRIBUTION CYCLE
   ========================================================= */

function getCurrentCycle(closingDay) {
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

    /*
     * If today is after the selected closing day,
     * the current cycle closes next month.
     *
     * If today is on or before the closing day,
     * the current cycle closes this month.
     */

    if (today.getDate() > day) {
        closingMonth += 1;
    }

    const closingDate =
        new Date(
            closingYear,
            closingMonth,
            day
        );

    /*
     * The cycle is inclusive:
     *
     * Opening date = previous closing date + 1 day
     *
     * Therefore:
     *
     * 05 Oct 2026 closing
     * → 06 Sep 2026 opening
     */

    const openingDate =
        new Date(closingDate);

    openingDate.setDate(
        openingDate.getDate() - 29
    );

    return {
        openingDate,
        closingDate
    };
}


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
        if (dom.currentContributionCycle) {
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

    if (dom.currentContributionCycle) {
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

        subscription = null;

        renderSubscription();

        return;
    }

    if (Array.isArray(data)) {
        subscription =
            data.length > 0
                ? data[0]
                : null;
    } else {
        subscription = data;
    }

    renderSubscription();
}


function renderSubscription() {
    const value =
        subscription || {};

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
        Number(existingValue);

    dom.monthlyClosingDay.value =
        Number.isInteger(normalized) &&
        normalized >= 1 &&
        normalized <= 28
            ? String(normalized)
            : "28";

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

        /*
         * Keep the page usable if the optional
         * settings RPC is unavailable.
         */

        contributionSettings = {
            monthly_closing_day: 28
        };

        populateClosingDayOptions();

        return;
    }

    if (Array.isArray(data)) {
        contributionSettings =
            data.length > 0
                ? data[0]
                : {
                    monthly_closing_day: 28
                };
    } else {
        contributionSettings =
            data || {
                monthly_closing_day: 28
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
        !Number.isInteger(closingDay) ||
        closingDay < 1 ||
        closingDay > 28
    ) {
        showError(
            "Choose a monthly closing day from 1 to 28."
        );

        return;
    }

    if (dom.saveContributionCalendar) {
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
        if (dom.saveContributionCalendar) {
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

    const category =
        dom.groupCategory?.value.trim();

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

    if (!category) {
        showError(
            "Group type is required."
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

        currentGroup = {
            ...currentGroup,

            ...(data || {}),

            name,
            category,
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
    if (dom.groupForm) {
        dom.groupForm.addEventListener(
            "submit",
            async (event) => {
                event.preventDefault();

                await saveGroup();
            }
        );
    }

    if (dom.contributionCalendarForm) {
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
   ========================================================= */

export async function initGroupManagement() {
    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise =
        (async () => {
            clearMessages();

            try {
                await loadAuthorizationContext();

                renderGroup();

                applyAuthorizationUI();

                await Promise.all([
                    loadMemberCount(),
                    loadSubscription(),
                    loadContributionSettings()
                ]);

                renderContributionSettings();

                if (dom.adminLoading) {
                    dom.adminLoading.classList.add(
                        "hidden"
                    );
                }

                if (dom.managementContent) {
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
   AUTO INITIALIZATION
   ========================================================= */

bindEvents();

void initGroupManagement();

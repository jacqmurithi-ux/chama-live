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
let customContributionDrafts = [];

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
    monthlyContributionForm: null,
    monthlyStartDate: null,
    monthlyGraceDays: null,
    monthlyFineEnabled: null,
    monthlyFineAmount: null,
    monthlyRuleSummary: null,
    saveMonthlyContribution: null,

    customContributionForm: null,
    customContributionName: null,
    customContributionAmount: null,
    customContributionCycle: null,
    customContributionStartDate: null,
    customContributionEndDate: null,
    customContributionDescription: null,
    customGraceDays: null,
    customFineEnabled: null,
    customFineAmount: null,
    customRuleSummary: null,
    saveCustomContribution: null,
    customContributionList: null,

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
    monthlyContributionStartDate: null,
    monthlyContributionClosingDay: null,
    monthlyGracePeriodDays: null,
    monthlyFineEnabled: null,
    monthlyFineAmount: null,
    monthlyFineStartSummary: null,
    saveMonthlyContributionSettings: null,
    newCustomContributionButton: null,
    customContributionEditor: null,
    customContributionName: null,
    customContributionAmount: null,
    customContributionStartDate: null,
    customContributionEndDate: null,
    customContributionFrequency: null,
    customContributionDueDate: null,
    customContributionDescription: null,
    customGracePeriodDays: null,
    customFineEnabled: null,
    customFineAmount: null,
    customFineStartSummary: null,
    saveCustomContribution: null,
    cancelCustomContribution: null,
    customContributionsList: null,

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

    elements.monthlyContributionForm =
        document.getElementById("monthlyContributionForm");
    elements.monthlyStartDate =
        document.getElementById("monthlyStartDate");
    elements.monthlyGraceDays =
        document.getElementById("monthlyGraceDays");
    elements.monthlyFineEnabled =
        document.getElementById("monthlyFineEnabled");
    elements.monthlyFineAmount =
        document.getElementById("monthlyFineAmount");
    elements.monthlyRuleSummary =
        document.getElementById("monthlyRuleSummary");
    elements.saveMonthlyContribution =
        document.getElementById("saveMonthlyContribution");

    elements.customContributionForm =
        document.getElementById("customContributionForm");
    elements.customContributionName =
        document.getElementById("customContributionName");
    elements.customContributionAmount =
        document.getElementById("customContributionAmount");
    elements.customContributionCycle =
        document.getElementById("customContributionCycle");
    elements.customContributionStartDate =
        document.getElementById("customContributionStartDate");
    elements.customContributionEndDate =
        document.getElementById("customContributionEndDate");
    elements.customContributionDescription =
        document.getElementById("customContributionDescription");
    elements.customGraceDays =
        document.getElementById("customGraceDays");
    elements.customFineEnabled =
        document.getElementById("customFineEnabled");
    elements.customFineAmount =
        document.getElementById("customFineAmount");
    elements.customRuleSummary =
        document.getElementById("customRuleSummary");
    elements.saveCustomContribution =
        document.getElementById("saveCustomContribution");
    elements.customContributionList =
        document.getElementById("customContributionList");

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

    elements.groupManagementStatus = document.getElementById("groupManagementStatus");
    elements.monthlyContributionStartDate = document.getElementById("monthlyContributionStartDate");
    elements.monthlyContributionClosingDay = document.getElementById("monthlyContributionClosingDay");
    elements.monthlyGracePeriodDays = document.getElementById("monthlyGracePeriodDays");
    elements.monthlyFineEnabled = document.getElementById("monthlyFineEnabled");
    elements.monthlyFineAmount = document.getElementById("monthlyFineAmount");
    elements.monthlyFineStartSummary = document.getElementById("monthlyFineStartSummary");
    elements.saveMonthlyContributionSettings = document.getElementById("saveMonthlyContributionSettings");
    elements.newCustomContributionButton = document.getElementById("newCustomContributionButton");
    elements.customContributionEditor = document.getElementById("customContributionEditor");
    elements.customContributionName = document.getElementById("customContributionName");
    elements.customContributionAmount = document.getElementById("customContributionAmount");
    elements.customContributionStartDate = document.getElementById("customContributionStartDate");
    elements.customContributionEndDate = document.getElementById("customContributionEndDate");
    elements.customContributionFrequency = document.getElementById("customContributionFrequency");
    elements.customContributionDueDate = document.getElementById("customContributionDueDate");
    elements.customContributionDescription = document.getElementById("customContributionDescription");
    elements.customGracePeriodDays = document.getElementById("customGracePeriodDays");
    elements.customFineEnabled = document.getElementById("customFineEnabled");
    elements.customFineAmount = document.getElementById("customFineAmount");
    elements.customFineStartSummary = document.getElementById("customFineStartSummary");
    elements.saveCustomContribution = document.getElementById("saveCustomContribution");
    elements.cancelCustomContribution = document.getElementById("cancelCustomContribution");
    elements.customContributionsList = document.getElementById("customContributionsList");

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

    [
        elements.monthlyContributionForm,
        elements.customContributionForm
    ].forEach((form) => {
        if (!form) return;
        form.querySelectorAll("input, select, textarea, button")
            .forEach((element) => {
                element.disabled = !canEditContributionSettings;
            });
    });

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

    if (!name) {
        throw new Error(
            "Group name is required."
        );
    }

    const { error } =
        await groupManagementApi.updateGroup(currentGroup.id,{
            name,
            category,
            country
        });

    if (error) {
        throw error;
    }


    currentGroup = {
        ...currentGroup,
        name,
        category,
        country,
        monthly_contribution:
            currentGroup.monthly_contribution
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
   CONTRIBUTION RULE UI
================================================================ */

function getCheckedValue(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || "none";
}

function syncContributionRuleUI(kind) {
    const isMonthly = kind === "monthly";
    const graceMode = getCheckedValue(isMonthly ? "monthlyGraceMode" : "customGraceMode");
    const graceDays = isMonthly ? elements.monthlyGraceDays : elements.customGraceDays;
    const fineEnabled = isMonthly ? elements.monthlyFineEnabled : elements.customFineEnabled;
    const fineAmount = isMonthly ? elements.monthlyFineAmount : elements.customFineAmount;
    const summary = isMonthly ? elements.monthlyRuleSummary : elements.customRuleSummary;

    if (!graceDays || !fineEnabled || !fineAmount || !summary) return;

    graceDays.disabled = graceMode !== "days" || !canEditContributionSettings;
    fineAmount.disabled = !fineEnabled.checked || !canEditContributionSettings;

    const graceText = graceMode === "days"
        ? `${graceDays.value || "0"} day${Number(graceDays.value) === 1 ? "" : "s"} grace period`
        : "No grace period";

    const fineText = fineEnabled.checked
        ? `Fine KSh ${fineAmount.value || "0"} after grace period`
        : "No fine applies";

    summary.textContent = `${graceText}. ${fineText}.`;
}

function validateContributionRuleUI(kind) {
    const isMonthly = kind === "monthly";
    const graceMode = getCheckedValue(isMonthly ? "monthlyGraceMode" : "customGraceMode");
    const graceDays = isMonthly ? elements.monthlyGraceDays : elements.customGraceDays;
    const fineEnabled = isMonthly ? elements.monthlyFineEnabled : elements.customFineEnabled;
    const fineAmount = isMonthly ? elements.monthlyFineAmount : elements.customFineAmount;

    if (graceMode === "days" && (!Number.isInteger(Number(graceDays.value)) || Number(graceDays.value) < 1)) {
        throw new Error("Grace period must be a whole number of days.");
    }

    if (fineEnabled.checked && (!Number.isFinite(Number(fineAmount.value)) || Number(fineAmount.value) <= 0)) {
        throw new Error("Fine amount must be greater than zero when a fine is enabled.");
    }
}

function showContributionStatus(message, type = "info") {
    if (!elements.groupManagementStatus) return;
    elements.groupManagementStatus.textContent = message;
    elements.groupManagementStatus.className = `management-status is-visible ${type}`;
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


async function saveMonthlyContribution(event) {
    event?.preventDefault();

    if (!currentGroup?.id) {
        throw new Error("No active group is available.");
    }

    if (!canEditContributionSettings) {
        throw new Error("You do not have permission to update contribution settings.");
    }

    const amount = Number(elements.monthlyContribution?.value || 0);
    const rawClosingDay = elements.closingDay?.value?.trim();
    const closingDay = Number(rawClosingDay);

    if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Monthly contribution must be a valid non-negative number.");
    }

    if (!rawClosingDay || !Number.isInteger(closingDay) || closingDay < 1 || closingDay > 28) {
        throw new Error("Closing day must be a whole number between 1 and 28.");
    }

    validateContributionRuleUI("monthly");

    if (currentRole === "admin") {
        const groupResult = await groupManagementApi.updateGroup(
            currentGroup.id,
            { monthly_contribution: amount }
        );

        if (groupResult.error) throw groupResult.error;
    }

    const settingsResult = await groupManagementApi.rpc(
        "update_group_contribution_settings",
        {
            p_group_id: currentGroup.id,
            p_monthly_closing_day: closingDay
        }
    );

    if (settingsResult.error) throw settingsResult.error;

    currentGroup = {
        ...currentGroup,
        monthly_contribution: amount
    };

    await loadContributionSettings();
    renderGroup();

    showContributionStatus(
        currentRole === "admin"
            ? "Monthly contribution amount and closing day saved. Rule/fine values remain UI-only until the backend rule contract is approved."
            : "Monthly closing day saved. Monthly amount changes require an admin role; rule/fine values remain UI-only until the backend rule contract is approved.",
        "success"
    );
}

async function saveCustomContribution(event) {
    event?.preventDefault();

    if (!canEditContributionSettings) {
        throw new Error("You do not have permission to manage contribution settings.");
    }

    const name = elements.customContributionName?.value?.trim();
    const amount = Number(elements.customContributionAmount?.value || 0);
    const startDate = elements.customContributionStartDate?.value;
    const endDate = elements.customContributionEndDate?.value;

    if (!name) throw new Error("Contribution name is required.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount due must be greater than zero.");
    if (!startDate || !endDate) throw new Error("Start date and end date are required.");
    if (endDate < startDate) throw new Error("End date cannot be before the start date.");

    validateContributionRuleUI("custom");

    showContributionStatus(
        "Custom contribution form is valid. Saving is intentionally blocked until the backend contribution-type/cycle contract is approved; no database write was performed.",
        "info"
    );
}

async function saveContributionSettings(event) {
    return saveMonthlyContribution(event);
}


/* ================================================================
   CONTRIBUTION SETTINGS — UI GATE
================================================================ */

function getGraceDays(prefix) {
    const name = prefix === "monthly" ? "monthlyGracePeriodMode" : "customGracePeriodMode";
    const selected = Array.from(document.querySelectorAll('input[name="' + name + '"]')).find((radio) => radio.checked);
    if (!selected || selected.value !== "days") return 0;
    const value = Number(elements[prefix + "GracePeriodDays"]?.value || 0);
    return Number.isInteger(value) && value >= 0 ? value : 0;
}

function updateFineSummary(prefix) {
    const summary = elements[prefix + "FineStartSummary"];
    if (!summary) return;
    const enabled = Boolean(elements[prefix + "FineEnabled"]?.checked);
    const graceDays = getGraceDays(prefix);
    summary.textContent = !enabled ? "No fine configured" : graceDays > 0 ? "After closing date + " + graceDays + " day" + (graceDays === 1 ? "" : "s") + " grace" : "Immediately after the closing date";
}

function syncGracePeriodControls(prefix) {
    const name = prefix === "monthly" ? "monthlyGracePeriodMode" : "customGracePeriodMode";
    const enabled = Array.from(document.querySelectorAll('input[name="' + name + '"]')).some((radio) => radio.checked && radio.value === "days");
    const days = elements[prefix + "GracePeriodDays"];
    if (days) { days.disabled = !enabled; if (!enabled) days.value = "0"; }
    updateFineSummary(prefix);
}

function syncFineControls(prefix) {
    const enabled = Boolean(elements[prefix + "FineEnabled"]?.checked);
    const amount = elements[prefix + "FineAmount"];
    if (amount) { amount.disabled = !enabled; if (!enabled) amount.value = ""; }
    updateFineSummary(prefix);
}

function renderCustomContributionDrafts() {
    if (!elements.customContributionsList) return;
    elements.customContributionsList.replaceChildren();
    if (!customContributionDrafts.length) {
        const empty = document.createElement("div");
        empty.className = "custom-contribution-empty";
        empty.textContent = "No custom contributions have been added in this UI session.";
        elements.customContributionsList.appendChild(empty);
        return;
    }
    customContributionDrafts.forEach((item) => {
        const card = document.createElement("div");
        card.className = "custom-contribution-summary";
        const title = document.createElement("strong");
        title.textContent = item.name;
        const meta = document.createElement("div");
        meta.className = "custom-contribution-summary-meta";
        meta.textContent = "KSh " + item.amount.toLocaleString() + " · " + item.startDate + " to " + item.endDate + " · " + item.frequencyLabel;
        const rules = document.createElement("div");
        rules.className = "custom-contribution-summary-meta";
        rules.textContent = item.fineEnabled ? "Grace period: " + item.graceDays + " day" + (item.graceDays === 1 ? "" : "s") + " · Fine: KSh " + item.fineAmount.toLocaleString() : "Grace period: " + item.graceDays + " day" + (item.graceDays === 1 ? "" : "s") + " · No fine";
        card.append(title, meta, rules);
        elements.customContributionsList.appendChild(card);
    });
}

function resetCustomContributionForm() {
    ["customContributionName","customContributionAmount","customContributionStartDate","customContributionEndDate","customContributionDueDate","customContributionDescription","customFineAmount"].forEach((key) => { if (elements[key]) elements[key].value = ""; });
    if (elements.customContributionFrequency) elements.customContributionFrequency.value = "one_time";
    document.querySelectorAll('input[name="customGracePeriodMode"]').forEach((radio) => { radio.checked = radio.value === "none"; });
    if (elements.customGracePeriodDays) elements.customGracePeriodDays.value = "0";
    if (elements.customFineEnabled) elements.customFineEnabled.checked = false;
    syncGracePeriodControls("custom");
    syncFineControls("custom");
}

function showContributionStatus(message, type = "info") {
    if (!elements.groupManagementStatus) return;
    elements.groupManagementStatus.textContent = message;
    elements.groupManagementStatus.className = "management-status is-visible " + type;
}

function saveCustomContributionDraft() {
    if (!canEditContributionSettings) throw new Error("You do not have permission to configure contributions.");
    const name = elements.customContributionName?.value.trim();
    const amount = Number(elements.customContributionAmount?.value || 0);
    const startDate = elements.customContributionStartDate?.value;
    const endDate = elements.customContributionEndDate?.value;
    const dueDate = elements.customContributionDueDate?.value;
    const frequency = elements.customContributionFrequency?.value || "one_time";
    const description = elements.customContributionDescription?.value.trim() || "";
    const graceDays = getGraceDays("custom");
    const fineEnabled = Boolean(elements.customFineEnabled?.checked);
    const fineAmount = Number(elements.customFineAmount?.value || 0);
    if (!name) throw new Error("Custom contribution name is required.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount due must be greater than zero.");
    if (!startDate || !endDate) throw new Error("Start date and end date are required.");
    if (endDate < startDate) throw new Error("End date cannot be before the start date.");
    if (dueDate && (dueDate < startDate || dueDate > endDate)) throw new Error("Due date must fall between the start and end dates.");
    if (fineEnabled && (!Number.isFinite(fineAmount) || fineAmount <= 0)) throw new Error("Fine amount must be greater than zero when a fine is enabled.");
    const frequencyLabels = { one_time: "One-time", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" };
    customContributionDrafts.push({name, amount, startDate, endDate, dueDate, frequency, frequencyLabel: frequencyLabels[frequency] || frequency, description, graceDays, fineEnabled, fineAmount});
    renderCustomContributionDrafts();
    resetCustomContributionForm();
    elements.customContributionEditor.hidden = true;
    showContributionStatus("Custom contribution validated and added to this UI session. Backend persistence is intentionally not connected in this gate.", "info");
}

function saveMonthlyContributionUiSettings() {
    if (!canEditContributionSettings) throw new Error("You do not have permission to configure contributions.");
    const startDate = elements.monthlyContributionStartDate?.value;
    const closingDay = Number(elements.monthlyContributionClosingDay?.value || elements.closingDay?.value || 0);
    const fineEnabled = Boolean(elements.monthlyFineEnabled?.checked);
    const fineAmount = Number(elements.monthlyFineAmount?.value || 0);
    if (!startDate) throw new Error("Monthly contribution start date is required.");
    if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 28) throw new Error("Monthly closing day must be between 1 and 28.");
    if (fineEnabled && (!Number.isFinite(fineAmount) || fineAmount <= 0)) throw new Error("Fine amount must be greater than zero when a fine is enabled.");
    if (elements.closingDay) elements.closingDay.value = String(closingDay);
    showContributionStatus("Monthly contribution settings validated. Existing backend persistence remains governed by the current contribution-settings contract.", "info");
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

    elements.monthlyContributionForm?.addEventListener("submit", async (event) => {
        try {
            await saveMonthlyContribution(event);
        } catch (error) {
            console.error("Failed to save monthly contribution:", error);
            showContributionStatus(error?.message || "Monthly contribution could not be saved.", "error");
        }
    });

    elements.customContributionForm?.addEventListener("submit", async (event) => {
        try {
            await saveCustomContribution(event);
        } catch (error) {
            console.error("Failed to validate custom contribution:", error);
            showContributionStatus(error?.message || "Custom contribution could not be saved.", "error");
        }
    });

    document.querySelectorAll('input[name="monthlyGraceMode"]').forEach((input) => {
        input.addEventListener("change", () => syncContributionRuleUI("monthly"));
    });
    document.querySelectorAll('input[name="customGraceMode"]').forEach((input) => {
        input.addEventListener("change", () => syncContributionRuleUI("custom"));
    });
    elements.monthlyFineEnabled?.addEventListener("change", () => syncContributionRuleUI("monthly"));
    elements.customFineEnabled?.addEventListener("change", () => syncContributionRuleUI("custom"));
    elements.monthlyGraceDays?.addEventListener("input", () => syncContributionRuleUI("monthly"));
    elements.monthlyFineAmount?.addEventListener("input", () => syncContributionRuleUI("monthly"));
    elements.customGraceDays?.addEventListener("input", () => syncContributionRuleUI("custom"));
    elements.customFineAmount?.addEventListener("input", () => syncContributionRuleUI("custom"));


    /* ------------------------------------------------------------
       CONTRIBUTION SETTINGS UI
    ------------------------------------------------------------ */

    elements.newCustomContributionButton?.addEventListener("click", () => {
        elements.customContributionEditor.hidden = false;
        elements.customContributionName?.focus();
    });
    elements.cancelCustomContribution?.addEventListener("click", () => {
        resetCustomContributionForm();
        elements.customContributionEditor.hidden = true;
    });
    elements.saveCustomContribution?.addEventListener("click", () => {
        try { saveCustomContributionDraft(); } catch (error) { showContributionStatus(error.message, "error"); }
    });
    elements.saveMonthlyContributionSettings?.addEventListener("click", () => {
        try { saveMonthlyContributionUiSettings(); } catch (error) { showContributionStatus(error.message, "error"); }
    });
    document.querySelectorAll('input[name="monthlyGracePeriodMode"]').forEach((radio) => radio.addEventListener("change", () => syncGracePeriodControls("monthly")));
    document.querySelectorAll('input[name="customGracePeriodMode"]').forEach((radio) => radio.addEventListener("change", () => syncGracePeriodControls("custom")));
    elements.monthlyFineEnabled?.addEventListener("change", () => syncFineControls("monthly"));
    elements.customFineEnabled?.addEventListener("change", () => syncFineControls("custom"));
    syncGracePeriodControls("monthly");
    syncGracePeriodControls("custom");
    syncFineControls("monthly");
    syncFineControls("custom");
    renderCustomContributionDrafts();

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
    syncContributionRuleUI("monthly");
    syncContributionRuleUI("custom");

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
    saveCustomContributionDraft,
    saveMonthlyContributionUiSettings,
    saveMonthlyContribution,
    saveCustomContribution,

    loadContributionSettings,
    loadLeadershipSetup,
    loadSubscription
};

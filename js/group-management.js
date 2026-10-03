/* ================================================================
   CHAMA LIVE — ADMIN GROUP MANAGEMENT
================================================================ */

import {
    supabase,
    getMyApplicationContext
} from "./auth.js";


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
let canManageGroup = false;

let subscription = null;
let contributionSettings = null;

let contributionTypes = [];
let contributionInitiatives = [];

let initiativeMembers = [];
let configuringInitiativeId = null;

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

    contributionTypesList: null,

    createInitiativeForm: null,
    createInitiativeButton: null,
    initiativeContributionType: null,
    initiativeName: null,
    initiativeDescription: null,
    initiativeStartDate: null,
    initiativeClosingDate: null,
    initiativeDefaultAmount: null,
    initiativeFrequency: null,

    contributionInitiativesList: null,
    contributionProgramStatus: null,

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

    elements.contributionTypesList =
        document.getElementById("contributionTypesList");

    elements.createInitiativeForm =
        document.getElementById("createInitiativeForm");

    elements.createInitiativeButton =
        document.getElementById("createInitiativeButton");

    elements.initiativeContributionType =
        document.getElementById("initiativeContributionType");

    elements.initiativeName =
        document.getElementById("initiativeName");

    elements.initiativeDescription =
        document.getElementById("initiativeDescription");

    elements.initiativeStartDate =
        document.getElementById("initiativeStartDate");

    elements.initiativeClosingDate =
        document.getElementById("initiativeClosingDate");

    elements.initiativeDefaultAmount =
        document.getElementById("initiativeDefaultAmount");

    elements.initiativeFrequency =
        document.getElementById("initiativeFrequency");

    elements.contributionInitiativesList =
        document.getElementById("contributionInitiativesList");

    elements.contributionProgramStatus =
        document.getElementById("contributionProgramStatus");

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


function isInitiativeManager() {
    return (
        currentRole === "admin" ||
        currentRole === "chairperson"
    );
}


function applyAuthorization() {
    // The groups update policy and contribution-settings RPC require admin.
    canManageGroup = currentRole === "admin";
}


function applyAuthorizationUI() {
    const manager =
        Boolean(canManageGroup);

    if (elements.groupForm) {
        elements.groupForm
            .querySelectorAll(
                "input, select, textarea, button"
            )
            .forEach((element) => {
                element.disabled = !manager;
            });
    }

    if (elements.saveContributionSettings) {
        elements.saveContributionSettings.disabled =
            !manager;
    }

    if (elements.createInitiativeForm) {
        elements.createInitiativeForm
            .querySelectorAll(
                "input, select, textarea, button"
            )
            .forEach((element) => {
                element.disabled = !isInitiativeManager();
            });
    }

    if (elements.permissionMessage) {
        elements.permissionMessage.hidden =
            manager;
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

    if (!canManageGroup) {
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

    const rawClosingDay = elements.closingDay?.value?.trim();
    const closingDay = Number(rawClosingDay);

    if (!rawClosingDay || !Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
        throw new Error("Closing day must be a whole number between 1 and 31.");
    }

    const { error } =
        await supabase
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
            );

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

    if (elements.contributionProgramStatus) {
        elements.contributionProgramStatus.textContent =
            "Group information saved successfully.";

        elements.contributionProgramStatus.className =
            "program-status ready";
    }
}


/* ================================================================
   LEADERSHIP SETUP
================================================================ */

async function loadLeadershipSetup() {
    if (!currentGroup?.id || !elements.leadershipList) return;

    const { data, error } = await supabase
        .from("members")
        .select("id, name, actual_position, actual_position_name")
        .eq("group_id", currentGroup.id)
        .not("actual_position", "is", null)
        .order("name", { ascending: true });

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

    if (!canManageGroup) {
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
        closingDay > 31
    ) {
        throw new Error(
            "Closing day must be a whole number between 1 and 31."
        );
    }

    const { error } =
        await supabase.rpc(
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

    if (elements.contributionProgramStatus) {
        elements.contributionProgramStatus.textContent =
            "Contribution closing day saved successfully.";

        elements.contributionProgramStatus.className =
            "program-status ready";
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
            subscription?.amount !== null &&
            subscription?.amount !== undefined
                ? String(subscription.amount)
                : "—";
    }
}


/* ================================================================
   CONTRIBUTION TYPE HELPERS
================================================================ */

function renderContributionTypeOptions() {
    const select =
        elements.initiativeContributionType;

    if (!select) {
        return;
    }

    const currentValue =
        select.value;

    select.replaceChildren();

    const placeholder =
        document.createElement("option");

    placeholder.value = "";
    placeholder.textContent =
        "Select contribution type";

    select.appendChild(placeholder);

    contributionTypes.forEach((type) => {
        const option =
            document.createElement("option");

        option.value = type.id;

        option.textContent =
            type.name ||
            type.code ||
            "Contribution type";

        select.appendChild(option);
    });

    if (
        currentValue &&
        contributionTypes.some(
            (type) =>
                type.id === currentValue
        )
    ) {
        select.value = currentValue;
    }
}


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

        renderContributionTypeOptions();

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

        appendTextRow(
            item,
            "Code",
            type.code || "—"
        );

        container.appendChild(item);
    });

    renderContributionTypeOptions();
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
            [
                "id",
                "name",
                "code",
                "created_at"
            ].join(", ")
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
   GENERIC RENDER HELPERS
================================================================ */

function appendTextRow(
    container,
    label,
    value
) {
    const row =
        document.createElement("div");

    row.className =
        "program-row";

    const labelElement =
        document.createElement("span");

    labelElement.className =
        "program-label";

    labelElement.textContent =
        label;

    const valueElement =
        document.createElement("span");

    valueElement.className =
        "program-value";

    valueElement.textContent =
        value;

    row.append(
        labelElement,
        valueElement
    );

    container.appendChild(row);
}


function appendEmptyState(
    container,
    message
) {
    const empty =
        document.createElement("div");

    empty.className =
        "program-empty";

    empty.textContent =
        message;

    container.appendChild(empty);
}


/* ================================================================
   INITIATIVE HELPERS
================================================================ */

function getInitiativeById(
    initiativeId
) {
    return (
        contributionInitiatives.find(
            (initiative) =>
                initiative.id === initiativeId
        ) || null
    );
}


function isMonthlyInitiative(
    initiative
) {
    return (
        normalizeLower(
            initiative?.frequency
        ) === "monthly"
    );
}


function isOneTimeInitiative(
    initiative
) {
    const frequency =
        normalizeLower(
            initiative?.frequency
        );

    return (
        frequency === "one_time" ||
        frequency === "once" ||
        frequency === "one-time"
    );
}


function getFirstFullRecurringMonth(
    startDate
) {
    if (!startDate) {
        throw new Error(
            "A recurring initiative requires a valid start date."
        );
    }

    const date =
        new Date(
            `${startDate}T00:00:00`
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        throw new Error(
            "The recurring initiative start date is invalid."
        );
    }

    const first =
        new Date(
            date.getFullYear(),
            date.getMonth() + 1,
            1
        );

    return [
        first.getFullYear(),
        String(
            first.getMonth() + 1
        ).padStart(2, "0"),
        "01"
    ].join("-");
}


function getCurrentRecurringPeriodKey() {
    const now =
        new Date();

    return [
        now.getFullYear(),
        String(
            now.getMonth() + 1
        ).padStart(2, "0")
    ].join("-");
}


/* ================================================================
   CREATE CONTRIBUTION INITIATIVE
================================================================ */

async function createContributionInitiative(
    event
) {
    event?.preventDefault();

    if (!currentGroup?.id) {
        throw new Error(
            "No active group is available."
        );
    }

    if (!isInitiativeManager()) {
        throw new Error(
            "Initiative creation requires an admin or chairperson role."
        );
    }

    const contributionTypeId =
        elements.initiativeContributionType?.value?.trim();

    const name =
        elements.initiativeName?.value?.trim();

    const description =
        elements.initiativeDescription?.value?.trim() ||
        null;

    const startDate =
        elements.initiativeStartDate?.value?.trim();

    const closingDate =
        elements.initiativeClosingDate?.value?.trim();

    const rawAmount =
        elements.initiativeDefaultAmount?.value?.trim();

    const frequency =
        normalizeLower(
            elements.initiativeFrequency?.value
        );

    if (!contributionTypeId) {
        throw new Error(
            "Please select a contribution type."
        );
    }

    if (
        !contributionTypes.some(
            (type) =>
                type.id === contributionTypeId
        )
    ) {
        throw new Error(
            "The selected contribution type is not available for the current group."
        );
    }

    if (!name) {
        throw new Error(
            "Initiative name is required."
        );
    }

    if (!startDate) {
        throw new Error(
            "Initiative start date is required."
        );
    }

    if (!closingDate) {
        throw new Error(
            "Initiative closing date is required."
        );
    }

    if (
        closingDate <
        startDate
    ) {
        throw new Error(
            "Initiative closing date cannot be before the start date."
        );
    }

    if (
        frequency !== "monthly" &&
        !isOneTimeInitiative({
            frequency
        })
    ) {
        throw new Error(
            "Please select a valid initiative frequency."
        );
    }

    let defaultAmount = null;

    if (rawAmount) {
        defaultAmount =
            Number(rawAmount);

        if (
            !Number.isFinite(
                defaultAmount
            ) ||
            defaultAmount < 0
        ) {
            throw new Error(
                "Default amount must be a valid non-negative number."
            );
        }
    }

    const payload = {
        group_id:
            currentGroup.id,

        contribution_type_id:
            contributionTypeId,

        name,

        description,

        start_date:
            startDate,

        closing_date:
            closingDate,

        default_amount:
            defaultAmount,

        frequency,

        status:
            "draft"
    };

    const {
        data,
        error
    } = await supabase
        .rpc("create_contribution_initiative", {
            p_group_id: payload.group_id,
            p_contribution_type_id: payload.contribution_type_id,
            p_name: payload.name,
            p_description: payload.description,
            p_start_date: payload.start_date,
            p_closing_date: payload.closing_date,
            p_default_amount: payload.default_amount,
            p_frequency: payload.frequency,
            p_request_id: crypto.randomUUID()
        });

    if (error) {
        throw error;
    }

    await loadContributionInitiatives();

    if (
        elements.createInitiativeForm
    ) {
        elements.createInitiativeForm.reset();
    }

    renderContributionTypeOptions();

    if (
        elements.contributionProgramStatus
    ) {
        elements.contributionProgramStatus.textContent =
            `Contribution initiative "${data?.name || name}" created as Draft. Configure its participants before activation.`;

        elements.contributionProgramStatus.className =
            "program-status ready";
    }

    return data;
}


/* ================================================================
   INITIATIVE MEMBER LOADING
================================================================ */

async function loadInitiativeMembers() {
    if (!currentGroup?.id) {
        return [];
    }

    const {
        data,
        error
    } = await supabase
        .from("members")
        .select(
            [
                "id",
                "group_id",
                "user_id",
                "name",
                "status"
            ].join(", ")
        )
        .eq(
            "group_id",
            currentGroup.id
        )
        .order(
            "name",
            {
                ascending: true
            }
        );

    if (error) {
        throw error;
    }

    initiativeMembers =
        Array.isArray(data)
            ? data
            : [];

    return initiativeMembers;
}


/* ================================================================
   ONE-TIME PARTICIPANT STATE
================================================================ */

async function loadOneTimeParticipantState(
    initiativeId
) {
    const {
        data,
        error
    } = await supabase.rpc(
        "get_contribution_initiative_participants",
        {
            p_initiative_id:
                initiativeId
        }
    );

    if (error) {
        throw error;
    }

    return Array.isArray(data)
        ? data
        : data
            ? [data]
            : [];
}


/* ================================================================
   RECURRING PARTICIPANT STATE
================================================================ */

async function loadRecurringParticipantState(
    initiativeId
) {
    const {
        data,
        error
    } = await supabase.rpc(
        "get_contribution_initiative_recurring_participants",
        {
            p_initiative_id:
                initiativeId
        }
    );

    if (error) {
        throw error;
    }

    return Array.isArray(data)
        ? data
        : data
            ? [data]
            : [];
}


/* ================================================================
   PARTICIPANT STATUS HELPERS
================================================================ */

function getParticipantStatus(
    state,
    memberId
) {
    return (
        state.find(
            (participant) =>
                participant.member_id ===
                memberId
        ) || null
    );
}


function createParticipantRow(
    member,
    participant,
    options = {}
) {
    const {
        recurring = false
    } = options;

    const row =
        document.createElement("div");

    row.className =
        "initiative-participant-row";

    row.dataset.memberId =
        member.id;

    const checkbox =
        document.createElement("input");

    checkbox.type =
        "checkbox";

    checkbox.dataset.memberId =
        member.id;

    checkbox.checked =
        Boolean(participant);

    const name =
        document.createElement("span");

    name.className =
        "initiative-participant-name";

    name.textContent =
        member.name ||
        "Member";

    row.append(
        checkbox,
        name
    );

    if (recurring) {
        const amount =
            document.createElement("input");

        amount.type =
            "number";

        amount.min =
            "0";

        amount.step =
            "0.01";

        amount.className =
            "initiative-participant-amount";

        amount.dataset.memberId =
            member.id;

        amount.value =
            participant?.amount ?? "";

        amount.placeholder =
            "Amount";

        const effective =
            document.createElement("input");

        effective.type =
            "date";

        effective.className =
            "initiative-recurring-effective";

        effective.dataset.memberId =
            member.id;

        effective.value =
            participant?.effective_from ?? "";

        row.append(
            amount,
            effective
        );
    }

    return row;
}


/* ================================================================
   ONE-TIME PARTICIPANT EDITOR
================================================================ */

function renderOneTimeParticipantEditor(
    initiative,
    state
) {
    const container =
        elements.contributionInitiativesList;

    if (!container) {
        return;
    }

    clearInitiativeParticipantEditor();

    const editor =
        document.createElement("div");

    editor.className =
        "initiative-participant-editor";

    editor.dataset.initiativeId =
        initiative.id;

    const heading =
        document.createElement("h4");

    heading.textContent =
        `Configure participants — ${initiative.name || "Initiative"}`;

    editor.appendChild(heading);

    const description =
        document.createElement("p");

    description.textContent =
        "Select the members who should participate in this one-time initiative.";

    editor.appendChild(description);

    const list =
        document.createElement("div");

    list.className =
        "initiative-participant-list";

    initiativeMembers.forEach((member) => {
        const participant =
            getParticipantStatus(
                state,
                member.id
            );

        list.appendChild(
            createParticipantRow(
                member,
                participant
            )
        );
    });

    editor.appendChild(list);

    const status =
        document.createElement("div");

    status.className =
        "initiative-participant-status";

    editor._participantStatus =
        status;

    editor.appendChild(status);

    const actions =
        document.createElement("div");

    actions.className =
        "program-actions";

    const saveButton =
        document.createElement("button");

    saveButton.type =
        "button";

    saveButton.className =
        "btn btn-primary";

    saveButton.dataset
        .saveInitiativeParticipants =
        "true";

    saveButton.textContent =
        "Save Participants";

    const cancelButton =
        document.createElement("button");

    cancelButton.type =
        "button";

    cancelButton.className =
        "btn btn-secondary";

    cancelButton.dataset
        .cancelInitiativeParticipants =
        "true";

    cancelButton.textContent =
        "Cancel";

    actions.append(
        saveButton,
        cancelButton
    );

    editor.appendChild(actions);

    container.appendChild(editor);
}


/* ================================================================
   ONE-TIME PARTICIPANT CONFIGURATION
================================================================ */

async function configureInitiativeParticipants(
    initiativeId
) {
    if (!currentGroup?.id) {
        throw new Error(
            "No active group is available."
        );
    }

    if (!isInitiativeManager()) {
        throw new Error(
            "Participant configuration requires an admin or chairperson role."
        );
    }

    const initiative =
        getInitiativeById(
            initiativeId
        );

    if (!initiative) {
        throw new Error(
            "The selected initiative is no longer available."
        );
    }

    if (!isOneTimeInitiative(initiative)) {
        throw new Error(
            "The selected initiative is not a one-time initiative."
        );
    }

    if (
        normalizeLower(
            initiative.status
        ) !== "draft"
    ) {
        throw new Error(
            "Only Draft initiatives can be configured."
        );
    }

    const [
        members,
        state
    ] = await Promise.all([
        loadInitiativeMembers(),
        loadOneTimeParticipantState(
            initiative.id
        )
    ]);

    initiativeMembers =
        Array.isArray(members)
            ? members
            : [];

    renderOneTimeParticipantEditor(
        initiative,
        state
    );
}


/* ================================================================
   ONE-TIME PARTICIPANT SAVE
================================================================ */

async function saveInitiativeParticipants(
    initiative,
    editor
) {
    if (!currentGroup?.id) {
        throw new Error(
            "No active group is available."
        );
    }

    if (!isInitiativeManager()) {
        throw new Error(
            "Participant configuration requires an admin or chairperson role."
        );
    }

    if (!initiative) {
        throw new Error(
            "The selected initiative is no longer available."
        );
    }

    if (
        normalizeLower(
            initiative.status
        ) !== "draft"
    ) {
        throw new Error(
            "Only Draft initiatives can be configured."
        );
    }

    const memberIds =
        new Set(
            initiativeMembers.map(
                (member) => member.id
            )
        );

    const selectedIds =
        Array.from(
            editor.querySelectorAll(
                'input[type="checkbox"][data-member-id]:checked'
            )
        ).map(
            (checkbox) =>
                checkbox.dataset.memberId
        );

    for (
        const memberId of selectedIds
    ) {
        if (
            !memberId ||
            !memberIds.has(memberId)
        ) {
            throw new Error(
                "One or more selected members do not belong to the current group."
            );
        }
    }

    const status =
        editor._participantStatus;

    const saveButton =
        editor.querySelector(
            '[data-save-initiative-participants="true"]'
        );

    const cancelButton =
        editor.querySelector(
            '[data-cancel-initiative-participants="true"]'
        );

    if (status) {
        status.className =
            "initiative-participant-status";

        status.textContent =
            "Saving participant configuration…";
    }

    if (saveButton) {
        saveButton.disabled = true;
    }

    if (cancelButton) {
        cancelButton.disabled = true;
    }

    try {
        const {
            error
        } = await supabase.rpc(
            "set_contribution_initiative_members",
            {
                p_initiative_id:
                    initiative.id,

                p_members:
                    selectedIds.map(
                        (memberId) => ({
                            member_id:
                                memberId,

                            amount:
                                Number(initiative.default_amount ?? 0)
                        })
                    ),

                p_request_id:
                    crypto.randomUUID()
            }
        );

        if (error) {
            throw error;
        }

        await loadContributionInitiatives();

        clearInitiativeParticipantEditor();

        if (
            elements.contributionProgramStatus
        ) {
            elements.contributionProgramStatus.textContent =
                "Initiative participants saved successfully.";

            elements.contributionProgramStatus.className =
                "program-status ready";
        }
    } catch (error) {
        if (status) {
            status.className =
                "initiative-participant-status error";

            status.textContent =
                error?.message ||
                "Failed to save participant configuration.";
        }

        if (saveButton) {
            saveButton.disabled = false;
        }

        if (cancelButton) {
            cancelButton.disabled = false;
        }

        throw error;
    }
}


/* ================================================================
   ONE-TIME INITIATIVE ACTIVATION
================================================================ */

async function activateInitiative(
    initiativeId
) {
    if (!currentGroup?.id) {
        throw new Error(
            "No active group is available."
        );
    }

    if (!isInitiativeManager()) {
        throw new Error(
            "Initiative activation requires an admin or chairperson role."
        );
    }

    const initiative =
        getInitiativeById(
            initiativeId
        );

    if (!initiative) {
        throw new Error(
            "The selected initiative is no longer available."
        );
    }

    if (
        normalizeLower(
            initiative.status
        ) !== "draft"
    ) {
        throw new Error(
            "Only Draft initiatives can be activated."
        );
    }

    const {
        error
    } = await supabase.rpc(
        "activate_contribution_initiative",
        {
            p_initiative_id:
                initiative.id,

            p_request_id:
                crypto.randomUUID()
        }
    );

    if (error) {
        throw error;
    }

    await loadContributionInitiatives();

    if (
        elements.contributionProgramStatus
    ) {
        elements.contributionProgramStatus.textContent =
            "Contribution initiative activated successfully.";

        elements.contributionProgramStatus.className =
            "program-status ready";
    }
}


/* ================================================================
   INITIATIVE EDITOR CLEANUP
================================================================ */

function clearInitiativeParticipantEditor() {
    const existing =
        elements.contributionInitiativesList
            ?.querySelector(
                ".initiative-participant-editor"
            );

    if (existing) {
        existing.remove();
    }

    configuringInitiativeId =
        null;
}


/* ================================================================
   RECURRING PARTICIPANT EDITOR
================================================================ */

function renderRecurringParticipantEditor(
    initiative,
    state
) {
    const container =
        elements.contributionInitiativesList;

    if (!container) {
        return;
    }

    clearInitiativeParticipantEditor();

    const editor =
        document.createElement("div");

    editor.className =
        "initiative-participant-editor";

    editor.dataset.initiativeId =
        initiative.id;

    const heading =
        document.createElement("h4");

    heading.textContent =
        `Configure recurring participants — ${initiative.name || "Initiative"}`;

    editor.appendChild(heading);

    const description =
        document.createElement("p");

    description.textContent =
        "Select each participating member and define the amount and first effective calendar month for the recurring term.";

    editor.appendChild(description);

    const list =
        document.createElement("div");

    list.className =
        "initiative-participant-list";

    initiativeMembers.forEach((member) => {
        const participant =
            getParticipantStatus(
                state,
                member.id
            );

        list.appendChild(
            createParticipantRow(
                member,
                participant,
                {
                    recurring: true
                }
            )
        );
    });

    editor.appendChild(list);

    const status =
        document.createElement("div");

    status.className =
        "initiative-participant-status";

    editor._participantStatus =
        status;

    editor.appendChild(status);

    const actions =
        document.createElement("div");

    actions.className =
        "program-actions";

    const saveButton =
        document.createElement("button");

    saveButton.type =
        "button";

    saveButton.className =
        "btn btn-primary";

    saveButton.dataset
        .saveRecurringParticipants =
        "true";

    saveButton.textContent =
        "Save Recurring Terms";

    const cancelButton =
        document.createElement("button");

    cancelButton.type =
        "button";

    cancelButton.className =
        "btn btn-secondary";

    cancelButton.dataset
        .cancelInitiativeParticipants =
        "true";

    cancelButton.textContent =
        "Cancel";

    actions.append(
        saveButton,
        cancelButton
    );

    editor.appendChild(actions);

    container.appendChild(editor);
}


/* ================================================================
   RECURRING PARTICIPANT CONFIGURATION
================================================================ */

async function configureRecurringInitiative(
    initiativeId
) {
    if (!currentGroup?.id) {
        throw new Error(
            "No active group is available."
        );
    }

    if (!isInitiativeManager()) {
        throw new Error(
            "Recurring configuration requires an admin or chairperson role."
        );
    }

    const initiative =
        getInitiativeById(
            initiativeId
        );

    if (!initiative) {
        throw new Error(
            "The selected initiative is no longer available."
        );
    }

    if (!isMonthlyInitiative(initiative)) {
        throw new Error(
            "The selected initiative is not a monthly recurring initiative."
        );
    }

    if (
        normalizeLower(
            initiative.status
        ) !== "draft"
    ) {
        throw new Error(
            "Only Draft recurring initiatives can be configured."
        );
    }

    configuringInitiativeId =
        initiative.id;

    const [
        members,
        state
    ] = await Promise.all([
        loadInitiativeMembers(),
        loadRecurringParticipantState(
            initiative.id
        )
    ]);

    initiativeMembers =
        Array.isArray(members)
            ? members
            : [];

    const currentInitiative =
        getInitiativeById(
            initiative.id
        );

    if (!currentInitiative) {
        clearInitiativeParticipantEditor();

        throw new Error(
            "The selected initiative is no longer available."
        );
    }

    if (!isMonthlyInitiative(currentInitiative)) {
        clearInitiativeParticipantEditor();

        throw new Error(
            "The selected initiative is no longer monthly recurring."
        );
    }

    if (
        normalizeLower(
            currentInitiative.status
        ) !== "draft"
    ) {
        clearInitiativeParticipantEditor();

        throw new Error(
            "Only Draft recurring initiatives can be configured."
        );
    }

    renderRecurringParticipantEditor(
        currentInitiative,
        state
    );
}


/* ================================================================
   RECURRING PARTICIPANT TERM SAVE
================================================================ */

async function saveRecurringParticipants(
    initiative,
    editor
) {
    if (!currentGroup?.id) {
        throw new Error(
            "No active group is available."
        );
    }

    if (!isInitiativeManager()) {
        throw new Error(
            "Recurring configuration requires an admin or chairperson role."
        );
    }

    if (!initiative) {
        throw new Error(
            "The selected initiative is no longer available."
        );
    }

    if (!isMonthlyInitiative(initiative)) {
        throw new Error(
            "The selected initiative is not monthly recurring."
        );
    }

    if (
        normalizeLower(
            initiative.status
        ) !== "draft"
    ) {
        throw new Error(
            "Only Draft recurring initiatives can be configured."
        );
    }

    if (
        configuringInitiativeId !==
        initiative.id
    ) {
        throw new Error(
            "The recurring participant editor is no longer active."
        );
    }

    const memberIds =
        new Set(
            initiativeMembers.map(
                (member) => member.id
            )
        );

    const checkboxes =
        Array.from(
            editor.querySelectorAll(
                'input[type="checkbox"][data-member-id]'
            )
        );

    const selectedIds =
        new Set();

    const participants = [];

    const firstMonth =
        getFirstFullRecurringMonth(
            initiative.start_date
        );

    for (const checkbox of checkboxes) {
        if (!checkbox.checked) {
            continue;
        }

        const memberId =
            checkbox.dataset.memberId;

        if (
            !memberId ||
            !memberIds.has(memberId)
        ) {
            throw new Error(
                "One or more selected members do not belong to the current group."
            );
        }

        if (
            selectedIds.has(memberId)
        ) {
            throw new Error(
                "A member was selected more than once."
            );
        }

        selectedIds.add(memberId);

        const amountInput =
            Array.from(
                editor.querySelectorAll(
                    ".initiative-participant-amount"
                )
            ).find(
                (input) =>
                    input.dataset.memberId ===
                    memberId
            );

        const effectiveInput =
            Array.from(
                editor.querySelectorAll(
                    ".initiative-recurring-effective"
                )
            ).find(
                (input) =>
                    input.dataset.memberId ===
                    memberId
            );

        if (!amountInput) {
            throw new Error(
                "A recurring amount is missing for a selected member."
            );
        }

        if (!effectiveInput) {
            throw new Error(
                "A recurring effective date is missing for a selected member."
            );
        }

        const rawAmount =
            amountInput.value.trim();

        const effectiveFrom =
            effectiveInput.value.trim();

        if (!rawAmount) {
            throw new Error(
                "A recurring amount is required for every selected member."
            );
        }

        const amount =
            Number(rawAmount);

        if (
            !Number.isFinite(amount) ||
            amount < 0
        ) {
            throw new Error(
                "Recurring amounts must be valid non-negative numbers."
            );
        }

        if (
            !/^\d{4}-\d{2}-01$/.test(
                effectiveFrom
            )
        ) {
            throw new Error(
                "Recurring effective dates must be the first day of a calendar month."
            );
        }

        if (
            effectiveFrom <
            firstMonth
        ) {
            throw new Error(
                "A recurring term cannot begin before the first eligible full calendar month."
            );
        }

        if (
            effectiveFrom >
            initiative.closing_date
        ) {
            throw new Error(
                "A recurring term cannot begin after the initiative closes."
            );
        }

        participants.push({
            member_id:
                memberId,

            amount:
                amount,

            effective_from:
                effectiveFrom
        });
    }

    const status =
        editor._participantStatus;

    const saveButton =
        editor.querySelector(
            '[data-save-recurring-participants="true"]'
        );

    const cancelButton =
        editor.querySelector(
            '[data-cancel-initiative-participants="true"]'
        );

    if (status) {
        status.className =
            "initiative-participant-status";

        status.textContent =
            "Saving recurring participant terms…";
    }

    if (saveButton) {
        saveButton.disabled = true;
    }

    if (cancelButton) {
        cancelButton.disabled = true;
    }

    try {
        const participantRequestId =
            crypto.randomUUID();

        const {
            error: participantError
        } = await supabase.rpc(
            "set_contribution_initiative_members",
            {
                p_initiative_id:
                    initiative.id,

                p_members:
                    participants.map(
                        (participant) => ({
                            member_id:
                                participant.member_id,

                            amount:
                                participant.amount
                        })
                    ),

                p_request_id:
                    participantRequestId
            }
        );

        if (participantError) {
            throw participantError;
        }

        const {
            data: currentParticipants,
            error: currentParticipantError
        } = await supabase.rpc(
            "get_contribution_initiative_recurring_participants",
            {
                p_initiative_id:
                    initiative.id
            }
        );

        if (currentParticipantError) {
            throw currentParticipantError;
        }

        const participantIds =
            new Map(
                (
                    currentParticipants ||
                    []
                ).map(
                    (participant) => [
                        participant.member_id,
                        participant.initiative_member_id
                    ]
                )
            );

        for (
            const participant of participants
        ) {
            const initiativeMemberId =
                participantIds.get(
                    participant.member_id
                );

            if (!initiativeMemberId) {
                throw new Error(
                    "The database did not return the recurring participant identity."
                );
            }

            const { error } =
                await supabase.rpc(
                    "set_contribution_initiative_member_term",
                    {
                        p_initiative_member_id:
                            initiativeMemberId,

                        p_effective_from:
                            participant.effective_from,

                        p_amount:
                            participant.amount,

                        p_status:
                            "active",

                        p_request_id:
                            crypto.randomUUID()
                    }
                );

            if (error) {
                throw error;
            }
        }

        await loadContributionInitiatives();

        clearInitiativeParticipantEditor();

        if (
            elements.contributionProgramStatus
        ) {
            elements.contributionProgramStatus.textContent =
                "Recurring participant terms saved. The initiative remains Draft until recurring activation.";

            elements.contributionProgramStatus.className =
                "program-status ready";
        }
    } catch (error) {
        if (status) {
            status.className =
                "initiative-participant-status error";

            status.textContent =
                error?.message ||
                "Failed to save recurring participant terms.";
        }

        if (saveButton) {
            saveButton.disabled = false;
        }

        if (cancelButton) {
            cancelButton.disabled = false;
        }

        throw error;
    }
}


/* ================================================================
   RECURRING ACTIVATION
================================================================ */

async function activateRecurringInitiative(
    initiativeId
) {
    if (!currentGroup?.id) {
        throw new Error(
            "No active group is available."
        );
    }

    if (!isInitiativeManager()) {
        throw new Error(
            "Recurring activation requires an admin or chairperson role."
        );
    }

    const initiative =
        getInitiativeById(
            initiativeId
        );

    if (!initiative) {
        throw new Error(
            "The selected initiative is no longer available."
        );
    }

    if (!isMonthlyInitiative(initiative)) {
        throw new Error(
            "The selected initiative is not monthly recurring."
        );
    }

    if (
        normalizeLower(
            initiative.status
        ) !== "draft"
    ) {
        throw new Error(
            "Only Draft recurring initiatives can be activated."
        );
    }

    const requestId =
        crypto.randomUUID();

    const { error } =
        await supabase.rpc(
            "activate_recurring_contribution_initiative",
            {
                p_initiative_id:
                    initiative.id,

                p_request_id:
                    requestId
            }
        );

    if (error) {
        throw error;
    }

    await loadContributionInitiatives();

    if (
        elements.contributionProgramStatus
    ) {
        elements.contributionProgramStatus.textContent =
            "Recurring initiative activated. Prepare an eligible calendar period to generate its obligations.";

        elements.contributionProgramStatus.className =
            "program-status ready";
    }
}


/* ================================================================
   RECURRING PERIOD PREPARATION
================================================================ */

function extractPeriodId(data) {
    if (typeof data === "string") {
        return data;
    }

    if (
        !data ||
        typeof data !== "object"
    ) {
        return null;
    }

    return (
        data.period_id ||
        data.id ||
        data.contribution_initiative_period_id ||
        null
    );
}


function extractObligationCount(data) {
    if (
        typeof data === "number" ||
        typeof data === "string"
    ) {
        return data;
    }

    if (
        !data ||
        typeof data !== "object"
    ) {
        return null;
    }

    return (
        data.obligation_count ??
        data.count ??
        data.generated_count ??
        null
    );
}


async function prepareRecurringCurrentPeriod(
    initiativeId
) {
    if (!currentGroup?.id) {
        throw new Error(
            "No active group is available."
        );
    }

    const initiative =
        getInitiativeById(
            initiativeId
        );

    if (!initiative) {
        throw new Error(
            "The selected initiative is no longer available."
        );
    }

    if (!isMonthlyInitiative(initiative)) {
        throw new Error(
            "The selected initiative is not monthly recurring."
        );
    }

    if (
        normalizeLower(
            initiative.status
        ) !== "active"
    ) {
        throw new Error(
            "Only active recurring initiatives can prepare a period."
        );
    }

    const periodKey =
        getCurrentRecurringPeriodKey();

    const {
        data: periodData,
        error: periodError
    } = await supabase.rpc(
        "ensure_contribution_initiative_period",
        {
            p_initiative_id:
                initiative.id,

            p_period_key:
                periodKey,

            p_request_id:
                crypto.randomUUID()
        }
    );

    if (periodError) {
        throw periodError;
    }

    const periodId =
        extractPeriodId(
            periodData
        );

    if (!periodId) {
        throw new Error(
            "The period service did not return a valid period ID."
        );
    }

    const {
        data: obligationData,
        error: obligationError
    } = await supabase.rpc(
        "ensure_contribution_initiative_period_obligations",
        {
            p_period_id:
                periodId,

            p_request_id:
                crypto.randomUUID()
        }
    );

    if (obligationError) {
        throw obligationError;
    }

    const obligationCount =
        extractObligationCount(
            obligationData
        );

    const {
        data: status,
        error: statusError
    } = await supabase.rpc(
        "get_contribution_initiative_period_status",
        {
            p_initiative_id:
                initiative.id,

            p_period_key:
                periodKey
        }
    );

    if (statusError) {
        throw statusError;
    }

    const resolvedCount =
        obligationCount ??
        status?.obligation_count ??
        status?.generated_obligation_count ??
        0;

    if (
        elements.contributionProgramStatus
    ) {
        elements.contributionProgramStatus.textContent =
            `Recurring period ${periodKey} prepared. ${resolvedCount} obligation(s) are available for this initiative period.`;

        elements.contributionProgramStatus.className =
            "program-status ready";
    }

    await loadContributionInitiatives();

    return {
        periodId,
        periodKey,
        obligationCount:
            resolvedCount,
        status
    };
}


/* ================================================================
   RECURRING PERIOD STATUS
================================================================ */

async function loadRecurringPeriodStatus(
    initiativeId,
    periodKey
) {
    const {
        data,
        error
    } = await supabase.rpc(
        "get_contribution_initiative_period_status",
        {
            p_initiative_id:
                initiativeId,

            p_period_key:
                periodKey
        }
    );

    if (error) {
        throw error;
    }

    return data;
}


/* ================================================================
   CLOSE CONTRIBUTION INITIATIVE
================================================================ */

async function closeContributionInitiative(
    initiativeId
) {
    if (!currentGroup?.id) {
        throw new Error(
            "No active group is available."
        );
    }

    if (!isInitiativeManager()) {
        throw new Error(
            "Initiative closure requires an admin or chairperson role."
        );
    }

    const initiative =
        getInitiativeById(
            initiativeId
        );

    if (!initiative) {
        throw new Error(
            "The selected initiative is no longer available."
        );
    }

    if (
        normalizeLower(
            initiative.status
        ) !== "active"
    ) {
        throw new Error(
            "Only active initiatives can be closed."
        );
    }

    const confirmed =
        window.confirm(
            `Close "${initiative.name || "this initiative"}"? Historical accounting will remain preserved.`
        );

    if (!confirmed) {
        return {
            cancelled: true
        };
    }

    const {
        error
    } = await supabase
        .from("contribution_initiatives")
        .update({
            status: "closed"
        })
        .eq(
            "id",
            initiative.id
        )
        .eq(
            "group_id",
            currentGroup.id
        );

    if (error) {
        throw error;
    }

    await loadContributionInitiatives();

    if (
        elements.contributionProgramStatus
    ) {
        elements.contributionProgramStatus.textContent =
            "Contribution initiative closed successfully. Historical accounting remains preserved.";

        elements.contributionProgramStatus.className =
            "program-status ready";
    }

    return {
        success: true
    };
}


/* ================================================================
   CONTRIBUTION INITIATIVES — RENDER
================================================================ */

function renderContributionInitiatives() {
    const container =
        elements.contributionInitiativesList;

    if (!container) {
        return;
    }

    clearInitiativeParticipantEditor();

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

            item.dataset.initiativeId =
                initiative.id;

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

            const status =
                normalizeLower(
                    initiative.status
                );

            if (
                isMonthlyInitiative(
                    initiative
                )
            ) {
                appendTextRow(
                    item,
                    "Recurring setup",
                    status === "draft"
                        ? "Recurring participant terms"
                        : "Calendar periods and obligations"
                );

                if (
                    status === "draft" &&
                    isInitiativeManager()
                ) {
                    const actions =
                        document.createElement(
                            "div"
                        );

                    actions.className =
                        "program-actions";

                    const configureButton =
                        document.createElement(
                            "button"
                        );

                    configureButton.type =
                        "button";

                    configureButton.className =
                        "btn btn-secondary";

                    configureButton.dataset
                        .configureRecurringInitiative =
                        initiative.id;

                    configureButton.textContent =
                        "Configure Recurring Terms";

                    const activateButton =
                        document.createElement(
                            "button"
                        );

                    activateButton.type =
                        "button";

                    activateButton.className =
                        "btn btn-primary";

                    activateButton.dataset
                        .activateRecurringInitiative =
                        initiative.id;

                    activateButton.textContent =
                        "Activate Recurring";

                    actions.append(
                        configureButton,
                        activateButton
                    );

                    item.appendChild(actions);

                    const statusMessage =
                        document.createElement(
                            "div"
                        );

                    statusMessage.className =
                        "program-status";

                    statusMessage.textContent =
                        "Configure recurring participants and terms before activation.";

                    item.appendChild(
                        statusMessage
                    );
                } else if (
                    status === "active"
                ) {
                    const actions =
                        document.createElement(
                            "div"
                        );

                    actions.className =
                        "program-actions";

                    const prepareButton =
                        document.createElement(
                            "button"
                        );

                    prepareButton.type =
                        "button";

                    prepareButton.className =
                        "btn btn-primary";

                    prepareButton.dataset
                        .prepareRecurringPeriod =
                        initiative.id;

                    prepareButton.textContent =
                        "Prepare Current Period";

                    actions.appendChild(
                        prepareButton
                    );

                    if (
                        isInitiativeManager()
                    ) {
                        const closeButton =
                            document.createElement(
                                "button"
                            );

                        closeButton.type =
                            "button";

                        closeButton.className =
                            "btn btn-secondary";

                        closeButton.dataset
                            .closeInitiative =
                            initiative.id;

                        closeButton.textContent =
                            "Close Initiative";

                        actions.appendChild(
                            closeButton
                        );
                    }

                    item.appendChild(actions);

                    const statusMessage =
                        document.createElement(
                            "div"
                        );

                    statusMessage.className =
                        "program-status";

                    statusMessage.textContent =
                        "Period preparation creates only eligible recurring period obligations through the canonical database service.";

                    item.appendChild(
                        statusMessage
                    );
                } else if (
                    status === "closed"
                ) {
                    const statusMessage =
                        document.createElement(
                            "div"
                        );

                    statusMessage.className =
                        "program-status";

                    statusMessage.textContent =
                        "Recurring initiative is closed. Historical periods and accounting remain preserved.";

                    item.appendChild(
                        statusMessage
                    );
                }

                container.appendChild(item);

                return;
            }

            if (
                isOneTimeInitiative(
                    initiative
                )
            ) {
                if (
                    status === "draft" &&
                    isInitiativeManager()
                ) {
                    const actions =
                        document.createElement(
                            "div"
                        );

                    actions.className =
                        "program-actions";

                    const configureButton =
                        document.createElement(
                            "button"
                        );

                    configureButton.type =
                        "button";

                    configureButton.className =
                        "btn btn-secondary";

                    configureButton.dataset
                        .configureInitiative =
                        initiative.id;

                    configureButton.textContent =
                        "Configure Participants";

                    const activateButton =
                        document.createElement(
                            "button"
                        );

                    activateButton.type =
                        "button";

                    activateButton.className =
                        "btn btn-primary";

                    activateButton.dataset
                        .activateInitiative =
                        initiative.id;

                    activateButton.textContent =
                        "Activate";

                    actions.append(
                        configureButton,
                        activateButton
                    );

                    item.appendChild(actions);

                    const statusMessage =
                        document.createElement(
                            "div"
                        );

                    statusMessage.className =
                        "program-status";

                    statusMessage.textContent =
                        "Configure participants before activating this one-time initiative.";

                    item.appendChild(
                        statusMessage
                    );
                } else if (
                    status === "active" &&
                    isInitiativeManager()
                ) {
                    const actions =
                        document.createElement(
                            "div"
                        );

                    actions.className =
                        "program-actions";

                    const closeButton =
                        document.createElement(
                            "button"
                        );

                    closeButton.type =
                        "button";

                    closeButton.className =
                        "btn btn-secondary";

                    closeButton.dataset
                        .closeInitiative =
                        initiative.id;

                    closeButton.textContent =
                        "Close Initiative";

                    actions.appendChild(
                        closeButton
                    );

                    item.appendChild(actions);
                } else if (
                    status === "closed"
                ) {
                    const statusMessage =
                        document.createElement(
                            "div"
                        );

                    statusMessage.className =
                        "program-status";

                    statusMessage.textContent =
                        "One-time initiative is closed. Historical accounting remains preserved.";

                    item.appendChild(
                        statusMessage
                    );
                }
            }

            container.appendChild(item);
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
        .from(
            "contribution_initiatives"
        )
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

    if (!elements.contributionProgramStatus) {
        return;
    }

    let errors = [];

    try {
        const stored =
            elements.contributionProgramStatus
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

    elements.contributionProgramStatus
        .dataset
        .initializationErrors =
        JSON.stringify(errors);

    elements.contributionProgramStatus.textContent =
        errors.join(" ");

    elements.contributionProgramStatus.className =
        "program-status error";
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

    if (elements.contributionProgramStatus) {
        elements.contributionProgramStatus.textContent =
            message;

        elements.contributionProgramStatus.className =
            "program-status error";
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
       CREATE INITIATIVE
    ------------------------------------------------------------ */

    elements.createInitiativeForm?.addEventListener(
        "submit",
        async (event) => {
            if (elements.createInitiativeButton) {
                elements.createInitiativeButton.disabled =
                    true;
            }

            try {
                await createContributionInitiative(
                    event
                );
            } catch (error) {
                console.error(
                    "Failed to create contribution initiative:",
                    error
                );

                if (
                    elements.contributionProgramStatus
                ) {
                    elements.contributionProgramStatus.textContent =
                        error?.message ||
                        "Failed to create contribution initiative.";

                    elements.contributionProgramStatus.className =
                        "program-status error";
                }
            } finally {
                applyAuthorizationUI();
            }
        }
    );


    /* ------------------------------------------------------------
       INITIATIVE ACTIONS
    ------------------------------------------------------------ */

    elements.contributionInitiativesList?.addEventListener(
        "click",
        async (event) => {

            const configureButton =
                event.target.closest(
                    "[data-configure-initiative]"
                );

            if (configureButton) {
                const initiativeId =
                    configureButton.dataset
                        .configureInitiative;

                if (!initiativeId) {
                    return;
                }

                configureButton.disabled =
                    true;

                try {
                    await configureInitiativeParticipants(
                        initiativeId
                    );
                } catch (error) {
                    console.error(
                        "Failed to configure initiative participants:",
                        error
                    );

                    if (
                        elements.contributionProgramStatus
                    ) {
                        elements.contributionProgramStatus.textContent =
                            error?.message ||
                            "Failed to open participant configuration.";

                        elements.contributionProgramStatus.className =
                            "program-status error";
                    }
                } finally {
                    if (
                        configureButton.isConnected
                    ) {
                        configureButton.disabled =
                            false;
                    }
                }

                return;
            }


            const activateButton =
                event.target.closest(
                    "[data-activate-initiative]"
                );

            if (activateButton) {
                const initiativeId =
                    activateButton.dataset
                        .activateInitiative;

                if (!initiativeId) {
                    return;
                }

                activateButton.disabled =
                    true;

                try {
                    await activateInitiative(
                        initiativeId
                    );
                } catch (error) {
                    console.error(
                        "Failed to activate one-time initiative:",
                        error
                    );

                    if (
                        elements.contributionProgramStatus
                    ) {
                        elements.contributionProgramStatus.textContent =
                            error?.message ||
                            "Failed to activate one-time initiative.";

                        elements.contributionProgramStatus.className =
                            "program-status error";
                    }
                } finally {
                    if (
                        activateButton.isConnected
                    ) {
                        activateButton.disabled =
                            false;
                    }
                }

                return;
            }


            const recurringConfigureButton =
                event.target.closest(
                    "[data-configure-recurring-initiative]"
                );

            if (recurringConfigureButton) {
                const initiativeId =
                    recurringConfigureButton.dataset
                        .configureRecurringInitiative;

                if (!initiativeId) {
                    return;
                }

                recurringConfigureButton.disabled =
                    true;

                try {
                    await configureRecurringInitiative(
                        initiativeId
                    );
                } catch (error) {
                    console.error(
                        "Failed to configure recurring initiative:",
                        error
                    );

                    if (
                        elements.contributionProgramStatus
                    ) {
                        elements.contributionProgramStatus.textContent =
                            error?.message ||
                            "Failed to open recurring configuration.";

                        elements.contributionProgramStatus.className =
                            "program-status error";
                    }
                } finally {
                    if (
                        recurringConfigureButton.isConnected
                    ) {
                        recurringConfigureButton.disabled =
                            false;
                    }
                }

                return;
            }


            const recurringActivateButton =
                event.target.closest(
                    "[data-activate-recurring-initiative]"
                );

            if (recurringActivateButton) {
                const initiativeId =
                    recurringActivateButton.dataset
                        .activateRecurringInitiative;

                if (!initiativeId) {
                    return;
                }

                recurringActivateButton.disabled =
                    true;

                try {
                    await activateRecurringInitiative(
                        initiativeId
                    );
                } catch (error) {
                    console.error(
                        "Failed to activate recurring initiative:",
                        error
                    );

                    if (
                        elements.contributionProgramStatus
                    ) {
                        elements.contributionProgramStatus.textContent =
                            error?.message ||
                            "Failed to activate recurring initiative.";

                        elements.contributionProgramStatus.className =
                            "program-status error";
                    }
                } finally {
                    if (
                        recurringActivateButton.isConnected
                    ) {
                        recurringActivateButton.disabled =
                            false;
                    }
                }

                return;
            }


            const prepareRecurringButton =
                event.target.closest(
                    "[data-prepare-recurring-period]"
                );

            if (prepareRecurringButton) {
                const initiativeId =
                    prepareRecurringButton.dataset
                        .prepareRecurringPeriod;

                if (!initiativeId) {
                    return;
                }

                prepareRecurringButton.disabled =
                    true;

                try {
                    await prepareRecurringCurrentPeriod(
                        initiativeId
                    );
                } catch (error) {
                    console.error(
                        "Failed to prepare recurring period:",
                        error
                    );

                    if (
                        elements.contributionProgramStatus
                    ) {
                        elements.contributionProgramStatus.textContent =
                            error?.message ||
                            "Failed to prepare recurring period.";

                        elements.contributionProgramStatus.className =
                            "program-status error";
                    }
                } finally {
                    if (
                        prepareRecurringButton.isConnected
                    ) {
                        prepareRecurringButton.disabled =
                            false;
                    }
                }

                return;
            }


            const closeButton =
                event.target.closest(
                    "[data-close-initiative]"
                );

            if (closeButton) {
                const initiativeId =
                    closeButton.dataset
                        .closeInitiative;

                if (!initiativeId) {
                    return;
                }

                closeButton.disabled =
                    true;

                try {
                    await closeContributionInitiative(
                        initiativeId
                    );
                } catch (error) {
                    console.error(
                        "Failed to close contribution initiative:",
                        error
                    );

                    if (
                        elements.contributionProgramStatus
                    ) {
                        elements.contributionProgramStatus.textContent =
                            error?.message ||
                            "Failed to close contribution initiative.";

                        elements.contributionProgramStatus.className =
                            "program-status error";
                    }
                } finally {
                    if (
                        closeButton.isConnected
                    ) {
                        closeButton.disabled =
                            false;
                    }
                }

                return;
            }


            const saveRecurringButton =
                event.target.closest(
                    '[data-save-recurring-participants="true"]'
                );

            if (saveRecurringButton) {
                const editor =
                    saveRecurringButton.closest(
                        ".initiative-participant-editor"
                    );

                if (!editor) {
                    return;
                }

                const initiativeId =
                    editor.dataset.initiativeId;

                const initiative =
                    getInitiativeById(
                        initiativeId
                    );

                if (!initiative) {
                    if (
                        elements.contributionProgramStatus
                    ) {
                        elements.contributionProgramStatus.textContent =
                            "The selected initiative is no longer available.";

                        elements.contributionProgramStatus.className =
                            "program-status error";
                    }

                    clearInitiativeParticipantEditor();

                    return;
                }

                try {
                    await saveRecurringParticipants(
                        initiative,
                        editor
                    );
                } catch (error) {
                    console.error(
                        "Failed to save recurring participant terms:",
                        error
                    );

                    if (
                        elements.contributionProgramStatus
                    ) {
                        elements.contributionProgramStatus.textContent =
                            error?.message ||
                            "Failed to save recurring participant terms.";

                        elements.contributionProgramStatus.className =
                            "program-status error";
                    }
                }

                return;
            }


            const cancelButton =
                event.target.closest(
                    '[data-cancel-initiative-participants="true"]'
                );

            if (cancelButton) {
                clearInitiativeParticipantEditor();

                if (
                    elements.contributionProgramStatus
                ) {
                    elements.contributionProgramStatus.textContent =
                        "Participant configuration cancelled.";

                    elements.contributionProgramStatus.className =
                        "program-status";
                }

                return;
            }


            const saveButton =
                event.target.closest(
                    '[data-save-initiative-participants="true"]'
                );

            if (saveButton) {
                const editor =
                    saveButton.closest(
                        ".initiative-participant-editor"
                    );

                if (!editor) {
                    return;
                }

                const initiativeId =
                    editor.dataset.initiativeId;

                const initiative =
                    getInitiativeById(
                        initiativeId
                    );

                if (!initiative) {
                    if (
                        elements.contributionProgramStatus
                    ) {
                        elements.contributionProgramStatus.textContent =
                            "The selected initiative is no longer available.";

                        elements.contributionProgramStatus.className =
                            "program-status error";
                    }

                    clearInitiativeParticipantEditor();

                    return;
                }

                try {
                    await saveInitiativeParticipants(
                        initiative,
                        editor
                    );
                } catch (error) {
                    console.error(
                        "Failed to save initiative participants:",
                        error
                    );

                    if (
                        elements.contributionProgramStatus
                    ) {
                        elements.contributionProgramStatus.textContent =
                            error?.message ||
                            "Failed to save participant configuration.";

                        elements.contributionProgramStatus.className =
                            "program-status error";
                    }
                }

                return;
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
                elements.contributionProgramStatus
            ) {
                delete elements
                    .contributionProgramStatus
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
                {
                    section:
                        "contribution types",
                    loader:
                        loadContributionTypes
                },
                {
                    section:
                        "contribution initiatives",
                    loader:
                        loadContributionInitiatives
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
    loadSubscription,

    loadContributionTypes,
    loadContributionInitiatives,

    createContributionInitiative,

    configureInitiativeParticipants,
    saveInitiativeParticipants,
    activateInitiative,

    configureRecurringInitiative,
    saveRecurringParticipants,
    activateRecurringInitiative,

    prepareRecurringCurrentPeriod,
    loadRecurringPeriodStatus,

    closeContributionInitiative
};

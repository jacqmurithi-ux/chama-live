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
 * Contribution types are read-only in this page.
 *
 * Initiative creation:
 *     create_contribution_initiative()
 *
 * One-time participant configuration:
 *     set_contribution_initiative_members()
 *
 * One-time activation:
 *     activate_contribution_initiative()
 *
 * Initiative closing:
 *     close_contribution_initiative()
 *
 * Monthly recurring initiatives:
 *     set_contribution_initiative_members()
 *     set_contribution_initiative_member_term()
 *     activate_recurring_contribution_initiative()
 *     ensure_contribution_initiative_period()
 *     ensure_contribution_initiative_period_obligations()
 *     get_contribution_initiative_period_status()
 *
 * The browser never writes directly to accounting tables.
 *
 * Payment collection remains outside this implementation because
 * the separate STK/payment gate has not been cleared.
 */
let contributionTypes = [];
let contributionInitiatives = [];
let fineRules = [];


/*
 * Initiative participant configuration state.
 *
 * initiativeMembers:
 *     Read-only list of members belonging to the current group.
 *
 * configuringInitiativeId:
 *     Initiative currently being configured.
 *
 * No participant-table writes occur from state management itself.
 */
let initiativeMembers = [];
let configuringInitiativeId = null;

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
        document.getElementById("fineRulesList"),

    contributionProgramStatus:
        document.getElementById("contributionProgramStatus"),

    createInitiativeForm:
        document.getElementById("createInitiativeForm"),

    initiativeName:
        document.getElementById("initiativeName"),

    initiativeDescription:
        document.getElementById("initiativeDescription"),

    initiativeContributionType:
        document.getElementById("initiativeContributionType"),

    initiativeStartDate:
        document.getElementById("initiativeStartDate"),

    initiativeClosingDate:
        document.getElementById("initiativeClosingDate"),

    initiativeDefaultAmount:
        document.getElementById("initiativeDefaultAmount"),

    initiativeFrequency:
        document.getElementById("initiativeFrequency"),

    createInitiativeButton:
        document.getElementById("createInitiativeButton")
};


/* ================================================================
   AUTHORIZATION
================================================================ */

function normalizeLower(value) {
    return typeof value === "string"
        ? value.trim().toLowerCase()
        : "";
}


function isInitiativeManager() {

    const role =
        normalizeLower(currentRole);

    /*
     * Canonical initiative management contract:
     *
     * admin OR chairperson
     */
    return (
        role === "admin" ||
        role === "chairperson"
    );
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

    if (elements.createInitiativeButton) {

        elements.createInitiativeButton.disabled =
            !isInitiativeManager();
    }

    if (elements.initiativeContributionType) {

        elements.initiativeContributionType.disabled =
            !isInitiativeManager() ||
            contributionTypes.length === 0;
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

    if (!currentMember?.id) {

        throw new Error(
            "No current member context is available for leadership setup."
        );
    }

    const {
        data,
        error
    } = await supabase
        .from("members")
        .select(
            "id, actual_position, actual_position_name, join_date"
        )
        .eq(
            "group_id",
            currentGroup.id
        )
        .eq(
            "id",
            currentMember.id
        )
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
                normalizeLower(
                    data.actual_position
                )
            )
                ? normalizeLower(
                    data.actual_position
                )
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
   CONTRIBUTION INITIATIVE — CREATE DRAFT
================================================================ */

function renderInitiativeContributionTypes() {

    const select =
        elements.initiativeContributionType;

    if (!select) {
        return;
    }

    select.replaceChildren();

    const placeholder =
        document.createElement("option");

    placeholder.value =
        "";

    placeholder.textContent =
        contributionTypes.length
            ? "Select contribution type"
            : "No contribution types available";

    select.appendChild(
        placeholder
    );

    contributionTypes.forEach((type) => {

        const option =
            document.createElement("option");

        option.value =
            type.id;

        option.textContent =
            type.code
                ? `${type.name} (${type.code})`
                : type.name;

        select.appendChild(
            option
        );
    });

    select.disabled =
        contributionTypes.length === 0 ||
        !isInitiativeManager();
}


function resetCreateInitiativeForm() {

    if (!elements.createInitiativeForm) {
        return;
    }

    elements.createInitiativeForm.reset();

    renderInitiativeContributionTypes();
}


async function createContributionInitiative(event) {

    if (event) {
        event.preventDefault();
    }

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

    const name =
        elements.initiativeName?.value.trim() || "";

    const description =
        elements.initiativeDescription?.value.trim() || null;

    const contributionTypeId =
        elements.initiativeContributionType?.value || "";

    const startDate =
        elements.initiativeStartDate?.value || "";

    const closingDate =
        elements.initiativeClosingDate?.value || "";

    const defaultAmount =
        Number(
            elements.initiativeDefaultAmount?.value
        );

    const frequency =
        normalizeLower(
            elements.initiativeFrequency?.value
        );

    if (!name) {
        throw new Error(
            "Initiative name is required."
        );
    }

    if (!contributionTypeId) {
        throw new Error(
            "A contribution type is required."
        );
    }

    if (!startDate || !closingDate) {
        throw new Error(
            "Start date and closing date are required."
        );
    }

    if (closingDate < startDate) {
        throw new Error(
            "Closing date cannot be earlier than the start date."
        );
    }

    if (
        !Number.isFinite(defaultAmount) ||
        defaultAmount <= 0
    ) {

        throw new Error(
            "Default amount must be greater than zero."
        );
    }

    if (
        frequency !== "one_time" &&
        frequency !== "monthly"
    ) {

        throw new Error(
            "Invalid initiative frequency."
        );
    }

    const requestId =
        crypto.randomUUID();

    const {
        data,
        error
    } = await supabase.rpc(
        "create_contribution_initiative",
        {
            p_group_id:
                currentGroup.id,

            p_name:
                name,

            p_description:
                description,

            p_contribution_type_id:
                contributionTypeId,

            p_start_date:
                startDate,

            p_closing_date:
                closingDate,

            p_default_amount:
                defaultAmount,

            p_frequency:
                frequency,

            p_request_id:
                requestId
        }
    );

    if (error) {
        throw error;
    }

    await loadContributionInitiatives();

    resetCreateInitiativeForm();

    if (elements.contributionProgramStatus) {

        elements.contributionProgramStatus.textContent =
            frequency === "monthly"
                ? "Recurring initiative created as Draft. Configure recurring participants and terms before activation."
                : "One-time initiative created as Draft. Configure participants before activation.";

        elements.contributionProgramStatus.className =
            "program-status ready";
    }

    return data;
}


/* ================================================================
   CONTRIBUTION CONFIGURATION — READ ONLY HELPERS
================================================================ */

function appendEmptyState(
    container,
    message
) {

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
    renderInitiativeContributionTypes();
}


/* ================================================================
   INITIATIVE HELPERS
================================================================ */

function getInitiativeById(initiativeId) {

    return contributionInitiatives.find(
        (initiative) =>
            initiative.id === initiativeId
    ) || null;
}


function isMonthlyInitiative(initiative) {

    return normalizeLower(
        initiative?.frequency
    ) === "monthly";
}


function isOneTimeInitiative(initiative) {

    return normalizeLower(
        initiative?.frequency
    ) === "one_time";
}


function getFirstFullRecurringMonth(startDate) {

    const date =
        new Date(
            `${startDate}T00:00:00`
        );

    if (Number.isNaN(date.getTime())) {

        throw new Error(
            "Invalid initiative start date."
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


function clearInitiativeParticipantEditor() {

    configuringInitiativeId =
        null;

    document
        .querySelectorAll(
            ".initiative-participant-editor"
        )
        .forEach((editor) => {

            editor.remove();
        });
}


/* ================================================================
   INITIATIVE MEMBERS — READ ONLY
================================================================ */

async function loadInitiativeMembers() {

    if (!currentGroup?.id) {

        throw new Error(
            "No active group is available."
        );
    }

    const {
        data,
        error
    } = await supabase
        .from("members")
        .select(
            [
                "id",
                "member_number",
                "membership_number",
                "name",
                "status",
                "onboarding_status"
            ].join(", ")
        )
        .eq(
            "group_id",
            currentGroup.id
        )
        .order(
            "member_number",
            {
                ascending: true,
                nullsFirst: false
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
   ONE-TIME PARTICIPANTS — READ ONLY
================================================================ */

async function loadInitiativeParticipants(
    initiativeId
) {

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
            "Monthly recurring initiatives use the recurring participant-term workflow."
        );
    }

    const {
        data,
        error
    } = await supabase
        .from(
            "contribution_initiative_members"
        )
        .select(
            "member_id, amount"
        )
        .eq(
            "initiative_id",
            initiative.id
        );

    if (error) {
        throw error;
    }

    return Array.isArray(data)
        ? data
        : [];
}


/* ================================================================
   RECURRING PARTICIPANT STATE — READ ONLY
================================================================ */

async function loadRecurringParticipantState(
    initiativeId
) {

    const {
        data: participants,
        error: participantError
    } = await supabase
        .from(
            "contribution_initiative_members"
        )
        .select(
            [
                "id",
                "member_id",
                "amount",
                "effective_from",
                "effective_to",
                "status"
            ].join(", ")
        )
        .eq(
            "initiative_id",
            initiativeId
        )
        .order(
            "created_at",
            {
                ascending: true
            }
        );

    if (participantError) {
        throw participantError;
    }

    const participantRows =
        Array.isArray(participants)
            ? participants
            : [];

    if (!participantRows.length) {

        return {
            participants:
                participantRows,
            terms:
                []
        };
    }

    const {
        data: terms,
        error: termError
    } = await supabase
        .from(
            "contribution_initiative_member_terms"
        )
        .select(
            [
                "id",
                "initiative_member_id",
                "effective_from",
                "effective_to",
                "amount",
                "status"
            ].join(", ")
        )
        .in(
            "initiative_member_id",
            participantRows.map(
                (participant) =>
                    participant.id
            )
        )
        .order(
            "effective_from",
            {
                ascending: true
            }
        );

    if (termError) {
        throw termError;
    }

    return {
        participants:
            participantRows,

        terms:
            Array.isArray(terms)
                ? terms
                : []
    };
}


/* ================================================================
   PARTICIPANT EDITOR STATUS
================================================================ */

function createParticipantStatus(
    editor,
    message,
    isError = false
) {

    const status =
        document.createElement("div");

    status.className =
        isError
            ? "initiative-participant-status error"
            : "initiative-participant-status";

    status.setAttribute(
        "role",
        "status"
    );

    status.setAttribute(
        "aria-live",
        "polite"
    );

    status.textContent =
        message;

    editor.appendChild(
        status
    );

    return status;
}


/* ================================================================
   PARTICIPANT ROW
================================================================ */

function createParticipantRow(
    member,
    existingParticipant,
    defaultAmount
) {

    const row =
        document.createElement("div");

    row.className =
        "initiative-participant-row";

    const memberContainer =
        document.createElement("label");

    memberContainer.className =
        "initiative-participant-member";

    const checkbox =
        document.createElement("input");

    checkbox.type =
        "checkbox";

    checkbox.dataset.memberId =
        member.id;

    checkbox.checked =
        Boolean(existingParticipant);

    const memberText =
        document.createElement("div");

    const name =
        document.createElement("strong");

    name.textContent =
        member.name ||
        member.membership_number ||
        member.member_number ||
        member.id;

    const metadata =
        document.createElement("span");

    const identifiers = [];

    if (
        member.member_number !== null &&
        member.member_number !== undefined &&
        member.member_number !== ""
    ) {

        identifiers.push(
            `Member #${member.member_number}`
        );
    }

    if (member.membership_number) {

        identifiers.push(
            `Membership: ${member.membership_number}`
        );
    }

    if (member.status) {

        identifiers.push(
            `Status: ${member.status}`
        );
    }

    metadata.textContent =
        identifiers.length
            ? identifiers.join(" • ")
            : "Group member";

    memberText.append(
        name,
        metadata
    );

    memberContainer.append(
        checkbox,
        memberText
    );

    const amountContainer =
        document.createElement("label");

    amountContainer.className =
        "initiative-participant-amount-field";

    const amountLabel =
        document.createElement("span");

    amountLabel.textContent =
        "Amount";

    const amountInput =
        document.createElement("input");

    amountInput.type =
        "number";

    amountInput.inputMode =
        "decimal";

    amountInput.step =
        "0.01";

    amountInput.min =
        "0";

    amountInput.className =
        "initiative-participant-amount";

    amountInput.dataset.memberId =
        member.id;

    const existingAmount =
        existingParticipant?.amount;

    const initialAmount =
        existingAmount !== null &&
        existingAmount !== undefined
            ? existingAmount
            : defaultAmount;

    if (
        initialAmount !== null &&
        initialAmount !== undefined &&
        initialAmount !== ""
    ) {

        amountInput.value =
            String(initialAmount);
    }

    amountContainer.append(
        amountLabel,
        amountInput
    );

    row.append(
        memberContainer,
        amountContainer
    );

    return row;
}


/* ================================================================
   ONE-TIME PARTICIPANT EDITOR
================================================================ */

function renderInitiativeParticipantEditor(
    initiative,
    existingParticipants
) {

    const container =
        elements.contributionInitiativesList;

    if (!container) {
        return;
    }

    if (!isOneTimeInitiative(initiative)) {

        throw new Error(
            "Monthly recurring initiatives cannot use the one-time participant editor."
        );
    }

    clearInitiativeParticipantEditor();

    const existingByMemberId =
        new Map(
            existingParticipants.map(
                (participant) => [
                    participant.member_id,
                    participant
                ]
            )
        );

    const editor =
        document.createElement("div");

    editor.className =
        "initiative-participant-editor";

    editor.dataset.initiativeId =
        initiative.id;

    const header =
        document.createElement("div");

    header.className =
        "program-subsection-header";

    const heading =
        document.createElement("h3");

    heading.textContent =
        "Configure One-Time Participants";

    const description =
        document.createElement("p");

    description.textContent =
        `Select members participating in "${initiative.name}". ` +
        "Set the amount for each selected member. " +
        "The initiative remains Draft after saving.";

    header.append(
        heading,
        description
    );

    editor.appendChild(
        header
    );

    const status =
        createParticipantStatus(
            editor,
            initiativeMembers.length
                ? "Select the members who should participate."
                : "No members are currently available in this group."
        );

    const list =
        document.createElement("div");

    list.className =
        "initiative-participant-list";

    if (!initiativeMembers.length) {

        const empty =
            document.createElement("div");

        empty.className =
            "initiative-participant-empty";

        empty.textContent =
            "No group members are available for participant configuration.";

        list.appendChild(
            empty
        );

    } else {

        initiativeMembers.forEach(
            (member) => {

                const existingParticipant =
                    existingByMemberId.get(
                        member.id
                    );

                const row =
                    createParticipantRow(
                        member,
                        existingParticipant,
                        initiative.default_amount
                    );

                list.appendChild(
                    row
                );
            }
        );
    }

    editor.appendChild(
        list
    );

    const actions =
        document.createElement("div");

    actions.className =
        "initiative-participant-actions";

    const cancelButton =
        document.createElement("button");

    cancelButton.type =
        "button";

    cancelButton.className =
        "btn btn-secondary";

    cancelButton.dataset.cancelInitiativeParticipants =
        "true";

    cancelButton.textContent =
        "Cancel";

    const saveButton =
        document.createElement("button");

    saveButton.type =
        "button";

    saveButton.className =
        "btn btn-primary";

    saveButton.dataset.saveInitiativeParticipants =
        "true";

    saveButton.textContent =
        "Save Participants";

    saveButton.disabled =
        !initiativeMembers.length ||
        !isInitiativeManager();

    actions.append(
        cancelButton,
        saveButton
    );

    editor.appendChild(
        actions
    );

    editor._participantStatus =
        status;

    container.appendChild(
        editor
    );

    return editor;
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

    if (isMonthlyInitiative(initiative)) {

        throw new Error(
            "Monthly recurring initiatives use the recurring participant-term workflow."
        );
    }

    if (!isOneTimeInitiative(initiative)) {

        throw new Error(
            "The initiative frequency is not supported by this participant configuration workflow."
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

    configuringInitiativeId =
        initiative.id;

    const [
        members,
        existingParticipants
    ] = await Promise.all([
        loadInitiativeMembers(),
        loadInitiativeParticipants(
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

    if (
        normalizeLower(
            currentInitiative.status
        ) !== "draft"
    ) {

        clearInitiativeParticipantEditor();

        throw new Error(
            "Only Draft initiatives can be configured."
        );
    }

    renderInitiativeParticipantEditor(
        currentInitiative,
        existingParticipants
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

    if (!isOneTimeInitiative(initiative)) {

        throw new Error(
            "Monthly recurring initiatives cannot use the one-time participant configuration contract."
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

    if (
        configuringInitiativeId !== initiative.id
    ) {

        throw new Error(
            "The participant editor is no longer active."
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

        if (selectedIds.has(memberId)) {

            throw new Error(
                "A member was selected more than once."
            );
        }

        selectedIds.add(
            memberId
        );

        const amountInput =
            Array.from(
                editor.querySelectorAll(
                    ".initiative-participant-amount"
                )
            ).find(
                (input) =>
                    input.dataset.memberId === memberId
            );

        if (!amountInput) {

            throw new Error(
                "A contribution amount is missing for a selected member."
            );
        }

        const rawAmount =
            amountInput.value.trim();

        if (!rawAmount) {

            throw new Error(
                "A contribution amount is required for every selected member."
            );
        }

        const amount =
            Number(rawAmount);

        if (
            !Number.isFinite(amount) ||
            amount < 0
        ) {

            throw new Error(
                "Participant amounts must be valid non-negative numbers."
            );
        }

        participants.push({
            member_id:
                memberId,

            amount:
                amount
        });
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

        const requestId =
            crypto.randomUUID();

        const {
            error
        } = await supabase.rpc(
            "set_contribution_initiative_members",
            {
                p_initiative_id:
                    initiative.id,

                p_members:
                    participants,

                p_request_id:
                    requestId
            }
        );

        if (error) {
            throw error;
        }

        await loadContributionInitiatives();

        clearInitiativeParticipantEditor();

        if (elements.contributionProgramStatus) {

            elements.contributionProgramStatus.textContent =
                "One-time participant configuration saved. Initiative remains Draft.";

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
   ONE-TIME ACTIVATION
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
            "One-time activation requires an admin or chairperson role."
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
            "Only Draft one-time initiatives can be activated."
        );
    }

    const requestId =
        crypto.randomUUID();

    const {
        data,
        error
    } = await supabase.rpc(
        "activate_contribution_initiative",
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

    if (elements.contributionProgramStatus) {

        const obligationCount =
            data?.obligations_created;

        elements.contributionProgramStatus.textContent =
            obligationCount !== undefined &&
            obligationCount !== null
                ? `One-time initiative activated. ${obligationCount} obligation(s) created.`
                : "One-time initiative activated.";

        elements.contributionProgramStatus.className =
            "program-status ready";
    }

    return data;
}


/* ================================================================
   INITIATIVE CLOSING
================================================================ */

/*
 * Closing is deliberately delegated to the canonical backend RPC.
 *
 * The browser does not:
 *     - update initiative status directly
 *     - delete participants
 *     - alter obligations
 *     - alter allocations
 *     - calculate accounting
 *
 * The database remains authoritative.
 */
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
            "Closing an initiative requires an admin or chairperson role."
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

    const status =
        normalizeLower(
            initiative.status
        );

    if (
        status !== "active"
    ) {

        throw new Error(
            "Only active initiatives can be closed."
        );
    }

    const requestId =
        crypto.randomUUID();

    const {
        data,
        error
    } = await supabase.rpc(
        "close_contribution_initiative",
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

    if (elements.contributionProgramStatus) {

        elements.contributionProgramStatus.textContent =
            "Contribution initiative closed. Historical accounting remains preserved.";

        elements.contributionProgramStatus.className =
            "program-status ready";
    }

    return data;
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

    if (!isMonthlyInitiative(initiative)) {

        throw new Error(
            "The recurring participant editor requires a monthly initiative."
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

    clearInitiativeParticipantEditor();

    const existingByMemberId =
        new Map(
            (
                state.participants ||
                []
            ).map(
                (participant) => [
                    participant.member_id,
                    participant
                ]
            )
        );

    const termsByParticipant =
        new Map();

    (
        state.terms ||
        []
    ).forEach(
        (term) => {

            const current =
                termsByParticipant.get(
                    term.initiative_member_id
                );

            if (
                !current ||
                String(
                    term.effective_from
                ) >
                String(
                    current.effective_from
                )
            ) {

                termsByParticipant.set(
                    term.initiative_member_id,
                    term
                );
            }
        }
    );

    const editor =
        document.createElement("div");

    editor.className =
        "initiative-participant-editor recurring-initiative-editor";

    editor.dataset.initiativeId =
        initiative.id;

    const header =
        document.createElement("div");

    header.className =
        "program-subsection-header";

    const heading =
        document.createElement("h3");

    heading.textContent =
        "Configure Recurring Participants";

    const description =
        document.createElement("p");

    description.textContent =
        `Select members for "${initiative.name}". ` +
        "Each selected member receives a recurring term with a " +
        "calendar-month effective date. Changes apply to future " +
        "periods and do not rewrite generated historical obligations.";

    header.append(
        heading,
        description
    );

    editor.appendChild(
        header
    );

    const firstMonth =
        getFirstFullRecurringMonth(
            initiative.start_date
        );

    const instruction =
        document.createElement("p");

    instruction.className =
        "program-help";

    instruction.textContent =
        `First eligible recurring month: ${firstMonth}. ` +
        "The database remains authoritative for period eligibility.";

    editor.appendChild(
        instruction
    );

    const status =
        createParticipantStatus(
            editor,
            initiativeMembers.length
                ? "Select recurring participants and set their terms."
                : "No members are currently available in this group."
        );

    const list =
        document.createElement("div");

    list.className =
        "initiative-participant-list";

    if (!initiativeMembers.length) {

        const empty =
            document.createElement("div");

        empty.className =
            "initiative-participant-empty";

        empty.textContent =
            "No group members are available for recurring configuration.";

        list.appendChild(
            empty
        );

    } else {

        initiativeMembers.forEach(
            (member) => {

                const existingParticipant =
                    existingByMemberId.get(
                        member.id
                    );

                const existingTerm =
                    existingParticipant
                        ? termsByParticipant.get(
                            existingParticipant.id
                        )
                        : null;

                const row =
                    createParticipantRow(
                        member,
                        existingParticipant
                            ? {
                                amount:
                                    existingTerm?.amount ??
                                    existingParticipant.amount
                            }
                            : null,
                        initiative.default_amount
                    );

                const amountField =
                    row.querySelector(
                        ".initiative-participant-amount-field"
                    );

                if (amountField) {

                    const effectiveLabel =
                        document.createElement(
                            "label"
                        );

                    effectiveLabel.className =
                        "initiative-recurring-effective-field";

                    const effectiveText =
                        document.createElement(
                            "span"
                        );

                    effectiveText.textContent =
                        "Effective from";

                    const effectiveInput =
                        document.createElement(
                            "input"
                        );

                    effectiveInput.type =
                        "date";

                    effectiveInput.className =
                        "initiative-recurring-effective";

                    effectiveInput.dataset.memberId =
                        member.id;

                    effectiveInput.value =
                        existingTerm?.effective_from ||
                        firstMonth;

                    effectiveInput.min =
                        firstMonth;

                    effectiveLabel.append(
                        effectiveText,
                        effectiveInput
                    );

                    amountField.appendChild(
                        effectiveLabel
                    );
                }

                list.appendChild(
                    row
                );
            }
        );
    }

    editor.appendChild(
        list
    );

    const actions =
        document.createElement("div");

    actions.className =
        "initiative-participant-actions";

    const cancelButton =
        document.createElement("button");

    cancelButton.type =
        "button";

    cancelButton.className =
        "btn btn-secondary";

    cancelButton.dataset.cancelInitiativeParticipants =
        "true";

    cancelButton.textContent =
        "Cancel";

    const saveButton =
        document.createElement("button");

    saveButton.type =
        "button";

    saveButton.className =
        "btn btn-primary";

    saveButton.dataset.saveRecurringParticipants =
        "true";

    saveButton.textContent =
        "Save Recurring Terms";

    saveButton.disabled =
        !initiativeMembers.length ||
        !isInitiativeManager();

    actions.append(
        cancelButton,
        saveButton
    );

    editor.appendChild(
        actions
    );

    editor._participantStatus =
        status;

    container.appendChild(
        editor
    );

    return editor;
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
        configuringInitiativeId !== initiative.id
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

        if (selectedIds.has(memberId)) {

            throw new Error(
                "A member was selected more than once."
            );
        }

        selectedIds.add(
            memberId
        );

        const amountInput =
            Array.from(
                editor.querySelectorAll(
                    ".initiative-participant-amount"
                )
            ).find(
                (input) =>
                    input.dataset.memberId === memberId
            );

        const effectiveInput =
            Array.from(
                editor.querySelectorAll(
                    ".initiative-recurring-effective"
                )
            ).find(
                (input) =>
                    input.dataset.memberId === memberId
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
        } = await supabase
            .from(
                "contribution_initiative_members"
            )
            .select(
                "id, member_id"
            )
            .eq(
                "initiative_id",
                initiative.id
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
                        participant.id
                    ]
                )
            );

        for (
            const participant
            of participants
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

            const {
                error
            } = await supabase.rpc(
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

        if (elements.contributionProgramStatus) {

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

    const {
        error
    } = await supabase.rpc(
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

    if (elements.contributionProgramStatus) {

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

    if (!data || typeof data !== "object") {
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

    if (!data || typeof data !== "object") {
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

    if (elements.contributionProgramStatus) {

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

            /*
             * =====================================================
             * MONTHLY RECURRING INITIATIVE
             * =====================================================
             */

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

                    item.appendChild(
                        actions
                    );

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

                    if (isInitiativeManager()) {

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

                    item.appendChild(
                        actions
                    );

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

                container.appendChild(
                    item
                );

                return;
            }


            /*
             * =====================================================
             * ONE-TIME INITIATIVE
             * =====================================================
             */

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

                    item.appendChild(
                        actions
                    );

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

                    item.appendChild(
                        actions
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
                        "One-time initiative is closed. Historical accounting remains preserved.";

                    item.appendChild(
                        statusMessage
                    );
                }
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

    /*
     * Group Management cannot operate without an active group.
     * Treat this as a hard initialization failure rather than
     * allowing the page to remain in an ambiguous loading state.
     */
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
            elements.contributionProgramStatus.dataset
                .initializationErrors;

        if (stored) {

            const parsed =
                JSON.parse(
                    stored
                );

            if (Array.isArray(parsed)) {
                errors = parsed;
            }
        }

    } catch (parseError) {

        console.warn(
            "[Group Management] " +
            "Could not parse previous initialization errors.",
            parseError
        );

        errors = [];
    }

    errors.push(
        message
    );

    elements.contributionProgramStatus.dataset
        .initializationErrors =
        JSON.stringify(
            errors
        );

    elements.contributionProgramStatus.textContent =
        errors.join(" ");

    elements.contributionProgramStatus.className =
        "program-status error";
}


function renderInitializationFailure(
    error
) {

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

    eventsBound = true;


    /* ------------------------------------------------------------
       GROUP
    ------------------------------------------------------------ */

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


    /* ------------------------------------------------------------
       LEADERSHIP
    ------------------------------------------------------------ */

    elements.leadershipForm?.addEventListener(
        "submit",
        async (event) => {

            try {

                await saveAdminActualPosition(
                    event
                );

            } catch (error) {

                console.error(
                    "Failed to save actual position:",
                    error
                );
            }
        }
    );


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

                if (elements.contributionProgramStatus) {

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


            /* ====================================================
               ONE-TIME CONFIGURE
            ==================================================== */

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


            /* ====================================================
               ONE-TIME ACTIVATE
            ==================================================== */

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


            /* ====================================================
               RECURRING CONFIGURE
            ==================================================== */

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


            /* ====================================================
               RECURRING ACTIVATE
            ==================================================== */

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


            /* ====================================================
               RECURRING PERIOD PREPARATION
            ==================================================== */

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


            /* ====================================================
               CLOSE INITIATIVE
            ==================================================== */

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


            /* ====================================================
               RECURRING TERM SAVE
            ==================================================== */

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


            /* ====================================================
               CANCEL PARTICIPANT EDITOR
            ==================================================== */

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


            /* ====================================================
               ONE-TIME PARTICIPANT SAVE
            ==================================================== */

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

            const selected =
                normalizeLower(
                    elements.groupCategory?.value
                );

            const field =
                document.getElementById(
                    "groupCategoryOtherField"
                );

            if (field) {

                field.hidden =
                    selected !== "other";
            }
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

            /*
             * ----------------------------------------------------
             * STEP 1 — BIND EVENTS
             * ----------------------------------------------------
             */
            bindEvents();


            /*
             * ----------------------------------------------------
             * STEP 2 — LOAD APPLICATION CONTEXT
             *
             * This is the hard dependency. Without the group
             * context there is no safe way to initialize the page.
             * ----------------------------------------------------
             */
            await loadApplicationContext();


            /*
             * ----------------------------------------------------
             * STEP 3 — APPLY AUTHORIZATION IMMEDIATELY
             * ----------------------------------------------------
             */
            applyAuthorizationUI();


            /*
             * ----------------------------------------------------
             * STEP 4 — CLEAR PREVIOUS INITIALIZATION ERRORS
             * ----------------------------------------------------
             */
            if (
                elements.contributionProgramStatus
            ) {

                delete elements.contributionProgramStatus
                    .dataset
                    .initializationErrors;
            }


            /*
             * ----------------------------------------------------
             * STEP 5 — LOAD INDEPENDENT SECTIONS
             *
             * Promise.all() is deliberately NOT used here.
             *
             * One failed query/RPC must not prevent the remaining
             * sections from rendering.
             * ----------------------------------------------------
             */
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

                {
                    section:
                        "fine rules",

                    loader:
                        loadFineRules
                }
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


            /*
             * ----------------------------------------------------
             * STEP 6 — REAPPLY AUTHORIZATION
             * ----------------------------------------------------
             */
            applyAuthorizationUI();


            /*
             * ----------------------------------------------------
             * STEP 7 — REPORT PARTIAL INITIALIZATION
             * ----------------------------------------------------
             */
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
                    "[Group Management] " +
                    "Some sections failed to load:",
                    failedSections
                );
            }


            /*
             * The page itself has initialized successfully even
             * when one or more optional sections failed.
             */
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

        /*
         * Only hard initialization failures reach this block.
         *
         * Example:
         *     application context unavailable
         *     group context unavailable
         */
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
    saveAdminActualPosition,
    saveContributionSettings,

    loadContributionSettings,
    loadLeadershipSetup,
    loadSubscription,

    loadContributionTypes,
    loadContributionInitiatives,
    loadFineRules,

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

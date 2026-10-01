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
 * Contribution types remain read-only.
 *
 * Initiative creation is governed exclusively by
 * create_contribution_initiative().
 *
 * One-time participant configuration is governed exclusively by
 * set_contribution_initiative_members().
 *
 * Monthly recurring initiatives use a separate backend contract.
 * Until that recurring contract is available in the target
 * environment, the browser MUST NOT route monthly initiatives
 * through the one-time participant configuration workflow.
 *
 * Activation and closure remain outside this implementation gate.
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
 *     The draft ONE-TIME initiative currently being configured.
 *
 * No participant-table writes occur from state management.
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
     * Mirrors the verified production backend contract:
     *
     * public.can_manage_members(group_id)
     *     = current_user_role IN ('admin', 'chairperson')
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

    /*
     * Initiative authorization mirrors the canonical backend
     * can_manage_members() contract:
     *
     *     admin OR chairperson
     */
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
            currentMember?.id
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

    placeholder.value = "";

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

    /*
     * This mirrors the verified backend authorization contract:
     *
     * public.can_manage_members(group_id)
     *     = current_user_role IN ('admin', 'chairperson')
     *
     * The database remains authoritative.
     */
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

    /*
     * Monthly initiatives may currently be CREATED as Draft.
     *
     * Their recurring terms, periods, obligations, activation,
     * reporting and payment contracts are separate from the
     * existing one-time initiative contract.
     *
     * Creation itself is safe because the verified canonical
     * create_contribution_initiative() RPC stores the initiative
     * as Draft and creates no obligations.
     */

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

        if (frequency === "monthly") {

            elements.contributionProgramStatus.textContent =
                "Recurring initiative created as Draft. Recurring participant terms and activation remain backend-gated.";

        } else {

            elements.contributionProgramStatus.textContent =
                "One-time initiative created as Draft. Configure participants before activation.";
        }

        elements.contributionProgramStatus.className =
            "program-status ready";
    }

    return data;
}


/* ================================================================
   CONTRIBUTION CONFIGURATION — READ ONLY HELPERS
================================================================ */

/*
 * These helpers intentionally render textContent rather than
 * inserting HTML. This keeps the presentation path safe and
 * avoids introducing HTML injection paths.
 */

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


/*
 * Remove any currently open participant editor.
 *
 * Only one draft initiative is configured at a time.
 */
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

/*
 * Reads members belonging to the current group.
 *
 * This is intentionally scoped by currentGroup.id.
 *
 * No member-table writes occur here.
 * members.js remains the owner of ordinary member management.
 */
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
   INITIATIVE PARTICIPANTS — READ ONLY EXISTING STATE
================================================================ */

/*
 * There is no participant getter RPC in the verified production
 * contract.
 *
 * Therefore this is a READ ONLY query against the participant table.
 *
 * The browser MUST NOT insert, update, delete or upsert this table.
 *
 * This helper is intentionally limited to ONE-TIME initiatives.
 * Monthly recurring initiatives must use the future recurring
 * participant-term contract and must never be routed through this
 * legacy participant configuration path.
 */
async function loadInitiativeParticipants(initiativeId) {

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
        .from("contribution_initiative_members")
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
   INITIATIVE PARTICIPANT EDITOR
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

    if (member.member_number !== null &&
        member.member_number !== undefined &&
        member.member_number !== "") {

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


function renderInitiativeParticipantEditor(
    initiative,
    existingParticipants
) {

    const container =
        elements.contributionInitiativesList;

    if (!container) {
        return;
    }

    /*
     * This editor is exclusively for the existing ONE-TIME
     * participant contract.
     */
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
        "This configuration applies to the existing one-time initiative contract. " +
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

    /*
     * Status is intentionally retained as a DOM element so the
     * save handler can update it without using innerHTML.
     */
    editor._participantStatus =
        status;

    /*
     * Insert immediately after the initiative list.
     *
     * This keeps the editor inside the existing Contribution
     * Programs section and avoids creating a second program area.
     */
    container.appendChild(
        editor
    );

    return editor;
}


/* ================================================================
   INITIATIVE PARTICIPANT CONFIGURATION
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

    /*
     * IMPORTANT:
     * The existing participant RPC is a ONE-TIME initiative
     * contract. Monthly recurring initiatives must never enter
     * this workflow.
     */
    if (isMonthlyInitiative(initiative)) {

        throw new Error(
            "Monthly recurring initiatives are not yet available for participant configuration. The recurring participant-term contract is still gated."
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

    /*
     * Both operations are read-only.
     *
     * Members are scoped to the active group.
     * Existing participants are read from the participant table
     * because no participant getter RPC currently exists.
     */
    const [
        members,
        existingParticipants
    ] = await Promise.all([
        loadInitiativeMembers(),
        loadInitiativeParticipants(
            initiative.id
        )
    ]);

    /*
     * Guard against the selected initiative changing or becoming
     * unavailable while the asynchronous reads were in progress.
     */
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

    if (!isOneTimeInitiative(currentInitiative)) {

        clearInitiativeParticipantEditor();

        throw new Error(
            "Monthly recurring initiatives use the recurring participant-term workflow."
        );
    }

    initiativeMembers =
        Array.isArray(members)
            ? members
            : [];

    renderInitiativeParticipantEditor(
        currentInitiative,
        existingParticipants
    );
}


/* ================================================================
   INITIATIVE PARTICIPANT SAVE
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

    /*
     * Hard boundary:
     * set_contribution_initiative_members() remains the existing
     * ONE-TIME initiative participant contract.
     */
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

        /*
         * The frontend verifies the selected member belongs to the
         * already-loaded current-group member set.
         *
         * The canonical RPC remains authoritative and performs its
         * own group-membership validation.
         */
        if (
            !memberId ||
            !memberIds.has(memberId)
        ) {

            throw new Error(
                "One or more selected members do not belong to the current group."
            );
        }

        /*
         * Prevent duplicate payload entries at the browser layer.
         * The database unique constraint remains authoritative.
         */
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

    /*
     * Empty participant arrays are permitted by the currently
     * verified backend contract.
     *
     * Activation policy for zero-participant initiatives remains
     * a later gate and is not invented here.
     */

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

        /*
         * One fresh request ID represents this logical save.
         *
         * If the same logical request must be retried, the caller
         * should reuse the same request ID. A new logical save gets
         * a new UUID.
         */
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

        /*
         * Refresh only the initiative display.
         *
         * The canonical RPC owns participant replacement and
         * effective-date handling.
         */
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
   CONTRIBUTION INITIATIVES — LIST
================================================================ */

function renderContributionInitiatives() {

    const container =
        elements.contributionInitiativesList;

    if (!container) {
        return;
    }

    /*
     * Re-rendering removes any stale participant editor.
     */
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

            /*
             * MONTHLY RECURRING BOUNDARY
             *
             * Monthly initiatives are intentionally visible, but
             * they cannot use the existing one-time participant
             * editor until the recurring participant-term contract
             * is present and frozen.
             */
            if (
                isMonthlyInitiative(initiative)
            ) {

                appendTextRow(
                    item,
                    "Recurring setup",
                    "Backend contract pending"
                );

                if (
                    normalizeLower(
                        initiative.status
                    ) === "draft" &&
                    isInitiativeManager()
                ) {

                    const status =
                        document.createElement("div");

                    status.className =
                        "program-status";

                    status.textContent =
                        "Monthly recurring configuration is gated pending the recurring participant-term contract.";

                    item.appendChild(
                        status
                    );
                }

                container.appendChild(
                    item
                );

                return;
            }

            /*
             * ONE-TIME PARTICIPANT CONFIGURATION
             *
             * This remains the existing canonical workflow.
             */
            if (
                isOneTimeInitiative(initiative) &&
                normalizeLower(
                    initiative.status
                ) === "draft" &&
                isInitiativeManager()
            ) {

                const actions =
                    document.createElement("div");

                actions.className =
                    "program-actions";

                const configureButton =
                    document.createElement("button");

                configureButton.type =
                    "button";

                configureButton.className =
                    "btn btn-secondary";

                configureButton.dataset.configureInitiative =
                    initiative.id;

                configureButton.textContent =
                    "Configure Participants";

                actions.appendChild(
                    configureButton
                );

                item.appendChild(
                    actions
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
   APPLICATION CONTEXT
================================================================ */

async function loadApplicationContext() {

    const {
        data,
        error
    } = await getMyApplicationContext();

    if (error) {
        throw error;
    }

    const context =
        Array.isArray(data)
            ? data[0] || null
            : data || null;

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

    applyAuthorization();
    renderGroup();
}


/* ================================================================
   EVENT BINDING
================================================================ */

function bindEvents() {

    if (eventsBound) {
        return;
    }

    eventsBound = true;

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
                    "Failed to save actual position:",
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

    /*
     * Contribution initiative controls are rendered dynamically.
     *
     * Delegation keeps one event owner on the existing list rather
     * than attaching listeners repeatedly every time the list
     * refreshes.
     */
    elements.contributionInitiativesList?.addEventListener(
        "click",
        async (event) => {

            const configureButton =
                event.target.closest(
                    "[data-configure-initiative]"
                );

            if (configureButton) {

                const initiativeId =
                    configureButton.dataset.configureInitiative;

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

                    if (elements.contributionProgramStatus) {

                        elements.contributionProgramStatus.textContent =
                            error?.message ||
                            "Failed to open participant configuration.";

                        elements.contributionProgramStatus.className =
                            "program-status error";
                    }

                } finally {

                    /*
                     * The initiative list may have been re-rendered
                     * during the operation. Only restore the original
                     * button if it is still connected.
                     */
                    if (
                        configureButton.isConnected
                    ) {

                        configureButton.disabled =
                            false;
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

                if (elements.contributionProgramStatus) {

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

                    if (elements.contributionProgramStatus) {

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

                    if (elements.contributionProgramStatus) {

                        elements.contributionProgramStatus.textContent =
                            error?.message ||
                            "Failed to save participant configuration.";

                        elements.contributionProgramStatus.className =
                            "program-status error";
                    }
                }
            }
        }
    );

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

            bindEvents();

            await loadApplicationContext();

            await Promise.all([
                loadLeadershipSetup(),
                loadMemberCount(),
                loadContributionSettings(),
                loadSubscription(),
                loadContributionTypes(),
                loadContributionInitiatives(),
                loadFineRules()
            ]);

            applyAuthorizationUI();

        })();

    try {

        await initializationPromise;

    } catch (error) {

        initializationPromise =
            null;

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
    saveInitiativeParticipants
};

import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";

const $ = id => document.getElementById(id);
let groupId = null;

async function init() {
  try {
    setStatus("Checking your permissions...");
    const member = await getMyMember();
    if (!member) throw new Error("You must be logged in.");
    groupId = member.group_id;
    if (!groupId) throw new Error("Your account is not linked to a group.");

    const role = String(member.role || member.security_role || "").trim().toLowerCase();
    if (!["admin", "chairperson"].includes(role)) {
      showError("Access denied. Only a group admin or chairperson can add members.");
      setStatus("You do not have permission to add members.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    if ($("joinDate")) $("joinDate").value = today;
    if ($("contributionEffectiveFrom")) $("contributionEffectiveFrom").value = today;
    if ($("positionEffectiveFrom")) $("positionEffectiveFrom").value = today;
    if ($("addMemberPanel")) $("addMemberPanel").hidden = false;

    bindHistoricalControls();
    bindContributionPreview();
    bindPositionControls();
    $("joinDate")?.addEventListener("change", syncEffectiveDates);
    setStatus("You can add members to this group.");
  } catch (e) {
    showError(e);
    setStatus("Unable to load member onboarding.");
  }
}

function bindHistoricalControls() {
  document.querySelectorAll('input[name="historicalContributions"]').forEach(input => {
    input.addEventListener("change", updateHistoricalVisibility);
  });
  updateHistoricalVisibility();
}

function updateHistoricalVisibility() {
  const selected = document.querySelector('input[name="historicalContributions"]:checked')?.value;
  const section = $("historicalContributionSection");
  if (section) section.hidden = selected !== "yes";
  if (selected !== "yes") {
    if ($("historicalPaidMonths")) $("historicalPaidMonths").value = "";
    if ($("historicalPaidThrough")) $("historicalPaidThrough").value = "";
  }
}

function bindPositionControls() {
  const position = $("actualPosition");
  const wrap = $("actualPositionNameWrap");
  const name = $("actualPositionName");
  const update = () => {
    const isOther = position?.value === "other";
    if (wrap) wrap.hidden = !isOther;
    if (!isOther && name) name.value = "";
  };
  position?.addEventListener("change", update);
  update();
}

function syncEffectiveDates() {
  const joinDate = $("joinDate")?.value;
  if (!joinDate) return;
  if ($("contributionEffectiveFrom")) $("contributionEffectiveFrom").value = joinDate;
  if ($("positionEffectiveFrom")) $("positionEffectiveFrom").value = joinDate;
}

function bindContributionPreview() {
  const amount = $("monthlyContributionAmount");
  const preview = $("monthlyContributionPreview");
  const update = () => {
    const value = Number(amount?.value || 0);
    if (preview) preview.textContent = value > 0 ? `Monthly contribution KSh ${value.toFixed(2)}` : "";
  };
  amount?.addEventListener("input", update);
  update();
}

async function submitMember(event) {
  event.preventDefault();
  clearError();

  if (!groupId) return showError("Your group could not be identified.");

  const button = $("saveMemberButton");
  const name = $("memberName")?.value.trim();
  const memberNumber = $("memberNumber")?.value.trim();
  const rawMembershipNumber = $("membershipNumber")?.value.trim() || "";
  const membershipNumber = /^\d{4}$/.test(rawMembershipNumber)
    ? rawMembershipNumber
    : memberNumber;
  const nationalId = $("nationalId")?.value.trim() || null;
  const phone = $("memberPhone")?.value.trim();
  const email = $("memberEmail")?.value.trim() || null;
  const sendInvitation = Boolean($("sendInvitation")?.checked && email);
  const role = $("memberRole")?.value || "member";
  const status = $("memberStatus")?.value || "active";
  const joinDate = $("joinDate")?.value;
  const actualPosition = $("actualPosition")?.value || null;
  const actualPositionName = actualPosition === "other" ? ($("actualPositionName")?.value.trim() || null) : null;
  const positionEffectiveFrom = $("positionEffectiveFrom")?.value || joinDate;
  const monthlyAmount = Number($("monthlyContributionAmount")?.value || 0);
  const firstPeriodRule = $("firstPeriodRule")?.value || "full_period";
  const contributionEffectiveFrom = $("contributionEffectiveFrom")?.value || joinDate;
  const historical = document.querySelector('input[name="historicalContributions"]:checked')?.value === "yes";
  const historicalEffectiveFrom = historical
    ? contributionEffectiveFrom.slice(0, 7) + "-01"
    : contributionEffectiveFrom;
  const historicalPaidMonths = Number($("historicalPaidMonths")?.value || 0);
  const historicalPaidThrough = $("historicalPaidThrough")?.value || null;
  const historicalTotalPaidInput = $("historicalTotalPaid")?.value;
  const historicalTotalPaid = historicalTotalPaidInput === "" || historicalTotalPaidInput == null
    ? historicalPaidMonths * monthlyAmount
    : Number(historicalTotalPaidInput);
  const historicalPaymentMethod = $("historicalPaymentMethod")?.value || "Cash";

  if (!name) return showError("Please enter the full name.");
  if (!memberNumber) return showError("Please enter the member number.");
  if (!phone) return showError("Please enter the phone number.");
  if (!joinDate) return showError("Please select the join date.");
  if (!(monthlyAmount > 0)) return showError("Please enter a valid monthly contribution amount.");
  if (!contributionEffectiveFrom) return showError("Please select the contribution effective date.");
  if (contributionEffectiveFrom < joinDate) return showError("Contribution effective date cannot be before the join date.");
  if (actualPosition && positionEffectiveFrom < joinDate) return showError("Position effective date cannot be before the join date.");

  if (historical) {
    if (status !== "active") return showError("Historical contributions require the member to be Active.");
    if (!Number.isInteger(historicalPaidMonths) || historicalPaidMonths < 1) {
      return showError("Enter the number of historical paid months.");
    }
    if (!historicalPaidThrough) return showError("Select the month through which the member has paid.");
    if (!(historicalTotalPaid > 0)) return showError("Enter a valid historical total paid amount.");
    if (historicalPaidThrough < historicalEffectiveFrom.slice(0, 7)) {
      return showError("Paid Through cannot be before the contribution effective month.");
    }
  }

  let historicalPayments = null;
  if (historical) {
    historicalPayments = buildHistoricalPayments(
      historicalPaidMonths,
      historicalPaidThrough,
      monthlyAmount,
      historicalTotalPaid,
      historicalEffectiveFrom,
      historicalPaymentMethod
    );
  }

  button.disabled = true;
  button.textContent = "Adding Member...";

  try {
    const { data: types, error: typeError } = await supabase
      .from("contribution_types")
      .select("id,code,name")
      .eq("group_id", groupId);

    if (typeError) throw typeError;

    const monthlyType = (types || []).find(t =>
      String(t.code || "").toLowerCase() === "monthly" ||
      String(t.name || "").trim().toLowerCase() === "monthly"
    );
    if (!monthlyType) throw new Error("The group's Monthly contribution type could not be found.");

    if (historical) {
      const requestId = crypto.randomUUID();
      const paidThroughDate = getEndOfMonthDate(historicalPaidThrough);

      const { data: historicalResult, error: historicalError } = await supabase.rpc(
        "create_member_with_historical_contributions",
        {
          p_member: {
            member_number: memberNumber,
            membership_number: membershipNumber,
            name, phone, email, national_id: nationalId, role, status,
            onboarding_status: "active",
            join_date: joinDate,
            actual_position: actualPosition,
            actual_position_name: actualPositionName,
            actual_position_effective_from: positionEffectiveFrom
          },
          p_contribution_plan: [{
            contribution_type_id: monthlyType.id,
            amount: monthlyAmount,
            frequency: "monthly",
            effective_from: contributionEffectiveFrom,
            first_period_rule: firstPeriodRule,
            status: "active"
          }],
          p_historical: {
            enabled: true,
            monthly_amount: monthlyAmount,
            paid_through: paidThroughDate,
            payment_method: historicalPaymentMethod
          },
          p_request_id: requestId
        }
      );

      if (historicalError) throw historicalError;

      const historicalRow = historicalResult?.result || historicalResult;
      if (!historicalRow?.member_id) {
        throw new Error("Historical member onboarding did not return a member ID.");
      }

      const position = String(
        historicalRow.contribution_status || "up_to_date"
      ).replace(/_/g, " ").toUpperCase();

      const msg = $("formMessage");
      if (msg) {
        msg.hidden = false;
        msg.textContent = `${name} was added. Historical accounting completed: ${position}.`;
        msg.style.background = "#ecfdf5";
        msg.style.color = "#166534";
      }

      $("addMemberForm")?.reset();
      if ($("joinDate")) $("joinDate").value = new Date().toISOString().slice(0, 10);
      if ($("contributionEffectiveFrom")) {
        $("contributionEffectiveFrom").value = $("joinDate")?.value;
      }
      updateHistoricalVisibility();
      if (sendInvitation) {
        try {
          await sendLoginInvitation(historicalRow.member_id);
        } catch (inviteError) {
          console.warn("Member created but login invitation failed:", inviteError);
          setStatus(`${name} added — accounting completed, but the login invitation could not be sent.`);
          return;
        }
      }

      setStatus(`${name} added — opening contribution position: ${position}.`);
      return;
    }
    const { data: created, error: createError } = await supabase.rpc(
      "create_member_with_contribution_plan",
      {
        p_member: {
          member_number: memberNumber,
          membership_number: membershipNumber,
          name,
          phone,
          email,
          national_id: nationalId,
          role,
          status,
          onboarding_status: "active",
          join_date: joinDate,
          actual_position: actualPosition,
          actual_position_name: actualPositionName,
          actual_position_effective_from: positionEffectiveFrom
        },
        p_contribution_plan: [{
          contribution_type_id: monthlyType.id,
          amount: monthlyAmount,
          frequency: "monthly",
          effective_from: contributionEffectiveFrom,
          first_period_rule: firstPeriodRule,
          status: "active"
        }]
      }
    );

    if (createError) throw createError;
    const createdRow = Array.isArray(created) ? created[0] : created;
    if (!createdRow?.member_id) throw new Error("Member was not created.");

    if (sendInvitation) {
      try {
        await sendLoginInvitation(createdRow.member_id);
      } catch (inviteError) {
        console.warn("Member created but login invitation failed:", inviteError);
      }
    }

    let accountingResult = createdRow;

    const position = String(accountingResult.position_status || createdRow.contribution_status || "")
      .replaceAll("_", " ")
      .toUpperCase();

    const msg = $("formMessage");
    if (msg) {
      msg.hidden = false;
      msg.textContent = historical
        ? `${name} was added. Historical accounting completed: ${position || "UP TO DATE"}.`
        : `${name} was added successfully.`;
      msg.style.background = "#ecfdf5";
      msg.style.color = "#166534";
    }

    $("addMemberForm")?.reset();
    if ($("joinDate")) $("joinDate").value = new Date().toISOString().slice(0, 10);
    if ($("contributionEffectiveFrom")) $("contributionEffectiveFrom").value = $("joinDate")?.value;
    updateHistoricalVisibility();
    setStatus(
      historical
        ? `${name} added — opening contribution position: ${position || "UP TO DATE"}.`
        : `${name} was added successfully.`
    );
  } catch (e) {
    console.error("Add member error:", {
      message: e?.message,
      details: e?.details,
      hint: e?.hint,
      code: e?.code,
      error: e
    });

    const diagnostic = [
      e?.code ? `Code: ${e.code}` : "",
      e?.message || "",
      e?.details ? `Details: ${e.details}` : "",
      e?.hint ? `Hint: ${e.hint}` : ""
    ].filter(Boolean).join(" — ");

    showError(diagnostic || "Unable to add member.");
  } finally {
    button.disabled = false;
    button.textContent = "Save Member";
  }
}

function getEndOfMonthDate(monthValue) {
  const value = String(monthValue || "").trim();
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Invalid historical Paid Through month.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function buildHistoricalPayments(paidMonths, paidThrough, monthlyAmount, totalPaid, effectiveFrom, paymentMethod) {
  const [year, month] = paidThrough.split("-").map(Number);
  const end = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - paidMonths + 1);

  const effectiveMonth = new Date(Date.UTC(
    Number(effectiveFrom.slice(0, 4)),
    Number(effectiveFrom.slice(5, 7)) - 1,
    1
  ));

  if (start < effectiveMonth) {
    throw new Error("The number of paid months extends before the contribution effective date. Adjust Paid Months or Paid Through.");
  }

  const payments = [];
  let remaining = Number(totalPaid.toFixed(2));
  for (let i = 0; i < paidMonths; i += 1) {
    const d = new Date(start);
    d.setUTCMonth(start.getUTCMonth() + i);
    const monthKey = d.toISOString().slice(0, 7);
    const amount = i === paidMonths - 1
      ? Number(remaining.toFixed(2))
      : Number(Math.min(monthlyAmount, remaining).toFixed(2));
    if (amount <= 0) throw new Error("Historical total paid is too small for the selected paid months.");
    remaining = Number((remaining - amount).toFixed(2));
    payments.push({
      payment_id: crypto.randomUUID(),
      payment_date: `${monthKey}-01`,
      amount,
      payment_method: paymentMethod,
      reference: `HISTORICAL-${monthKey}`,
      notes: "Historical onboarding payment reconstructed from paid months"
    });
  }
  if (payments.length !== paidMonths) {
    throw new Error("Historical payment reconstruction did not produce all selected paid months.");
  }
  return payments;
}

async function sendLoginInvitation(memberId) {
  if (!memberId) throw new Error("Member ID is required for invitation.");
  const { data, error } = await supabase.functions.invoke(
    "send-member-invitation",
    { body: { member_id: memberId } }
  );
  if (error) throw error;
  if (data?.email_sent === false) {
    throw new Error(data?.error || "The login invitation email was not sent.");
  }
  return data;
}


function clearError() {
  const e = $("error");
  if (e) {
    e.hidden = true;
    e.textContent = "";
  }
}

function showError(error) {
  const message = typeof error === "string" ? error : error?.message || "Something went wrong.";
  const e = $("error");
  if (e) {
    e.hidden = false;
    e.textContent = message;
  }
  const m = $("formMessage");
  if (m) {
    m.hidden = false;
    m.textContent = message;
    m.style.background = "#fef2f2";
    m.style.color = "#991b1b";
  }
}

function setStatus(message) {
  const e = $("status");
  if (e) e.textContent = message;
}

$("addMemberForm")?.addEventListener("submit", submitMember);
$("cancelAddMember")?.addEventListener("click", () => {
  if ($("addMemberPanel")) $("addMemberPanel").hidden = true;
});
$("closeAddMember")?.addEventListener("click", () => {
  if ($("addMemberPanel")) $("addMemberPanel").hidden = true;
});

init();

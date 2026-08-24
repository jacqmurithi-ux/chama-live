import { supabase } from "./supabase.js";

const rows = document.querySelector("#rows");
const form = document.querySelector("#contribution-form");
const memberSelect = document.querySelector("#member");
const errorBox = document.querySelector("[data-error]");
const saveButton = document.querySelector("#save");

function showError(error) {
  console.error("Contributions error:", error);

  if (errorBox) {
    errorBox.textContent =
      error?.message || "Unable to load contributions.";
    errorBox.hidden = false;
  }
}

function money(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES"
  }).format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getCurrentGroupId() {
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) throw userError;

  if (!user) {
    window.location.href = "./login.html";
    return null;
  }

  const { data, error } = await supabase
    .from("members")
    .select("group_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error("Your account is not linked to a group.");
  }

  return data.group_id;
}

async function loadMembers() {
  const groupId = await getCurrentGroupId();

  const { data, error } = await supabase
    .from("members")
    .select("id, name")
    .eq("group_id", groupId)
    .order("name");

  if (error) throw error;

  memberSelect.innerHTML =
    '<option value="">Select member</option>';

  (data || []).forEach(member => {
    const option = document.createElement("option");

    option.value = member.id;
    option.textContent = member.name;

    memberSelect.appendChild(option);
  });
}

async function loadContributions() {
  const groupId = await getCurrentGroupId();

  const { data, error } = await supabase
    .from("contributions")
    .select(`
      contribution_date,
      amount,
      contribution_type,
      payment_method,
      reference,
      member_id
    `)
    .eq("group_id", groupId)
    .order("contribution_date", {
      ascending: false
    });

  if (error) throw error;

  const contributions = data || [];

  if (contributions.length === 0) {
    rows.innerHTML = `
      <tr>
        <td colspan="6">No contributions yet.</td>
      </tr>
    `;
    return;
  }

  const memberIds = [
    ...new Set(
      contributions
        .map(item => item.member_id)
        .filter(Boolean)
    )
  ];

  let names = {};

  if (memberIds.length) {
    const { data: members, error } = await supabase
      .from("members")
      .select("id, name")
      .in("id", memberIds);

    if (error) throw error;

    names = Object.fromEntries(
      (members || []).map(member => [
        member.id,
        member.name
      ])
    );
  }

  rows.innerHTML = contributions.map(item => `
    <tr>
      <td>${escapeHtml(item.contribution_date || "—")}</td>
      <td>${escapeHtml(names[item.member_id] || "—")}</td>
      <td>${money(item.amount)}</td>
      <td>${escapeHtml(item.contribution_type || "—")}</td>
      <td>${escapeHtml(item.payment_method || "—")}</td>
      <td>${escapeHtml(item.reference || "—")}</td>
    </tr>
  `).join("");
}

if (form) {
  form.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      errorBox.hidden = true;

      saveButton.disabled = true;
      saveButton.textContent = "Saving...";

      const groupId = await getCurrentGroupId();

      const memberId = memberSelect.value;
      const amount = Number(
        document.querySelector("#amount").value
      );
      const date =
        document.querySelector("#date").value;
      const type =
        document.querySelector("#type").value;
      const method =
        document.querySelector("#method").value;
      const reference =
        document.querySelector("#reference").value.trim();

      if (!memberId) {
        throw new Error("Please select a member.");
      }

      if (!amount || amount <= 0) {
        throw new Error("Enter a valid amount.");
      }

      if (!date) {
        throw new Error("Please select a date.");
      }

      const { error } = await supabase
        .from("contributions")
        .insert({
          group_id: groupId,
          member_id: memberId,
          amount: amount,
          contribution_date: date,
          contribution_type: type,
          payment_method: method,
          reference: reference || null
        });

      if (error) throw error;

      form.reset();

      document.querySelector("#date").value =
        new Date().toISOString().split("T")[0];

      await loadContributions();

    } catch (error) {
      showError(error);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save Contribution";
    }
  });
}

try {
  if (document.querySelector("#date")) {
    document.querySelector("#date").value =
      new Date().toISOString().split("T")[0];
  }

  await loadMembers();
  await loadContributions();

} catch (error) {
  showError(error);
  
}

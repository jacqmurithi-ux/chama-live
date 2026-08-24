import { supabase } from "./supabase.js";

const rows = document.querySelector("#rows");
const memberSelect = document.querySelector("#member");
const form = document.querySelector("#contribution-form");
const errorBox = document.querySelector("[data-error]");
const saveButton = document.querySelector("#save");

if (!rows) {
  throw new Error("Missing #rows in contributions.html");
}

if (!memberSelect) {
  throw new Error("Missing #member in contributions.html");
}

if (!form) {
  throw new Error("Missing #contribution-form in contributions.html");
}

function showError(error) {
  console.error("CHAMA LIVE Contributions:", error);

  if (errorBox) {
    errorBox.textContent =
      error?.message || "Something went wrong.";
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
    error
  } = await supabase.auth.getUser();

  if (error) throw error;

  if (!user) {
    location.href = "login.html";
    return null;
  }

  const {
    data: member,
    error: memberError
  } = await supabase
    .from("members")
    .select("group_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (memberError) throw memberError;

  if (!member) {
    throw new Error(
      "Your account is not linked to a group."
    );
  }

  return member.group_id;
}

async function loadMembers() {

  const groupId =
    await getCurrentGroupId();

  const {
    data,
    error
  } = await supabase
    .from("members")
    .select("id, name")
    .eq("group_id", groupId)
    .order("name");

  if (error) throw error;

  memberSelect.innerHTML =
    '<option value="">Select member</option>';

  (data || []).forEach(member => {

    const option =
      document.createElement("option");

    option.value = member.id;
    option.textContent = member.name;

    memberSelect.appendChild(option);
  });
}

async function loadContributions() {

  const groupId =
    await getCurrentGroupId();

  const {
    data,
    error
  } = await supabase
    .from("contributions")
    .select(
      "contribution_date, amount, contribution_type, payment_method, reference, member_id"
    )
    .eq("group_id", groupId)
    .order("contribution_date", {
      ascending: false
    });

  if (error) throw error;

  if (!data || data.length === 0) {

    rows.innerHTML = `
      <tr>
        <td colspan="6">
          No contributions yet.
        </td>
      </tr>
    `;

    return;
  }

  const memberIds = [
    ...new Set(
      data
        .map(item => item.member_id)
        .filter(Boolean)
    )
  ];

  let names = {};

  if (memberIds.length) {

    const {
      data: members,
      error
    } = await supabase
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

  rows.innerHTML = data.map(item => {

    return `
      <tr>

        <td>
          ${escapeHtml(
            item.contribution_date || "—"
          )}
        </td>

        <td>
          ${escapeHtml(
            names[item.member_id] || "—"
          )}
        </td>

        <td>
          ${money(item.amount)}
        </td>

        <td>
          ${escapeHtml(
            item.contribution_type || "—"
          )}
        </td>

        <td>
          ${escapeHtml(
            item.payment_method || "—"
          )}
        </td>

        <td>
          ${escapeHtml(
            item.reference || "—"
          )}
        </td>

      </tr>
    `;

  }).join("");
}

async function start() {

  try {

    await loadMembers();

    await loadContributions();

  } catch (error) {

    showError(error);

  }
}

start();

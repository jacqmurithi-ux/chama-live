import { supabase } from "./supabase.js";

async function getCurrentGroupId() {

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    window.location.href = "./login.html";
    return null;
  }

  /*
   * The CHAMA LIVE database links the logged-in
   * Supabase user to a member using auth_user_id.
   *
   * members.auth_user_id
   *        ↓
   * members.group_id
   */

  const {
    data: member,
    error
  } = await supabase
    .from("members")
    .select("group_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!member) {
    throw new Error(
      "Your account is not linked to a group."
    );
  }

  return member.group_id;
}


function showError(error) {

  console.error(
    "CHAMA LIVE members error:",
    error
  );

  const errorBox =
    document.querySelector("[data-error]");

  if (errorBox) {

    errorBox.textContent =
      error?.message ||
      "Unable to load members.";

    errorBox.hidden = false;
  }
}


function escapeHtml(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


async function loadMembers() {

  const rows =
    document.querySelector("#rows");

  if (!rows) {
    console.error(
      "CHAMA LIVE: #rows was not found."
    );
    return;
  }

  try {

    const groupId =
      await getCurrentGroupId();

    if (!groupId) {
      throw new Error(
        "No group is linked to this account."
      );
    }


    const {
      data: members,
      error
    } = await supabase
      .from("members")
      .select(
        "member_number, name, phone, email, role, status, onboarding_status"
      )
      .eq("group_id", groupId)
      .order("member_number", {
        ascending: true
      });


    if (error) {
      throw error;
    }


    if (!members || members.length === 0) {

      rows.innerHTML = `
        <tr>
          <td colspan="7">
            No members found.
          </td>
        </tr>
      `;

      return;
    }


    rows.innerHTML = members
      .map(member => {

        return `
          <tr>

            <td>
              ${escapeHtml(
                member.member_number ?? "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                member.name ?? "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                member.phone ?? "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                member.email ?? "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                member.role ?? "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                member.status ?? "—"
              )}
            </td>

            <td>
              ${escapeHtml(
                member.onboarding_status ?? "—"
              )}
            </td>

          </tr>
        `;

      })
      .join("");

  } catch (error) {

    rows.innerHTML = `
      <tr>
        <td colspan="7">
          Unable to load members.
        </td>
      </tr>
    `;

    showError(error);
  }
}


loadMembers();

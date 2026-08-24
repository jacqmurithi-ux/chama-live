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


function money(value) {

  return new Intl.NumberFormat(
    "en-KE",
    {
      style: "currency",
      currency: "KES",
      minimumFractionDigits: 2
    }
  ).format(Number(value) || 0);

}


function showError(error) {

  console.error(
    "CHAMA LIVE contributions error:",
    error
  );

  const errorBox =
    document.querySelector("[data-error]");

  if (errorBox) {

    errorBox.textContent =
      error?.message ||
      "Unable to load contributions.";

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


async function loadContributions() {

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


    /*
     * LOAD CONTRIBUTIONS
     */

    const {
      data: contributions,
      error
    } = await supabase
      .from("contributions")
      .select(`
        contribution_date,
        amount,
        contribution_type,
        payment_method,
        mpesa_reference,
        member_id
      `)
      .eq("group_id", groupId)
      .order("contribution_date", {
        ascending: false
      });


    if (error) {
      throw error;
    }


    const contributionRows =
      contributions || [];


    /*
     * GET MEMBER IDS
     */

    const memberIds = [
      ...new Set(
        contributionRows
          .map(row => row.member_id)
          .filter(Boolean)
      )
    ];


    let memberNames = {};


    /*
     * LOAD MEMBERS
     */

    if (memberIds.length > 0) {

      const {
        data: members,
        error: memberError
      } = await supabase
        .from("members")
        .select("id, name")
        .eq("group_id", groupId)
        .in("id", memberIds);


      if (memberError) {
        throw memberError;
      }


      memberNames =
        Object.fromEntries(
          (members || []).map(member => [
            member.id,
            member.name
          ])
        );
    }


    /*
     * NO CONTRIBUTIONS
     */

    if (contributionRows.length === 0) {

      rows.innerHTML = `
        <tr>
          <td colspan="6">
            No contributions yet.
          </td>
        </tr>
      `;

      return;
    }


    /*
     * DISPLAY CONTRIBUTIONS
     */

    rows.innerHTML =
      contributionRows
        .map(contribution => {

          return `
            <tr>

              <td>
                ${escapeHtml(
                  contribution.contribution_date ?? "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  memberNames[
                    contribution.member_id
                  ] ?? "—"
                )}
              </td>

              <td>
                ${money(
                  contribution.amount
                )}
              </td>

              <td>
                ${escapeHtml(
                  contribution.contribution_type ?? "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  contribution.payment_method ?? "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  contribution.mpesa_reference ?? "—"
                )}
              </td>

            </tr>
          `;

        })
        .join("");


  } catch (error) {

    rows.innerHTML = `
      <tr>
        <td colspan="6">
          Unable to load contributions.
        </td>
      </tr>
    `;

    showError(error);
  }
}


loadContributions();

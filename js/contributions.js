import { supabase } from "./supabase.js";

const rows = document.querySelector("#rows");

async function loadContributions() {

  if (!rows) {
    return;
  }

  rows.innerHTML =
    "<tr><td colspan='6'>Connecting...</td></tr>";

  try {

    const {
      data: {
        session
      }
    } = await supabase.auth.getSession();

    if (!session) {
      throw new Error("Not logged in.");
    }

    rows.innerHTML =
      "<tr><td colspan='6'>Loading contributions...</td></tr>";


    /*
     * First test: load contributions
     */
    const result =
      await supabase
        .from("contributions")
        .select(
          "contribution_date, amount, contribution_type, payment_method, reference, member_id, group_id"
        )
        .order(
          "contribution_date",
          {
            ascending: false
          }
        );


    if (result.error) {
      throw result.error;
    }


    const contributions =
      result.data || [];


    console.log(
      "CONTRIBUTIONS:",
      contributions
    );


    if (contributions.length === 0) {

      rows.innerHTML =
        "<tr>" +
        "<td colspan='6'>" +
        "No contributions yet." +
        "</td>" +
        "</tr>";

      return;
    }


    /*
     * Load members
     */
    const memberIds =
      [
        ...new Set(
          contributions
            .map(function (item) {
              return item.member_id;
            })
            .filter(Boolean)
        )
      ];


    const memberNames = {};


    if (memberIds.length > 0) {

      const membersResult =
        await supabase
          .from("members")
          .select("id, name")
          .in("id", memberIds);


      if (membersResult.error) {
        throw membersResult.error;
      }


      (membersResult.data || [])
        .forEach(function (member) {

          memberNames[member.id] =
            member.name;

        });
    }


    /*
     * Display
     */
    rows.innerHTML =
      contributions
        .map(function (item) {

          return `
            <tr>

              <td>
                ${item.contribution_date || "—"}
              </td>

              <td>
                ${memberNames[item.member_id] || "—"}
              </td>

              <td>
                KSh ${Number(item.amount || 0).toLocaleString()}
              </td>

              <td>
                ${item.contribution_type || "—"}
              </td>

              <td>
                ${item.payment_method || "—"}
              </td>

              <td>
                ${item.reference || "—"}
              </td>

            </tr>
          `;

        })
        .join("");


  } catch (error) {

    console.error(
      "CONTRIBUTIONS ERROR:",
      error
    );


    rows.innerHTML =
      "<tr>" +
      "<td colspan='6' style='color:red'>" +
      "ERROR: " +
      error.message +
      "</td>" +
      "</tr>";
  }
}


loadContributions();

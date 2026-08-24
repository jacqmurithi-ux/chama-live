import { supabase } from "./supabase.js";

const rows = document.querySelector("#rows");

async function loadContributions() {

  try {

    if (!rows) {
      throw new Error("Contributions table not found.");
    }

    rows.innerHTML =
      "<tr><td colspan='6'>Connecting to Supabase...</td></tr>";


    const {
      data: sessionData,
      error: sessionError
    } = await supabase.auth.getSession();


    if (sessionError) {
      throw sessionError;
    }


    if (!sessionData.session) {
      throw new Error("You are not logged in.");
    }


    rows.innerHTML =
      "<tr><td colspan='6'>Loading contributions...</td></tr>";


    const {
      data,
      error
    } = await supabase
      .from("contributions")
      .select(
        "contribution_date, amount, contribution_type, payment_method, reference, member_id"
      )
      .order("contribution_date", {
        ascending: false
      });


    console.log(
      "Supabase contributions:",
      data,
      error
    );


    if (error) {
      throw error;
    }


    const contributions = data || [];


    if (contributions.length === 0) {

      rows.innerHTML =
        "<tr>" +
        "<td colspan='6'>" +
        "No contributions yet." +
        "</td>" +
        "</tr>";

      return;
    }


    const memberIds = [
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

      const {
        data: members,
        error: memberError
      } = await supabase
        .from("members")
        .select("id, name")
        .in("id", memberIds);


      if (memberError) {
        throw memberError;
      }


      (members || []).forEach(function (member) {

        memberNames[member.id] =
          member.name;

      });
    }


    rows.innerHTML =
      contributions
        .map(function (item) {

          return (
            "<tr>" +

            "<td>" +
            (item.contribution_date || "—") +
            "</td>" +

            "<td>" +
            (memberNames[item.member_id] || "—") +
            "</td>" +

            "<td>" +
            "KSh " +
            Number(
              item.amount || 0
            ).toLocaleString() +
            "</td>" +

            "<td>" +
            (item.contribution_type || "—") +
            "</td>" +

            "<td>" +
            (item.payment_method || "—") +
            "</td>" +

            "<td>" +
            (item.reference || "—") +
            "</td>" +

            "</tr>"
          );

        })
        .join("");


  } catch (error) {

    console.error(
      "CHAMA LIVE contributions error:",
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

<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">

  <title>Contributions — CHAMA LIVE</title>

  <link rel="stylesheet" href="css/app.css">
</head>

<body>

<header class="topbar">

  <div class="brand">
    CHAMA <span>LIVE</span>
  </div>

  <button class="btn btn-secondary" id="logout">
    Sign out
  </button>

</header>


<div class="layout">

  <aside class="sidebar">

    <nav class="nav">

      <a href="dashboard.html">Dashboard</a>
      <a href="members.html">Members</a>
      <a class="" href="contributions.html">Contributions</a>
      <a href="expenses.html">Expenses</a>
      <a href="meetings.html">Meetings</a>
      <a href="reports.html">Reports</a>
      <a href="group-management.html">Group Management</a>

    </nav>

  </aside>


  <main class="main">

    <div class="page-head">

      <div>
        <h1>Contributions</h1>
        <p class="muted">
          Record and view group contributions.
        </p>
      </div>

    </div>


    <!-- ADD CONTRIBUTION -->

    <section class="card">

      <h2>Add Contribution</h2>

      <form id="contribution-form">

        <div class="form">

          <div class="field">

            <label for="member">
              Member
            </label>

            <select id="member" required>

              <option value="">
                Select member
              </option>

            </select>

          </div>


          <div class="field">

            <label for="amount">
              Amount
            </label>

            <input
              id="amount"
              type="number"
              min="1"
              step="0.01"
              placeholder="e.g. 500"
              required
            >

          </div>


          <div class="field">

            <label for="date">
              Date
            </label>

            <input
              id="date"
              type="date"
              required
            >

          </div>


          <div class="field">

            <label for="type">
              Contribution Type
            </label>

            <select id="type" required>

              <option value="">
                Select type
              </option>

              <option value="Monthly">
                Monthly
              </option>

              <option value="Registration">
                Registration
              </option>

              <option value="Welfare">
                Welfare
              </option>

              <option value="Fundraising">
                Fundraising
              </option>

              <option value="Other">
                Other
              </option>

            </select>

          </div>


          <div class="field">

            <label for="method">
              Payment Method
            </label>

            <select id="method" required>

              <option value="">
                Select method
              </option>

              <option value="M-Pesa">
                M-Pesa
              </option>

              <option value="Cash">
                Cash
              </option>

              <option value="Bank">
                Bank
              </option>

              <option value="Other">
                Other
              </option>

            </select>

          </div>


          <div class="field">

            <label for="reference">
              M-Pesa / Payment Reference
            </label>

            <input
              id="reference"
              type="text"
              placeholder="e.g. ABC123XYZ"
            >

          </div>


          <button
            class="btn btn-primary"
            type="submit"
            id="save"
          >
            Save Contribution
          </button>

        </div>

      </form>

    </section>


    <div
      class="error"
      data-error
      hidden
    ></div>


    <section class="card">

      <div class="page-head">

        <div>
          <h2>Contribution Ledger</h2>
        </div>

      </div>


      <div class="table-wrap">

        <table class="table">

          <thead>

            <tr>
              <th>Date</th>
              <th>Member</th>
              <th>Amount</th>
              <th>Type</th>
              <th>Method</th>
              <th>M-Pesa Ref</th>
            </tr>

          </thead>


          <tbody id="rows">

            <tr>
              <td colspan="6">
                Loading…
              </td>
            </tr>

          </tbody>

        </table>

      </div>

    </section>

  </main>

</div>


<script type="module">

import { supabase } from "./js/supabase.js";


const rows =
  document.querySelector("#rows");

const form =
  document.querySelector("#contribution-form");

const memberSelect =
  document.querySelector("#member");

const errorBox =
  document.querySelector("[data-error]");

const saveButton =
  document.querySelector("#save");


function showError(error) {

  console.error(
    "CHAMA LIVE contributions error:",
    error
  );

  errorBox.textContent =
    error?.message ||
    "Something went wrong.";

  errorBox.hidden = false;
}


function money(value) {

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 2
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

  if (userError) {
    throw userError;
  }

  if (!user) {

    window.location.href =
      "./login.html";

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


async function loadMembers() {

  const groupId =
    await getCurrentGroupId();


  const {
    data: members,
    error
  } = await supabase
    .from("members")
    .select("id, name")
    .eq("group_id", groupId)
    .order("name");


  if (error) {
    throw error;
  }


  memberSelect.innerHTML = `
    <option value="">
      Select member
    </option>
  `;


  (members || []).forEach(member => {

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
    data: contributions,
    error
  } = await supabase
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


  if (error) {
    throw error;
  }


  const contributionRows =
    contributions || [];


  const memberIds = [
    ...new Set(
      contributionRows
        .map(row => row.member_id)
        .filter(Boolean)
    )
  ];


  let memberNames = {};


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


  rows.innerHTML =
    contributionRows.map(contribution => `

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
            contribution.reference ?? "—"
          )}
        </td>

      </tr>

    `).join("");

}


form.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    errorBox.hidden = true;

    saveButton.disabled = true;
    saveButton.textContent =
      "Saving...";


    try {

      const groupId =
        await getCurrentGroupId();


      const memberId =
        memberSelect.value;

      const amount =
        Number(
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
        throw new Error(
          "Please select a member."
        );
      }


      if (!amount || amount <= 0) {
        throw new Error(
          "Enter a valid contribution amount."
        );
      }


      if (!date) {
        throw new Error(
          "Please select the contribution date."
        );
      }


      if (!type) {
        throw new Error(
          "Please select the contribution type."
        );
      }


      if (!method) {
        throw new Error(
          "Please select the payment method."
        );
      }


      const {
        error
      } = await supabase
        .from("contributions")
        .insert({

          group_id: groupId,

          member_id: memberId,

          amount: amount,

          contribution_date: date,

          contribution_type: type,

          payment_method: method,

          reference:
            reference || null

        });


      if (error) {
        throw error;
      }


      form.reset();


      /*
       * Set today's date again
       */
      document.querySelector("#date").value =
        new Date().toISOString().split("T")[0];


      await loadContributions();


    } catch (error) {

      showError(error);

    } finally {

      saveButton.disabled = false;

      saveButton.textContent =
        "Save Contribution";

    }

  }
);


document
  .querySelector("#logout")
  .addEventListener(
    "click",
    async () => {

      await supabase.auth.signOut();

      window.location.href =
        "./login.html";

    }
  );


/*
 * Initial page load
 */

try {

  document.querySelector("#date").value =
    new Date().toISOString().split("T")[0];

  await loadMembers();

  await loadContributions();

} catch (error) {

  showError(error);

}

</script>

</body>
</html>

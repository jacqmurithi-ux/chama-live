<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >

  <title>Group Management — CHAMA LIVE</title>

  <link
    rel="stylesheet"
    href="css/app.css"
  >
</head>

<body>

<header class="topbar">

  <div class="brand">
    CHAMA <span>LIVE</span>
  </div>

  <button
    class="btn btn-secondary"
    id="logout"
  >
    Sign out
  </button>

</header>


<div class="layout">

  <aside class="sidebar">

    <nav class="nav">

      <a href="dashboard.html">
        Dashboard
      </a>

      <a href="members.html">
        Members
      </a>

      <a href="contributions.html">
        Contributions
      </a>

      <a href="expenses.html">
        Expenses
      </a>

      <a href="meetings.html">
        Meetings
      </a>

      <a href="reports.html">
        Reports
      </a>

      <a
        class="active"
        href="group-management.html"
      >
        Group Management
      </a>

    </nav>

  </aside>


  <main class="main">

    <div class="page-head">

      <div>

        <h1>
          Group Management
        </h1>

        <p class="muted">
          Current group profile.
        </p>

      </div>

    </div>


    <section class="card">

      <p>
        Group:
        <strong id="name">
          Loading…
        </strong>
      </p>

      <p>
        Opening balance:
        <strong id="opening">
          —
        </strong>
      </p>

      <p>
        Monthly contribution:
        <strong id="monthly">
          —
        </strong>
      </p>

    </section>


    <div
      class="error"
      data-error
      hidden
    ></div>

  </main>

</div>


<script type="module">

  import { boot } from "./js/layout.js";

  import { supabase } from "./js/supabase.js";

  import {
    getCurrentGroupId,
    money,
    setText,
    showError
  } from "./js/app.js";


  /*
   * Start authentication and layout
   */
  await boot();


  /*
   * Load the current group
   */
  async function loadGroup() {

    try {

      const groupId =
        await getCurrentGroupId();


      if (!groupId) {

        throw new Error(
          "No group is linked to this account."
        );

      }


      const {
        data,
        error
      } = await supabase
        .from("groups")
        .select(
          "name, opening_balance, monthly_contribution"
        )
        .eq("id", groupId)
        .single();


      if (error) {
        throw error;
      }


      if (!data) {

        throw new Error(
          "Group information could not be found."
        );

      }


      setText(
        "#name",
        data.name ?? "—"
      );


      setText(
        "#opening",
        money(
          Number(
            data.opening_balance || 0
          )
        )
      );


      setText(
        "#monthly",
        money(
          Number(
            data.monthly_contribution || 0
          )
        )
      );

    }

    catch (error) {

      console.error(
        "CHAMA LIVE group management error:",
        error
      );

      showError(error);

    }

  }


  loadGroup();

</script>

</body>
</html>

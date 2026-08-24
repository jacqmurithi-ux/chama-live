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

      <a href="dashboard.html">Dashboard</a>

      <a href="members.html">Members</a>

      <a
        class="active"
        href="contributions.html"
      >
        Contributions
      </a>

      <a href="expenses.html">Expenses</a>

      <a href="meetings.html">Meetings</a>

      <a href="reports.html">Reports</a>

      <a href="group-management.html">
        Group Management
      </a>

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

            <select
              id="member"
              required
            >

              <option value="">
                Loading members...
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
              placeholder="500"
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

            <select
              id="type"
              required
            >

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

            <select
              id="method"
              required
            >

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
            id="save"
            type="submit"
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


    <!-- CONTRIBUTION LIST -->

    <section class="card">

      <h2>Contribution Ledger</h2>

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

  import { boot }
    from "./js/layout.js";

  await boot();

  import "./js/contributions.js";

</script>


</body>
</html>

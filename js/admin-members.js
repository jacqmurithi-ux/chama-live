import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";

const $ = (id) =>
document.getElementById(id);

let currentMember = null;
let members = [];

/* =====================================================
INIT
===================================================== */

async function init() {

try {

```
currentMember =
  await getMyMember();

if (!currentMember) {

  throw new Error(
    "Unable to identify your member account."
  );

}


/*
 * This is only a UI check.
 * The Edge Function must perform the
 * real authorization check.
 */

const allowedRoles = [
  "admin",
  "chairperson"
];

if (
  !allowedRoles.includes(
    String(currentMember.role || "").toLowerCase()
  )
) {

  throw new Error(
    "Only an administrator or chairperson can manage login access."
  );

}


const refreshButton =
  $("refreshMembers");

if (refreshButton) {

  refreshButton.addEventListener(
    "click",
    loadMembers
  );

}


await loadMembers();
```

} catch (error) {

```
showError(error);
```

}

}

/* =====================================================
LOAD MEMBERS
===================================================== */

async function loadMembers() {

clearError();

setStatus(
"Loading members..."
);

try {

```
const { data, error } =
  await supabase

    .from("members")

    .select(`
      id,
      group_id,
      member_number,
      membership_number,
      name,
      phone,
      email,
      role,
      status,
      onboarding_status,
      invited_at,
      activated_at,
      auth_user_id,
      created_at
    `)

    .eq(
      "group_id",
      currentMember.group_id
    )

    .order(
      "name",
      {
        ascending: true
      }
    );


if (error) {

  throw error;

}


members =
  data || [];


renderMembers();


setStatus(
  `${members.length} member${members.length === 1 ? "" : "s"} loaded • ${new Date().toLocaleString("en-KE")}`
);
```

} catch (error) {

```
showError(error);
```

}

}

/* =====================================================
RENDER
===================================================== */

function renderMembers() {

const tbody =
$("memberRows");

if (!tbody) {

```
return;
```

}

if (!members.length) {

```
tbody.innerHTML = `

  <tr>

    <td
      colspan="7"
      class="empty-state"
    >

      No members have been added
      to this group yet.

    </td>

  </tr>

`;

return;
```

}

tbody.innerHTML =
members.map(
member =>
renderMemberRow(member)
).join("");

document
.querySelectorAll("[data-invite-member]")
.forEach(button => {

```
  button.addEventListener(
    "click",
    () => {

      const memberId =
        button.dataset.inviteMember;

      inviteMember(
        memberId
      );

    }
  );

});
```

}

/* =====================================================
MEMBER ROW
===================================================== */

function renderMemberRow(member) {

const onboarding =
String(
member.onboarding_status ||
"pending"
).toLowerCase();

const hasAuth =
Boolean(
member.auth_user_id
);

let loginStatus =
"PENDING";

let statusClass =
"status-pending";

if (
onboarding === "active" ||
member.activated_at ||
hasAuth
) {

```
loginStatus =
  "ACTIVE";

statusClass =
  "status-active";
```

} else if (
onboarding === "invited"
) {

```
loginStatus =
  "INVITED";

statusClass =
  "status-invited";
```

} else if (
onboarding === "disabled"
) {

```
loginStatus =
  "DISABLED";

statusClass =
  "status-disabled";
```

}

const email =
member.email ||
"No email";

const memberNumber =
member.member_number ||
member.membership_number ||
"—";

let action = "";

if (
loginStatus === "ACTIVE"
) {

```
action = `

  <span class="muted">
    Login active
  </span>

`;
```

} else if (
loginStatus === "INVITED"
) {

```
action = `

  <button
    type="button"
    class="btn btn-secondary"
    data-invite-member="${escapeHtml(member.id)}"
  >
    Resend Invite
  </button>

`;
```

} else {

```
action = `

  <button
    type="button"
    class="btn btn-primary"
    data-invite-member="${escapeHtml(member.id)}"
  >
    Send Login Invite
  </button>

`;
```

}

return `

```
<tr>

  <td>

    <strong>
      ${escapeHtml(member.name)}
    </strong>

  </td>


  <td>

    ${escapeHtml(memberNumber)}

  </td>


  <td>

    ${escapeHtml(
      member.phone || "—"
    )}

  </td>


  <td>

    ${escapeHtml(email)}

  </td>


  <td>

    <span class="role-badge">

      ${escapeHtml(
        member.role || "member"
      )}

    </span>

  </td>


  <td>

    <span
      class="status-badge ${statusClass}"
    >

      ${loginStatus}

    </span>

  </td>


  <td>

    ${action}

  </td>

</tr>
```

`;

}

/* =====================================================
INVITE MEMBER
===================================================== */

async function inviteMember(
memberId
) {

const member =
members.find(
item =>
item.id === memberId
);

if (!member) {

```
alert(
  "Member could not be found."
);

return;
```

}

if (!member.email) {

```
alert(
  `No email address is recorded for ${member.name}. Add the member's email address first.`
);

return;
```

}

const confirmed =
window.confirm(
`Send a CHAMA LIVE login invitation to ${member.name} at ${member.email}?`
);

if (!confirmed) {

```
return;
```

}

setStatus(
`Sending login invitation to ${member.name}...`
);

disableInviteButtons(
true
);

try {

```
/*
 * supabase.functions.invoke()
 * automatically sends the authenticated
 * user's session credentials.
 */

const {
  data,
  error
} = await supabase.functions.invoke(
  "invite-member",
  {
    body: {
      member_id: member.id
    }
  }
);


if (error) {

  let message =
    error.message ||
    "Unable to send invitation.";

  /*
   * FunctionsHttpError can expose the
   * server's JSON error response.
   */

  try {

    if (
      error.context &&
      typeof error.context.json === "function"
    ) {

      const details =
        await error.context.json();

      if (
        details?.error
      ) {

        message =
          details.error;

      }

    }

  } catch (_) {

    // Keep original error.

  }


  throw new Error(
    message
  );

}


if (
  data?.error
) {

  throw new Error(
    data.error
  );

}


alert(
  `Login invitation sent to ${member.email}.`
);


await loadMembers();
```

} catch (error) {

```
console.error(
  "Invite member error:",
  error
);


showError(
  error
);
```

} finally {

```
disableInviteButtons(
  false
);
```

}

}

/* =====================================================
DISABLE BUTTONS
===================================================== */

function disableInviteButtons(
disabled
) {

document
.querySelectorAll(
"[data-invite-member]"
)
.forEach(
button => {

```
    button.disabled =
      disabled;

  }
);
```

}

/* =====================================================
STATUS
===================================================== */

function setStatus(
message
) {

const element =
$("status");

if (element) {

```
element.textContent =
  message;
```

}

}

/* =====================================================
ERROR
===================================================== */

function clearError() {

const element =
$("error");

if (!element) {

```
return;
```

}

element.hidden =
true;

element.textContent =
"";

}

function showError(
error
) {

console.error(
error
);

const message =
error?.message ||
"Unable to load members.";

const element =
$("error");

if (element) {

```
element.hidden =
  false;

element.textContent =
  message;
```

}

setStatus(
"Unable to complete the request."
);

}

/* =====================================================
ESCAPE HTML
===================================================== */

function escapeHtml(
value
) {

return String(
value ?? ""
)

```
.replaceAll(
  "&",
  "&amp;"
)

.replaceAll(
  "<",
  "&lt;"
)

.replaceAll(
  ">",
  "&gt;"
)

.replaceAll(
  '"',
  "&quot;"
)

.replaceAll(
  "'",
  "&#039;"
);
```

}

/* =====================================================
START
===================================================== */

init();

import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";

const $ = (id) =>
document.getElementById(id);

let currentMember = null;
let groupId = null;
let members = [];
let editingId = null;
let inviteMember = null;

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


groupId =
  currentMember.group_id;


setupEvents();

configurePermissions();

setToday();

await loadMembers();
```

} catch (error) {

```
showError(error);
```

}

}

/* =====================================================
EVENTS
===================================================== */

function setupEvents() {

$("addMemberBtn")
?.addEventListener(
"click",
openAddForm
);

$("cancelMember")
?.addEventListener(
"click",
closeForm
);

$("memberForm")
?.addEventListener(
"submit",
saveMember
);

$("searchMembers")
?.addEventListener(
"input",
renderMembers
);

$("generateInvite")
?.addEventListener(
"click",
generateInvite
);

$("logout")
?.addEventListener(
"click",
async () => {

```
    await supabase.auth.signOut();

    window.location.href =
      "login.html";

  }
);
```

}

/* =====================================================
PERMISSIONS
===================================================== */

function configurePermissions() {

const role =
String(
currentMember.role || ""
).toLowerCase();

const canManage =
role === "admin" ||
role === "chairperson";

$("addMemberBtn").hidden =
!canManage;

if (!canManage) {

```
$("memberFormCard").hidden =
  true;
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

const {
data,
error
} = await supabase

```
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
  join_date,
  status,
  onboarding_status,
  invited_at,
  activated_at,
  auth_user_id
`)

.eq(
  "group_id",
  groupId
)

.order(
  "name",
  {
    ascending: true
  }
);
```

if (error) {

```
throw error;
```

}

members =
data || [];

renderSummary();

renderMembers();

setStatus(
`Members loaded • ${new Date().toLocaleString("en-KE")}`
);

}

/* =====================================================
SUMMARY
===================================================== */

function renderSummary() {

const total =
members.length;

const active =
members.filter(
member =>
member.status ===
"active"
).length;

const pending =
members.filter(
member =>
!member.auth_user_id ||
member.onboarding_status ===
"pending"
).length;

$("totalMembers").textContent =
total;

$("activeMembers").textContent =
active;

$("pendingMembers").textContent =
pending;

}

/* =====================================================
RENDER MEMBERS
===================================================== */

function renderMembers() {

const tbody =
$("memberRows");

const search =
String(
$("searchMembers")?.value || ""
)
.trim()
.toLowerCase();

const filtered =
members.filter(
member => {

```
    if (!search) {

      return true;

    }


    return [

      member.name,

      member.member_number,

      member.membership_number,

      member.phone,

      member.email,

      member.role

    ]

      .filter(Boolean)

      .some(
        value =>
          String(value)
            .toLowerCase()
            .includes(search)
      );

  }
);
```

if (!filtered.length) {

```
tbody.innerHTML = `

  <tr>

    <td colspan="7">

      No members found.

    </td>

  </tr>

`;

return;
```

}

const canManage =
isManager();

tbody.innerHTML =
filtered.map(
member => `

```
    <tr>

      <td>

        <strong>
          ${escapeHtml(member.name)}
        </strong>

        ${
          member.email
            ? `
              <div class="muted">
                ${escapeHtml(member.email)}
              </div>
            `
            : ""
        }

      </td>


      <td>

        ${escapeHtml(
          member.member_number ||
          member.membership_number ||
          "—"
        )}

      </td>


      <td>

        ${escapeHtml(
          member.phone || "—"
        )}

      </td>


      <td>

        <strong>

          ${escapeHtml(
            roleLabel(member.role)
          )}

        </strong>

      </td>


      <td>

        ${accountStatus(member)}

      </td>


      <td>

        ${statusLabel(
          member.status,
          member.onboarding_status
        )}

      </td>


      <td>

        ${
          canManage
            ? actionButtons(member)
            : "—"
        }

      </td>

    </tr>

  `
).join("");
```

}

/* =====================================================
ACTION BUTTONS
===================================================== */

function actionButtons(member) {

const isSelf =
member.auth_user_id &&
currentMember.auth_user_id ===
member.auth_user_id;

let buttons = `

```
<button
  class="btn btn-secondary"
  type="button"
  data-action="edit"
  data-id="${member.id}"
>
  Edit
</button>
```

`;

if (
member.email &&
!member.auth_user_id
) {

```
buttons += `

  <button
    class="btn btn-primary"
    type="button"
    data-action="invite"
    data-id="${member.id}"
  >
    Activate Login
  </button>

`;
```

}

if (
member.status === "active" &&
!isSelf
) {

```
buttons += `

  <button
    class="btn btn-secondary"
    type="button"
    data-action="toggle"
    data-id="${member.id}"
  >
    Deactivate
  </button>

`;
```

} else if (
member.status === "inactive"
) {

```
buttons += `

  <button
    class="btn btn-secondary"
    type="button"
    data-action="toggle"
    data-id="${member.id}"
  >
    Activate
  </button>

`;
```

}

return `

```
<div
  style="
    display:flex;
    gap:6px;
    flex-wrap:wrap;
  "
>

  ${buttons}

</div>
```

`;

}

/* =====================================================
ACCOUNT STATUS
===================================================== */

function accountStatus(member) {

if (
member.auth_user_id &&
member.onboarding_status ===
"active"
) {

```
return `

  <strong>
    ACTIVE LOGIN
  </strong>

`;
```

}

if (
member.onboarding_status ===
"suspended"
) {

```
return `
  <strong>
    SUSPENDED
  </strong>
`;
```

}

return `

```
<span class="muted">
  PENDING ACTIVATION
</span>
```

`;

}

/* =====================================================
STATUS
===================================================== */

function statusLabel(
status,
onboardingStatus
) {

if (
onboardingStatus ===
"suspended"
) {

```
return "SUSPENDED";
```

}

return String(
status || "active"
).toUpperCase();

}

/* =====================================================
ROLE LABEL
===================================================== */

function roleLabel(role) {

const labels = {

```
admin:
  "Admin",

chairperson:
  "Chairperson",

treasurer:
  "Treasurer",

secretary:
  "Secretary",

member:
  "Member"
```

};

return labels[
String(role || "")
.toLowerCase()
] ||
"Member";

}

/* =====================================================
ADD FORM
===================================================== */

function openAddForm() {

if (!isManager()) {

```
return;
```

}

editingId =
null;

$("formTitle").textContent =
"Add Member";

$("memberForm").reset();

$("memberId").value =
"";

setToday();

$("memberFormCard").hidden =
false;

$("inviteCard").hidden =
true;

window.scrollTo({
top:
$("memberFormCard")
.offsetTop -
20,

```
behavior:
  "smooth"
```

});

}

/* =====================================================
EDIT FORM
===================================================== */

function editMember(member) {

if (!isManager()) {

```
return;
```

}

editingId =
member.id;

$("formTitle").textContent =
"Edit Member";

$("memberId").value =
member.id;

$("name").value =
member.name || "";

$("memberNumber").value =
member.member_number || "";

$("membershipNumber").value =
member.membership_number || "";

$("phone").value =
member.phone || "";

$("email").value =
member.email || "";

$("role").value =
member.role || "member";

$("joinDate").value =
member.join_date ||
"";

$("memberFormCard").hidden =
false;

$("inviteCard").hidden =
true;

window.scrollTo({
top:
$("memberFormCard")
.offsetTop -
20,

```
behavior:
  "smooth"
```

});

}

/* =====================================================
SAVE MEMBER
===================================================== */

async function saveMember(
event
) {

event.preventDefault();

if (!isManager()) {

```
showError(
  "Only an admin or chairperson can manage members."
);

return;
```

}

const payload = {

```
p_group_id:
  groupId,

p_name:
  $("name").value.trim(),

p_member_number:
  $("memberNumber").value.trim(),

p_membership_number:
  $("membershipNumber").value.trim(),

p_phone:
  $("phone").value.trim(),

p_email:
  $("email").value.trim() ||
  null,

p_role:
  $("role").value,

p_join_date:
  $("joinDate").value ||
  new Date()
    .toISOString()
    .slice(0, 10)
```

};

try {

```
clearError();

setStatus(
  editingId
    ? "Updating member..."
    : "Creating member..."
);


if (!editingId) {

  const {
    data,
    error
  } = await supabase.rpc(
    "add_group_member",
    payload
  );


  if (error) {

    throw error;

  }


  if (!data) {

    throw new Error(
      "Member was not created."
    );

  }


  showSuccess(
    "Member added successfully. You can now activate their login."
  );

} else {

  const {
    error
  } = await supabase

    .from("members")

    .update({

      name:
        payload.p_name,

      member_number:
        payload.p_member_number,

      membership_number:
        payload.p_membership_number,

      phone:
        payload.p_phone,

      email:
        payload.p_email,

      role:
        payload.p_role,

      join_date:
        payload.p_join_date

    })

    .eq(
      "id",
      editingId
    )

    .eq(
      "group_id",
      groupId
    );


  if (error) {

    throw error;

  }


  showSuccess(
    "Member updated successfully."
  );

}


closeForm();

await loadMembers();
```

} catch (error) {

```
showError(error);
```

}

}

/* =====================================================
TOGGLE STATUS
===================================================== */

async function toggleMember(
member
) {

if (!isManager()) {

```
return;
```

}

const newStatus =
member.status ===
"active"
? "inactive"
: "active";

const message =
newStatus ===
"inactive"

```
  ? `Deactivate ${member.name}?`

  : `Activate ${member.name}?`;
```

if (!confirm(message)) {

```
return;
```

}

try {

```
const {
  error
} = await supabase

  .from("members")

  .update({

    status:
      newStatus

  })

  .eq(
    "id",
    member.id
  )

  .eq(
    "group_id",
    groupId
  );


if (error) {

  throw error;

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
INVITE
===================================================== */

function openInvite(
member
) {

if (!isManager()) {

```
return;
```

}

if (!member.email) {

```
showError(
  "Add the member's email address before activating login."
);

return;
```

}

inviteMember =
member;

$("inviteMemberName")
.textContent =
member.name;

$("inviteMemberEmail")
.textContent =
member.email;

$("inviteResult").hidden =
true;

$("inviteCard").hidden =
false;

window.scrollTo({
top:
$("inviteCard")
.offsetTop -
20,

```
behavior:
  "smooth"
```

});

}

/* =====================================================
GENERATE INVITE
===================================================== */

async function generateInvite() {

if (
!inviteMember ||
!isManager()
) {

```
return;
```

}

try {

```
clearError();


$("generateInvite").disabled =
  true;


$("generateInvite").textContent =
  "Generating...";


const {
  data,
  error
} = await supabase.rpc(
  "create_group_invite",
  {
    p_group_id:
      groupId,

    p_email:
      inviteMember.email,

    p_role:
      inviteMember.role
  }
);


if (error) {

  throw error;

}


const invite =
  Array.isArray(data)
    ? data[0]
    : data;


if (
  !invite ||
  !invite.code
) {

  throw new Error(
    "The access code was not generated."
  );

}


$("inviteCode")
  .textContent =
  invite.code;


$("inviteResult").hidden =
  false;


showSuccess(
  `Access code generated for ${inviteMember.name}.`
);
```

} catch (error) {

```
showError(error);
```

} finally {

```
$("generateInvite").disabled =
  false;


$("generateInvite").textContent =
  "Generate Access Code";
```

}

}

/* =====================================================
FORM CLOSE
===================================================== */

function closeForm() {

editingId =
null;

$("memberFormCard").hidden =
true;

$("memberForm").reset();

}

/* =====================================================
HELPERS
===================================================== */

function isManager() {

const role =
String(
currentMember?.role ||
""
).toLowerCase();

return (
role === "admin" ||
role === "chairperson"
);

}

function setToday() {

const input =
$("joinDate");

if (
input &&
!input.value
) {

```
input.value =
  new Date()
    .toISOString()
    .slice(0, 10);
```

}

}

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

console.error(error);

const message =
error?.message ||
"Unable to complete the operation.";

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
"Operation failed."
);

}

function showSuccess(
message
) {

clearError();

setStatus(
message
);

}

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
TABLE ACTION DELEGATION
===================================================== */

$("memberRows")
?.addEventListener(
"click",
event => {

```
  const button =
    event.target.closest(
      "button[data-action]"
    );


  if (!button) {

    return;

  }


  const id =
    button.dataset.id;


  const member =
    members.find(
      item =>
        item.id === id
    );


  if (!member) {

    return;

  }


  const action =
    button.dataset.action;


  if (
    action ===
    "edit"
  ) {

    editMember(member);

  }


  if (
    action ===
    "toggle"
  ) {

    toggleMember(member);

  }


  if (
    action ===
    "invite"
  ) {

    openInvite(member);

  }

}
```

);

/* =====================================================
START
===================================================== */

init();

const SUPABASE_URL =
"https://ptktftwyltxmtcodyzoa.supabase.co";

const CREATE_GROUP_URL =
`${SUPABASE_URL}/functions/v1/create-group`;

const $ = (id) =>
document.getElementById(id);

const form =
$("createGroupForm");

const button =
$("createButton");

const status =
$("status");

const errorBox =
$("error");

const successBox =
$("success");

const accessCode =
$("accessCode");

const successGroup =
$("successGroup");

const activateLink =
$("activateLink");

const copyCode =
$("copyCode");

let createdCode = "";

/* =====================================================
HELPERS
===================================================== */

function showError(message) {

errorBox.textContent =
message;

errorBox.classList.remove(
"hidden"
);

window.scrollTo({
top: 0,
behavior: "smooth"
});

}

function clearError() {

errorBox.textContent =
"";

errorBox.classList.add(
"hidden"
);

}

function setStatus(message) {

if (status) {

```
status.textContent =
  message;
```

}

}

function setLoading(isLoading) {

if (!button) {
return;
}

button.disabled =
isLoading;

button.textContent =
isLoading
? "Creating Group..."
: "Create Group Account";

}

function clean(value) {

return String(
value ?? ""
).trim();

}

function numberValue(id) {

const value =
Number(
$(id)?.value || 0
);

return Number.isFinite(value)
? value
: 0;

}

/* =====================================================
VALIDATION
===================================================== */

function validateForm() {

const groupName =
clean(
$("group_name").value
);

const name =
clean(
$("name").value
);

const phone =
clean(
$("phone").value
);

const email =
clean(
$("email").value
).toLowerCase();

const groupEmail =
clean(
$("group_email").value
).toLowerCase();

const monthlyContribution =
numberValue(
"monthly_contribution"
);

const openingBalance =
numberValue(
"opening_balance"
);

if (!groupName) {

```
throw new Error(
  "Enter the group name."
);
```

}

if (!name) {

```
throw new Error(
  "Enter the administrator's full name."
);
```

}

if (!phone) {

```
throw new Error(
  "Enter the administrator's phone number."
);
```

}

if (!email) {

```
throw new Error(
  "Enter the administrator's email address."
);
```

}

if (
!email.includes("@") ||
!email.includes(".")
) {

```
throw new Error(
  "Enter a valid administrator email address."
);
```

}

if (
groupEmail &&
(
!groupEmail.includes("@") ||
!groupEmail.includes(".")
)
) {

```
throw new Error(
  "Enter a valid group email address."
);
```

}

if (
monthlyContribution < 0
) {

```
throw new Error(
  "Monthly contribution cannot be negative."
);
```

}

if (
openingBalance < 0
) {

```
throw new Error(
  "Opening balance cannot be negative."
);
```

}

return {
groupName,
name,
phone,
email,
groupEmail,
monthlyContribution,
openingBalance
};

}

/* =====================================================
CREATE GROUP
===================================================== */

async function createGroup() {

clearError();

setStatus(
"Creating your group account..."
);

setLoading(true);

try {

```
const values =
  validateForm();


const payload = {

  group_name:
    values.groupName,

  registration_number:
    clean(
      $("registration_number").value
    ),

  group_phone:
    clean(
      $("group_phone").value
    ),

  group_email:
    values.groupEmail,

  category:
    clean(
      $("category").value
    ) || "other",

  description:
    clean(
      $("description").value
    ),

  country:
    clean(
      $("country").value
    ) || "Kenya",

  monthly_contribution:
    values.monthlyContribution,

  opening_balance:
    values.openingBalance,

  name:
    values.name,

  phone:
    values.phone,

  email:
    values.email

};


const response =
  await fetch(
    CREATE_GROUP_URL,
    {

      method:
        "POST",

      headers: {

        "Content-Type":
          "application/json"

      },

      body:
        JSON.stringify(
          payload
        )

    }
  );


let result;

try {

  result =
    await response.json();

} catch {

  throw new Error(
    "The server returned an invalid response."
  );

}


if (
  !response.ok ||
  !result.success
) {

  throw new Error(
    result.message ||
    "Unable to create the group."
  );

}


createdCode =
  result.access_code ||
  "";


/* =================================================
   DISPLAY SUCCESS
================================================= */

successGroup.textContent =
  result.group?.name
    ? `Group: ${result.group.name}`
    : "";


accessCode.textContent =
  createdCode;


if (
  result.activation_url
) {

  activateLink.href =
    result.activation_url;

}


form.classList.add(
  "hidden"
);

successBox.classList.remove(
  "hidden"
);


setStatus(
  "Group created successfully."
);


window.scrollTo({
  top: 0,
  behavior: "smooth"
});
```

} catch (error) {

```
console.error(
  "Create group error:",
  error
);


showError(
  error?.message ||
  "Unable to create group."
);


setStatus(
  "Group creation failed."
);
```

} finally {

```
setLoading(false);
```

}

}

/* =====================================================
COPY ACCESS CODE
===================================================== */

async function copyAccessCode() {

if (!createdCode) {

```
return;
```

}

try {

```
await navigator.clipboard.writeText(
  createdCode
);


copyCode.textContent =
  "Copied!";


setTimeout(
  () => {

    copyCode.textContent =
      "Copy Access Code";

  },
  1800
);
```

} catch {

```
alert(
  `Access code: ${createdCode}`
);
```

}

}

/* =====================================================
SUBMIT
===================================================== */

form.addEventListener(
"submit",
async event => {

```
event.preventDefault();

await createGroup();
```

}
);

/* =====================================================
COPY
===================================================== */

copyCode?.addEventListener(
"click",
copyAccessCode
);

/* =====================================================
START
===================================================== */

setStatus(
"Ready to create your group account."
);

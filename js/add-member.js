import { supabase } from "./supabase.js";
import { getMyMember } from "./auth.js";
const $ = id => document.getElementById(id);
let groupId = null;
async function init() {
  try {
    setStatus("Checking your permissions...");
    const member = await getMyMember();
    if (!member) throw new Error("You must be logged in.");
    groupId = member.group_id;
    if (!groupId) throw new Error("Your account is not linked to a group.");
    const role = String(member.role || member.security_role || "").trim().toLowerCase();
    if (!["admin","chairperson"].includes(role)) { showError("Access denied. Only a group admin or chairperson can add members."); setStatus("You do not have permission to add members."); return; }
    if ($("joinDate")) $("joinDate").value = new Date().toISOString().slice(0,10);
    if ($("addMemberPanel")) $("addMemberPanel").hidden = false;
    setStatus("You can add members to this group.");
  } catch (e) { showError(e); setStatus("Unable to load member onboarding."); }
}
async function submitMember(event) {
  event.preventDefault(); clearError();
  if (!groupId) return showError("Your group could not be identified.");
  const button = $("saveMemberButton");
  const name = $("memberName")?.value.trim();
  const memberNumber = $("memberNumber")?.value.trim();
  const membershipNumber = $("membershipNumber")?.value.trim() || memberNumber;
  const phone = $("memberPhone")?.value.trim();
  const email = $("memberEmail")?.value.trim() || null;
  const joinDate = $("joinDate")?.value;
  const role = $("memberRole")?.value || "member";
  if (!name) return showError("Please enter the full name.");
  if (!memberNumber) return showError("Please enter the member number.");
  if (!phone) return showError("Please enter the phone number.");
  if (!joinDate) return showError("Please select the join date.");
  button.disabled = true; button.textContent = "Adding Member...";
  try {
    const { data, error } = await supabase.rpc("add_group_member", { p_group_id: groupId, p_name: name, p_member_number: memberNumber, p_membership_number: membershipNumber, p_phone: phone, p_email: email, p_role: role, p_join_date: joinDate });
    if (error) throw error;
    if (!data) throw new Error("Member was not created.");
    const msg = $("formMessage");
    if (msg) { msg.hidden = false; msg.textContent = name + " was added successfully."; msg.style.background = "#ecfdf5"; msg.style.color = "#166534"; }
    $("addMemberForm")?.reset();
    if ($("joinDate")) $("joinDate").value = new Date().toISOString().slice(0,10);
    setStatus(name + " was added successfully.");
  } catch (e) { console.error("Add member error:", e); showError(e); }
  finally { button.disabled = false; button.textContent = "Save Member"; }
}
function clearError() { const e=$("error"); if(e){e.hidden=true;e.textContent="";} }
function showError(error) { const message=typeof error==="string"?error:error?.message||"Something went wrong."; const e=$("error"); if(e){e.hidden=false;e.textContent=message;} const m=$("formMessage"); if(m){m.hidden=false;m.textContent=message;m.style.background="#fef2f2";m.style.color="#991b1b";} }
function setStatus(message) { const e=$("status"); if(e)e.textContent=message; }
$("addMemberForm")?.addEventListener("submit", submitMember);
$("cancelAddMember")?.addEventListener("click", () => { if($("addMemberPanel")) $("addMemberPanel").hidden=true; });
init();
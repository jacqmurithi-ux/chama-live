import { supabase } from "./supabase.js";
import { getMyApplicationContext } from "./auth.js";
import { canWrite, applyRolePermissions } from "./role-permissions.js?v=loan-three-office-approval-20261013";

const $ = id => document.getElementById(id);
const money = value => Number(value || 0).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let ctx, settings, loans=[], members=[], loanApprovals=[], selectedLoan=null, official=false, isAdmin=false, officeSlot=null, memberOnly=false, groupLoansEnabled=false;
// Portal mode is an explicit UI boundary: an Admin visiting the Member Portal sees their own loan account only.
const memberPortal = new URLSearchParams(window.location.search).get("portal") === "member";

function loanApprovalSlot(member = {}) {
 const clean = value => String(value ?? "").trim().toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ");
 const declared = [member.actual_position,member.actual_position_name].map(clean);
 if(declared.some(v=>["chairperson","vice chairperson","chair","vice chair"].includes(v)))return "chairperson";
 if(declared.some(v=>v==="treasurer"))return "treasurer";
 if(declared.some(v=>["secretary","vice secretary"].includes(v)))return "secretary";
 // Match expense approvals: actual_position or actual_position_name must declare the office.
 return null;
}
const APPROVAL_OFFICES = [
 ["chairperson","Chairperson"],
 ["treasurer","Treasurer"],
 ["secretary","Secretary"]
];

function status(message,error=false){$("loanStatus").textContent=message;$("loanStatus").classList.toggle("error",error);}
function errorText(error){return [error?.message,error?.details,error?.hint,error?.code?("Code: "+error.code):null].filter(Boolean).join(" — ")||"Request failed.";}
function allowed(action,loan=null){
 if(action==="apply") return true;
 if(action==="settings") return isAdmin&&!memberPortal;
 if(action==="review") return Boolean(officeSlot)&&(!loan||loan.member_id!==ctx.member.id);
 if(action==="disburse") return officeSlot==="treasurer";
 if(action==="repayment") return Boolean(selectedLoan&&selectedLoan.member_id===ctx.member.id&&["active","overdue"].includes(selectedLoan.status));
 if(action==="confirm") return isAdmin||Boolean(officeSlot);
 if(action==="export") return official;
 return false;
}
function statusLabel(loan){
 const s=loan.status;
 if(s==="submitted") return "Pending";
 if(s==="approved") return "Approved (awaiting disbursement)";
 if(s==="active") return "Active";
 if(s==="overdue") return "Overdue";
 if(s==="cleared") return "Cleared";
 if(s==="cancelled") return "Cancelled";
 if(s==="rejected") return "Rejected";
 return s||"Pending";
}
async function rpc(name,args){const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data;}
function today(){return new Date().toISOString().slice(0,10);}
function applyPermissions(){
  applyRolePermissions({page:"loans",member:ctx.member});
  $("loanSettingsCard").classList.toggle("loan-hidden",memberPortal||!isAdmin);
  $("loanExportCsv").classList.toggle("loan-hidden",!official);
  $("loanReviewCard").classList.toggle("loan-hidden",!officeSlot);
  $("loanPendingRepaymentsCard").classList.toggle("loan-hidden",!official);
  $("loanOverdueCard").classList.toggle("loan-hidden",!official);
  $("loanGroupSummaryCard").classList.toggle("loan-hidden",!official);
  $("loanRepaymentPanel").classList.toggle("loan-hidden",!selectedLoan||selectedLoan.member_id!==ctx.member.id||!["active","overdue"].includes(selectedLoan.status));
  document.querySelectorAll("#loanRows [data-review]").forEach(b=>{const l=loans.find(x=>x.id===b.dataset.id);b.disabled=!allowed("review",l);});
  document.querySelectorAll("#loanReviewRows [data-review]").forEach(b=>{const l=loans.find(x=>x.id===b.dataset.id);b.disabled=!allowed("review",l);});
  document.querySelectorAll("#loanRows [data-disburse]").forEach(b=>{b.disabled=!allowed("disburse");});
  $("loanExportCsv").disabled=!allowed("export");
}
async function loadNotifications(){
 let query=supabase.from("loan_notifications").select("id,event_type,title,message,created_at,read_at").eq("group_id",ctx.group.id).eq("recipient_member_id",ctx.member.id);
 const {data,error}=await query.order("created_at",{ascending:false}).limit(20);
 if(error){if(memberPortal){$("loanNotifications").innerHTML='<p class="loan-muted">Personal loan notifications are not available for this account yet.</p>';console.warn("CHAMA LIVE: Member-scoped loan notifications unavailable.",error);return;}throw error;}
 const rows=data||[];
 $("loanNotificationsCard").querySelector("h2").textContent="My loan notifications";
 $("loanNotifications").innerHTML=rows.map(n=>'<article class="loan-notification '+(n.read_at?'':'unread')+'"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap"><strong>'+esc(n.title)+'</strong>'+(n.read_at?'':'<button type="button" class="loan-btn secondary" data-notification-read="'+esc(n.id)+'">Mark read</button>')+'</div><p>'+esc(n.message)+'</p><small class="loan-muted">'+esc(new Date(n.created_at).toLocaleString())+'</small></article>').join("")||'<p class="loan-muted">No loan notifications yet.</p>';
}
$("loanNotifications").addEventListener("click",async e=>{
 const b=e.target.closest("[data-notification-read]");if(!b)return;
 try{
  const {error}=await supabase.from("loan_notifications").update({read_at:new Date().toISOString()}).eq("id",b.dataset.notificationRead).eq("recipient_member_id",ctx.member.id).is("read_at",null);
  if(error)throw error;
  await loadNotifications();
 }catch(err){status(errorText(err),true);}
});
async function loadSettings(){
 const {data,error}=await supabase.from("loan_settings").select("enabled,interest_rate,interest_type,max_loan_amount,max_period_months,late_penalty,updated_by,updated_at").eq("group_id",ctx.group.id).maybeSingle();
 if(error)throw error; settings=data||null;
 if(settings){
  const f=$("loanSettingsForm").elements;
  for(const key of ["interest_rate","interest_type","max_loan_amount","max_period_months","late_penalty"]) f[key].value=settings[key];
  $("loanEnabled").checked=Boolean(settings.enabled);
  const editor=members.find(m=>m.auth_user_id===settings.updated_by||m.user_id===settings.updated_by);
  $("loanSettingsUpdated").textContent="Last updated by "+(editor?.name||"group Admin")+" on "+(settings.updated_at?new Date(settings.updated_at).toLocaleString():"—")+".";
  $("loanLimits").textContent="Annual rate "+settings.interest_rate+"% · "+settings.interest_type.replaceAll("_"," ")+" · Maximum KES "+money(settings.max_loan_amount)+" · Up to "+settings.max_period_months+" months · Late penalty KES "+money(settings.late_penalty)+" per overdue installment.";
 }else {
  $("loanEnabled").checked=false;
  $("loanSettingsUpdated").textContent="Loan settings have not been saved.";
  $("loanLimits").textContent="Loans are not yet available for this group.";
 }
 const enabled=Boolean(settings&&settings.enabled&&groupLoansEnabled);
 $("loanApplyForm").querySelector("button[type=submit]").disabled=!enabled;
 $("loanApplicationGate").textContent=enabled?"":"Loans are not yet available for this group.";
 for(const name of ["amount","period","purpose","guarantor"]) $("loanApplyForm").elements[name].disabled=!enabled;
 renderPreview();
}
async function loadMembers(){
 const {data,error}=await supabase.from("members").select("id,name,member_number,status,onboarding_status").eq("group_id",ctx.group.id).eq("status","active").eq("onboarding_status","active").order("name");
 if(error)throw error;members=data||[];
 $("loanApplyForm").elements.guarantor.innerHTML='<option value="">No guarantor selected</option>'+members.filter(m=>m.id!==ctx.member.id).map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+(m.member_number?' · '+esc(m.member_number):"")+'</option>').join("");
}
function applyLoanFilters(){
 const query=String($("loanSearch")?.value||"").trim().toLowerCase();
 const statusFilter=String($("loanStatusFilter")?.value||"");
 document.querySelectorAll("#loanRows tr[data-member-name]").forEach(row=>{
  const name=row.dataset.memberName||"",status=row.dataset.loanStatus||"";
  row.style.display=(!query||name.includes(query))&&(!statusFilter||status===statusFilter)?"":"none";
 });
}
$("loanSearch").addEventListener("input",applyLoanFilters);
$("loanStatusFilter").addEventListener("change",applyLoanFilters);

async function loadLoans(){
 let query=supabase.from("loan_applications").select("id,group_id,member_id,requested_amount,approved_amount,period_months,purpose,guarantor_member_id,guarantor_status,status,decision_note,interest_rate_snapshot,interest_type_snapshot,penalty_snapshot,approved_by,approved_at,disbursed_at,created_at").eq("group_id",ctx.group.id);
 if(memberOnly) query=query.eq("member_id",ctx.member.id);
 const {data,error}=await query.order("created_at",{ascending:false});
 if(error)throw error;loans=data||[];
 if(loans.length){let aq=supabase.from("loan_approvals").select("loan_id,approval_slot,decision,approver_user_id,note,created_at").eq("group_id",ctx.group.id);if(memberOnly)aq=aq.in("loan_id",loans.map(l=>l.id));const {data:approvalData,error:approvalError}=await aq;if(approvalError)throw approvalError;loanApprovals=approvalData||[];}else loanApprovals=[];
 const memberById=new Map(members.map(m=>[m.id,m]));
 const ownSlot=loanApprovalSlot(ctx.member);
 $("loanRows").innerHTML=loans.map(l=>{
  const m=memberById.get(l.member_id);const name=m?.name||(l.member_id===ctx.member.id?"You":"Member");
  const votes=loanApprovals.filter(a=>a.loan_id===l.id);
  const ownVote=votes.find(a=>a.approval_slot===ownSlot);
  const canDecide=l.status==="submitted"&&allowed("review",l)&&Boolean(ownSlot)&&!ownVote&&l.member_id!==ctx.member.id;
  const approvalSummary=memberOnly ? "" : APPROVAL_OFFICES.map(([slot,label])=>{
   const vote=votes.find(a=>a.approval_slot===slot);
   const text=vote?(vote.decision==="approved"?"Approved":"Rejected"):"Pending";
   return '<span style="display:inline-block;margin:2px 6px 2px 0">'+esc(label)+': '+esc(text)+'</span>';
  }).join("");
  let actions='<button class="loan-btn secondary" data-detail="'+esc(l.id)+'">View</button>';
  if(memberOnly&&l.status==="submitted"&&l.member_id===ctx.member.id)actions+='<button class="loan-btn secondary" data-cancel="'+esc(l.id)+'">Cancel</button>';
  if(canDecide) actions+='<button class="loan-btn" data-review="approved" data-id="'+esc(l.id)+'">Approve</button><button class="loan-btn secondary" data-review="rejected" data-id="'+esc(l.id)+'">Reject</button>';
  if(official&&l.status==="approved"&&allowed("disburse")) actions+='<button class="loan-btn" data-disburse="'+esc(l.id)+'">Disburse</button>';
  const approvalCount=votes.filter(a=>a.decision==="approved").length;
  const shownStatus=l.status==="submitted"&&!memberOnly?"Pending · Approved by "+approvalCount+" of 3":statusLabel(l);
  const memberCell=memberOnly?"":'<td data-label="Member">'+esc(name)+'</td>';
  return '<tr data-member-name="'+esc(name.toLowerCase())+'" data-loan-status="'+esc(l.status)+'">'+memberCell+'<td data-label="Requested">KES '+money(l.requested_amount)+'</td><td data-label="Approved">'+(l.approved_amount==null?"—":"KES "+money(l.approved_amount))+'</td><td data-label="Period">'+l.period_months+' months</td><td data-label="Status"><span class="loan-pill">'+esc(shownStatus)+'</span></td><td data-label="Submitted">'+esc(l.created_at?new Date(l.created_at).toLocaleDateString():"—")+'</td><td data-label="Actions"><div class="loan-muted" aria-label="Required office approvals">'+approvalSummary+'</div><div class="loan-actions">'+actions+'</div></td></tr>';
 }).join("")||'<tr><td colspan="7">No loan applications yet.</td></tr>';
 const overviewLoans=memberPortal?loans.filter(l=>l.member_id===ctx.member.id):loans;
 const outstandingIds=overviewLoans.filter(l=>["active","overdue"].includes(l.status));
 let outstanding=0, overdue=0;
 for(const l of outstandingIds){
  const {data:schedules,error:e}=await supabase.from("loan_repayment_schedule").select("principal_due,interest_due,penalty_due,amount_paid,due_date").eq("loan_id",l.id);
  if(e)throw e;
  for(const s of schedules||[]){outstanding+=Math.max(0,Number(s.principal_due)+Number(s.interest_due)+Number(s.penalty_due)-Number(s.amount_paid));}
  if((schedules||[]).some(s=>s.due_date<today()&&Number(s.amount_paid)<Number(s.principal_due)+Number(s.interest_due)+Number(s.penalty_due)))overdue++;
 }
 $("loanCount").textContent=String(overviewLoans.length);$("loanOutstanding").textContent="KES "+money(outstanding);$("loanOverdue").textContent=String(overdue);
 let nextDue=null;
 for(const l of outstandingIds){const {data:ss,error:se}=await supabase.from("loan_repayment_schedule").select("due_date,principal_due,interest_due,penalty_due,amount_paid").eq("loan_id",l.id).gte("due_date",today()).order("due_date").limit(1);if(!se&&ss?.length&&(!nextDue||ss[0].due_date<nextDue))nextDue=ss[0].due_date;}
 $("loanNextDue").textContent=nextDue||"—";
 const pending=overviewLoans.some(l=>["submitted","approved"].includes(l.status));const hasOverdue=overdue>0||overviewLoans.some(l=>l.status==="overdue");
 const enabled=Boolean(settings&&settings.enabled&&groupLoansEnabled);
 $("loanApplyForm").querySelector("button[type=submit]").disabled=!enabled||pending||hasOverdue;
 $("loanApplicationGate").textContent=!enabled?"Loans are not yet available for this group.":pending?"You already have a pending application. Wait for the decision before applying again.":hasOverdue?"You cannot apply while you have an overdue loan. Clear the overdue balance first.":"";
 $("loanViewMode").textContent=memberOnly?"Member view: only your own applications and repayment details.":isAdmin&&!officeSlot?"Admin-only account: you may manage settings but cannot approve or disburse loans without an explicit office.":official?"Official view: group applications and totals.":"";
 const table=$("loanApplicationsTable");if(table)table.classList.toggle("member-only",memberOnly);
 $("loanTableFilters").classList.toggle("loan-hidden",!official);applyLoanFilters();
 const header=$("loanRows").closest("table").querySelector("thead th:first-child");if(header)header.style.display=memberOnly?"none":"";
 await loadOfficialSections();
 if(selectedLoan){const fresh=loans.find(l=>l.id===selectedLoan.id);selectedLoan=fresh||null;if(selectedLoan)await showDetail(selectedLoan.id);}
 applyPermissions();
}

function renderPreview(){
 const f=$("loanApplyForm").elements;
 const amount=Number(f.amount.value||0), period=Number(f.period.value||0);
 const rate=Number(settings?.interest_rate||0), method=settings?.interest_type||"flat";
 if(!settings||!settings.enabled||!groupLoansEnabled){$("loanPreview").textContent="Loans are not yet available for this group.";return;}
 if(amount<=0||period<1){$("loanPreview").textContent="Enter an amount and period to preview the estimated installment, interest and total repayable.";return;}
 if(amount>Number(settings.max_loan_amount)||period>Number(settings.max_period_months)){
  $("loanPreview").textContent="Requested amount or period exceeds the group maximum. Maximum KES "+money(settings.max_loan_amount)+" for "+settings.max_period_months+" months.";
  $("loanApplyForm").querySelector('button[type="submit"]').disabled=true;return;
 }
 let installment=0,interest=0;
 if(method==="flat"){interest=amount*rate/100*period/12;installment=(amount+interest)/period;}
 else {const monthly=rate/1200;installment=monthly===0?amount/period:amount*monthly/(1-Math.pow(1+monthly,-period));interest=installment*period-amount;}
 $("loanPreview").textContent="Estimated installment: KES "+money(installment)+" · Total interest: KES "+money(interest)+" · Total repayable: KES "+money(amount+interest)+". Estimates only; the approved terms and schedule are confirmed at disbursement.";
 const personalLoans=loans.filter(l=>l.member_id===ctx.member.id);
 const blocked=personalLoans.some(l=>["submitted","approved"].includes(l.status))||personalLoans.some(l=>l.status==="overdue");
 $("loanApplyForm").querySelector('button[type="submit"]').disabled=blocked;
}
for(const field of ["amount","period"]) $("loanApplyForm").elements[field].addEventListener("input",renderPreview);

async function loadGuarantorRequests(){
 const card=$("loanGuarantorCard");
 if(!memberPortal){card.classList.add("loan-hidden");return;}
 card.classList.remove("loan-hidden");
 const {data,error}=await supabase.from("loan_applications")
  .select("id,member_id,requested_amount,period_months,purpose,created_at")
  .eq("group_id",ctx.group.id).eq("guarantor_member_id",ctx.member.id).eq("guarantor_status","pending")
  .order("created_at",{ascending:false});
 if(error){$("loanGuarantorRows").innerHTML='<p class="loan-muted">Guarantor requests are unavailable until member-scoped access is enabled.</p>';return;}
 const byId=new Map(members.map(m=>[m.id,m]));
 $("loanGuarantorRows").innerHTML=(data||[]).map(l=>'<article class="loan-notification"><strong>'+esc(byId.get(l.member_id)?.name||"Group member")+'</strong><p>KES '+money(l.requested_amount)+' · '+l.period_months+' months</p><p>'+esc(l.purpose)+'</p><div class="loan-actions"><button class="loan-btn" data-guarantor-response="true" data-loan-id="'+esc(l.id)+'">Accept</button><button class="loan-btn secondary" data-guarantor-response="false" data-loan-id="'+esc(l.id)+'">Decline</button></div></article>').join("")||'<p class="loan-muted">No guarantor requests.</p>';
}

async function loadOfficialSections(){
 if(!official){applyPermissions();return;}
 const byId=new Map(members.map(m=>[m.id,m]));
 const ownApproval=loanApprovals.find(a=>a.approval_slot===officeSlot);
 const awaiting=officeSlot?loans.filter(l=>l.status==="submitted"&&l.member_id!==ctx.member.id&&!loanApprovals.some(a=>a.loan_id===l.id&&a.approval_slot===officeSlot)): [];
 const reviewRows=await Promise.all(awaiting.map(async l=>{
  const history=loans.filter(x=>x.member_id===l.member_id&&x.id!==l.id);
  let historyBalance=0;for(const past of history.filter(x=>["active","overdue"].includes(x.status))){const {data:ss}=await supabase.from("loan_repayment_schedule").select("principal_due,interest_due,penalty_due,amount_paid").eq("loan_id",past.id);for(const s of ss||[])historyBalance+=Math.max(0,Number(s.principal_due)+Number(s.interest_due)+Number(s.penalty_due)-Number(s.amount_paid));}
  const guarantor=byId.get(l.guarantor_member_id)?.name|| (l.guarantor_member_id?"Guarantor":"None");
  return '<tr><td data-label="Applicant">'+esc(byId.get(l.member_id)?.name||"Member")+'</td><td data-label="Amount">KES '+money(l.requested_amount)+'</td><td data-label="Period">'+l.period_months+' months</td><td data-label="Purpose">'+esc(l.purpose)+'</td><td data-label="Guarantor">'+esc(guarantor)+' ('+esc(l.guarantor_status||"not_required")+')</td><td data-label="History / balance">'+history.length+' previous loan(s); outstanding KES '+money(historyBalance)+'</td><td data-label="Action"><div class="loan-actions"><button class="loan-btn" data-review="approved" data-id="'+esc(l.id)+'">Approve</button><button class="loan-btn secondary" data-review="rejected" data-id="'+esc(l.id)+'">Reject</button><button class="loan-btn secondary" data-detail="'+esc(l.id)+'">View</button></div></td></tr>';
 }));
 $("loanReviewRows").innerHTML=reviewRows.join("")||'<tr><td colspan="7">No loans awaiting your office decision.</td></tr>';

 const {data:pending,error:pendingError}=await supabase.from("loan_repayments")
  .select("id,loan_id,group_id,amount,payment_date,reference,status")
  .eq("group_id",ctx.group.id).eq("status","pending").order("payment_date");
 if(pendingError){$("loanPendingRepaymentRows").innerHTML='<tr><td colspan="5">Pending repayments could not be loaded.</td></tr>';}
 else $("loanPendingRepaymentRows").innerHTML=(pending||[]).map(p=>'<tr><td data-label="Member">'+esc(byId.get(loans.find(l=>l.id===p.loan_id)?.member_id)?.name||"Member")+'</td><td data-label="Amount">KES '+money(p.amount)+'</td><td data-label="Date">'+esc(p.payment_date)+'</td><td data-label="Reference">'+esc(p.reference||"—")+'</td><td data-label="Action"><button class="loan-btn" data-confirm-repayment="'+esc(p.id)+'" '+(allowed("confirm")?"":"disabled")+'>Confirm</button></td></tr>').join("")||'<tr><td colspan="5">No pending repayments.</td></tr>';

 const overdue=loans.filter(l=>l.status==="overdue");
 $("loanOverdueRows").innerHTML=overdue.map(l=>'<article class="loan-notification"><strong>'+esc(byId.get(l.member_id)?.name||"Member")+'</strong><p>KES '+money(l.approved_amount||l.requested_amount)+' · '+l.period_months+' months · '+esc(l.status)+'</p><div class="loan-actions"><button class="loan-btn secondary" data-detail="'+esc(l.id)+'">View schedule</button><button class="loan-btn" data-send-reminder="'+esc(l.id)+'">Send reminder</button></div></article>').join("")||'<p class="loan-muted">No overdue loans.</p>';

 try{
  const summary=await rpc("group_loan_summary",{p_group_id:ctx.group.id});
  const values=[
   ["Disbursed total",summary.totalDisbursed],["Interest gained",summary.interestGained],
   ["Members benefited",summary.membersBenefited],["Outstanding",summary.outstandingAmount],
   ["Active loans",summary.activeLoansCount]
  ];
  $("loanGroupSummary").innerHTML=values.map(([label,value])=>'<div class="loan-stat"><small>'+esc(label)+'</small><strong>'+(label==="Members benefited"||label==="Active loans"?String(value??0):"KES "+money(value))+'</strong></div>').join("");
 }catch(err){$("loanGroupSummary").innerHTML='<p class="loan-muted">Group loan overview is not available: '+esc(err.message)+'</p>';}
 applyPermissions();
}

async function exportLoansCsv(){
 if(!allowed("export")){status("View only: you cannot export group loan reports.",true);return;}
 try{
  const memberById=new Map(members.map(m=>[m.id,m]));
  const rows=[["Loan ID","Member","Requested KES","Approved KES","Period months","Purpose","Status","Chairperson decision","Treasurer decision","Secretary decision","Interest rate %","Interest type","Submitted at","Disbursed at","Principal due KES","Interest due KES","Penalty due KES","Confirmed repayments KES","Pending repayments KES","Outstanding KES","Overdue installments"]];
  for(const loan of loans){
   const {data:schedules,error}=await supabase.from("loan_repayment_schedule").select("due_date,principal_due,interest_due,penalty_due,amount_paid").eq("loan_id",loan.id);
   if(error)throw error;
   let principal=0,interest=0,penalty=0,paid=0,overdue=0;
   for(const s of schedules||[]){
    principal+=Number(s.principal_due||0);interest+=Number(s.interest_due||0);penalty+=Number(s.penalty_due||0);paid+=Number(s.amount_paid||0);
    if(s.due_date<today()&&Number(s.amount_paid)<Number(s.principal_due)+Number(s.interest_due)+Number(s.penalty_due))overdue++;
   }
   const outstanding=Math.max(0,principal+interest+penalty-paid);
   const member=memberById.get(loan.member_id);
   const votes=loanApprovals.filter(a=>a.loan_id===loan.id);
   const decision=slot=>{const v=votes.find(a=>a.approval_slot===slot);return v?(v.decision+(v.note?": "+v.note:"")):"Pending";};
   const {data:repayments,error:repaymentError}=await supabase.from("loan_repayments").select("amount,status").eq("loan_id",loan.id);
   if(repaymentError)throw repaymentError;
   const confirmed=(repayments||[]).filter(p=>p.status==="confirmed").reduce((sum,p)=>sum+Number(p.amount||0),0);
   const pending=(repayments||[]).filter(p=>p.status==="pending").reduce((sum,p)=>sum+Number(p.amount||0),0);
   rows.push([loan.id,member?.name||(loan.member_id===ctx.member.id?"You":"Member"),loan.requested_amount??"",loan.approved_amount??"",loan.period_months,loan.purpose,loan.status,decision("chairperson"),decision("treasurer"),decision("secretary"),loan.interest_rate_snapshot??"",loan.interest_type_snapshot??"",loan.created_at??"",loan.disbursed_at??"",principal.toFixed(2),interest.toFixed(2),penalty.toFixed(2),confirmed.toFixed(2),pending.toFixed(2),outstanding.toFixed(2),overdue]);
  }
  const csv=rows.map(row=>row.map(value=>{const s=String(value??"");return '"'+s.replace(/"/g,'""')+'"';}).join(",")).join("\r\n");
  const blob=new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="chamalive-loan-report-"+today()+".csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  status("Loan report exported. Data shown is limited by your group's loan access permissions.");
 }catch(err){status(errorText(err),true);}
}
$("loanExportCsv").addEventListener("click",exportLoansCsv);
async function showDetail(id){
 selectedLoan=loans.find(l=>l.id===id);if(!selectedLoan)return;
 $("loanDetailCard").classList.remove("loan-hidden");$("loanDetailTitle").textContent="Loan details · "+selectedLoan.status;
 const {data:schedules,error}=await supabase.from("loan_repayment_schedule").select("id,installment_no,due_date,principal_due,interest_due,penalty_due,amount_paid,status").eq("loan_id",id).order("installment_no");
 if(error)throw error;
 const {data:payments,error:pe}=await supabase.from("loan_repayments").select("payment_date,amount,payment_method,reference,status,confirmed_at").eq("loan_id",id).order("payment_date",{ascending:false});
 if(pe)throw pe;
 const rows=(schedules||[]).map(s=>'<tr><td data-label="Installment">'+s.installment_no+'</td><td data-label="Due date">'+esc(s.due_date)+'</td><td data-label="Principal">'+money(s.principal_due)+'</td><td data-label="Interest">'+money(s.interest_due)+'</td><td data-label="Penalty">'+money(s.penalty_due)+'</td><td data-label="Paid">'+money(s.amount_paid)+'</td><td data-label="Balance">'+money(Math.max(0,Number(s.principal_due)+Number(s.interest_due)+Number(s.penalty_due)-Number(s.amount_paid)))+'</td><td data-label="Status">'+esc(s.status)+'</td></tr>').join("");
 const pRows=(payments||[]).map(p=>'<tr><td data-label="Date">'+esc(p.payment_date)+'</td><td data-label="Amount">'+money(p.amount)+'</td><td data-label="Method">'+esc(p.payment_method)+'</td><td data-label="Reference">'+esc(p.reference||"—")+'</td><td data-label="Status">'+esc(p.status||"confirmed")+'</td></tr>').join("");
 $("loanSchedule").innerHTML='<h3>Repayment schedule</h3><table class="loan-table"><thead><tr><th>#</th><th>Due</th><th>Principal</th><th>Interest</th><th>Penalty</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>'+ (rows||'<tr><td colspan="8">Schedule is created after disbursement.</td></tr>')+'</tbody></table><h3 style="margin-top:18px">Repayments (pending until confirmed)</h3><table class="loan-table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th></tr></thead><tbody>'+ (pRows||'<tr><td colspan="5">No repayments recorded.</td></tr>')+'</tbody></table>';
 const {data:approvalRows,error:approvalError}=await supabase.from("loan_approvals").select("approval_slot,decision,note,created_at").eq("loan_id",id).order("created_at");
 if(approvalError&&!memberOnly)throw approvalError;
 $("loanApprovalProgress").innerHTML='<p><strong>Approval progress</strong>: '+APPROVAL_OFFICES.map(([slot,label])=>{const v=(approvalRows||[]).find(a=>a.approval_slot===slot);return esc(label)+": "+(v?esc(v.decision==="approved"?"Approved":"Rejected")+(v.note?" — "+esc(v.note):""):"Pending");}).join(" · ")+'</p><p><strong>Guarantor status</strong>: '+esc(selectedLoan.guarantor_status||"not_required")+'</p>';
 if(official){const {data:audit,error:ae}=await supabase.from("loan_audit").select("actor_id,action,detail,created_at").eq("loan_id",id).order("created_at",{ascending:false}).limit(30);if(ae)throw ae;$("loanAuditTrail").innerHTML='<h3>Audit trail</h3>'+((audit||[]).map(a=>{const actor=members.find(m=>m.auth_user_id===a.actor_id||m.user_id===a.actor_id);return '<p class="loan-muted">'+esc(a.action)+' · '+esc(actor?.name||"Authorized user")+' · '+esc(new Date(a.created_at).toLocaleString())+' · '+esc(JSON.stringify(a.detail))+'</p>';}).join("")||'<p class="loan-muted">No audit events yet.</p>');}else $("loanAuditTrail").innerHTML="";
 $("loanRepaymentForm").elements.payment_date.value=today();applyPermissions();
}
$("loanSettingsForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!allowed("settings"))return status("View only: only Admin can change loan settings.",true);
 const f=e.currentTarget.elements;
 try{await rpc("set_loan_settings",{p_group_id:ctx.group.id,p_enabled:$("loanEnabled").checked,p_interest_rate:f.interest_rate.value,p_interest_type:f.interest_type.value,p_max_loan_amount:f.max_loan_amount.value,p_max_period_months:Number(f.max_period_months.value),p_late_penalty:f.late_penalty.value});status("Loan settings saved. Changes apply to new applications only.");groupLoansEnabled=$("loanEnabled").checked;ctx.group.loans_enabled=groupLoansEnabled;await loadSettings();await loadNotifications();await loadLoans();}
 catch(err){status(errorText(err),true);}
});
$("loanApplyForm").addEventListener("submit",async e=>{
 e.preventDefault();const f=e.currentTarget.elements;
 try{if(!settings||!settings.enabled||!groupLoansEnabled)throw new Error("Loans are not yet available for this group.");if(Number(f.amount.value)>Number(settings.max_loan_amount)||Number(f.period.value)>Number(settings.max_period_months))throw new Error("Requested amount or period exceeds the group maximum.");if(loans.some(l=>l.member_id===ctx.member.id&&["submitted","approved","overdue"].includes(l.status)))throw new Error("You already have a pending application or an overdue loan.");await rpc("apply_for_loan",{p_group_id:ctx.group.id,p_amount:f.amount.value,p_period:Number(f.period.value),p_purpose:f.purpose.value,p_guarantor_id:f.guarantor.value||null});e.currentTarget.reset();status("Loan application submitted.");await loadNotifications();await loadLoans();}
 catch(err){status(errorText(err),true);}
});
async function handleLoanAction(e){
 const b=e.target.closest("button");if(!b)return;
 try{
  if(b.dataset.detail){await showDetail(b.dataset.detail);return;}
  if(b.dataset.cancel){if(!confirm("Cancel this pending loan application?"))return;await rpc("cancel_loan",{p_loan_id:b.dataset.cancel});status("Loan application cancelled.");await loadLoans();await loadNotifications();return;}
  if(b.dataset.review){
   if(!allowed("review"))throw new Error("Only the designated Chairperson, Treasurer or Secretary can review loan applications.");
   const id=b.dataset.id;let note=null;
   const loan=loans.find(l=>l.id===id);
   if(!loan||loan.status!=="submitted")throw new Error("Only pending loan applications can receive an office decision.");
   if(loan.member_id===ctx.member.id)throw new Error("You cannot approve or reject your own loan.");
   const slot=loanApprovalSlot(ctx.member);
   if(!slot)throw new Error("Only the designated Chairperson, Treasurer or Secretary can approve loans.");
   if(loanApprovals.some(a=>a.loan_id===id&&a.approval_slot===slot))throw new Error("Your office has already submitted a decision for this loan.");
   note=prompt((b.dataset.review==="rejected"?"Reason for rejection:":"Reason / note for approval:"));if(!note?.trim())return;
   await rpc("decide_loan",{p_group_id:ctx.group.id,p_loan_id:id,p_decision:b.dataset.review,p_reason:note});
   await loadNotifications();await loadLoans();
   const updated=loans.find(l=>l.id===id);
   if(updated?.status==="approved")status("All three office approvals are recorded. Loan approved for disbursement.");
   else if(updated?.status==="rejected")status("Loan rejected. Disbursement is blocked.",true);
   else status("Your office decision was recorded. The loan remains pending until all three offices approve.");
   return;
  }
  if(b.dataset.disburse){
   if(!allowed("disburse"))throw new Error("View only: you cannot disburse loans.");
   if(!confirm("Disburse this approved loan and generate the repayment schedule?"))return;
   await rpc("disburse_loan",{p_group_id:ctx.group.id,p_loan_id:b.dataset.disburse,p_disbursed_date:today()});
   status("Loan disbursed and schedule generated.");await loadNotifications();await loadLoans();await showDetail(b.dataset.disburse);
  }
 }catch(err){status(errorText(err),true);}
}
$("loanRows").addEventListener("click",handleLoanAction);
$("loanReviewRows").addEventListener("click",handleLoanAction);
$("loanPendingRepaymentRows").addEventListener("click",async e=>{
 const b=e.target.closest("[data-confirm-repayment]");if(!b)return;
 if(!allowed("confirm"))return status("Only an authorized official can confirm repayments.",true);
 try{await rpc("confirm_repayment",{p_repayment_id:b.dataset.confirmRepayment});status("Repayment confirmed and allocated to the oldest unpaid installments.");await loadLoans();await loadNotifications();}catch(err){status(errorText(err),true);}
});
$("loanGuarantorRows").addEventListener("click",async e=>{
 const b=e.target.closest("[data-guarantor-response]");if(!b)return;
 try{await rpc("respond_guarantor",{p_loan_id:b.dataset.loanId,p_accept:b.dataset.guarantorResponse==="true"});status("Guarantor response recorded.");await loadGuarantorRequests();await loadNotifications();}catch(err){status(errorText(err),true);}
});
$("loanOverdueRows").addEventListener("click",async e=>{
 const b=e.target.closest("[data-send-reminder]");if(!b)return;
 try{await rpc("send_loan_reminder",{p_loan_id:b.dataset.sendReminder});status("Repayment reminder sent.");await loadNotifications();await loadOfficialSections();}catch(err){status(errorText(err),true);}
});
$("loanRepaymentForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!selectedLoan||!allowed("repayment"))return status("View only: you cannot record repayments.",true);
 const f=e.currentTarget.elements;
 try{await rpc("record_repayment",{p_group_id:ctx.group.id,p_loan_id:selectedLoan.id,p_amount:f.amount.value,p_paid_on:f.payment_date.value,p_reference:f.reference.value||null});status("Repayment submitted. It remains pending until an official confirms it.");e.currentTarget.reset();await loadNotifications();await loadLoans();if(selectedLoan)await showDetail(selectedLoan.id);}
 catch(err){status(errorText(err),true);}
});
async function initializeLoans(){
 try{
  ctx=await getMyApplicationContext();if(!ctx?.group?.id)throw new Error("Unable to resolve your active group.");
    const roles=[String(ctx.member?.role||"").trim().toLowerCase()];
  isAdmin=roles.some(r=>["admin","administrator"].includes(r));
  officeSlot=loanApprovalSlot(ctx.member);
  official=!memberPortal||Boolean(officeSlot);
  memberOnly=memberPortal&&!officeSlot;
  groupLoansEnabled=Boolean(await rpc("cl_group_module_enabled",{p_group_id:ctx.group.id,p_module:"loans"}));
  if(!groupLoansEnabled&&!isAdmin){status("Loans are not yet available for this group.",true);return;}
  $("loanContent").classList.remove("loan-hidden");
  if(memberOnly){$("loanSettingsCard").classList.add("loan-hidden");$("loanExportCsv").classList.add("loan-hidden");$("loanRows").closest("section").querySelector("h2").textContent="My applications and loans";}
  await loadMembers();await loadSettings();await loadNotifications();
  if(official){await rpc("apply_late_penalties",{p_group_id:ctx.group.id}).catch(err=>console.warn("Late penalty refresh unavailable:",err));await rpc("cl_loan_refresh_statuses",{p_group_id:ctx.group.id}).catch(err=>console.warn("Loan status refresh unavailable:",err));}
  await loadLoans();await loadGuarantorRequests();applyPermissions();
  if(isAdmin&&!officeSlot)status("Admin-only account: settings and reports are available, but loan approval and disbursement require an explicit office.");
  else status("Loans loaded for "+(ctx.group.name||"your group")+".");
 }catch(err){status(errorText(err),true);}
}
export async function initLoans(){return initializeLoans();}

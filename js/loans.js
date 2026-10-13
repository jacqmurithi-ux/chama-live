import { supabase } from "./supabase.js";
import { getMyApplicationContext } from "./auth.js";
import { canWrite, applyRolePermissions } from "./role-permissions.js";

const $ = id => document.getElementById(id);
const money = value => Number(value || 0).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let ctx, settings, loans=[], members=[], selectedLoan=null, official=false;

function status(message,error=false){$("loanStatus").textContent=message;$("loanStatus").classList.toggle("error",error);}
function errorText(error){return [error?.message,error?.details,error?.hint,error?.code?("Code: "+error.code):null].filter(Boolean).join(" — ")||"Request failed.";}
function allowed(action){return canWrite("loans",action,ctx?.member);}
async function rpc(name,args){const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data;}
function today(){return new Date().toISOString().slice(0,10);}
function applyPermissions(){
  applyRolePermissions({page:"loans",member:ctx.member});
  $("loanSettingsCard").classList.remove("loan-hidden");
  $("loanRepaymentPanel").classList.toggle("loan-hidden",!selectedLoan||!["active","overdue"].includes(selectedLoan.status));
}
async function loadSettings(){
 const {data,error}=await supabase.from("loan_settings").select("interest_rate,interest_type,max_loan_amount,max_period_months,late_penalty").eq("group_id",ctx.group.id).maybeSingle();
 if(error)throw error; settings=data||null;
 if(settings){
  const f=$("loanSettingsForm").elements;
  for(const key of ["interest_rate","interest_type","max_loan_amount","max_period_months","late_penalty"]) f[key].value=settings[key];
  $("loanLimits").textContent="Maximum KES "+money(settings.max_loan_amount)+" · Up to "+settings.max_period_months+" months · "+settings.interest_rate+"% annual ("+settings.interest_type.replaceAll("_"," ")+").";
 }else $("loanLimits").textContent="The group Admin must save loan settings before members can apply.";
 $("loanApplyForm").querySelector("button[type=submit]").disabled=!settings;
}
async function loadMembers(){
 const {data,error}=await supabase.from("members").select("id,name,member_number,status,onboarding_status").eq("group_id",ctx.group.id).eq("status","active").eq("onboarding_status","active").order("name");
 if(error)throw error;members=data||[];
 $("loanApplyForm").elements.guarantor.innerHTML='<option value="">No guarantor selected</option>'+members.filter(m=>m.id!==ctx.member.id).map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+(m.member_number?' · '+esc(m.member_number):"")+'</option>').join("");
}
async function loadLoans(){
 const {data,error}=await supabase.from("loan_applications").select("id,group_id,member_id,requested_amount,approved_amount,period_months,purpose,guarantor_member_id,status,decision_note,interest_rate_snapshot,interest_type_snapshot,approved_by,approved_at,disbursed_at,created_at").eq("group_id",ctx.group.id).order("created_at",{ascending:false});
 if(error)throw error;loans=data||[];
 const memberById=new Map(members.map(m=>[m.id,m]));
 $("loanRows").innerHTML=loans.map(l=>{
  const m=memberById.get(l.member_id);const name=m?.name||(l.member_id===ctx.member.id?"You":"Member");
  let actions='<button class="loan-btn secondary" data-detail="'+esc(l.id)+'">Details</button>';
  if(l.status==="submitted") actions+='<button class="loan-btn" data-review="approved" data-id="'+esc(l.id)+'" '+(allowed("review")?"":"disabled title=\"View only\"") +'>Approve</button><button class="loan-btn secondary" data-review="rejected" data-id="'+esc(l.id)+'" '+(allowed("review")?"":"disabled title=\"View only\"") +'>Reject</button>';
  if(l.status==="approved") actions+='<button class="loan-btn" data-disburse="'+esc(l.id)+'" '+(allowed("disburse")?"":"disabled title=\"View only\"") +'>Disburse</button>';
  return '<tr><td>'+esc(name)+'</td><td>KES '+money(l.requested_amount)+'</td><td>'+(l.approved_amount==null?"—":"KES "+money(l.approved_amount))+'</td><td>'+l.period_months+' months</td><td><span class="loan-pill">'+esc(l.status)+'</span></td><td>'+esc(l.created_at?new Date(l.created_at).toLocaleDateString():"—")+'</td><td><div class="loan-actions">'+actions+'</div></td></tr>';
 }).join("")||'<tr><td colspan="7">No loan applications yet.</td></tr>';
 const outstandingIds=loans.filter(l=>["active","overdue"].includes(l.status));
 let outstanding=0, overdue=0;
 for(const l of outstandingIds){
  const {data:schedules,error:e}=await supabase.from("loan_repayment_schedule").select("principal_due,interest_due,penalty_due,amount_paid,due_date").eq("loan_id",l.id);
  if(e)throw e;
  for(const s of schedules||[]){outstanding+=Math.max(0,Number(s.principal_due)+Number(s.interest_due)+Number(s.penalty_due)-Number(s.amount_paid));}
  if((schedules||[]).some(s=>s.due_date<today()&&Number(s.amount_paid)<Number(s.principal_due)+Number(s.interest_due)+Number(s.penalty_due)))overdue++;
 }
 $("loanCount").textContent=String(loans.length);$("loanOutstanding").textContent="KES "+money(outstanding);$("loanOverdue").textContent=String(overdue);
 $("loanViewMode").textContent=official?"Official view: applications and group totals.":"Member view: only your own applications and repayment details.";
 if(selectedLoan){const fresh=loans.find(l=>l.id===selectedLoan.id);selectedLoan=fresh||null;if(selectedLoan)await showDetail(selectedLoan.id);}
 applyPermissions();
}
async function exportLoansCsv(){
 if(!canWrite("loans","export",ctx.member)){status("View only: you cannot export group loan reports.",true);return;}
 try{
  const memberById=new Map(members.map(m=>[m.id,m]));
  const rows=[["Loan ID","Member","Requested KES","Approved KES","Period months","Purpose","Status","Interest rate %","Interest type","Submitted at","Disbursed at","Principal due KES","Interest due KES","Penalty due KES","Paid KES","Outstanding KES","Overdue installments"]];
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
   rows.push([loan.id,member?.name||(loan.member_id===ctx.member.id?"You":"Member"),loan.requested_amount??"",loan.approved_amount??"",loan.period_months,loan.purpose,loan.status,loan.interest_rate_snapshot??"",loan.interest_type_snapshot??"",loan.created_at??"",loan.disbursed_at??"",principal.toFixed(2),interest.toFixed(2),penalty.toFixed(2),paid.toFixed(2),outstanding.toFixed(2),overdue]);
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
 const {data:payments,error:pe}=await supabase.from("loan_repayments").select("payment_date,amount,payment_method,reference").eq("loan_id",id).order("payment_date",{ascending:false});
 if(pe)throw pe;
 const rows=(schedules||[]).map(s=>'<tr><td>'+s.installment_no+'</td><td>'+esc(s.due_date)+'</td><td>'+money(s.principal_due)+'</td><td>'+money(s.interest_due)+'</td><td>'+money(s.penalty_due)+'</td><td>'+money(s.amount_paid)+'</td><td>'+esc(s.status)+'</td></tr>').join("");
 const pRows=(payments||[]).map(p=>'<tr><td>'+esc(p.payment_date)+'</td><td>'+money(p.amount)+'</td><td>'+esc(p.payment_method)+'</td><td>'+esc(p.reference||"—")+'</td></tr>').join("");
 $("loanSchedule").innerHTML='<h3>Repayment schedule</h3><table class="loan-table"><thead><tr><th>#</th><th>Due</th><th>Principal</th><th>Interest</th><th>Penalty</th><th>Paid</th><th>Status</th></tr></thead><tbody>'+ (rows||'<tr><td colspan="7">Schedule is created after disbursement.</td></tr>')+'</tbody></table><h3 style="margin-top:18px">Payments</h3><table class="loan-table"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead><tbody>'+ (pRows||'<tr><td colspan="4">No repayments recorded.</td></tr>')+'</tbody></table>';
 $("loanRepaymentForm").elements.payment_date.value=today();applyPermissions();
}
$("loanSettingsForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!allowed("settings"))return status("View only: only Admin can change loan settings.",true);
 const f=e.currentTarget.elements;
 try{await rpc("cl_loan_update_settings",{p_group_id:ctx.group.id,p_interest_rate:f.interest_rate.value,p_interest_type:f.interest_type.value,p_max_loan_amount:f.max_loan_amount.value,p_max_period_months:Number(f.max_period_months.value),p_late_penalty:f.late_penalty.value});status("Loan settings saved and audit logged.");await loadSettings();}
 catch(err){status(errorText(err),true);}
});
$("loanApplyForm").addEventListener("submit",async e=>{
 e.preventDefault();const f=e.currentTarget.elements;
 try{await rpc("cl_loan_apply",{p_group_id:ctx.group.id,p_requested_amount:f.amount.value,p_period_months:Number(f.period.value),p_purpose:f.purpose.value,p_guarantor_member_id:f.guarantor.value||null});e.currentTarget.reset();status("Loan application submitted.");await loadLoans();}
 catch(err){status(errorText(err),true);}
});
$("loanRows").addEventListener("click",async e=>{
 const b=e.target.closest("button");if(!b)return;
 try{
  if(b.dataset.detail){await showDetail(b.dataset.detail);return;}
  if(b.dataset.review){
   if(!allowed("review"))throw new Error("View only: you cannot review loan applications.");
   const id=b.dataset.id;let note=null,amount=null;
   if(b.dataset.review==="rejected"){note=prompt("Reason for rejection:");if(!note?.trim())return;}
   else {const loan=loans.find(l=>l.id===id);const raw=prompt("Approved amount (KES)",String(loan.requested_amount));if(raw===null)return;amount=raw;}
   await rpc("cl_loan_review_authorized",{p_group_id:ctx.group.id,p_loan_id:id,p_decision:b.dataset.review,p_decision_note:note,p_approved_amount:amount});status("Loan application "+b.dataset.review+".");await loadLoans();return;
  }
  if(b.dataset.disburse){
   if(!allowed("disburse"))throw new Error("View only: you cannot disburse loans.");
   if(!confirm("Disburse this approved loan and generate the repayment schedule?"))return;
   await rpc("cl_loan_disburse",{p_group_id:ctx.group.id,p_loan_id:b.dataset.disburse,p_disbursed_date:today()});status("Loan disbursed and schedule generated.");await loadLoans();await showDetail(b.dataset.disburse);
  }
 }catch(err){status(errorText(err),true);}
});
$("loanRepaymentForm").addEventListener("submit",async e=>{
 e.preventDefault();if(!selectedLoan||!allowed("repayment"))return status("View only: you cannot record repayments.",true);
 const f=e.currentTarget.elements;
 try{await rpc("cl_loan_record_repayment_authorized",{p_group_id:ctx.group.id,p_loan_id:selectedLoan.id,p_amount:f.amount.value,p_payment_date:f.payment_date.value,p_payment_method:f.method.value,p_reference:f.reference.value||null,p_note:f.note.value||null});status("Repayment recorded and allocated to the earliest outstanding installments.");e.currentTarget.reset();await loadLoans();if(selectedLoan)await showDetail(selectedLoan.id);}
 catch(err){status(errorText(err),true);}
});
async function initializeLoans(){
 try{
  ctx=await getMyApplicationContext();if(!ctx?.group?.id)throw new Error("Unable to resolve your active group.");
  const enabled=await rpc("cl_group_module_enabled",{p_group_id:ctx.group.id,p_module:"loans"});
  if(!enabled){status("Loans is disabled for this group. Ask the group Admin to enable it.",true);return;}
  $("loanContent").classList.remove("loan-hidden");
  const roles=[String(ctx.member?.role||"").toLowerCase(),String(ctx.member?.actual_position||"").toLowerCase(),String(ctx.member?.actual_position_name||"").toLowerCase()];
  official=roles.some(r=>["admin","administrator","chairperson","vice chairperson","treasurer","secretary","vice secretary"].includes(r));
  await loadMembers();await loadSettings();await rpc("cl_loan_refresh_statuses",{p_group_id:ctx.group.id});await loadLoans();applyPermissions();status("Loans loaded for "+(ctx.group.name||"your group")+".");
 }catch(err){status(errorText(err),true);}
}
export async function initLoans(){return initializeLoans();}

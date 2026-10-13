import { supabase } from "./supabase.js";
import { getMyApplicationContext } from "./auth.js";
import { canWrite, applyRolePermissions } from "./role-permissions.js";

const $ = (id) => document.getElementById(id);
const statusEl = $("merryStatus");
const money = (v) => Number(v || 0).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let ctx, members = [], cycles = [];

function status(message, error=false) {
  statusEl.textContent = message;
  statusEl.style.background = error ? "#fef2f2" : "#f1f5f9";
  statusEl.style.color = error ? "#991b1b" : "#334155";
}
function rpcError(error) {
  const msg = error?.message || "The request could not be completed.";
  status(msg, true);
}
function writeAllowed(action) {
  return canWrite("merry-go-round", action, ctx?.member);
}
async function rpc(name,args) {
  const {data,error}=await supabase.rpc(name,args);
  if(error) throw error;
  return data;
}
async function loadMembers() {
  const {data,error}=await supabase.from("members").select("id,name,member_number,role,actual_position,actual_position_name").eq("group_id",ctx.group.id).eq("status","active").eq("onboarding_status","active").order("name");
  if(error) throw error;
  members=data||[];
  $("memberOrder").innerHTML=members.map(m=>'<option value="'+escapeHtml(m.id)+'">'+escapeHtml(m.name)+' ('+escapeHtml(m.member_number||"") +')</option>').join("");
  $("cycleForm").elements.rounds.max=String(Math.max(2,members.length));
  $("cycleForm").elements.rounds.value=String(members.length);
}
function applyOrderVisibility(){
 const show=$("payoutMethod").value==="admin";
 $("orderLabel").classList.toggle("merry-hide",!show);
 $("memberOrder").required=show;
}
async function loadNotifications(){
 const {data,error}=await supabase.from("merry_go_round_notifications")
  .select("id,notification_type,message,due_date,created_at,read_at")
  .eq("group_id",ctx.group.id).eq("member_id",ctx.member.id)
  .order("created_at",{ascending:false}).limit(20);
 if(error)throw error;
 const items=data||[];
 $("merryNotifications").innerHTML=items.length?items.map(n=>'<div style="padding:9px 0;border-bottom:1px solid #e5e7eb"><strong>'+escapeHtml(n.notification_type.replaceAll("_"," "))+'</strong><div>'+escapeHtml(n.message)+'</div><small>'+escapeHtml(n.created_at?new Date(n.created_at).toLocaleString():"")+(n.due_date?' · Due '+escapeHtml(n.due_date):'')+'</small></div>').join(""):"No notifications yet.";
}

async function renderMemberChoicePanel(selected){
 const panel=$("memberChoicePanel");
 const official=writeAllowed("applyPreferences");
 if(!selected||selected.payout_order_method!=="member_chosen"){panel.style.display="none";return;}
 panel.style.display="block";
 const select=$("preferredRound");
 select.innerHTML=Array.from({length:Number(selected.number_of_rounds)},(_,i)=>'<option value="'+(i+1)+'">Round '+(i+1)+'</option>').join("");
 const {data:mine,error}=await supabase.from("merry_go_round_preferences").select("preferred_round_number").eq("group_id",ctx.group.id).eq("cycle_id",selected.id).eq("member_id",ctx.member.id).maybeSingle();
 if(error)throw error;
 if(mine)select.value=String(mine.preferred_round_number);
 $("myPreferenceStatus").textContent=mine?"Your current choice: Round "+mine.preferred_round_number+". You may change it if the new round is still available.":"You have not chosen a payout round yet.";
 $("allPreferencesPanel").style.display=official?"block":"none";
 if(official){
  const rows=await rpc("cl_merry_list_preferences",{p_group_id:ctx.group.id,p_cycle_id:selected.id});
  $("allPreferences").innerHTML=(rows||[]).map(p=>'<div>'+escapeHtml(p.member_name)+' — Round '+p.preferred_round_number+'</div>').join("")||"No member choices submitted yet.";
  $("applyPreferencesBtn").disabled=(rows||[]).length!==Number(selected.number_of_rounds);
 }
}
\nasync function loadCycles(){
 cycles=await supabase.from("merry_go_round_cycles").select("id,name,status,contribution_amount,frequency,start_date,number_of_rounds,payout_order_method").eq("group_id",ctx.group.id).order("created_at",{ascending:false}).then(({data,error})=>{if(error)throw error;return data||[]});
 $("cycleSelect").innerHTML='<option value="">Select a cycle</option>'+cycles.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+' — '+escapeHtml(c.status)+'</option>').join("");
 if(cycles.length){$("cycleSelect").value=cycles[0].id;await loadTracking();}
}
async function loadTracking(){
 const cycleId=$("cycleSelect").value;
 if(!cycleId){$("roundRows").innerHTML='<tr><td colspan="9">Choose a cycle.</td></tr>';return;}
 const data=await rpc("cl_merry_tracking",{p_group_id:ctx.group.id,p_cycle_id:cycleId});
 const selected=cycles.find(c=>c.id===cycleId);
 $("cycleSummary").textContent=selected ? selected.name+" · "+money(selected.contribution_amount)+" per member · "+selected.frequency+" · "+selected.number_of_rounds+" rounds · "+selected.status : "";\n await renderMemberChoicePanel(selected);
 $("roundRows").innerHTML=(data||[]).map(r=>{
   const pays=Array.isArray(r.member_payments)?r.member_payments:[];
   const payHtml=pays.map(p=>{
     const canRecord=writeAllowed("record");
     const canComplete=writeAllowed("payout");
     const action=canRecord?'<form class="paymentForm" data-payment="'+escapeHtml(p.payment_id)+'" style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin:6px 0"><span>'+escapeHtml(p.member_name)+': '+escapeHtml(p.status)+' ('+money(p.amount_paid)+'/'+money(p.amount_due)+')'+(Number(p.late_fine_amount)>0?' · Late fine KES '+money(p.late_fine_amount):'')+'</span><input aria-label="Amount paid by '+escapeHtml(p.member_name)+'" name="amount" type="number" min="0" max="'+escapeHtml(p.amount_due)+'" step="0.01" value="'+escapeHtml(p.amount_paid)+'" style="width:105px;padding:5px" '+(p.status==="paid"?"disabled":"")+'><button class="merry-btn" type="submit" '+(p.status==="paid"?"disabled":"")+'>Record</button></form>':'<div>'+escapeHtml(p.member_name)+': '+escapeHtml(p.status)+' ('+money(p.amount_paid)+'/'+money(p.amount_due)+')</div>';
     return action;
   }).join("");
   const actions=writeAllowed("payout") && r.round_status!=="completed" && Number(r.pending_count)===0
     ? '<button class="merry-btn payoutBtn" data-round="'+escapeHtml(r.round_id)+'">Record payout</button>':'';
   const swap=writeAllowed("swap")?'<div class="merry-muted">Swap order below</div>':'';
   return '<tr><td>'+r.round_number+'</td><td>'+escapeHtml(r.due_date)+'</td><td>'+escapeHtml(r.recipient_name)+'</td><td>'+money(r.payout_amount)+'</td><td><span class="merry-pill">'+escapeHtml(r.round_status)+'</span></td><td>'+r.paid_count+'</td><td>'+r.pending_count+'</td><td>'+r.late_count+'</td><td>'+payHtml+actions+swap+'</td></tr>';
 }).join("")||'<tr><td colspan="9">No rounds found.</td></tr>';
}
$("memberChoiceForm").addEventListener("submit",async e=>{
 e.preventDefault();
 if(!ctx)return;
 try{$("savePreferenceBtn").disabled=true;await rpc("cl_merry_choose_round",{p_group_id:ctx.group.id,p_cycle_id:$("cycleSelect").value,p_round_number:Number($("preferredRound").value)});status("Your payout-round choice was saved.");await renderMemberChoicePanel(cycles.find(c=>c.id===$("cycleSelect").value));}
 catch(err){rpcError(err);}finally{$("savePreferenceBtn").disabled=false;}
});
$("applyPreferencesBtn").addEventListener("click",async()=>{
 if(!writeAllowed("applyPreferences"))return status("View only: you cannot apply member choices.",true);
 try{await rpc("cl_merry_apply_preferences",{p_group_id:ctx.group.id,p_cycle_id:$("cycleSelect").value});status("Member choices applied and audit logged.");await loadTracking();}
 catch(err){rpcError(err);}
});
async function initialize(){
 try{
   ctx=await getMyApplicationContext();
   if(!ctx?.group?.id) throw new Error("Unable to resolve your active group.");
   const enabled=await rpc("cl_group_module_enabled",{p_group_id:ctx.group.id,p_module:"merry_go_round"});
   if(!enabled){status("Merry-go-round is disabled for this group. Ask the group Admin to enable it.",true);return;}
   $("merryContent").classList.remove("merry-hide");
   applyRolePermissions({page:"merry-go-round",member:ctx.member,root:$("merryContent")});
   if(!writeAllowed("create")){const badge=document.createElement("span");badge.className="merry-pill";badge.textContent="View only";$("cycleForm").before(badge);$("cycleForm").querySelectorAll("input,select,button").forEach(el=>el.disabled=true);}
   await loadMembers();
   await loadCycles();
   applyOrderVisibility();
   status("Merry-go-round ready for "+ctx.group.name+".");
 }catch(e){rpcError(e);console.error("[Merry-go-round]",e);}
}
$("payoutMethod").addEventListener("change",applyOrderVisibility);
$("cycleSelect").addEventListener("change",()=>loadTracking().catch(rpcError));
$("cycleForm").addEventListener("submit",async e=>{
 e.preventDefault();
 if(!writeAllowed("create")) return status("View only: you cannot create a cycle.",true);
 const f=e.currentTarget.elements;
 const method=f.order_method.value;
 const order=method==="admin"?Array.from($("memberOrder").selectedOptions).map(o=>o.value):null;
 try{
  $("createCycleBtn").disabled=true;
  await rpc("cl_merry_create_cycle",{p_group_id:ctx.group.id,p_name:f.name.value.trim(),p_contribution_amount:Number(f.amount.value),p_frequency:f.frequency.value,p_start_date:f.start_date.value,p_number_of_rounds:Number(f.rounds.value),p_payout_order_method:method,p_member_order:order,p_late_fine_amount:Number(f.late_fine.value||0)});
  status("Cycle created and audited.");
  e.currentTarget.reset();f.rounds.value=String(members.length);f.late_fine.value="0";applyOrderVisibility();await loadCycles();
 }catch(err){rpcError(err);}finally{$("createCycleBtn").disabled=false;}
});
$("roundRows").addEventListener("submit",async e=>{
 const form=e.target.closest("form.paymentForm"); if(!form)return;
 e.preventDefault();
 if(!writeAllowed("record"))return status("View only: you cannot record payments.",true);
 try{const button=form.querySelector("button");button.disabled=true;await rpc("cl_merry_record_payment",{p_group_id:ctx.group.id,p_payment_id:form.dataset.payment,p_amount:Number(form.elements.amount.value)});status("Payment updated and audit log written.");await loadTracking();await loadNotifications();}catch(err){rpcError(err);}
});
$("swapRoundsBtn").addEventListener("click",async()=>{
 if(!writeAllowed("swap"))return status("View only: you cannot change payout order.",true);
 const a=Number($("swapRoundA").value),b=Number($("swapRoundB").value);
 if(!a||!b||a===b)return status("Choose two different rounds.",true);
 try{await rpc("cl_merry_swap_recipients",{p_group_id:ctx.group.id,p_cycle_id:$("cycleSelect").value,p_round_a:a,p_round_b:b});status("Payout order swapped and audit logged.");await loadTracking();}catch(err){rpcError(err);}
});
$("roundRows").addEventListener("click",async e=>{
 const btn=e.target.closest("button.payoutBtn"); if(!btn)return;
 if(!writeAllowed("payout")) return status("View only: you cannot record a payout.",true);
 try{btn.disabled=true;await rpc("cl_merry_complete_payout",{p_group_id:ctx.group.id,p_round_id:btn.dataset.round});status("Payout recorded and audit log updated.");await loadCycles();await loadTracking();await loadNotifications();}catch(err){rpcError(err);}finally{btn.disabled=false;}
});
export async function initMerryGoRound(){ await initialize(); }

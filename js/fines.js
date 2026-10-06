/* =========================================================
   CHAMA LIVE — FINES FEATURE
   ---------------------------------------------------------
   Loaded by admin-layout.js.
   This module is read-only for the fine ledger and owns
   fine-rule UI interaction only through its page contract.
========================================================= */

import { supabase } from "./supabase.js";
import { getMyGroup } from "./auth.js";

const money = value =>
  `KSh ${Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const esc = value =>
  String(value ?? "").replace(
    /[&<>"]/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    }[c])
  );

const date = value =>
  value
    ? new Date(value).toLocaleDateString("en-KE", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      })
    : "—";

    async function loadFineLedgerUI() {
      const message = document.getElementById("fineMessage");
      const rows = document.getElementById("fineRows");
      const mobile = document.getElementById("fineMobileList");
      const ruleRows = document.getElementById("fineRuleRows");
      try {
        const group = await getMyGroup();
        const groupId = group?.id ?? group?.group_id;
        if (!groupId) throw new Error("Group context could not be resolved.");

        const [{data:fines,error:fe},{data:rules,error:re}] = await Promise.all([
          supabase.from("fines").select("id,member_id,rule_id,trigger_type,accounting_month,calculated_amount,original_amount,triggered_at").eq("group_id",groupId).order("triggered_at",{ascending:false}),
          supabase.from("fine_rules").select("id,name,trigger_type,calculation_method,fixed_amount,percentage_rate,grace_period_value,grace_period_unit,effective_from,status").eq("group_id",groupId).order("created_at",{ascending:false})
        ]);
        if (fe) throw fe;
        if (re) throw re;

        const memberIds=[...new Set((fines||[]).map(x=>x.member_id).filter(Boolean))];
        const ruleIds=[...new Set((fines||[]).map(x=>x.rule_id).filter(Boolean))];
        const [{data:members,error:me},{data:allocs,error:ae}] = await Promise.all([
          memberIds.length ? supabase.from("members").select("id,name,full_name").in("id",memberIds) : Promise.resolve({data:[],error:null}),
          fines?.length ? supabase.from("fine_payment_allocations").select("fine_id,allocated_amount").in("fine_id",fines.map(x=>x.id)) : Promise.resolve({data:[],error:null})
        ]);
        if (me) throw me;
        if (ae) throw ae;
        const memberMap=new Map((members||[]).map(m=>[String(m.id),m.name||m.full_name||"Unnamed member"]));
        const ruleMap=new Map((rules||[]).map(r=>[String(r.id),r]));
        const allocated=new Map();
        (allocs||[]).forEach(a=>allocated.set(String(a.fine_id),(allocated.get(String(a.fine_id))||0)+Number(a.allocated_amount||0)));

        const filterMonth=document.getElementById("accountingMonth")?.value||"";
        const filterMember=document.getElementById("fineMember")?.value||"";
        const filtered=(fines||[]).filter(f=>(!filterMonth||f.accounting_month===filterMonth)&&(!filterMember||String(f.member_id)===filterMember));
        const total=filtered.reduce((s,f)=>s+Number(f.calculated_amount||0),0);
        const paid=filtered.reduce((s,f)=>s+(allocated.get(String(f.id))||0),0);
        document.getElementById("totalFineAmount").textContent=money(total);
        document.getElementById("allocatedFineAmount").textContent=money(paid);
        document.getElementById("outstandingFineAmount").textContent=money(Math.max(total-paid,0));
        document.getElementById("fineRecordCount").textContent=String(filtered.length);

        const months=[...new Set((fines||[]).map(f=>f.accounting_month).filter(Boolean))].sort().reverse();
        const monthSelect=document.getElementById("accountingMonth");
        const current=monthSelect.value;
        monthSelect.innerHTML='<option value="">All months</option>'+months.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join("");
        monthSelect.value=current;
        const memberSelect=document.getElementById("fineMember");
        const memberCurrent=memberSelect.value;
        memberSelect.innerHTML='<option value="">All members</option>'+[...memberMap.entries()].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join("");
        memberSelect.value=memberCurrent;

        if (!filtered.length) {
          rows.innerHTML='<tr><td colspan="7" class="fine-empty">No fine ledger records found.</td></tr>';
          mobile.innerHTML='<div class="fine-empty">No fine ledger records found.</div>';
        } else {
          rows.innerHTML=filtered.map(f=>{const a=allocated.get(String(f.id))||0; const o=Math.max(Number(f.calculated_amount||0)-a,0); const rule=ruleMap.get(String(f.rule_id)); return `<tr><td><strong>${esc(memberMap.get(String(f.member_id))||"Unnamed member")}</strong></td><td>${esc(f.trigger_type||rule?.name||"—")}</td><td>${esc(f.accounting_month||"—")}</td><td class="amount">${money(f.calculated_amount)}</td><td class="amount">${money(a)}</td><td class="amount">${money(o)}</td><td>${esc(date(f.triggered_at))}</td></tr>`}).join("");
          mobile.innerHTML=filtered.map(f=>{const a=allocated.get(String(f.id))||0; const o=Math.max(Number(f.calculated_amount||0)-a,0); return `<div class="fine-mobile-item"><div class="fine-mobile-top"><strong class="fine-mobile-name">${esc(memberMap.get(String(f.member_id))||"Unnamed member")}</strong><span class="fine-status ${o>0?"outstanding":"settled"}">${o>0?"Outstanding":"Settled"}</span></div><div class="fine-mobile-grid"><div><span class="fine-mobile-label">Trigger</span><span class="fine-mobile-value">${esc(f.trigger_type||"—")}</span></div><div><span class="fine-mobile-label">Month</span><span class="fine-mobile-value">${esc(f.accounting_month||"—")}</span></div><div><span class="fine-mobile-label">Fine</span><span class="fine-mobile-value">${money(f.calculated_amount)}</span></div><div><span class="fine-mobile-label">Allocated</span><span class="fine-mobile-value">${money(a)}</span></div><div><span class="fine-mobile-label">Outstanding</span><span class="fine-mobile-value">${money(o)}</span></div><div><span class="fine-mobile-label">Triggered</span><span class="fine-mobile-value">${esc(date(f.triggered_at))}</span></div></div></div>`}).join("");
        }
        ruleRows.innerHTML=(rules||[]).map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td>${esc(r.trigger_type||"—")}</td><td>${esc(r.calculation_method||"—")}${r.fixed_amount!=null?" — "+money(r.fixed_amount):r.percentage_rate!=null?" — "+esc(r.percentage_rate)+"%":""}</td><td>${esc(r.grace_period_value)} ${esc(r.grace_period_unit||"")}</td><td>${esc(date(r.effective_from))}</td><td><span class="fine-status ${String(r.status||"").toLowerCase()==="active"?"active":"inactive"}">${esc(r.status||"—")}</span></td></tr>`).join("") || '<tr><td colspan="6" class="fine-empty">No fine rules found.</td></tr>';
        message.textContent="Fine ledger loaded from authoritative records."; message.className="fine-message visible success";
      } catch(error) { console.error("CHAMA LIVE fine UI:",error); message.textContent=error?.message||"Unable to load the fine ledger."; message.className="fine-message visible error"; }
    }
    document.getElementById("accountingMonth")?.addEventListener("change",loadFineLedgerUI);
    document.getElementById("fineMember")?.addEventListener("change",loadFineLedgerUI);
    document.getElementById("clearFineFilters")?.addEventListener("click",()=>{document.getElementById("accountingMonth").value="";document.getElementById("fineMember").value="";loadFineLedgerUI();});
    document.getElementById("refreshFines")?.addEventListener("click",loadFineLedgerUI);

export async function initFines() {
  document
    .getElementById("accountingMonth")
    ?.addEventListener("change", loadFineLedgerUI);

  document
    .getElementById("fineMember")
    ?.addEventListener("change", loadFineLedgerUI);

  document
    .getElementById("clearFineFilters")
    ?.addEventListener("click", () => {
      const month = document.getElementById("accountingMonth");
      const member = document.getElementById("fineMember");

      if (month) month.value = "";
      if (member) member.value = "";

      loadFineLedgerUI();
    });

  document
    .getElementById("refreshFines")
    ?.addEventListener("click", loadFineLedgerUI);

  await loadFineLedgerUI();
}

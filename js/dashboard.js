import { supabase, getCurrentGroupId, money, setText, showError } from './app.js';
try {
  const groupId = await getCurrentGroupId();
  if (!groupId) throw new Error('No group is linked to this account.');
  const [{data:group,error:groupError},{count,error:memberError},{data:contributions,error:cError},{data:expenses,error:eError}] = await Promise.all([
    supabase.from('groups').select('name,opening_balance').eq('id',groupId).single(),
    supabase.from('members').select('id',{count:'exact',head:true}).eq('group_id',groupId).eq('status','active'),
    supabase.from('contributions').select('amount,contribution_date').eq('group_id',groupId),
    supabase.from('expenses').select('amount,date,approval_status').eq('group_id',groupId)
  ]);
  if(groupError)throw groupError;if(memberError)throw memberError;if(cError)throw cError;if(eError)throw eError;
  const totalC=contributions.reduce((s,r)=>s+Number(r.amount||0),0);
  const approvedE=expenses.filter(r=>r.approval_status==='approved').reduce((s,r)=>s+Number(r.amount||0),0);
  const start=new Date();start.setDate(1);start.setHours(0,0,0,0);
  const monthC=contributions.filter(r=>new Date(r.contribution_date)>=start).reduce((s,r)=>s+Number(r.amount||0),0);
  const monthE=expenses.filter(r=>r.approval_status==='approved'&&new Date(r.date)>=start).reduce((s,r)=>s+Number(r.amount||0),0);
  setText('#group-name',group.name);setText('#members',count);setText('#contributions',money(totalC));setText('#expenses',money(approvedE));setText('#balance',money(Number(group.opening_balance||0)+totalC-approvedE));setText('#month-contributions',money(monthC));setText('#month-expenses',money(monthE));
}catch(error){showError(error)}

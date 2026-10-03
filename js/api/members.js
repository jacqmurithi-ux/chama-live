import { supabase } from "../supabase.js";
const MEMBER_FIELDS="id, group_id, user_id, member_number, name, phone, role, join_date, status, created_at, email, membership_number, onboarding_status, invited_at, activated_at, auth_user_id, national_id, actual_position, actual_position_name";
const RULE_FIELDS="group_id, member_id, contribution_type_id, amount, frequency, effective_from, effective_to, first_period_rule, status";
const TYPE_FIELDS="id, group_id, name, code, created_at";
const ALLOWED_RPCS=new Set(["refresh_my_managed_member_accounting","get_member_contribution_position","create_member_with_historical_contributions","create_member_with_contribution_plan","reconcile_member_historical_payments","set_member_actual_position"]);
const cache=new Map(),inflight=new Map(),TTL_MS=15000;
function safeError(error){const code=String(error?.code||"");const message=code==="42501"?"You do not have permission to complete this action.":/^PGRST|^42/.test(code)?"Member information is temporarily unavailable. Refresh and try again.":"Something went wrong while contacting CHAMA LIVE. Please try again.";return{code:code||"CLIENT_ERROR",message};}
async function request(work){try{const r=await work();return{data:r?.data??null,error:r?.error?safeError(r.error):null,...(r?.count!==undefined?{count:r.count}:{})};}catch(e){return{data:null,error:safeError(e)};}}
async function readCached(key,work){const c=cache.get(key);if(c&&c.expiresAt>Date.now())return c.result;if(inflight.has(key))return inflight.get(key);const p=request(work).then(r=>{if(!r.error)cache.set(key,{result:r,expiresAt:Date.now()+TTL_MS});inflight.delete(key);return r;});inflight.set(key,p);return p;}
function invalidate(){for(const k of cache.keys())if(/^(members|rules|types):/.test(k))cache.delete(k);}
export const membersApi=Object.freeze({
 list(groupId){return readCached(`members:${groupId}`,()=>supabase.from("members").select(MEMBER_FIELDS).eq("group_id",groupId).order("member_number",{ascending:true,nullsFirst:false}));},
 contributionTypes(groupId){return readCached(`types:${groupId}`,()=>supabase.from("contribution_types").select(TYPE_FIELDS).eq("group_id",groupId));},
 contributionRules(groupId,memberIds){if(!memberIds?.length)return Promise.resolve({data:[],error:null});return readCached(`rules:${groupId}`,()=>supabase.from("member_contribution_rules").select(RULE_FIELDS).eq("group_id",groupId).in("member_id",memberIds));},
 updateMember(groupId,memberId,values){return request(()=>supabase.from("members").update(values).eq("id",memberId).eq("group_id",groupId)).then(r=>{if(!r.error)invalidate();return r;});},
 async rpc(name,args){if(!ALLOWED_RPCS.has(name))return{data:null,error:{code:"UNSUPPORTED_OPERATION",message:"This action is not available."}};const r=await request(()=>supabase.rpc(name,args));if(!r.error&&(name.startsWith("create_member_")||name==="set_member_actual_position"||name==="reconcile_member_historical_payments"))invalidate();return r;}
});

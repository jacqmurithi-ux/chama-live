import { getDemoMembers } from "./demo-client.js";
import { bootDemoPortal, setDemoError } from "./demo-portal.js";
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
export async function initDemoMembers(){try{await bootDemoPortal();const members=await getDemoMembers();document.getElementById("demoMemberCount").textContent=members.length;document.getElementById("demoMemberRows").innerHTML=members.map(m=>`<tr><td>${esc(m.name||m.full_name||"Member")}</td><td>${esc(m.position||m.actual_position||"Member")}</td><td>${esc(m.role||"Member")}</td><td>Demo member</td></tr>`).join("");}catch(e){console.error(e);setDemoError(e?.message);}}

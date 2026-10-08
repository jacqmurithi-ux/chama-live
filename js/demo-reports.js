import { getDemoMembers, getDemoMeetings } from "./demo-client.js";
import { bootDemoPortal, setDemoError } from "./demo-portal.js";
export async function initDemoReports(){try{await bootDemoPortal();const [members,meetings]=await Promise.all([getDemoMembers(),getDemoMeetings()]);document.getElementById("demoReportMembers").textContent=members.length;document.getElementById("demoReportMeetings").textContent=meetings.length;document.getElementById("demoFinancialStatus").textContent="Unavailable in E2600 demo";}catch(e){console.error(e);setDemoError(e?.message);}}

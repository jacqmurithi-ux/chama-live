import {
  getDemoContext,
  getDemoGroup,
  getDemoMembers,
  getDemoMeetings,
  getDemoAttendance
} from "./demo-client.js";
import { bootDemoPortal, setDemoError } from "./demo-portal.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value + "T00:00:00").toLocaleDateString("en-KE", {
    day:"numeric", month:"short", year:"numeric"
  });
}

function setStatus(message, error = false) {
  const el = document.getElementById("status");
  el.textContent = message;
  el.className = error ? "demo-error" : "demo-muted";
}

export async function initDemoDashboard() {
  try {
    await bootDemoPortal();

    const [context, group, members, meetings, attendance] = await Promise.all([
      getDemoContext(),
      getDemoGroup(),
      getDemoMembers(),
      getDemoMeetings(),
      getDemoAttendance()
    ]);

    if (!context?.demo) {
      throw new Error("Demo session is not valid.");
    }

    document.getElementById("groupName").textContent =
      group?.name || context.group_name || "E2600";

    document.getElementById("visitor").textContent =
      `Welcome, ${context.visitor_name || "Demo Visitor"} · Demo access expires automatically.`;

    const active = members.filter(m => String(m.status).toLowerCase() === "active");
    const counts = attendance.reduce((out, row) => {
      const status = String(row.status || "").toLowerCase();
      out[status] = (out[status] || 0) + 1;
      return out;
    }, {});

    const total = attendance.length;
    const present = counts.present || 0;
    const late = counts.late || 0;
    const apology = counts.apology || 0;
    const absent = counts.absent || 0;
    const attended = present + late;
    const rate = total ? Math.round((attended / total) * 100) : 0;

    document.getElementById("memberCount").textContent = active.length;
    document.getElementById("meetingCount").textContent = meetings.length;
    document.getElementById("attendanceCount").textContent = total;
    document.getElementById("presentCount").textContent = present;
    document.getElementById("lateCount").textContent = late;
    document.getElementById("apologyCount").textContent = apology;
    document.getElementById("absentCount").textContent = absent;
    document.getElementById("attendanceRate").textContent = `${rate}%`;

    const latest = meetings[0];
    document.getElementById("latestMeeting").innerHTML = latest
      ? `<div class="demo-row"><span><strong>${escapeHtml(latest.title)}</strong><br><span class="demo-muted">${formatDate(latest.date)} · ${escapeHtml(latest.venue)}</span></span><span class="demo-pill">${escapeHtml(latest.status)}</span></div>
         <p><strong>Minutes</strong><br>${escapeHtml(latest.minutes || "No minutes recorded.")}</p>
         <p><strong>Resolution</strong><br>${escapeHtml(latest.resolution || "No resolution recorded.")}</p>`
      : "No meetings recorded.";

    setStatus("Demo data loaded successfully.");
  } catch (error) {
    console.error("E2600 demo dashboard load failed:", error);
    setStatus("Unable to load the demo session. Please return to the demo and verify again.", true);
    setDemoError(error?.message);
  }
}

initDemoDashboard();

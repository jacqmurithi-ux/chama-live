import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://onzaonflquipqmhgslxi.supabase.co";
const SUPABASE_KEY = "sb_publishable_0jhKFtRCnOx0WDcO3PwcMg_GGsnN3kc";
const TOKEN_KEY = "chama_live_demo_token";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

const token = sessionStorage.getItem(TOKEN_KEY);
const statusEl = document.getElementById("status");

if (!token) {
  window.location.replace("/demo.html");
  throw new Error("Demo token missing.");
}

async function rpc(name) {
  const { data, error } = await supabase.rpc(name, { p_token: token });
  if (error) throw error;
  return data ?? [];
}

function setStatus(message, error = false) {
  statusEl.textContent = message;
  statusEl.className = error ? "error" : "muted";
}

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

const tabs = [...document.querySelectorAll(".tab")];
const views = [...document.querySelectorAll(".view")];

tabs.forEach(tab => tab.addEventListener("click", () => {
  const view = tab.dataset.view;
  tabs.forEach(x => x.classList.toggle("active", x === tab));
  views.forEach(x => x.classList.toggle("hidden", x.id !== view));
}));

async function loadDemo() {
  try {
    const [context, group, members, meetings, attendance] = await Promise.all([
      supabase.rpc("cl_demo_get_context", { p_token: token }),
      rpc("cl_demo_get_group"),
      rpc("cl_demo_get_members"),
      rpc("cl_demo_get_meetings"),
      rpc("cl_demo_get_attendance")
    ]);

    if (context.error || !context.data?.demo) {
      sessionStorage.removeItem(TOKEN_KEY);
      window.location.replace("/demo.html");
      return;
    }

    const groupRow = group[0];
    document.getElementById("groupName").textContent = groupRow?.name || context.data.group_name || "E2600";
    document.getElementById("visitor").textContent =
      `Welcome, ${context.data.visitor_name || "Demo Visitor"} · Demo access expires automatically.`;

    const active = members.filter(m => m.status === "active");
    const counts = attendance.reduce((out, row) => {
      out[row.status] = (out[row.status] || 0) + 1;
      return out;
    }, {});

    document.getElementById("memberCount").textContent = active.length;
    document.getElementById("meetingCount").textContent = meetings.length;
    document.getElementById("presentCount").textContent = counts.present || 0;
    document.getElementById("lateCount").textContent = counts.late || 0;
    document.getElementById("apologyCount").textContent = counts.apology || 0;
    document.getElementById("absentCount").textContent = counts.absent || 0;

    const latest = meetings[0];
    document.getElementById("latestMeeting").innerHTML = latest
      ? `<div class="row"><span><strong>${escapeHtml(latest.title)}</strong><br><span class="muted">${formatDate(latest.date)} · ${escapeHtml(latest.venue)}</span></span><span class="pill">${escapeHtml(latest.status)}</span></div>
         <p><strong>Minutes</strong><br>${escapeHtml(latest.minutes || "No minutes recorded.")}</p>
         <p><strong>Resolution</strong><br>${escapeHtml(latest.resolution || "No resolution recorded.")}</p>`
      : "No meetings recorded.";

    document.getElementById("membersTable").innerHTML = active.length
      ? `<table><thead><tr><th>No.</th><th>Name</th><th>Position</th><th>Status</th></tr></thead><tbody>${active.map(m =>
          `<tr><td>${escapeHtml(m.member_number)}</td><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.actual_position_name || m.role)}</td><td>${escapeHtml(m.status)}</td></tr>`).join("")}</tbody></table>`
      : "No active members.";

    document.getElementById("meetingsList").innerHTML = meetings.length
      ? meetings.map(m => `<article class="card">
          <h2>${escapeHtml(m.title)}</h2>
          <p class="muted">${formatDate(m.date)} · ${escapeHtml(m.venue || "Venue not specified")} · ${escapeHtml(m.status)}</p>
          <h3>Agenda</h3><ol>${(m.agenda || []).map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ol>
          <h3>Minutes</h3><p>${escapeHtml(m.minutes || "No minutes recorded.")}</p>
          <h3>Resolution</h3><p>${escapeHtml(m.resolution || "No resolution recorded.")}</p>
        </article>`).join("")
      : '<div class="card">No meetings recorded.</div>';

    setStatus("Demo data loaded successfully.");
  } catch (error) {
    console.error("E2600 demo load failed:", error);
    setStatus("Unable to load the demo session. Please return to the demo and verify again.", true);
  }
}

loadDemo();
import { getDemoContext, getDemoGroup, clearDemoSession } from "./demo-client.js";

let booted = false;

function pageName() {
  return window.location.pathname.split("/").pop().toLowerCase() || "demo-dashboard.html";
}

export async function bootDemoPortal() {
  if (booted) return;
  booted = true;

  const demo = await getDemoContext();
  if (!demo?.demo || !demo?.group_name) {
    clearDemoSession();
    window.location.replace("/demo.html");
    return;
  }

  const group = await getDemoGroup();
  if (!group?.name) throw new Error("Demo group unavailable.");

  document.documentElement.dataset.chamaLiveDemo = "true";
  document.body.classList.add("chama-demo-portal");

  const current = pageName();
  const links = [
    ["demo-dashboard.html","Dashboard"],
    ["demo-members.html","Members"],
    ["demo-meetings.html","Meetings"],
    ["demo-reports.html","Reports"]
  ];

  const header = document.createElement("header");
  header.className = "demo-topbar";
  header.innerHTML = `
    <div class="demo-brand">
      <strong>CHAMA LIVE</strong>
      <span>E2600 Demo</span>
    </div>
    <div class="demo-group">${escapeHtml(group.name)}</div>
    <button id="demoExit" type="button">Exit Demo</button>
  `;
  document.body.prepend(header);

  const nav = document.createElement("nav");
  nav.className = "demo-nav";
  nav.setAttribute("aria-label","Demo navigation");
  for (const [href,label] of links) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    if (href === current) a.className = "active";
    nav.appendChild(a);
  }
  document.body.insertBefore(nav, document.body.children[1] || null);

  document.getElementById("demoExit")?.addEventListener("click", () => {
    clearDemoSession();
    window.location.replace("/demo.html");
  });

  const title = document.querySelector("[data-demo-title]");
  if (title) title.textContent = group.name;

  const visitor = document.querySelector("[data-demo-visitor]");
  if (visitor) visitor.textContent = demo.visitor_name || "Demo Visitor";
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

export function setDemoError(message) {
  const el = document.getElementById("demoError");
  if (el) { el.hidden = false; el.textContent = message || "Unable to load the demo."; }
}

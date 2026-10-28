import { getMyApplicationContext } from "./auth.js";
import { supabase } from "./supabase.js";

let initialized = false;

function currentPageLabel() {
  const page = String(window.location.pathname || "/")
    .split("/")
    .pop() || "index.html";
  return page.slice(0, 300);
}

function buildDialog() {
  const dialog = document.createElement("dialog");
  dialog.id = "chamaFeedbackDialog";
  dialog.setAttribute("aria-labelledby", "chamaFeedbackTitle");
  dialog.style.cssText = "width:min(520px,calc(100% - 28px));border:1px solid #d0d5dd;border-radius:16px;padding:0;box-shadow:0 24px 70px rgba(16,24,40,.24);color:#101828";
  dialog.innerHTML = `
    <form id="chamaFeedbackForm" style="padding:22px;display:grid;gap:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <h2 id="chamaFeedbackTitle" style="margin:0;font-size:20px">Send feedback</h2>
        <button type="button" id="chamaFeedbackClose" aria-label="Close feedback" style="border:0;background:transparent;font-size:24px;cursor:pointer">×</button>
      </div>
      <p style="margin:0;color:#667085;font-size:13px">Tell us what happened or what would help. Do not include passwords or verification codes.</p>
      <label for="chamaFeedbackCategory" style="font-weight:700;font-size:13px">Type</label>
      <select id="chamaFeedbackCategory" name="category" style="width:100%;padding:10px;border:1px solid #d0d5dd;border-radius:8px">
        <option value="bug">Something isn't working</option>
        <option value="missing_feature">Suggestion</option>
        <option value="confusing">Question</option>
        <option value="general">Other</option>
      </select>
      <label for="chamaFeedbackMessage" style="font-weight:700;font-size:13px">Message</label>
      <textarea id="chamaFeedbackMessage" name="message" required maxlength="5000" rows="5" style="width:100%;resize:vertical;padding:10px;border:1px solid #d0d5dd;border-radius:8px" placeholder="Describe the page, what you expected, and what happened."></textarea>
      <p id="chamaFeedbackStatus" role="status" aria-live="polite" style="margin:0;font-size:13px"></p>
      <div style="display:flex;justify-content:flex-end;gap:8px">
        <button type="button" id="chamaFeedbackCancel" style="padding:10px 14px;border:1px solid #d0d5dd;border-radius:8px;background:white;cursor:pointer">Cancel</button>
        <button type="submit" id="chamaFeedbackSubmit" style="padding:10px 14px;border:1px solid #087443;border-radius:8px;background:#087443;color:white;font-weight:700;cursor:pointer">Send feedback</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);
  return dialog;
}

export async function initFeedbackButton() {
  if (initialized || !document.body) return;
  initialized = true;

  const topbar = document.querySelector(".topbar-actions");
  if (!topbar) {
    initialized = false;
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.id = "chamaSendFeedback";
  button.textContent = "Send feedback";
  button.style.cssText = "min-height:36px;padding:8px 11px;border:1px solid #d0d5dd;border-radius:9px;background:#fff;color:#344054;font:inherit;font-size:12px;font-weight:700;cursor:pointer";
  topbar.insertBefore(button, topbar.querySelector("#logout") || null);

  const dialog = buildDialog();
  const form = dialog.querySelector("#chamaFeedbackForm");
  const message = dialog.querySelector("#chamaFeedbackMessage");
  const category = dialog.querySelector("#chamaFeedbackCategory");
  const status = dialog.querySelector("#chamaFeedbackStatus");
  const submit = dialog.querySelector("#chamaFeedbackSubmit");

  const close = () => {
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  };
  button.addEventListener("click", () => {
    status.textContent = "";
    message.value = "";
    category.value = "bug";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    message.focus();
  });
  dialog.querySelector("#chamaFeedbackClose").addEventListener("click", close);
  dialog.querySelector("#chamaFeedbackCancel").addEventListener("click", close);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) close();
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const text = String(message.value || "").trim();
    if (!text) {
      status.textContent = "Please enter a message.";
      return;
    }
    if (text.length > 5000) {
      status.textContent = "Please keep the message under 5,000 characters.";
      return;
    }

    submit.disabled = true;
    status.textContent = "Sending…";
    try {
      const context = await getMyApplicationContext();
      const memberId = context?.member?.id;
      const groupId = context?.member?.group_id;
      if (!context?.user?.id || !memberId || !groupId) {
        throw new Error("Your signed-in group membership could not be verified. Please sign in again.");
      }

      const { error } = await supabase.from("feedback").insert({
        group_id: groupId,
        member_id: memberId,
        page: currentPageLabel(),
        category: String(category.value || "general"),
        message: text
      });
      if (error) throw error;

      status.textContent = "Feedback sent. Thank you.";
      form.reset();
      window.setTimeout(close, 900);
    } catch (error) {
      console.error("CHAMA LIVE: feedback submission failed.", error);
      status.textContent = error?.message || "Feedback could not be sent. Please try again.";
    } finally {
      submit.disabled = false;
    }
  });
}

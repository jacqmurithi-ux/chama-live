import { supabase } from "./supabase.js";
const moduleKeys = ["plans", "assets", "milestones", "migration"];
const byId = id => document.getElementById(id);
const showStatus = (message, ok = true) => {
  const node = byId("settingsStatus");
  if (!node) return;
  node.textContent = message;
  node.className = "settings-status " + (ok ? "success" : "error");
};
const setChecked = (id, value) => { if (byId(id)) byId(id).checked = value === true; };

export async function initGroupSettings() {
  const context = window.__CHAMA_LIVE_ADMIN_CONTEXT__;
  const groupId = context?.member?.group_id || context?.group?.id;
  if (!groupId) throw new Error("Your group could not be identified.");
  const role = String(context?.role || context?.member?.role || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  const canView = ["admin", "administrator", "chairperson", "treasurer", "secretary"].includes(role);
  const canEdit = ["admin", "administrator"].includes(role);
  if (!canView) {
    window.location.replace("dashboard.html");
    return;
  }
  if (byId("settingsRoot")) byId("settingsRoot").hidden = false;
  document.querySelectorAll("#existingModulesForm button, #existingModulesForm input, #optionalModulesForm button, #optionalModulesForm input")
    .forEach(node => { node.disabled = !canEdit; });

  const group = context.group || {};
  const member = context.member || {};
  const values = {
    groupName: group.name || member.group_name || "—",
    groupCategory: group.category || "—",
    groupRegistration: group.registration_number || "—",
    groupPhone: group.phone || "—",
    groupEmail: group.email || "—",
    groupCountry: group.country || "—",
    groupDescription: group.description || "—"
  };
  Object.entries(values).forEach(([id, value]) => { if (byId(id)) byId(id).textContent = value; });

  const [{ data: existingData, error: existingError }, { data: moduleData, error: moduleError }] = await Promise.all([
    supabase.rpc("get_group_module_settings", { p_group_id: groupId }),
    supabase.rpc("get_group_optional_modules", { p_group_id: groupId })
  ]);
  if (existingError) throw existingError;
  if (moduleError) throw moduleError;
  const existing = Array.isArray(existingData) ? existingData[0] : existingData;
  setChecked("merryGoRoundEnabled", existing?.merry_go_round_enabled);
  setChecked("loansEnabled", existing?.loans_enabled);
  moduleKeys.forEach(key => setChecked("module-" + key, moduleData?.[key] === true));

  const setBusy = busy => document.querySelectorAll("#existingModulesForm button, #existingModulesForm input, #optionalModulesForm button, #optionalModulesForm input").forEach(node => { node.disabled = busy || !canEdit; });
  setBusy(false);
  if (!canEdit) showStatus("View-only access. Only the group Admin can change settings.", true);

  byId("existingModulesForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    setBusy(true);
    try {
      const merry = byId("merryGoRoundEnabled").checked;
      const loans = byId("loansEnabled").checked;
      const { error } = await supabase.rpc("update_group_module_settings", {
        p_group_id: groupId, p_merry_go_round_enabled: merry, p_loans_enabled: loans
      });
      if (error) throw error;
      context.group = { ...(context.group || {}), merry_go_round_enabled: merry, loans_enabled: loans };
      window.dispatchEvent(new Event("chama:module-settings-updated"));
      showStatus("Existing feature settings saved.");
    } catch (error) {
      showStatus(error?.message || "Settings could not be saved.", false);
    } finally { setBusy(false); }
  });

  byId("optionalModulesForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    setBusy(true);
    try {
      const modules = Object.fromEntries(moduleKeys.map(key => [key, byId("module-" + key).checked === true]));
      const { data, error } = await supabase.rpc("update_group_optional_modules", { p_group_id: groupId, p_modules: modules });
      if (error) throw error;
      const saved = data && typeof data === "object" ? data : modules;
      context.group = { ...(context.group || {}), modules: saved };
      window.dispatchEvent(new Event("chama:module-settings-updated"));
      showStatus("Module settings saved.");
    } catch (error) {
      showStatus(error?.message || "Module settings could not be saved.", false);
    } finally { setBusy(false); }
  });
}

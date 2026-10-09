import { getDemoToken } from "./demo-session.js";

const SUPABASE_URL = "https://onzaonflquipqmhgslxi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_0jhKFtRCnOx0WDcO3PwcMg_GGsnN3kc";

function tokenOrThrow() {
  const token = getDemoToken();
  if (!token) {
    window.location.replace("./demo.html");
    throw new Error("Your demo session has ended. Open a new sandbox to continue.");
  }
  return token;
}

async function rpc(name, args) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_PUBLISHABLE_KEY,
      "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
    },
    body: JSON.stringify(args)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result?.message || result?.error || `Demo request failed (${response.status}).`;
    throw new Error(message);
  }
  return result;
}

export async function getDemoContext() {
  return rpc("cl_demo_get_context", { p_token: tokenOrThrow() });
}

export async function getDemoRows(tableName) {
  if (!/^[a-z_]+$/.test(tableName)) throw new Error("Invalid demo table name.");
  return rpc("cl_demo_get_rows", { p_token: tokenOrThrow(), p_table_name: tableName });
}

export async function setDemoOverride(tableName, rowId, rowData, operation = "upsert") {
  if (!/^[a-z_]+$/.test(tableName)) throw new Error("Invalid demo table name.");
  if (!/^[0-9a-f-]{36}$/i.test(rowId)) throw new Error("Invalid row ID.");
  if (!["upsert", "delete"].includes(operation)) throw new Error("Invalid demo operation.");
  return rpc("cl_demo_set_override", {
    p_token: tokenOrThrow(),
    p_table_name: tableName,
    p_row_id: rowId,
    p_operation: operation,
    p_row_data: operation === "upsert" ? rowData : null
  });
}

export async function resetDemoChanges() {
  return rpc("cl_demo_reset", { p_token: tokenOrThrow() });
}
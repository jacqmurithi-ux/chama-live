import { supabase } from "./supabase.js";

export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

export async function getMyMember() {
  const { data, error } = await supabase.rpc("get_my_member");
  if (error) throw error;
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function getMyGroups() {
  const { data, error } = await supabase.rpc("get_my_groups");
  if (error) throw error;
  return data ?? [];
}

export async function getCurrentGroupId() {
  const { data, error } = await supabase.rpc("my_group_id");
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "login.html";
}

export function money(value) {
  return `KSh ${Number(value || 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function showError(error) {
  console.error(error);
  const box = document.querySelector("[data-error]");
  if (box) {
    box.textContent = error?.message || "Something went wrong.";
    box.hidden = false;
  }
}

export function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value ?? "—";
}


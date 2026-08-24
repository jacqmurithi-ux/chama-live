import { requireAuth, signOut } from './app.js';
export async function boot() {
  await requireAuth();
  document.querySelector('#logout')?.addEventListener('click', signOut);
}

import { supabase } from "../supabase.js";
import { createApiClient } from "./client.js";

const api = createApiClient(supabase, {
  allowedRpcs: [
    "create_manual_member_fine",
    "cl_fine_create_rule",
    "cl_fine_balance"
  ],
  errorScope: "Fine management"
});

export const finesApi = Object.freeze({
  createManualFine(args) {
    return api.rpc("create_manual_member_fine", args);
  },

  createFineType(args) {
    return api.rpc("cl_fine_create_rule", args);
  },

  getFineBalance(fineId) {
    return api.rpc("cl_fine_balance", {
      p_fine_id: fineId
    });
  }
});

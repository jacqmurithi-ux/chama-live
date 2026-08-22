(function () {
  "use strict";

  /*
   * Chama Live Authentication Helper
   *
   * IMPORTANT:
   * The existing supabase-client.js creates:
   *
   * window.chamaSupabase
   *
   * This file does NOT create another Supabase client.
   */

  function getSupabase() {
    const client = window.chamaSupabase;

    if (!client || !client.auth) {
      throw new Error(
        "Chama Live Supabase client is not initialized. " +
        "Make sure js/supabase-client.js loads before js/supabase-auth.js."
      );
    }

    return client;
  }


  /* ============================================================
     GET CURRENT USER
     ============================================================ */

  async function getCurrentUser() {

    const supabase = getSupabase();

    const {
      data,
      error
    } = await supabase.auth.getUser();

    if (error) {
      throw error;
    }

    return data && data.user
      ? data.user
      : null;
  }


  /* ============================================================
     REQUIRE LOGIN
     ============================================================ */

  async function requireSession() {

    const user =
      await getCurrentUser();

    if (!user) {

      window.location.href =
        "login.html";

      return null;
    }

    return user;
  }


  /* ============================================================
     GET SESSION
     ============================================================ */

  async function getSession() {

    const supabase =
      getSupabase();

    const {
      data,
      error
    } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    return data && data.session
      ? data.session
      : null;
  }


  /* ============================================================
     SIGN OUT
     ============================================================ */

  async function signOut() {

    const supabase =
      getSupabase();

    const {
      error
    } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    window.location.href =
      "login.html";
  }


  /* ============================================================
     EXPOSE HELPERS
     ============================================================ */

  window.chamaAuth = {

    getCurrentUser:
      getCurrentUser,

    getSession:
      getSession,

    requireSession:
      requireSession,

    signOut:
      signOut

  };


  /*
   * Global aliases.
   *
   * These make the functions available to
   * existing Chama Live pages.
   */

  window.getCurrentUser =
    getCurrentUser;

  window.getSession =
    getSession;

  window.requireSession =
    requireSession;

  window.chamaSignOut =
    signOut;


})();

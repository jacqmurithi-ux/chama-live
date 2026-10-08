const entry =
    PAGE_SCRIPTS[page];


  /*
   * Shell-only page.
   *
   * The page is authorized but does not have a
   * feature initializer registered.
   */

  if (!entry) {

    console.info(
      "CHAMA LIVE: Shell-only admin page:",
      page
    );

    return;

  }


  const modulePath =
    entry[0];


  const initializerName =
    entry[1];


  /* ---------------------------------------------------------
     MODULE LOAD DIAGNOSTIC
  --------------------------------------------------------- */

  console.info(
    "CHAMA LIVE: Loading page module:",
    {
      page,
      modulePath,
      initializerName
    }
  );


  let module;


  /* ---------------------------------------------------------
     MODULE IMPORT
  --------------------------------------------------------- */

  try {

    module =
      await import(
        modulePath
      );

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: Page module import failed:",
      {
        page,
        modulePath,
        initializerName,
        name:
          error?.name,
        message:
          error?.message,
        stack:
          error?.stack,
        error
      }
    );


    /*
     * Re-throw the ORIGINAL error.
     *
     * The outer boot() catch will display the same
     * diagnostic without masking the actual problem.
     */

    throw error;

  }


  console.info(
    "CHAMA LIVE: Page module imported successfully:",
    {
      page,
      modulePath
    }
  );


  /* ---------------------------------------------------------
     INITIALIZER RESOLUTION
  --------------------------------------------------------- */

  const initializer =
    module?.[initializerName] ||
    module?.initPage ||
    module?.init;


  if (
    typeof initializer !==
    "function"
  ) {

    const exportedNames =
      module
        ? Object.keys(
            module
          )
        : [];


    console.error(
      "CHAMA LIVE: Page initializer missing:",
      {
        page,
        modulePath,
        expected:
          initializerName,
        exports:
          exportedNames
      }
    );


    throw new Error(
      `No initializer exported for ${page}.`
    );

  }


  /* ---------------------------------------------------------
     INITIALIZER EXECUTION
  --------------------------------------------------------- */

  console.info(
    "CHAMA LIVE: Starting page initializer:",
    {
      page,
      modulePath,
      initializerName
    }
  );


  try {

    await initializer();

  }

  catch (error) {

    console.error(
      "CHAMA LIVE: Page initializer failed:",
      {
        page,
        modulePath,
        initializerName,
        name:
          error?.name,
        message:
          error?.message,
        stack:
          error?.stack,
        error
      }
    );


    throw error;

  }


  console.info(
    "CHAMA LIVE: Page initializer completed:",
    {
      page,
      initializerName
    }
  );

}


/* =========================================================
   HIDE ALL LOADERS
========================================================= */

function hideAdminLoaders() {

  document
    .querySelectorAll(
      "[data-admin-loading]"
    )
    .forEach(
      element => {

        element.hidden =
          true;

      }
    );


  document
    .querySelectorAll(
      "[data-loading], .loading, .page-loading"
    )
    .forEach(
      element => {

        element.hidden =
          true;

      }
    );

}


/* =========================================================
   BOOT ERROR
========================================================= */

function showBootError(
  message,
  stage
) {

  hideAdminLoaders();


  const errorBox =
    document.getElementById(
      "error"
    );


  if (!errorBox) {

    const billingError =
      document.getElementById(
        "billingError"
      );


    if (billingError) {

      billingError.hidden =
        false;


      billingError.textContent =
        `Admin Portal loading failed during ${stage}: ${message}`;

    }


    return;

  }


  errorBox.hidden =
    false;


  errorBox.textContent =
    `Admin Portal loading failed during ${stage}: ${message}`;

}


/* =========================================================
   ADMIN PORTAL BOOT
   ---------------------------------------------------------
   IMPORTANT:
   There is intentionally NO automatic boot at the bottom
   of this file.

   HTML pages must explicitly call:

     import { boot } from "./js/admin-layout.js";
     boot();

   This makes admin-layout.js the single page-shell boot
   owner.
========================================================= */

export async function boot() {

  if (bootStarted) {
    return;
  }


  bootStarted =
    true;


  let stage =
    "authentication";


  try {

    /* -------------------------------------------------------
       APPLICATION CONTEXT
    ------------------------------------------------------- */

    stage =
      "application context";

    context =
      await getMyApplicationContext();

    if (
      !context?.member?.group_id ||
      !context?.user
    ) {
      throw new Error(
        "Your account is not linked to a group."
      );
    }


    context.role =
      String(
        context.role || ""
      )
        .trim()
        .toLowerCase();


    /* -------------------------------------------------------
       GROUP IDENTITY
    ------------------------------------------------------- */

    stage =
      "group identity";


    renderCurrentGroupName();


    /* -------------------------------------------------------
       ADMIN AUTHORIZATION
    ------------------------------------------------------- */

    stage =
      "admin authorization";


    if (
      !isAdminAccount()
    ) {

      window.location.replace(
        "member-dashboard.html"
      );

      return;

    }


    /* -------------------------------------------------------
       PAGE AUTHORIZATION
    ------------------------------------------------------- */

    const page =
      getCurrentPage();


    stage =
      "page authorization";


    if (!ADMIN_PAGES.has(page)) {

      window.location.replace(
        "dashboard.html"
      );

      return;

    }


    /* -------------------------------------------------------
       LAYOUT LOADING FLAG
       -------------------------------------------------------
       Feature modules that retain direct-page compatibility
       can use this flag to avoid duplicate initialization
       when they are loaded by admin-layout.js.
    ------------------------------------------------------- */

    window.__CHAMA_LIVE_LAYOUT_LOADING__ =
      true;

    /*
     * Expose the already-resolved admin context to the
     * page feature without importing admin-layout.js back
     * from the feature module. This prevents a circular
     * ES-module dependency during dynamic page loading.
     */
    window.__CHAMA_LIVE_ADMIN_CONTEXT__ =
      context;


    /* -------------------------------------------------------
       ADMIN NAVIGATION
    ------------------------------------------------------- */

    stage =
      "admin navigation";


    injectStyles();

    renderDesktopNavigation();

    renderMobileNavigation();

    renderMobileBottomNavigation();

    bindAdminLogout();


    /* -------------------------------------------------------
       CURRENT PAGE MODULE
    ------------------------------------------------------- */

    stage =
      `${page} module`;


    await loadCurrentPageFeature();


    /* -------------------------------------------------------
       PAGE READY
    ------------------------------------------------------- */

    hideAdminLoaders();


  }

  catch (error) {

    console.error(
      "CHAMA LIVE Admin Portal boot failed:",
      {
        stage,
        error,
        name:
          error?.name,
        message:
          error?.message,
        stack:
          error?.stack
      }
    );


    let message =
      error?.message ||
      "Unable to load the Admin Portal.";


    /*
     * Browser fetch failures often surface only as
     * "Failed to fetch". Give the user a useful next
     * step without hiding the original diagnostic.
     */

    if (
      String(message)
        .trim()
        .toLowerCase() ===
      "failed to fetch"
    ) {

      message =
        "CHAMA LIVE could not reach the authentication service. Check your internet connection and try again. If the problem continues, refresh the page before signing in again.";

    }


    showBootError(
      message,
      stage
    );

  }


  finally {

    delete window.__CHAMA_LIVE_LAYOUT_LOADING__;

  }

}


/* =========================================================
   LAYOUT STATE
========================================================= */

export function getLayoutState() {

  return {

    ...context,

    portal:
      "admin"

  };

}
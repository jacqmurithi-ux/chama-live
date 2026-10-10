# CHAMA LIVE PWA — Security and Regression Gate

Branch: `feature/pwa-installability`

This is a candidate implementation only. Do not merge or deploy until the checks below have been run against a preview deployment and their results recorded.

## Automated/static checks

- [ ] 1. Manifest is valid JSON and is served as `application/manifest+json` or `application/json`.
- [ ] 2. Manifest includes the required name, short name, start URL, standalone display, white background and green theme.
- [ ] 3. Both manifest icon URLs return HTTP 200 and render at the declared sizes.
- [ ] 4. Icon files are valid and have no external dependencies.
- [ ] 5. `sw.js` is served from the site root with a JavaScript content type.
- [ ] 6. Service worker installs and activates without an unhandled promise rejection.
- [ ] 7. Offline fallback and both icon assets are the only cache entries created by this worker.
- [ ] 8. No authenticated HTML, auth callback, API, Supabase, member, group, contribution, fine, or report response is cached.
- [ ] 9. Non-GET requests are never intercepted.
- [ ] 10. Existing landing-page scripts and links remain intact; no accounting or database code is changed.
- [ ] 11. Browser console has no new errors on the landing page.
- [ ] 12. Installability checks pass in current Android Chrome where supported.
- [ ] 13. Offline navigation shows the offline page, then returns to network navigation after reconnecting.
- [ ] 14. Login, logout, email confirmation, group dashboard, contributions, fines and reports pass regression smoke tests.

## Security constraints

- Do not add offline writes, background sync, local financial storage, or cached authenticated responses.
- Do not change Supabase schema, RPCs, RLS, authentication settings, or accounting code as part of PWA work.
- Do not merge this branch or deploy production until every applicable check is executed and the preview evidence is reviewed.
- SVG icons are used in this candidate. Confirm target-browser installability; if a browser requires PNG icons, add real 192×192 and 512×512 PNG assets before release.

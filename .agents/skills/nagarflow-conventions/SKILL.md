---
name: nagarflow-conventions
description: A skill providing manual knowledge regarding routing, components, and backend integration within the Nagarflow project. Use this whenever modifying data fetching or navigation structures.
---

# Instructions and Knowledge

When tasked with modifying or creating new pages in this workspace:

1. **Frontend**: Always prioritize using `nagarflow-next/app/` for creating new views or altering UI. This repository uses Next.js with functional React components. Do not write raw HTML/JS if it can be a Next.js component.
2. **Icons and UI Assets**: Utilize Lucide React icons over emojis for any iconography across the Next.js frontend to maintain a premium appearance.
3. **External Context**: Before adding new external dependencies, consult the `./resources/dependencies.txt` overview.
4. **Backend Links**: Make sure frontend API calls point directly to the backend Python service via standard fetch APIs or custom hooks (refer to `app.py`).

5. **Authenticated requests**: Use `app/lib/api.ts` `apiFetch` for same-origin API requests; it supplies cookies and CSRF. Do not reintroduce loopback URLs, mock response interception, browser role selection, or passwords in storage.
6. **Access control**: Verified user context comes from `AuthBoundary`; UI gates are convenience only. Enforce new endpoint roles in `auth_service.py`, scope SQL via `database.data_path`, and bind uploaded evidence to authorized tasks.
7. **Provisioning and tests**: Keep trusted CLI provisioning separate from HTTP. New test fixtures must authenticate through real sessions, use isolated databases, and must never disable production authorization.

8. **Fleet lifecycle**: Use `app/lib/dispatch.ts` and the shared active-assignment component. Accept requires a current prediction version; closure requires a dispatch ID. Persist retry keys until a response resolves and surface conflict messages. Never release a truck or synthesize observations from a map animation.
9. **Map and animation output**: Escape external text in Leaflet HTML popups using `htmlText`. Exiting task cards use `useIsPresent` with `aria-hidden` and `inert` so animation clones do not duplicate actionable content for assistive technology.
10. **Reporting**: Missing observations remain null. Operator demand/priority comparisons are score differences, not validated model accuracy. Generate exports from the same current API data and include source definitions.


## Current product architecture (2026-10-17)
Use OPERATIONS.md, AUTHENTICATION.md and DEPLOYMENT.md as current contracts. ingestion.py persists versioned HMAC event-ID receipts before 202; worker.py processes atomically per tenant. Never restore signature-only replay handling. knowledge.py uses approved-only FTS excerpts and aggregate history, not paid generation. forecasting.py fits historical ridge and compares baselines without future leakage. observability.py logs route templates and request IDs, never resident payloads. mfa.py requires the private .mfa-key alongside the control DB; backup_service.py includes it and revokes restored sessions. product_api.py routes use explicit roles, CSRF and tenant storage. Additive migrations must initialize every registered municipality. Browser tests use isolated synthetic fixtures only. Never reintroduce mock API JSON, fabricated weather/performance metrics or cross-tenant resident text indexes.

## Dependency reproducibility
jsPDF 4 ships its own types. Do not install legacy @types/jspdf 1.x: its ambient export assignment masks modern named exports and breaks fresh-checkout production builds. Reproduce CI with npm ci and a fresh .next directory; existing incremental artifacts are insufficient evidence. Keep the PDF browser download journey as runtime validation.

## Animated public homepage
Use landing.module.css for public homepage styles. The city is a deterministic inline SVG, requiring no remote script or rendering dependency. Keep motion decorative, pauseable and disabled for prefers-reduced-motion. Workflow tabs support arrow/Home/End keys with correct tab/panel relationships. Preserve the distinction between illustrative product previews and actual protected records. Verify desktop/mobile overflow, reduced motion, tab interactions and sign-in links after visual edits.

## Motion across workspaces
PageTransition uses a scoped stylesheet and IntersectionObserver/MutationObserver to reveal panels once. Keep content visible without observers; exclude Leaflet/map parents, modal dialogs and nested reveal targets. Never animate live record values or delay form actions. Reduced-motion mode must skip panel entrances and hover translation. Decorative CSS motion on the landing page must remain pauseable, including pseudo-elements; pointer/scroll transforms must also stop when paused.

## Plain language and mobile length
Use short task labels and explain the problem before features. Prefer Report, Assign, Verify to vague slogans or internal algorithm/database language. Keep routine actions visible; put optional setup and methodology behind native details, with meaningful summaries. Preserve safety and data-freshness notices. When adding UI, check mobile page height as well as horizontal overflow. Do not turn forecasts into dozens of expanded zone cards; use the zone selector.

## Persistent Render service
Use the root Dockerfile/render.yaml and scripts/render_service.py for hosted startup. Never run scripts/setup_cloud.sh as a production entrypoint or seed demo data. Next standalone forwards same-origin APIs to loopback5000; launcher supervises Next, Gunicorn and worker, handling failure/signals as a unit. Keep persistent data and private .mfa-key on the mounted disk. Administrator CLI mode must use the same bootstrap/permissions as server startup. Validate process cleanup and container restart persistence when changing this path.

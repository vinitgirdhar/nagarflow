# Product implementation roadmap

Implemented and locally verified:

- Municipality isolation, protected sessions, CSRF, roles, account/team administration and administrator MFA.
- Transactional dispatch, arrival/cancellation, field evidence, supervisor approval and audited observation corrections.
- Signed durable intake, atomic retries, dead letters, review and privacy-safe request correlation.
- Approved-document retrieval with citations and abstention; aggregate complaint history without resident text.
- Rolling-origin forecast comparisons, fitted ridge regression, explicit stale/insufficient-data states and deterministic scenario planning.
- Connected complaint review, work orders, crew assignment, fleet registration, responsive landing page and honest weather/map fallback states.
- Backup/restore tooling, production entrypoints, readiness checks and CI configuration.

See IMPLEMENTATION_REPORT.md for verification, OPERATIONS.md for behavior and EVALUATION.md for measured limits.

Remaining launch gates require the actual deployment: initial administrator provisioning/enrollment, persistent host paths and HTTPS domain, provider credentials and native-signature gateway mapping, permitted provider networking, backup restore drill on the target host and operator acceptance with representative data. CI is configured but remote execution is unverified. No live paid generation or semantic embedding service is configured. Forecasts need representative operational evaluation before dispatch policy depends on them.

Subsequent product choices: organization SSO/invitations, retention policy automation, externally monitored service-level objectives, calibrated forecast uncertainty and measured retrieval expansion. These require organizational requirements or representative data rather than invented production claims.

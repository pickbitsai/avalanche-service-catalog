<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits. -->

# Security policy

Report vulnerabilities through GitHub private vulnerability reporting on this repository. Include the affected version, Node/OS versions and a minimal synthetic reproduction. Do not attach real request data, credentials, command output or private configs. Version 0.1.0 and the latest default branch are supported.

The desk has no authentication. It binds only 127.0.0.1 and must remain local. Do not expose it using reverse proxies or tunnels. Exact Host validation, a fresh per-process token and mandatory same-origin Origin on POSTs protect against browser cross-origin requests and DNS rebinding. They do not authenticate local people or processes. Reading the page reveals the token; reading the API reveals the request ledger. All mutations use the configured startup actor.

Requests have a 1 MiB byte limit. Browser assets are local, with no inline JavaScript, inline event handlers, CDN fonts, analytics or telemetry. CSP, nosniff, same-origin referrer policy and frame denial apply to all responses. The server only serves allowlisted assets.

Config modules are executable, trusted owner code. Producers are trusted commands run as the current operating-system account with shell:false and an inherited environment. Values occupy individual arguments and leading hyphens are rejected. This is not a sandbox for untrusted config authors or arbitrary executables. Configure producers' own output/data paths outside the repository. Timeouts stop the direct child; descendant processes may survive.

The optional estate source only supplies selector ids. Missing or malformed files disable the source. Paths, server commands and scheduled jobs in the estate file are not executed.

The database schema is unchanged; events are guarded against updates/deletion. Database writes and external commands are not one transaction. Process termination can leave a submitted row, or a destination record whose reference was not saved. No retry occurs automatically. Inspect the destination and ledger before resubmission to avoid duplicates.

Store real config, SQLite, exports, reports, logs and caches in the private data directory. Use host permissions and private backups. Only synthetic records belong in this repository. Run preflight before publishing; its generic leakscan complements an external private-name review.

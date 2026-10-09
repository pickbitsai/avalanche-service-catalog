<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits. -->

How do I give my team and my AI agents one place to request a ticket, a change or a new initiative, with the right form and a reference back, without a hosted portal? Run Avalanche Service Catalog locally: define the forms, connect each one to a command, and keep the request, actor, outcome and returned reference in a SQLite ledger you own.

## What it does

Avalanche Service Catalog 0.1.0 is a ServiceNow-shaped intake module with a CLI and a local browser desk. Both call the same library functions. Dynamic forms support strings, text, choices, booleans, dates, estate references and conditional fields. Validation happens before a request is recorded. A producer runs without a shell; its successful stdout supplies the destination reference. Failure output remains available for inspection. SQLite events are append-only and actor-attributed.

Node 22.13+ (Node 22+) is required for ESM and built-in SQLite. There are zero runtime dependencies, no telemetry, and no external browser assets. All demonstration people, businesses and data are synthetic. Juniper Trail Studio is a fictional two-person software and content shop in Flagstaff, Arizona.

## What it does not do

This is not a hosted portal, authentication system, workflow approval engine, background queue or destination ticket database. It does not synchronize destination status, automatically retry commands, or provide atomic transactions across systems. The included echo producer prints a reference; it does not create a real ticket. A crash after a producer acts can leave a request submitted without its reference. Inspect the destination before manually submitting again.

## Five-minute start

~~~sh
npm ci
npm run demo
~~~

Open **http://127.0.0.1:4179/**. The desk displays a DEMO banner and eight forms. Requests shows 41 entries over the last 60 days, including failed and interrupted work. The founders are Priya Natarajan and Owen Castellanos; the agents are scout, builder and scribe. Click a request number to inspect its variables and event history. See [DEMO.md](DEMO.md) for a 60-second walkthrough.

Stop with Ctrl+C. To reseed after stopping the desk:

~~~sh
npm run demo -- --reset
~~~

The demo uses ignored .test-tmp/demo/ or the explicit --data-dir value. It ignores instance config, user and data-directory environment variables. A desk port override still applies. Reset replaces only known demo files and requires a matching demo marker; a customized non-demo config or populated directory is refused. Keep other instances stopped before resetting.

For your own instance:

~~~sh
npm exec -- avalanche-catalog init
npm exec -- avalanche-catalog list
npm exec -- avalanche-catalog show report-an-issue
npm exec -- avalanche-catalog submit report-an-issue --actor agent:scout --var "title=Review a stalled export" --var product=trail-notes
npm exec -- avalanche-catalog requests --json
npm exec -- avalanche-catalog request REQ0001 --json
npm exec -- avalanche-catalog desk
~~~

Every command accepts --data-dir. The bin is avalanche-catalog; direct execution with node bin/catalog.mjs also works. npm run desk uses the same entry point and accepts --data-dir and --actor after --. Read commands do not bind ports; request reads require an initialized database. JSON list output is an object with items or requests plus stamp; individual JSON results include stamp. Redirect exports to a location inside your data directory.

## Data and configuration

Data-directory precedence is **--data-dir > AVALANCHE_CATALOG_DATA_DIR > platform default**. On Windows the default is new/avalanche-data/service-catalog on the drive containing the user's home directory. Elsewhere it is ~/.local/share/avalanche/service-catalog, resolved with os.homedir(). Help and desk startup print the resolved absolute path. The directory is created on first run. Code-tree locations are rejected, including through existing symlinks; .test-tmp is the explicit test/demo exception.

The real config lives at &lt;dataDir&gt;/config.mjs. init copies [config.example.mjs](config.example.mjs) without overwriting an existing config and initializes the database. A missing config falls back to the example with a one-line notice. AVALANCHE_CATALOG_CONFIG selects another trusted config file; a missing explicit override is an error. Config is executable JavaScript, read once per process: restart after changes.

The database, SQLite sidecar files, real config, exports, reports, logs and caches belong outside the code checkout. No legacy database environment override bypasses the data directory. The example has no machine-specific paths. The old registry location, producer directories, port-check command and actor identity are not shipped.

| Config key | Meaning |
| --- | --- |
| name | CLI display name. |
| db | Filename or nested path within the data directory; paths escaping it are rejected. |
| actors.default | Optional default actor. Omit it to use the operating-system username. |
| requestNumbers.prefix | Uppercase letters, digits or hyphens, beginning with a letter. |
| requestNumbers.width | Numeric padding, 1–16. |
| requestNumbers.startsAt | Positive first sequence value for a fresh database. |
| sources.estate.path | Optional JSON file; relative to config.mjs. Empty or absent disables selectors from this source. |
| desk.port | Allocated port, 4179 by default; AVALANCHE_CATALOG_DESK_PORT overrides it. There is no scanning or automatic fallback. |
| desk.title | Desk page title and header. |
| producers | Named trusted commands; each item selects one by destination. |
| producers.*.argv | Executable and argument array. Whole-element placeholders, such as {title}, receive one validated value each. |
| producers.*.cwd | Working directory, relative to config.mjs; @module explicitly selects installed code for the bundled echo script. Configure other commands to use their private working directory. |
| producers.*.timeoutMs | Positive integer timeout, at most the Node timer limit. Applies to the direct child. |
| producers.*.refPattern | Regular expression or expression string matching the full reference in stdout. Zero exit and a matching reference are both required. |
| items | Array of catalog form definitions. |
| items[].id | Unique kebab-case identifier. |
| items[].name, short_description, category | Card title, description and grouping. |
| items[].destination | Key in producers. |
| items[].producerArgs | Map from argv placeholder name to variable name; unmapped/unused entries are rejected. |
| items[].variables | Ordered field definitions described below. |

| Variable key | Meaning |
| --- | --- |
| name | Unique lower snake_case field name. |
| label | Visible field label. |
| type | string, text, choice, boolean, date or reference. |
| mandatory | Boolean; required only while the field is visible. False is a valid boolean answer. |
| default | Optional initial value. |
| help | Optional explanatory text. |
| choices[].value, choices[].label | Legal values and labels for a choice field. |
| reference | Must be engine for reference fields. |
| visibleIf.variable, visibleIf.equals | Show this field when another field's value matches; hidden values are discarded. |

Only mapped variables reach the command; other answers stay in the ledger. Optional absent mapped values remove the immediately preceding --flag. Put an optional placeholder immediately after its flag. User values cannot begin with a hyphen and never become shell fragments. Commands inherit the process environment; configure the destination's data directory and identity as that CLI requires. The request actor is recorded locally and is not implicitly forwarded to another CLI.

Actor precedence is **--actor > AVALANCHE_CATALOG_USER > actors.default > human: plus os.userInfo().username**. Desk mutations use the actor selected at startup. This is attribution, not authenticated identity.

## Optional estate source

The former required engines registry is now sources.estate. Missing, unreadable or malformed files disable the source with a clear message; other forms continue to work. The desk reads selectors at startup. Empty selectors do not prevent forms using local product choices; a mandatory engine field requires a configured valid source.

[examples/estate.example.json](examples/estate.example.json) contains eight fictional engines with ports in 4300–4399. It describes files and jobs; Catalog never starts them, binds those ports, visits their URLs, or executes their commands.

The JSON root has engines[] and may have company. Each engine has id, owner, dir, name, note, url, and servers[] entries with port, what and start. Optional satellites[] entries have port and url. Optional jobs[] entries have id, schedule, actor and command; schedule is descriptive text. Catalog consumes only non-empty engine ids; the remaining fields make the file useful as a documented estate interchange format.

## Connect destination CLIs

Install the destination CLI on PATH. In your private config, replace an echo producer's argv, cwd, timeoutMs and refPattern, then point the item's destination at that producer key. No destination source checkout or sibling import is required.

These are command templates: replace the uppercase command placeholder with the executable advertised by the destination module, and confirm its subcommands, flags and printed reference using its --help before enabling it.

| Destination | Illustrative argv |
| --- | --- |
| Avalanche Service Desk | ['SERVICE_DESK_COMMAND', 'new', '--project', '{product}', '--title', '{title}', '--detail', '{detail}'] |
| Avalanche Customer Cases | ['CUSTOMER_CASES_COMMAND', 'new', '--account', '{account}', '--title', '{title}'] |
| Avalanche Roadmap | ['ROADMAP_COMMAND', 'demand', 'new', '--title', '{title}', '--requester', '{requester}'] |

Add the corresponding form variables and producerArgs mappings, use a refPattern matching that command's output, and set cwd to a private working directory. Existing local product choices do not guarantee valid destination project or account ids. On Windows, shell:false does not launch .cmd/.bat shims: use an executable CLI launcher, or node with the CLI entry point supplied in your private config. Commands are trusted owner configuration and can do anything your account can do.

## How it fits the suite

Avalanche Service Desk · Avalanche Roadmap · Avalanche Customer Cases · Avalanche Estate Map · Avalanche Assets & Spend · Avalanche Service Catalog.

## Security and operational limits

The desk binds **127.0.0.1 only**, with no login or user authentication. Do not expose it through a proxy, tunnel or public interface. Every request must use Host 127.0.0.1:&lt;port&gt; or localhost:&lt;port&gt;. Every POST also needs the per-process page token and an exact matching Origin. Bodies are limited to 1 MiB. The CSP excludes inline scripts and styles; other headers prevent MIME sniffing and framing and restrict referrers to the same origin.

Any local process or browser user able to read the desk can access records and obtain its token. Owner-controlled config, producers and the data directory are trusted. Output and form text are escaped in the browser. The server serves only its page and two allowlisted assets; it is not a filesystem browser.

SQLite uses WAL and a busy timeout; events reject UPDATE and DELETE. The original requests/events/sequences schema and lib/panel.mjs contract (id, title, nav, collect, stat, render) are preserved; collect returns null for a missing/unreadable database. There is no retention or backup automation. Protect the data directory with operating-system permissions and keep backups. Producer output retained per request is bounded to 4,000 characters; reference capture uses up to 64,000 characters per stream. Timeout terminates the direct child, not an arbitrary descendant process tree.

## Verification

~~~sh
npm test
npm run leakscan
node test/consumer-install.mjs
npm run preflight
~~~

Preflight runs tests, leakscan and consumer install in that order. Unit tests prohibit network use and port binding and use .test-tmp. Consumer install copies only git-trackable files into .test-tmp/consumer/, runs npm ci --offline with the normal npm cache, executes the installed bin's help and init, seeds a demo without serving, then reads list and requests. No test binds a port. Headers cover first-party source files; JSON is data/metadata and cannot contain comments. The executable bin keeps its required shebang before the two-line SPDX header.

Leakscan uses only generic path, domain, credential, phone and email rules. Its forbidden patterns never embed private people or business names. An external private scanner is needed to detect private names. No root index.html is shipped: it is ignored external build output, separate from the desk page.

Apache-2.0. Copyright 2026 Mark Pickering and PICKBITS LLC. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [SECURITY.md](SECURITY.md).

Questions and bugs: open a GitHub issue.

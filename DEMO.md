<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Service Catalog by PickBits. -->

# A 60-second walkthrough

Run npm ci, then npm run demo. Open http://127.0.0.1:4179/. All demo people, businesses and data are synthetic.

Juniper Trail Studio is a two-person software and content shop in Flagstaff, Arizona. Priya Natarajan and Owen Castellanos run eight small products and services with agent:scout, agent:builder and agent:scribe.

| Time | Show |
| --- | --- |
| 0–10 seconds | Show the DEMO banner and the eight catalog forms grouped into Operate, Support, Plan and Create. |
| 10–25 seconds | Open Request a change. Select a product, enable Schedule a window and show the date field appearing. Enter a title and date. |
| 25–35 seconds | Submit. The bundled echo command prints a JTS reference, which is captured beside the REQ number. No destination service is contacted. |
| 35–50 seconds | Open Requests. Click the new reference to inspect the variables, actor and two audit events. Expand a failed request's output. |
| 50–60 seconds | Find REQ0041, left submitted after a worker interruption. Explain why a human checks the destination before resubmitting. |

The seed contains 41 requests across 59 days: 38 fulfilled, two failed at a closed publishing window, and one interrupted. All eight forms and all five actors appear. The estate example fills optional selectors without starting any of its described services or jobs.

The demo stays in .test-tmp/demo/ by default. Use --data-dir to choose another isolated directory. Reusing it preserves new requests. Stop the desk with Ctrl+C before npm run demo -- --reset. Reset replaces only the known demo artifacts and preserves unrelated files. It refuses a populated non-demo directory or customized non-demo config.

For a CLI-only walkthrough, run npm run demo -- --seed-only, then node bin/catalog.mjs requests --data-dir .test-tmp/demo --json. This binds no port. All exported records and the desk footer carry “Made with Avalanche Service Catalog by PickBits”.

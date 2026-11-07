# Validation design

| Requirement | Evidence |
|---|---|
| Authorization precedes data access | API tests count reader calls for anonymous, legacy, wrong-scope, and accepted owner requests |
| Data remains bounded and minimized | Schema tests for byte/count limits, invalid dates, dangling references, URL rules, and omitted extra fields |
| Health never becomes falsely current | State tests for missing observations, expiry, and preserved producer times |
| Recently modified work includes honest closure states | State tests for update ordering, time windows, completion versus not-planned closure |
| Society integration retains its private boundary | Route, private asset manifest, shell, and loader tests |
| Phone experience is graphical and operable | Browser QA at 390 pixels: overview, repo expansion, issue selection, resource metrics, filters, keyboard, and text alternative |
| Private requests end with the view lifecycle | Controller/API abort checks and route deactivation review |
| No cloud mutation or live-data claim | Diff review: no infrastructure/workflow/grant changes; runtime empty/unavailable states and test-only fixtures |

Run `node --test tests/fleet-state.test.mjs tests/operator-fleet-api.test.mjs`
first, then affected companion/auth/asset tests and root public-CI contracts.
Record actual outcomes in `tasks.md` and the current source map. Browser QA uses
the actual modules with synthetic fixtures, not production auth bypass code.

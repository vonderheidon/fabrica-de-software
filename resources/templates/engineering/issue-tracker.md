# Issue tracker: GitHub

Issues and specifications live in GitHub Issues. Use the `gh` CLI in this repository; resolve the repository from its configured GitHub remote. If no remote exists, ask the operator to configure it before tracker operations.

- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels`.
- Publishing a ticket means creating a GitHub issue, with authorization for that write. Pass multiline content using `--body-file`.
- Use native sub-issues and blocking dependencies when available; otherwise record `Part of #<parent>` and `Blocked by: #<number>` explicitly in the issue body.
- Claiming, commenting, applying labels and closing issues are remote writes and require the corresponding authorization.

## Pull requests as a triage surface

**PRs as a request surface: no.**

Triage labels do not replace the factory's Ready, exclusive assignee and Project membership requirements. Scaffold does not create labels, issues or Projects.

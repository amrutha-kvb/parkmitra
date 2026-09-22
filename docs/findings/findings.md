# Findings log — parkmitra

Format follows the Niha Build Challenge finding template. Entries are appended in the
order they were observed; nothing here is backfilled after the fact.

---

## F-01: `niha doctor` tells you to run `niha init`, but a brand-new project can't succeed with it

- **Severity:** S3
- **Phase:** 0 — Setup
- **Scenario:** Task understanding / first-run setup (exact scenario ID pending — master
  scenario list not yet located; will update once available)
- **Area:** onboarding — doctor / init
- **Frequency:** 2/2 (reproduced on first attempt with `niha init --no-launch --verbose`,
  and again with `niha init --name "parkmitra" --verbose`)
- **Environment:** macOS (Darwin 25.2.0), niha v1.3.7, git 2.50.1, fresh empty repo,
  no prior `.niha/` state

### Steps
1. Fresh project folder, `git init`, no remote yet.
2. Run `niha doctor`.
3. Doctor reports a warning: `! Workspace — no .niha/workspace.yaml in cwd (run niha init to connect a workspace)`.
4. Follow that instruction: run `niha init --no-launch --verbose`.

### Expected
Either `niha init` succeeds in connecting/creating a workspace, matching what doctor's
own hint implies is the next step — or doctor's hint mentions the actual prerequisites
up front.

### Actual (verbatim)
```
$ niha doctor
  ...
  ! Workspace — no .niha/workspace.yaml in cwd (run `niha init` to connect a workspace)
  ...

$ niha init --no-launch --verbose
No git remote found. Use --workspace-id to connect directly.
  ⠋ Detecting workspace from git remote...
Error: No matching workspace for this repo (no remote).
Create one in the web console:
  https://app.nihaandco.com/workspaces/new

Then re-run: niha init --workspace-id <id>
```
After adding a git remote (`gh repo create ... --source=. --remote=origin`) and retrying:
```
$ niha init --no-launch --verbose
  ⠋ Detecting workspace from git remote...
Error: No matching workspace for this repo (amrutha-kvb/parkmitra).
Create one in the web console:
  https://app.nihaandco.com/workspaces/new

Then re-run: niha init --workspace-id <id>
```
Separately, the CLI's own setup guide (ai-challenge.techatcore.com/setup, Step 5) states:
*"Do not run niha init as this is unnecessary"* — directly contradicting doctor's hint,
for what is presented as the same first-run scenario.

### Impact
A new user following doctor's own suggested next step hits an error that doesn't explain
the real prerequisite (a workspace must already exist in the web console, and a git
remote must already be configured) — and the CLI's own setup documentation tells them not
to take this step at all. Cost: several minutes of confusion resolving which guidance to
trust, plus a false start (my case: 4-5 minutes across two `init` attempts before the real
blocker in F-02 was found).

### Suggested fix
Either: (a) have `niha doctor`'s workspace warning name the actual prerequisites
("no remote configured" / "no workspace exists yet — create one at <url> first"), so it
doesn't send users into a guaranteed failure, or (b) reconcile the setup guide's
"don't run niha init" guidance with doctor's "run niha init" guidance so they don't
contradict each other for the same first-run state.

### Disposition
FILED — not yet fixed (requires access to the `ai-platform` CLI source to patch the
doctor warning / help text; targeting this as a fix-PR candidate once workspace access
is unblocked).

---

## F-02: Workspace creation is a dead-end loop for the `developer` role

- **Severity:** S2
- **Phase:** 0 — Setup
- **Scenario:** Task understanding / first-run setup (exact scenario ID pending)
- **Area:** platform web console — workspace creation / org settings permissions
- **Frequency:** 1/1 so far (role-gated behavior, expected to be deterministic —
  not yet retried a second time)
- **Environment:** app.nihaandco.com, Chrome, account amrutha.korumilli@techatcore.com,
  org "AI Challenge Q3 2026", role: developer

### Steps
1. Go to https://app.nihaandco.com/workspaces/new (per F-01's own error message).
2. The page states: *"The niha GitHub App isn't connected for this organisation yet.
   Install it from Settings → Integrations and choose which repositories to grant, then
   come back here to create this workspace."* with a "Connect GitHub in Settings →" button.
3. Click through to Settings → Integrations.

### Expected
A `developer`-role user should either be able to complete this setup step themselves
(it's presented as a normal, expected part of onboarding a new project), or the
workspace-creation page shouldn't route them to a page their role can't use without
saying so up front.

### Actual (verbatim)
Settings → Integrations page:
```
Access restricted
Your role (developer) does not have permission to view this page.
Contact your org admin to request access.
```

### Impact
Full dead end for any `developer`-role participant trying to connect a new project to a
workspace: the only documented path to create a workspace requires a page that role
cannot open. No self-service workaround exists — requires an org admin to either connect
the GitHub App or grant elevated access. This blocks workspace-linked features (governance
via `niha assess`, rules/agent sync) for the entire challenge cohort if nobody's GitHub
App is pre-connected, though it does not block using the CLI itself (bare `niha` still
works without a workspace).

### Suggested fix
Either: (a) let workspace creation for a repo the user already owns/administers on GitHub
proceed without requiring an *org-level* GitHub App connection first, or (b) surface the
permission requirement on the `workspaces/new` page itself before sending the user into
Settings → Integrations, or (c) grant the `developer` role read access to see integration
status (even if not edit access) so this isn't a silent wall.

### Disposition
FIXED (PR niha-and-co/ai-platform#1011, closes issue #1010) — pending merge and demo video.

**Update, 2026-09-22:** raised with the challenge team; their response confirmed
workspace creation being admin-only is by design ("you will not have permission to
create workspace as a developer... use niha CLI to build/develop anything and report
your observations"). That narrows this finding: the *root* ask in the original
"Suggested fix" (letting developers self-serve workspace creation) is out of scope —
it's intentional. The defect that remains, and the one the PR fixes, is narrower but
still real: `WorkspaceSetupPage.tsx` showed the "Connect GitHub in Settings" button and
message to every role, including ones that can never complete that step, instead of
telling them up front to ask an admin. Confirmed via source: the code's own comment
above `handleConnectProvider` says "send the admin there" — the intent was always
admin-only, it just was never actually checked. Fix: gate that specific UI on
`isAdminRole()`, matching the pattern already used in `OrgSettingsLayout.tsx`.

Building proceeds locally without a linked workspace per the team's guidance — bare
`niha` works fine unlinked, as F-01 already showed.

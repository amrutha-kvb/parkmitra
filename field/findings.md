# Field findings — parkmitra

Mandatory finding format. Blocks are appended the day they happen; nothing here is
reconstructed after the fact. Every `Actual` block is terminal output pasted verbatim.

Issues are filed at `niha-and-co/ai-platform` with labels `niha-cli,finding,challenge-q3`.

---

### F-01  `niha doctor` tells you to run `niha init`, which the setup guide explicitly forbids and which cannot succeed for a challenge participant
Severity:    S2
Area:        onboarding — doctor / init
Scenario:    none
Frequency:   every time (3/3)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh, niha v1.3.7
Phase:       0, set up
Steps:
  1. mkdir parkmitra && cd parkmitra && git init
  2. niha doctor
  3. niha init --no-launch --verbose
Expected:    doctor's workspace hint points at the path the setup guide actually prescribes (just run `niha`, the workspace provisions itself silently on first write).
Actual:
  $ niha doctor
    ✓ Platform API — https://api.nihaandco.com
    ✓ Credentials — JWT verified by https://api.nihaandco.com/api/v1/auth/me (amrutha.korumilli@techatcore.com)
    ✓ State dir — /Users/amruthakorumilli/.niha
    ! Workspace — no .niha/workspace.yaml in cwd (run `niha init` to connect a workspace)
    ✓ Git — git version 2.50.1 (Apple Git-155) (no remote)
    ✓ Active context — org=AI Challenge Q3 2026

  $ niha init --no-launch --verbose
  No git remote found. Use --workspace-id to connect directly.
    ⠋ Detecting workspace from git remote...
  Error: No matching workspace for this repo (no remote).
  Create one in the web console:
    https://app.nihaandco.com/workspaces/new

  Then re-run: niha init --workspace-id <id>

  $ git remote add origin https://github.com/amrutha-kvb/parkmitra.git
  $ niha init --no-launch --verbose
    ⠋ Detecting workspace from git remote...
  Error: No matching workspace for this repo (amrutha-kvb/parkmitra).
  Create one in the web console:
    https://app.nihaandco.com/workspaces/new

  Then re-run: niha init --workspace-id <id>
Impact:      ~35 minutes lost. doctor's hint is the only in-product guidance at that
             moment, so I followed it, assumed a workspace was a prerequisite, and went
             to the web console it named — which is a dead end for this role (see F-02).
             The setup guide says the opposite in Step 5: "Do not run niha init. Do not
             create a workspace in the web console. Neither is needed for the challenge,
             and running them will point you at the wrong thing." doctor points you at
             exactly the wrong thing.
Suggested:   Make doctor's workspace line non-directive when no workspace is linked, e.g.
             "no workspace linked yet — it is created automatically the first time niha
             writes a file in this project", and drop the `run niha init` instruction for
             users who are bringing their own repo. Reserve the init hint for the case it
             was designed for (joining a repo to an admin-built workspace).
Disposition: FILED (#1012)

---

### F-02  Workspace setup offers every role a "Connect GitHub in Settings" button that routes non-admins into a page their role cannot open
Severity:    S2
Area:        platform web console — workspace-setup / org settings permissions
Scenario:    none
Frequency:   every time (1/1 observed; role-gated in router.tsx, so deterministic)
Environment: macOS 26.2 (Darwin 25.2.0), Chrome 152, app.nihaandco.com, role: developer
Phase:       0, set up
Steps:
  1. Sign in to app.nihaandco.com as a developer-role user, in an org where the niha GitHub App is not connected
  2. Open https://app.nihaandco.com/workspaces/new
  3. Click "Connect GitHub in Settings →"
Expected:    a role that cannot complete this step is not offered a button that leads into it.
Actual:
  /workspaces/new:
  The niha GitHub App isn't connected for this organisation yet. Install it from
  Settings → Integrations and choose which repositories to grant, then come back
  here to create this workspace.
  [ Connect GitHub in Settings → ]

  after clicking, /settings/integrations:
  Access restricted
  Your role (developer) does not have permission to view this page.
  Contact your org admin to request access.
Impact:      ~20 minutes lost assuming I had mis-set something in my own account, before
             reading router.tsx and finding /settings/integrations is gated
             `RequireRole roles={["admin"]}`. The code already knew: the comment above
             `handleConnectProvider` in WorkspaceSetupPage.tsx says "send the admin
             there" — the role is simply never checked before rendering the button.
Suggested:   Gate the GitHub connect prompt on `isAdminRole()` (the helper already exists
             in `@/lib/roles` and is used this way in OrgSettingsLayout.tsx). Non-admins
             get an "ask an org admin to connect it" message and no button.
Disposition: FIXED (PR #1011)

Note: the challenge team confirmed separately (2026-09-22) that developers are not meant
to create workspaces at all, which matches the setup guide. That makes the root request
in F-01/F-02 out of scope by design — but the misleading affordance in F-02, and the
misleading hint in F-01, are both still real and still cost time.

---

### F-03  Every model-backed call fails instantly: provider reports the API usage limit is exhausted until a date after the challenge deadline
Severity:    S1
Area:        provider / model routing — `niha ask` and interactive session
Scenario:    none
Frequency:   every time (8/8, across two independent code paths and two machines-of-entry: my shell and the interactive REPL)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh, niha v1.3.7
Phase:       0, set up
Steps:
  1. cd parkmitra
  2. niha ask "say hi"
  3. niha        # then type any prompt at the interactive prompt, e.g. "create UI"
Expected:    the model answers, or the CLI reports a quota problem in its own words with a path forward.
Actual:
  $ niha ask "say hi"
  Error: Provider error: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.'}, 'request_id': 'req_011CfJXCUPG5x7ZTwJ6k2baC'}

  $ niha
  niha · sonnet-4-6 · 0 tools · off mode
  /help for commands · Quickstart: https://docs.nihaandco.com/playbooks/quickstart · Ctrl+V to paste an image · Ctrl+C to interrupt · Ctrl+D to exit
  Organisation permission policy v0 — 0 deny / 0 ask, mode ceiling auto

  › create UI
    Error: Provider error: BadRequestError: Error code: 400 - {'type': 'error', 'error': {'type': 'invalid_request_error', 'message': 'You have reached your specified API usage limits. You will regain access on 2026-10-01 at 00:00 UTC.'}, 'request_id': 'req_011CfJZVAVwa5A45HR8SvrsA'}
    1s · $0.00

  Non-model commands are unaffected in the same shell, same minute:
  $ niha doctor
    ✓ Platform API — https://api.nihaandco.com
    ✓ Credentials — JWT verified by https://api.nihaandco.com/api/v1/auth/me (amrutha.korumilli@techatcore.com)
    ✓ Active context — org=AI Challenge Q3 2026
    ✓ 5 passed, 1 warning
Impact:      Total block on the core of the tool, and therefore on the programme's own
             premise: niha cannot write a file, run a command, or answer a question. The
             stated reset, 2026-10-01, is six days after submissions close on 2026-09-25,
             so it does not self-clear inside the challenge. Two scoring criteria depend
             on model use that is currently impossible: findings from the build phase,
             and the long-session protocol (3×2h, 1×4h, 1 resumed). Escalated the same
             day per the T1 rule rather than continuing to retry.
Suggested:   Two separate changes. (a) Operational: raise or reset the provider budget for
             the AI Challenge Q3 2026 org before 2026-09-25, and check whether the budget
             is shared across participants — if it is, every participant is blocked by
             whoever spends first. (b) Product: the CLI should recognise a quota/usage-limit
             error and say so in its own words ("your organisation's model budget is
             exhausted until <date>; ask your org admin to raise it") instead of surfacing
             a raw provider stack trace, and the suggested remedy it currently prints,
             `Run: niha platform start`, is for a local-platform scenario and is wrong
             advice for a hosted user.
Disposition: FILED (#1013)

Tier: T1 — blocks the project entirely, no workaround. Not fixable in the CLI repo by me:
the budget itself is an org/provider setting. The CLI-side half (error mapping and the
wrong remedy hint) is a real code defect and is a fix-PR candidate.

---

### F-04  Interactive session reports `0 tools`, where the setup guide's example shows `14 tools`
Severity:    S2
Area:        interactive session — tool registry
Scenario:    none
Frequency:   every time (5/5)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh, niha v1.3.7
Phase:       0, set up
Steps:
  1. cd parkmitra          # a git repo with a remote, signed in, doctor green
  2. niha
  3. read the header line
Expected:    a tool count matching a working session — the setup guide's own example shows `14 tools`.
Actual:
  $ niha
  niha · sonnet-4-6 · 0 tools · off mode

  setup guide, Step 5, for comparison:
  niha · claude-sonnet-5 · 14 tools · off mode
Impact:      Unclear whether this is cosmetic or means the session genuinely has no
             file/shell tools registered — which would make building impossible even
             after F-03 is lifted. Could not separate the two while F-03 blocks every
             turn, since no turn ever reaches tool selection. Recording it now rather
             than waiting, per the same-day rule. The model name also differs from the
             documented example (`sonnet-4-6` vs `claude-sonnet-5`), which may just be
             doc drift.
Suggested:   Confirm whether the tool registry is empty or merely unreported in the
             header when no workspace is linked; if the former, that is the real defect
             and the header is only the symptom. Update the setup guide's example if the
             model name has moved on.
Disposition: FILED (#1014)

Tier: T2 — cannot be characterised further until F-03 is lifted.

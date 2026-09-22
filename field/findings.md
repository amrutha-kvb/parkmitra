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

### F-02  WITHDRAWN — out of scope for this challenge
This block described a real defect in the platform **web console**
(`src/web/src/pages/workspace-setup/WorkspaceSetupPage.tsx`): a "Connect GitHub in
Settings" button shown to every role, routing non-admins into an admin-only page.

It is withdrawn from the numbered findings because the challenge scopes findings to the
CLI — `CLI_PATH = 'src/cli-ink'`, and the mandatory `niha-cli` label reads "Defect or
request in the Niha CLI (src/cli-ink)". A web-console defect does not meet that.

The work is not discarded and is not claimed here: issue #1010 and PR #1011 remain open
as an ordinary good-faith contribution to the platform, with the `challenge-q3` label
removed so it is not counted as a challenge finding. Numbering is left with a gap rather
than resequenced, because each filed issue carries its own F-number in its body and the
report and the issues must keep saying the same thing.

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

---

### F-05  User-scope personal skills from another tool's home directory are listed under a heading called "Team skills"
Severity:    S3
Area:        interactive session — /help, skill discovery
Scenario:    none
Frequency:   every time (2/2, once by hand and once in a clean scripted session)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh, niha v1.3.7
Phase:       0, set up
Steps:
  1. Have at least one skill in ~/.claude/skills/<name>/SKILL.md (Claude Code's user skills directory)
  2. cd into any project and run: niha
  3. /help
Expected:    a skill loaded from the current user's own machine is presented as personal and local, not under a team/org heading.
Actual:
  $ niha
  $ /help
  ...
    Team skills
      /business-site — Generate a complete local-business website ... [personal skill]
      /car-rental-site — Generate a complete, ready-to-pitch car rental website ... [personal skill]
  Type / to see all commands
Impact:      No time lost, but the label is contradictory on its own line: the item is
             tagged "[personal skill]" while sitting under "Team skills". For a
             governance product this matters more than cosmetics — skill origin is a
             trust boundary in the code itself (`skillSearchRoots` assigns
             org:"approved", project:"local", user:"local"), and the display collapses
             that distinction. A reader can reasonably conclude either that the org
             approved this skill, or that their private skill is visible to their team.
             Neither is true.
Suggested:   Title the category by origin rather than a single fixed string — "Team
             skills" only for org-scope (trust: approved), and "Personal skills" /
             "Project skills" for user- and project-scope. `ORIGIN_LABEL` already holds
             the right words; the heading just does not use them.
Disposition: FILED (#1015)

Tier: T3 — cosmetic, recorded not fixed.

Context, deliberately recorded so this is not mistaken for a security claim: niha reads
`~/.claude/skills`, `~/.claude/commands`, `<project>/.claude/skills` and
`<project>/.claude/commands` by design — they are listed explicitly in
`skillSearchRoots()`, alongside its own `.niha` paths. That is intentional interop with
Claude Code, not an exfiltration path, and `.claude` is also in niha's `PROTECTED_DIRS`
so it guards the directory rather than modifying it. The finding here is the labelling
only. Worth noting separately that the setup guide does not mention this ingestion at
all, so a user will not expect another tool's personal skills to become invokable niha
commands whose content reaches the model when run — a documentation gap rather than a
defect.

---

### F-06  `niha whoami --json` prints human-formatted text, so the example in its own `--help` fails
Severity:    S2
Area:        CLI — whoami, `--json` / non-interactive output
Scenario:    none
Frequency:   every time (4/4)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh, niha v1.3.7
Phase:       0, set up
Steps:
  1. niha whoami --help          # read the documented flag and its example
  2. niha whoami --json | jq     # run that example verbatim
Expected:    machine-readable JSON on stdout, as `--help` states: "--json  Output as JSON (machine-readable)", with the worked example "niha whoami --json | jq".
Actual:
  $ niha whoami --help
  Usage: niha whoami [options]

  Show current identity and trust level

  Options:
    --json      Output as JSON (machine-readable)
    -h, --help  display help for command

  Examples:
    niha whoami              Show your user, org, role, and trust level
    niha whoami --json | jq  Machine-readable output for scripts

  $ niha whoami --json | jq
  jq: parse error: Invalid numeric literal at line 2, column 7

  $ niha whoami --json
    Auth:      JWT token
    Name:      amrutha.korumilli
    Email:     amrutha.korumilli@techatcore.com
    Org:       AI Challenge Q3 2026
    Role:      capability_builder
    Trust:     L1
    Token:     valid for 29d 23h
    Profile:   niha
    Store:     keychain "niha" (falls back to /Users/amruthakorumilli/.niha/credentials.json)

    ✓ Verified against https://api.nihaandco.com/api/v1/auth/me
Impact:      Any script or CI step that follows the documented example breaks, and it
             breaks quietly: niha exits 0, so the caller believes the command succeeded
             and only the downstream parser fails. ~10 minutes to establish that the flag
             is recognised rather than mistyped. This is not loose flag parsing — unknown
             flags are correctly rejected (`niha whoami --banana` → "error: unknown option
             '--banana'", exit 1), so `--json` is specifically registered, documented,
             given a worked example, and then ignored.
Suggested:   Implement `--json` for whoami to emit the same fields as a JSON object, or,
             if it is not going to be implemented, remove the flag and its example from
             `--help` so the documentation stops promising it. Separately, `niha doctor
             --json` is accepted and ignored while `--json` is not in doctor's documented
             options at all — it should either be implemented there or rejected like any
             other unknown option.
Disposition: FILED (#1016)

Tier: T2 — a workaround exists (parse the text, or use the platform API directly), so
recorded and characterised rather than fixed mid-build.

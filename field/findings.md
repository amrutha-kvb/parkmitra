# Field findings — parkmitra

Mandatory finding format. Blocks are appended the day they happen; nothing here is
reconstructed after the fact. Every `Actual` block is terminal output pasted verbatim.

Issues are filed at `niha-and-co/ai-platform` with labels `niha-cli,finding,challenge-q3`.

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
Disposition: FIXED (PR #1019)

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

---

### F-07  The documented zsh completions one-liner fails with "command not found: compdef" unless compinit has already run
Severity:    S3
Area:        CLI — completions (zsh)
Scenario:    none
Frequency:   every time (3/3)
Environment: macOS 26.2 (Darwin 25.2.0), zsh 5.9, VS Code integrated terminal, niha v1.3.7
Phase:       0, set up
Steps:
  1. niha completions --help        # read the documented example
  2. zsh -c 'eval "$(niha completions zsh)"'
  3. zsh -c 'autoload -Uz compinit && compinit -u && eval "$(niha completions zsh)"'   # contrast
Expected:    the one-liner printed by `--help`, and repeated inside the generated script's own header, works as given — as the bash equivalent does.
Actual:
  $ niha completions --help
  Examples:
    niha completions bash                                         Print bash completion script
    eval "$(niha completions zsh)"                                Enable zsh completions
    niha completions fish > ~/.config/fish/completions/niha.fish  Install fish completions

  $ niha completions zsh | head -3
  #compdef niha niha-dev
  # niha zsh completions
  # Add to ~/.zshrc: eval "$(niha completions zsh)"

  $ zsh -c 'eval "$(niha completions zsh)"'
  (eval):136: command not found: compdef
  (eval):137: command not found: compdef

  $ zsh -c 'autoload -Uz compinit && compinit -u >/dev/null 2>&1 && eval "$(niha completions zsh)" && echo "EVAL OK (with compinit)"'
  EVAL OK (with compinit)

  $ bash -c 'eval "$(niha completions bash)" && echo "EVAL OK"'
  EVAL OK
Impact:      `compdef` only exists after zsh's completion system is initialised, and the
             generated script calls it at lines 136-137 without autoloading `compinit`
             or guarding for it. The script's own header tells the reader to add the line
             to `~/.zshrc` — pasted at the top of a zshrc, or into one that never runs
             `compinit`, it errors on every new shell with a message that names neither
             niha nor the real cause. Bounded, and stated plainly: on a zshrc that runs
             compinit first (oh-my-zsh does), placing the line after it works fine, so
             this bites ordering and non-compinit setups rather than everyone. The bash
             path has no equivalent requirement, so the two examples read as equivalent
             when they are not.
Suggested:   Emit a guard at the top of the zsh script — `(( $+functions[compdef] )) ||
             { autoload -Uz compinit; compinit -u; }` — or, at minimum, change the
             example and the in-script comment to state that the line must come after
             `compinit`. The fish and bash outputs need no change.
Disposition: FIXED (PR #1021)

Tier: T3 — cosmetic/setup friction with an obvious workaround, recorded not fixed.

---

### F-08  `--json` is documented on the list commands but ignored, and they still exit 0 — scripts get unparseable output and no error
Severity:    S2
Area:        CLI — `--json` / non-interactive output across compliance, memory, skills, prompts
Scenario:    none
Frequency:   every time (2/2 per command, 4 commands)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh 5.9, niha v1.3.7
Phase:       0, set up
Steps:
  1. niha compliance list --help      # confirm the flag is documented
  2. niha compliance list --json
  3. niha compliance list --json | jq .
  4. repeat 2 for: niha memory list --json, niha skills list --json, niha prompts list --json
Expected:    machine-readable JSON on stdout, as every one of these commands documents: "--json  Output as JSON (machine-readable)".
Actual:
  $ niha compliance list --help
  Usage: niha compliance list [options]

  List compliance frameworks for your org

  Options:
    --json      Output as JSON (machine-readable)
    -h, --help  display help for command

  $ niha compliance list --json

    Compliance frameworks (3)

    NAME                 SCORE    ACTIVE
    SOC 2                60%      yes
    ISO 27001            60%      yes
    GDPR                 50%      yes

    Run 'niha compliance show <framework>' for requirement detail.

  $ echo $?
  0

  $ niha compliance list --json | jq .
  jq: parse error: Invalid numeric literal at line 2, column 13

  Same for the other three, all exit 0:
  $ niha memory list --json
  No memories stored yet. `/memory add "<text>"` to store the first one.
  $ niha skills list --json
  No skills in your org library yet. `/skills search <query>` to look again, or `/help` for the project and personal skills loaded on this machine.
  $ niha prompts list --json
  No prompt templates available. `/prompts create` to add the first one.
Impact:      This is the failure mode that costs a pipeline the most: the command reports
             success, so the caller proceeds, and only the downstream parser fails — with
             a jq error that names neither niha nor the flag. `compliance list` is the
             clearest case because it is not an empty-state edge: it has real data, three
             frameworks, renders a formatted ANSI table, and still exits 0. Any CI step
             built on the documented contract silently produces garbage. ~15 minutes
             across the four commands to establish that the flag is documented on each
             and honoured by none.
Suggested:   Either implement `--json` on these commands to emit the same data as a JSON
             document, or remove the flag from their `--help` so the contract stops being
             advertised. If it cannot be implemented now, failing loudly (non-zero with
             "not implemented") would be far safer for scripts than exiting 0 with human
             text. Related and probably the same root cause: `niha whoami --json` behaves
             identically and breaks the worked example in its own `--help` (#1016).
Disposition: FILED (#1020)

Tier: T2 — a workaround exists (parse text, or call the platform API directly), so
characterised and recorded rather than fixed mid-build. Filed as one finding rather than
one per command: it is a single contract defect on four surfaces, not four defects.

---

### F-09  Guardian blocks any prompt containing `../`, so ordinary relative imports cannot be discussed or written
Severity:    S2
Area:        Guardian / prompt input filtering — `niha ask`
Scenario:    A1 (give it the task from the brief alone and see whether it produces the right thing)
Frequency:   every time (6/6, two independent triggers, each isolated against a control)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh 5.9, niha v1.3.7, org AI Challenge Q3 2026
Phase:       6, build
Steps:
  1. niha ask "In one sentence, what does the import path ../lib/db refer to?"
  2. niha ask "In one sentence, what does the import path lib/db refer to?"      # control, differs only by ../
  3. repeat step 1
Expected:    `../` in a prompt is read as what it is in this context — a relative module path — and the request is answered. A path-traversal control should apply to file operations the agent attempts, not to the characters in the user's sentence.
Actual:
  $ niha ask "In one sentence, what does the import path ../lib/db refer to?"
  Error: Request blocked by Guardian: Injection attack detected: path_traversal

  $ niha ask "In one sentence, what does the import path lib/db refer to?"
  lib/db exports a single shared PostgreSQL connection pool (via the pg library) that is initialised from the DATABASE_URL environment variable.

  $ niha ask "In one sentence, what does the import path ../lib/db refer to?"
  Error: Request blocked by Guardian: Injection attack detected: path_traversal

  The control differs only by the two characters `..`, so the trigger is isolated to
  that substring appearing anywhere in the prompt text.

  Originally hit on a real build task, not a probe:
  $ niha ask "Create tests/concurrency.test.ts ... Import pool as a DEFAULT import from ../lib/db ..." --permission-mode auto --max-turns 20
  Error: Request blocked by Guardian: Injection attack detected: path_traversal
Impact:      Blocks a large class of ordinary coding requests. `../` is how relative
             parent imports are written in TypeScript and JavaScript, and the same two
             characters appear in Python (`from ..module import x`), Go, Rust, shell paths
             and virtually every language's module or path syntax. Any prompt that names
             such a path — to write it, review it, or merely explain it — is refused with
             a security error rather than answered.
             Cost here: it blocked creation of `tests/concurrency.test.ts`, the test that
             proves this product's central guarantee, and the failure mode is confusing
             because the message accuses the user of an injection attack rather than
             naming the offending characters. ~15 minutes to work out that two characters
             in the prompt were the cause, and the workaround is to write the file by hand
             or phrase the path in a way the filter does not recognise — neither of which
             the error suggests.
Suggested:   Apply path-traversal detection to the paths the agent actually resolves when
             it performs a file operation, not to the free text of the prompt. The agent
             already has a write-containment sandbox and a protected-paths list, which is
             the correct place for this control and which would still stop a genuine
             traversal. If a prompt-level heuristic is kept, it should at minimum exclude
             `../` occurring inside an import specifier or a quoted path, and the message
             should name the substring that triggered it so the user can rephrase rather
             than guess.
Disposition: FILED (#1027)

**Second trigger, same root cause (added after the first was filed):** SQL syntax in the
prompt is blocked the same way.

  $ niha ask "In one sentence, explain what DELETE FROM bookings does."
  Error: Request blocked by Guardian: Injection attack detected: sql

  $ niha ask "In one sentence, explain what a row removal statement on the bookings table does."
  > ⚠️ Security note (SEC-004): ... any DELETE targeting the bookings table must use
  > parameterised queries/prepared statements ...

The control is answered, and its answer discusses DELETE against bookings freely — the
same content the blocked request asked for. So the trigger is SQL vocabulary in the user's
text, not anything the agent would do. `DELETE FROM` is ordinary vocabulary for a tool
that writes migrations.

Tier: T2 — a workaround exists (write the file by hand, or avoid the vocabulary), so
characterised and recorded rather than fixed mid-build. Filed as ONE finding with two
triggers rather than two findings, because the root cause is single: prompt text is
scanned for attack signatures instead of the operations the agent attempts.

---

### F-10  `niha assess` fails with "Error: requires 'assess'", a message that names neither the cause nor a remedy
Severity:    S2
Area:        CLI — assess
Scenario:    none
Frequency:   every time (4/4, including with --json and --verbose)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh 5.9, niha v1.3.7, org AI Challenge Q3 2026, role capability_builder, trust L1
Phase:       6, build
Steps:
  1. cd into a project with a resolved workspace (niha status shows the project and a ledger)
  2. niha assess
  3. niha assess --verbose
Expected:    a governance score, as the setup guide promises: "niha assess — Your governance score for this project, one to five. Useful as a starting baseline." Or, if the command is unavailable to this role or plan, an error saying which and what to do about it.
Actual:
  $ niha assess
    ⠋ Scanning governance posture...
    ⠙ Detected: TypeScript + GitHub Actions · 1 CI workflow · 0 agent configs
  Error: requires 'assess'

  $ echo $?
  1

  $ niha assess --verbose
    ⠹ Detected: TypeScript + GitHub Actions · 1 CI workflow · 0 agent configs
  Error: requires 'assess'

  $ niha whoami
    Role:      capability_builder
    Trust:     L1

  For contrast, `niha check` on the same workspace in the same minute works and
  returns 20 passing rules, so the workspace itself resolves fine.
Impact:      `niha assess` is one of the five commands the setup guide tells a new user to
             run first, and it is the one that produces the headline governance number.
             It fails after appearing to work — the scan completes and reports what it
             detected, then the command dies on a string that reads like an internal
             assertion. "requires 'assess'" does not say whether that is a permission, a
             plan entitlement, a workspace feature or a missing argument, and offers
             nothing to try. ~15 minutes spent checking role, trust level, workspace state
             and flags before concluding the message simply cannot be acted on.
             The tool clearly can do better: when a non-interactive run hits a permission
             gate it prints "this call needs confirmation and this is a non-interactive run
             ... Add one to .niha/settings.local.json, or run it in the niha REPL. For a
             one-off, pass --permission-mode auto." That message names the cause, the fix
             and a one-off workaround. This one names nothing.
Suggested:   Say what is required and how to obtain it — for example "assess requires the
             'assess' capability, which your role (capability_builder) does not have; ask
             an org admin to grant it" — and exit before the scan rather than after, so the
             user is not shown progress for work that cannot complete. If the requirement
             is a plan or entitlement rather than a role, name that instead.
Disposition: FILED (#1028)

Tier: T2 — no workaround for the score itself, but `niha check` covers the adjacent need,
so recorded and characterised rather than fixed mid-build.

---

### F-11  A failing governance check cannot be traced back to a rule: `check` prints UUIDs, `rules list` prints short ids, and the advertised `rules show` does not exist
Severity:    S2
Area:        CLI — check / rules
Scenario:    none
Frequency:   every time (3/3)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh 5.9, niha v1.3.7
Phase:       6, build
Steps:
  1. niha check
  2. niha rules list
  3. niha rules show CICD-001
Expected:    the identifier a check result prints can be used to look that rule up, so a failing CI gate can be understood and fixed.
Actual:
  $ niha check
    Passed (20)
    ✓ 900a941b-f3f8-5333-ab93-8f1b47909a9a Branch protection enabled
    ✓ 90e864dc-0856-5a2a-9b01-2c0e378cebd1 No SQL string concatenation
    ✓ 90d4b5a8-2829-5de3-a171-4daa1ec6b386 Minimum test coverage

  $ niha rules list
  Rule ID    Name                     Layer       Category        Zone    Status
  ─────────  ───────────────────────  ──────────  ──────────────  ──────  ────────
  CICD-001   Branch protection en...  org         ci_cd           4       active
  SEC-003    Input validation on ...  org         security        3       active

  $ niha rules show CICD-001
  error: unknown command 'show'
  (run `niha --help` to see available commands)
  $ echo $?
  1

  $ niha rules --help
  Commands:
    list [options]       Show effective rules table
    diff [options]       Show recent rule changes
    effective [options]  Full inheritance view — rules grouped by category with source labels
    help [command]       display help for command

  But the interactive session's own /help advertises it:
  /rules — Inspect governance rules — /rules [list | effective | show <id>]
Impact:      Three things compound. "Branch protection enabled" is
             `900a941b-f3f8-5333-ab93-8f1b47909a9a` in `check` and `CICD-001` in
             `rules list` — the same rule under two identifier schemes, with no command
             that maps between them. `rules list` truncates the names
             ("Branch protection en..."), so matching on name is unreliable too. And
             `rules show <id>`, the obvious way out, is advertised in the REPL's `/help`
             but does not exist on the CLI.
             This matters most where the product is meant to earn its keep: `niha check
             --ci` is documented as a pipeline gate. When it fails in CI, the engineer
             gets a UUID, and there is no supported way to turn that UUID into the rule's
             text, rationale or remedy. ~20 minutes establishing that the two id schemes
             do not meet and that the documented lookup is missing.
Suggested:   Print the short id (`CICD-001`) in `check` output, or print both. Either way
             the identifier a failure reports must be the one `rules` accepts. Implement
             `niha rules show <id>` accepting either form, since the REPL help already
             promises it — or remove it from that help. Stop truncating names in
             `rules list`, or add a `--no-truncate`, so name matching is at least a
             viable fallback.
Disposition: FILED (#1029)

Tier: T2 — a workaround exists (match on the visible part of the name), so recorded and
characterised rather than fixed mid-build.

---

### F-12  `niha ceremony kaizen` reports a usage error but exits 0, so a script cannot tell it failed
Severity:    S3
Area:        CLI — ceremony, exit codes
Scenario:    none
Frequency:   every time (3/3)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh 5.9, niha v1.3.7
Phase:       6, build
Steps:
  1. niha --help                      # note the documented form
  2. niha ceremony kaizen ; echo $?
  3. niha trace ; echo $?             # control: the same kind of usage error
Expected:    a usage error exits non-zero, as every other command in the CLI does.
Actual:
  $ niha --help | grep ceremony
      ceremony kaizen      Kaizen Cycle (preview auto-generated agenda)

  $ niha ceremony kaizen
  Usage: niha ceremony kaizen --preview
  $ echo $?
  0

  Controls — the same class of error on three other commands, all correct:
  $ niha trace            → exit 1 | Usage: niha trace <id> | --last | --pr <number>
  $ niha rules show X     → exit 1 | error: unknown command 'show'
  $ niha agent status zzz → exit 1 | Agent not found: zzz

  And with the flag it asks for:
  $ niha ceremony kaizen --preview
  Kaizen agenda preview is not available yet — the platform endpoint doesn't exist.
  Tracked as a follow-up (S1-140 — /api/v1 kaizen preview).
  $ echo $?
  0
Impact:      Low severity but a real trap, and it is the quiet kind. `niha --help` lists
             `ceremony kaizen` as the command, so that is what a person or a script will
             run. It prints a usage line to say it is wrong, then reports success. Any
             wrapper using `set -e`, `&&`, or a CI step that checks the exit status treats
             a failed invocation as a pass. The rest of the CLI gets this right, which is
             what makes it a defect rather than a convention — `niha trace` in exactly the
             same situation exits 1.
             Secondary, same command: the correct invocation also exits 0 while reporting
             that the feature does not exist yet. "Not implemented" and "worked" should not
             be indistinguishable to a caller.
Suggested:   Exit non-zero on the usage error, matching `trace`, `rules` and
             `agent status`. Decide deliberately what `--preview` should return while the
             endpoint is missing — a non-zero exit with the same explanatory message would
             be honest, and leaves room for a caller to branch on it. If the subcommand is
             not usable at all yet, consider not advertising it in `niha --help`.
Disposition: FILED (#1030)

Tier: T3 — cosmetic in effect, recorded rather than fixed mid-build.

---

### F-13  Governance stops enforcing and the pre-commit hook silently allows commits: "Not authorized to evaluate rules" for a workspace niha itself provisioned
Severity:    S2
Area:        CLI — check / hooks / workspace authorisation
Scenario:    none
Frequency:   every time once it starts (6/6). It worked earlier in the same session on the same machine and account, then stopped.
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh 5.9, niha v1.3.7, org AI Challenge Q3 2026, role capability_builder, trust L1
Phase:       9, run
Steps:
  1. niha check                      # earlier the same session: PASS, 20 rules
  2. niha check                      # later: not authorized
  3. niha whoami                     # token still valid
  4. niha status                     # reports the workspace as not provisioned
  5. cat .niha/workspace.yaml        # the id from the error is here, written by niha
  6. git commit                      # observe what the installed hook does
Expected:    either the rules evaluate, or the failure is explained accurately and the governance hook makes a deliberate, visible decision about whether to allow the commit.
Actual:
  Earlier in this session, on this machine and account:
  $ niha check
    Governance Check — workspace
    Passed (20)
    ✓ 900a941b-f3f8-5333-ab93-8f1b47909a9a Branch protection enabled

  Later, unchanged account, same directory:
  $ niha check
  Not authorized to evaluate rules for 42f67bef-192d-4c09-bd04-04c280704073. Run niha login or check your role.

  The suggested remedy does not apply — the session is fine:
  $ niha whoami
    Email:     amrutha.korumilli@techatcore.com
    Role:      capability_builder
    Token:     valid for 28d 23h

  And niha's own status disagrees that the workspace exists at all:
  $ niha status
    Project:   parkmitra (repo)  ·  id amrutha-kvb/parkmitra
    Workspace: local-only (offline or not yet provisioned)

  But the id in the error is one niha wrote itself:
  $ cat .niha/workspace.yaml
  workspace:
    id: 42f67bef-192d-4c09-bd04-04c280704073
    name: parkmitra

  The installed pre-commit hook then fails open:
  $ git commit -m "probe: does the governance hook block or allow?"
  niha: governance check skipped (commit allowed) — Not authorized to evaluate rules for 42f67bef-192d-4c09-bd04-04c280704073. Run niha login or check your role.
  [phase-9/run 12afdad] probe: does the governance hook block or allow?
  $ echo $?
  0

  Not branch-specific: reproduced on main and on a feature branch.
Impact:      A governance product silently stops governing. `niha hooks install` sets the
             hook up as "Runs niha check --ci before every commit", and from this point it
             runs nothing — every commit passes unchecked, including the secret scan and
             the SQL-concatenation rule, with one grey line of output as the only signal.
             In a team that installed this hook deliberately, nobody would notice for days.
             Three things compound. The failure is silent in effect; `status` and `check`
             disagree about whether the workspace exists; and the remedy offered
             ("Run niha login or check your role") is wrong, because the token is valid and
             the role has not changed — which sends the user to re-authenticate for nothing.
             ~25 minutes establishing that the session was fine, the branch was irrelevant,
             and the id came from niha's own workspace.yaml.
Suggested:   Three separate things. (a) Reconcile authorisation with provisioning: if
             `status` reports a workspace as not provisioned, `check` should not be
             authorising against its id — and if the id in `.niha/workspace.yaml` is stale
             or was never registered, say exactly that and offer `niha init --refresh`.
             (b) Make the hook's failure mode deliberate and configurable: failing open is
             defensible for a developer's commit, but it should be a stated policy, and
             loud — the current one-line notice is easy to miss in a normal commit. (c)
             Stop suggesting `niha login` when the credential is demonstrably valid; it
             costs the user a re-auth and does not fix anything.
Disposition: FILED (#1031)

**CORRECTION, 2026-09-23, same day.** Part of this finding was wrong and is withdrawn.

I claimed the credential was valid, and therefore that "Run niha login or check your role"
was misleading. That was based on incomplete evidence: I filtered `niha whoami` with
`grep -E 'Email|Role|Token'`, which hid the decisive line. The full output says both
"Token: valid for 28d 23h" AND "✗ This credential is expired or revoked — the API rejected
it", and `doctor` had been reporting the rejection all along. The credential really was
rejected, the authorisation failure was correct, and the remedy offered was right.
Suggestion (c) is withdrawn.

What stands is the substance: **the pre-commit hook fails open silently.** Every commit
passed unchecked — secret scan included — with one grey line as the only signal and exit 0.
Suggestions (a) and (b) are unchanged.

The misleading `whoami` display that caused this error is filed separately as F-14.

Tier: T2 — commits still work, so there is a workaround in the sense that nothing blocks,
which is exactly the problem. Recorded and characterised rather than fixed mid-build.

---

### F-14  `niha whoami` prints "Token: valid for 28d 23h" directly above "this credential is expired or revoked"
Severity:    S2
Area:        auth / whoami
Scenario:    none
Frequency:   every time while the credential is rejected (5/5)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh 5.9, niha v1.3.7
Phase:       9, run
Steps:
  1. niha login, then work until the credential is rejected server-side
  2. niha whoami
  3. niha doctor
Expected:    one verdict. If the server has rejected the credential, the summary line should not say it is valid for another 28 days.
Actual:
  $ niha whoami

    Auth:      JWT token
    Name:      amrutha.korumilli
    Email:     amrutha.korumilli@techatcore.com
    Org:       AI Challenge Q3 2026
    Role:      capability_builder
    Trust:     L1
    Token:     valid for 28d 23h
    Profile:   niha
    Store:     keychain "niha" (falls back to /Users/amruthakorumilli/.niha/credentials.json)

    ✗ This credential is expired or revoked - https://api.nihaandco.com/api/v1/auth/me rejected it.

  Both statements are in one output. "valid for 28d 23h" is computed from the JWT's own
  expiry; the ✗ line is the server's verdict. They are never reconciled.

  doctor is unambiguous by comparison:
  $ niha doctor
    ✗ Credentials — JWT rejected by https://api.nihaandco.com/api/v1/auth/me (expired or revoked) — run `niha login`
Impact:      The line a reader scans for is the one labelled "Token", and it says valid.
             The contradiction sits four lines below it, after the store path, formatted as
             a footnote.
             This cost me real time and, worse, a wrong report. Chasing an authorisation
             failure elsewhere in the CLI, I checked whoami, saw "valid for 28d 23h", and
             concluded the session was fine — so I filed a finding criticising a perfectly
             correct "run niha login" message as bad advice. I had to withdraw that part
             publicly. The display did not merely slow me down; it produced a false
             conclusion I then acted on. ~25 minutes, plus the correction.
             The programme's own worked example is "doctor reports healthy while the session
             token is expired". This is that shape, in whoami, with the contradiction
             visible in a single screen of output.
Suggested:   Let the server's verdict win the summary line. When /auth/me rejects the
             credential, print "Token: expired or revoked" — or "rejected by the server
             (local expiry 28d 23h)" if the local figure is worth keeping for debugging —
             rather than a confident "valid for 28d 23h" that the next line contradicts.
             The ✗ should lead, not trail.
Disposition: FILED (#1032)

Tier: T2 — a workaround exists (trust `doctor`, which is unambiguous), so recorded and
characterised rather than fixed mid-build.

---

## Withdrawn

F-01 (#1012) and F-04 (#1014) are closed, and F-02 (#1010) and F-03 (#1013) are
de-scoped from the challenge. F-01's advice is defensible general product behaviour;
F-04 could not be separated from F-03 while the model was down; F-02 is `src/web`, not
the CLI; F-03 is an org credit/billing outage the team already knew about, not a defect
I found. Only findings I can defend on their own evidence are counted above.

---

### F-15  `niha ci agent init` generates a workflow pinned to a ref that does not exist, so CI fails on every PR
Severity:    S2
Area:        CLI — ci agent, generated artifacts
Scenario:    none
Frequency:   every time (2/2, including a clean empty repo)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh 5.9, niha v1.3.7
Phase:       9, run
Steps:
  1. mkdir /tmp/niha-ci-repro && cd /tmp/niha-ci-repro && git init -q .
  2. niha ci agent init
  3. grep -n "uses:" .github/workflows/niha-governance.yml
  4. gh api repos/niha-and-co/ai-platform/git/ref/tags/v1     # control: does the ref exist?
Expected:    a generated workflow runs. At minimum, the ref it pins resolves.
Actual:
  $ niha ci agent init
  ✓ Created governance CI workflow:
    /private/tmp/niha-ci-repro/.github/workflows/niha-governance.yml

    Composite action: niha-and-co/ai-platform/.github/actions/niha-ci@v1
    Fail-on threshold: blocked

  $ grep -n "uses:" .github/workflows/niha-governance.yml
  22:      - uses: actions/checkout@v4
  28:        uses: niha-and-co/ai-platform/.github/actions/niha-ci@v1

  $ gh api repos/niha-and-co/ai-platform/git/ref/tags/v1
  {
    "message": "Not Found",
    "documentation_url": "https://docs.github.com/rest/git/refs#get-a-reference",
    "status": "404"
  }
  gh: Not Found (HTTP 404)

  $ gh api repos/niha-and-co/ai-platform/branches/v1
  {
    "message": "Branch not found",
    "status": "404"
  }
  gh: Branch not found (HTTP 404)

  $ gh api repos/niha-and-co/ai-platform/git/matching-refs/heads/v1 --jq '.[].ref'
  (empty)

Analysis:    The action directory itself exists on main, so the path is right and only the
             ref is wrong. Every published tag is a full three-part version — v1.0.0
             through v1.2.8 — and there is no floating major. GitHub Actions cannot
             resolve `@v1`, so the workflow fails at job setup before a single governance
             check runs.

             The generated file's own comment reads "Bump the @v1 tag when a new release
             of the action ships", which presents `v1` as an existing convention. It is
             not one.

             Two things make this worse than a broken default. The failure appears at the
             job level and names a missing action version, so it reads like the user's own
             mistake rather than the generator's. And it is a governance product: the
             visible effect is a red check that never actually checked anything, which is
             the same shape as F-13 — governance that has silently stopped governing.

             Pinning to "the CLI's own version" would not have worked either. The shipped
             CLI is 1.3.7 and there is no v1.3.x tag at all, so the newest release tag
             already lags the published CLI by a minor version.
Suggested:   Publish and maintain a floating `v1` tag. It is the convention the generated
             file already promises, it is what `actions/checkout@v4` does one line above
             it in the same template, and it means the generator never needs touching
             again. Failing that, pin a tag that exists.

             Separately: a generator that emits a ref is in a position to verify it.
             Resolving the ref once at generation time would have caught this before it
             reached any user's repository.
Disposition: FILED (#1033) · FIX PR (#1034)

Tier: T1 — fixed. The pin is now v1.2.8, the newest published tag, where the action is
verifiably present. The existing test asserted the literal `@v1` and so passed happily
while the product was broken; the added test asserts the shape instead, and was confirmed
to fail against the old constant.

---

### F-16  The generated workflow references a composite action in a PRIVATE repo, so it cannot run in any consumer repository
Severity:    S2
Area:        CLI — ci agent, generated artifacts
Scenario:    none
Frequency:   every time (1/1 against a real runner; deterministic by construction)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh 5.9, niha v1.3.7
Phase:       9, run
Steps:
  1. niha ci agent init
  2. Commit the generated workflow and push it to a repository you own.
  3. Open a pull request. Read the Governance Check job.
Expected:    the generated workflow runs, or the generator says what else is required.
Actual:
  X phase-9/run niha Governance amrutha-kvb/parkmitra#16 · 35876662617
  Triggered via pull_request

  JOBS
  X Governance Check in 3s

  ANNOTATIONS
  X Unable to resolve action `niha-and-co/ai-platform`, not found

  $ gh api repos/niha-and-co/ai-platform --jq '{private:.private, visibility:.visibility}'
  {"private":true,"visibility":"private"}

Analysis:    Separate from F-15, and not fixed by it. F-15 was a ref that does not exist;
             this is a repository the runner cannot read. A workflow authenticates with its
             OWN repository's GITHUB_TOKEN, which has no access to a private repo belonging
             to someone else. My account can read ai-platform interactively — it is how the
             fix PRs were raised — but the runner does not use my credentials.

             The two compound. Pinning the ref (PR #1034) was necessary and still leaves the
             generated workflow unable to run for any consumer.

             A trap worth recording separately: a step-level `if:` guard does NOT prevent
             this. GitHub resolves every `uses:` in a job at job SETUP, before step
             conditions are evaluated, so the job fails identically. The gate has to be at
             job level. This cost me one failed run to discover and is not obvious.
Suggested:   Publish the action — a small public repo, or the Marketplace. That is what
             `actions/checkout@v4`, one line above it in the same generated file, already
             does. Alternatively ship the logic in the CLI and have the workflow call
             `npx @niha-and-co/niha ci run`, since the workflow already installs the CLI in
             the preceding step. At minimum, say so: the command prints three "Next steps"
             and none of them mentions that the workflow cannot resolve its action outside
             this organisation.
Disposition: FILED (#1035)

Tier: T2 — worked around in this repository by gating the whole job on a repository
variable, so it skips visibly rather than failing red. Not fixable from outside the org:
publishing the action is a decision for whoever owns it.


---

### F-17  `niha export --json` is documented as a shorthand for `--format json` but emits markdown, and exits 0
Severity:    S2
Area:        CLI — export, flag handling
Scenario:    none
Frequency:   every time (3/3)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh 5.9, niha v1.3.7
Phase:       8, ship — reading a long session's cost back for the B8 protocol
Steps:
  1. niha export <session-id> --json | head -2
  2. niha export <session-id> --format json | head -2     # control, same session
  3. niha export <session-id> --json | jq .governance     # the form its own --help shows
Expected:    `--json` produces JSON. Its own help says "Shorthand for --format json", and its
             examples show `--format json | jq .governance`.
Actual:
```console
$ niha export 7d425a0b --json | head -2
# Session export — Read docs/handover.md and field/securit…

$ echo $?
0

$ niha export 7d425a0b --format json | head -2
{
  "schema_version": 1,

$ niha export 7d425a0b --json | jq .governance
jq: parse error: Invalid numeric literal at line 1, column 2
$ echo $?
5
```
Analysis:    The two documented spellings of one option disagree, and the failing one is the
             shorthand. It exits 0, so a script cannot detect the failure from the CLI — it
             surfaces further down the pipe as a jq error, which points at the wrong tool.
             Same shape as F-08 (#1020) but on a different command, so filed separately: the
             pattern repeating across unrelated commands is the more useful signal.
Suggested:   Map `--json` onto `--format json` at parse time and assert the two spellings
             produce byte-identical output. A shorthand that does not do what it is short
             for is worse than no shorthand, because nothing prompts the user to doubt it.
Disposition: FILED (#1036)

Tier: T2 — a workaround exists (`--format json`), so recorded and characterised.

---

### F-18  `niha export` reports "Total time 2s" for a 41-minute session, contradicting its own timestamps
Severity:    S2
Area:        CLI — export, session metrics
Scenario:    B8 — cost and token readout at the end of a long session
Frequency:   every time (2/2, two different sessions)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh 5.9, niha v1.3.7
Phase:       8, ship
Steps:
  1. Run a long session. This one: 40 turns over ~41 minutes.
  2. niha export <session-id>
  3. Read "Total time" against "Started" and "Last updated" in the same table.
Expected:    a duration that matches the session's own timestamps, or a field name that says
             what it actually measures.
Actual:
```console
$ niha export 7d425a0b
| Started      | 2026-09-23T16:09:50.944Z |
| Last updated | 2026-09-23T16:50:42.406Z |
| Turns        | 40                       |
| Total cost   | $0.8505                  |
| Total time   | 2s                       |

$ python3 -c "from datetime import datetime as d; print((d.fromisoformat('2026-09-23T16:50:42.406+00:00')-d.fromisoformat('2026-09-23T16:09:50.944+00:00')).total_seconds())"
2451.462
```
Analysis:    2451 seconds reported as 2 — wrong by three orders of magnitude, in the one row
             a reader cannot check without doing the subtraction by hand. Independently
             corroborated: the harness recorded 40/40 turns, mean wall-clock latency 62s,
             slowest turn 234s. No reading of "time" makes 2s correct.

             It matters more than a normal metrics bug because of what the field is for.
             Scenario B8 asks every engineer to report cost and duration per long session and
             to say whether long sessions cost disproportionately more. That is cost divided
             by duration. `export` supplies both; the cost is right and the duration is not,
             so the derived figure the programme asks for is wrong for everyone who reports
             it. Found by trying to do exactly that.

             Same shape as F-14 (#1032): a summary line contradicting data the command has
             already printed.
Suggested:   Compute the row from `updatedAt - startedAt`, or rename it to what it measures —
             if it is render time or one API round trip, it does not belong in a session
             summary. A test asserting the row is consistent with the two timestamps beside
             it is cheap and would have caught this. `--format json` carries no duration
             field at all, so there is currently no correct machine-readable source either.
Disposition: FILED (#1037)

Tier: T2 — the duration is recoverable by hand from the two timestamps, so recorded rather
than blocking.


---

### F-20  `niha rules list` validates two of its filters and silently ignores two others, all exiting 0
Severity:    S2
Area:        CLI — rules list, flag validation
Scenario:    none
Frequency:   every time (5/5 per flag)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh 5.9, niha v1.3.7
Phase:       9, run — auditing governance rules against the built product
Steps:
  1. niha rules list --status bogus   ; echo $?    # control: validated
  2. niha rules list --category bogus ; echo $?    # control: validated
  3. niha rules list --layer bogus    ; echo $?
  4. niha rules list --limit bogus | grep -c "^[A-Z]*-[0-9]*"
  5. niha rules list --limit -5       ; echo $?
Expected:    a flag documented with an enum rejects a value outside it, as two of the four
             already do. A numeric flag rejects a non-number.
Actual:
```console
$ niha rules list --status bogus ; echo $?
Input should be 'active', 'canary', 'disabled', 'expired' or 'draft'
1

$ niha rules list --category bogus ; echo $?
Input should be 'architecture', 'code_quality', 'securi…
1

$ niha rules list --layer bogus ; echo $?
No rules match your filters.
0

$ niha rules list               | grep -cE "^[A-Z]+-[0-9]+"   # baseline
20
$ niha rules list --limit 3     | grep -cE "^[A-Z]+-[0-9]+"   # works
3
$ niha rules list --limit bogus | grep -cE "^[A-Z]+-[0-9]+"   # ignored
20
$ niha rules list --limit -5 ; echo $?
0
```
Analysis:    Two defects in one command, filed together because the inconsistency is the
             point: the correct behaviour is sitting next to the incorrect one in the same
             help screen.

             `--layer` declares an enum in its own help and is not validated, so a typo
             (`--layer platfrom`) is indistinguishable from a correct query with no results.
             Someone auditing whether a layer has rules is told it does not.

             `--limit` is the worse of the two. A script running `--limit "$N"` with `$N`
             unset receives the FULL table and exit 0, having asked for N rows — no failure,
             no warning, and output of an entirely plausible shape.

             Third command on which the "documented flag accepted then not honoured, exit 0"
             pattern has now appeared, after #1020 and #1036.

             Separately: `--status` accepts five values and its help lists two. The only way
             to find `canary`, `expired` and `draft` is to pass something invalid and read
             the rejection, which makes the error message a better reference than the docs.
Suggested:   Validate `--layer` against its declared enum the way `--status` and `--category`
             already are. Reject a non-numeric or negative `--limit` rather than discarding
             it — silently returning more rows than asked for is the one outcome a caller
             cannot detect. List all five `--status` values in the help.
Disposition: FILED (#1039)

Tier: T2 — a workaround exists (check the row count yourself), so recorded rather than fixed
mid-build.

---

## Extension to F-08 (#1020), not a new finding

`--json` is documented and ignored on two further surfaces: `niha agents --json`, whose help
prints `niha agents --json | jq '.agents'` as a worked example, and **`niha check --json`**,
which is the governance gate and the command a CI pipeline runs.

Recorded as a comment on #1020 rather than as F-21, because that issue argues the defect is
"a single contract defect on four surfaces, not four defects" and it would be dishonest to
count surfaces as findings when it suits the total. Six surfaces now; still one defect.

`check` raises that issue's severity: a pipeline running `niha check --json | jq '.violations'`
gets unparseable text and exit 0, which is indistinguishable from a clean run. Same shape as
F-13 — a governance product reporting success while reporting nothing.


---

### F-21  `niha status` reports 19 governance observations; `niha trace --last` says none exist and gives a false reason
Severity:    S2
Area:        CLI — trace, governance observability
Scenario:    none
Frequency:   every time (3/3)
Environment: macOS 26.2 (Darwin 25.2.0), VS Code integrated terminal, zsh 5.9, niha v1.3.7
Phase:       9, run — inspecting governance decisions for the handover
Steps:
  1. niha status
  2. niha trace --last
  3. wc -l < .niha/ledger.jsonl
Expected:    the command whose purpose is "Governance decision trace (X-ray)" either shows
             the recorded decisions or explains why it cannot.
Actual:
```console
$ niha status
  Posture:   advisory (observe-only pilot — nudges + logs, never blocks)
  Workspace: local-only (offline or not yet provisioned)
  Ledger:    19 observations logged  ·  .niha/ledger.jsonl

$ niha trace --last
No traces yet — traces appear once agents run governed actions.

$ wc -l < .niha/ledger.jsonl
19
```
Analysis:    Two commands, one CLI, one workspace, one moment, disagreeing about whether any
             governance decision exists.

             The reason given is what costs time. "Traces appear once agents run governed
             actions" is a claim about cause and it is false — 53 model turns with tool
             calls, a pre-commit hook on every commit, 19 ledger entries. It sends the reader
             to do what they have already done.

             `status` prints the real reason two lines earlier: the workspace is local-only.
             The tool knows; `trace` does not say it.
Suggested:   Say what `status` already knows, or let `trace` read the local ledger when the
             workspace is local-only — the data is on disk in a documented format and
             showing it is the command's entire purpose.
Disposition: FILED (#1040)

Tier: T2 — the ledger is readable directly, so recorded rather than blocking.

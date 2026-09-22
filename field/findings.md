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
Disposition: FILED (#1018)

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

## Withdrawn

F-01 (#1012) and F-04 (#1014) are closed, and F-02 (#1010) and F-03 (#1013) are
de-scoped from the challenge. F-01's advice is defensible general product behaviour;
F-04 could not be separated from F-03 while the model was down; F-02 is `src/web`, not
the CLI; F-03 is an org credit/billing outage the team already knew about, not a defect
I found. Only findings I can defend on their own evidence are counted above.

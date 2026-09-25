# PR demo videos — scripts

Three fix PRs against `niha-and-co/ai-platform`, each needs a ~60 second video posted as a
comment on its own PR: before, the bug proven, after. This is the merge-bar requirement —
without it the fix risks scoring **a0**: *"a pull request missing the merge bar: no before
and after, no test, no video, no docs line."*

| PR | Finding | Fixes |
|---|---|---|
| [#1034](https://github.com/niha-and-co/ai-platform/pull/1034) | F-15 | `niha ci agent init` pins a ref that doesn't exist |
| [#1021](https://github.com/niha-and-co/ai-platform/pull/1021) | F-07 | documented zsh completions one-liner fails |
| [#1019](https://github.com/niha-and-co/ai-platform/pull/1019) | F-05 | `/help` mislabels personal skills as team skills |

---

## Setup, once, before recording any of the three

```bash
source /tmp/niha-fixed.sh
```

This gives three short aliases so the commands read cleanly on camera:

```bash
alias niha-fixed-ci='node /tmp/fixed-builds/ci-agent-pins-nonexistent-ref/dist/index.js'
alias niha-fixed-zsh='node /tmp/fixed-builds/F-07-zsh-compinit-guard/dist/index.js'
alias niha-fixed-skills='node /tmp/fixed-builds/F-05-skill-help-heading/dist/index.js'
```

`niha` on its own stays the installed v1.3.7 — that's the "before". Each `niha-fixed-*`
alias runs the built fix branch — that's the "after". If `/tmp/fixed-builds/` doesn't
exist, the branches need rebuilding first (`git checkout <branch> && npm run build` inside
`ai-platform/src/cli-ink`, then link `node_modules` and add `{"type":"module"}` to
`dist/package.json`).

---

## Video 1 — PR #1034 · ~70 seconds

**The issue:** `niha ci agent init` generates a GitHub Actions workflow. It pins the
governance step to `niha-and-co/ai-platform/.github/actions/niha-ci@v1`. That ref doesn't
exist — the repo tags full semver only, `v1.0.0` through `v1.2.8`, never a floating `v1`.
GitHub can't resolve it, so the job fails at setup before any check runs, and the error
names the missing action version rather than the generator that emitted it.

| Step | Action | Say |
|---|---|---|
| 1 | — | "`niha ci agent init` scaffolds your governance workflow. One command, writes the Actions file." |
| 2 | `mkdir /tmp/v1a && cd /tmp/v1a && git init`<br>`niha ci agent init` | "It pins `niha-ci@v1`. Let's resolve that ref." |
| 3 | `gh api repos/niha-and-co/ai-platform/git/ref/tags/v1` | "404. There's no `v1` tag and no `v1` branch. They tag full versions, `v1.0.0` up to `v1.2.8`, never a floating major. So this workflow fails at job setup on every PR, before a single check runs. And the error names the action version, not the generator that emitted it." |
| 4 | `mkdir /tmp/v1b && cd /tmp/v1b && git init`<br>`niha-fixed-ci ci agent init` | "Pinned to `v1.2.8`, which is real. Same command, working file." |
| 5 | — | "One caveat: issue #1035 shows it still can't run outside this org, because the action lives in a private repo. That needs a decision from the owners, not a patch. My fix makes the version correct — it doesn't make the repo public." |

**Verify before recording:**
```bash
cd /tmp/v1a && niha ci agent init 2>&1 | grep -i composite     # expect: @v1
gh api repos/niha-and-co/ai-platform/git/ref/tags/v1            # expect: 404
cd /tmp/v1b && niha-fixed-ci ci agent init 2>&1 | grep -i composite  # expect: @v1.2.8
```

**Caption when posting:** *Before: `@v1`, which 404s. After: `@v1.2.8`, which resolves.*

---

## Video 2 — PR #1021 · ~60 seconds

**The issue:** `niha completions zsh` emits a completion script that calls `compdef`
directly. `compdef` only exists once zsh's completion system is initialised via
`compinit`, and the generated script never initialises it. On any shell where `compinit`
hasn't already run — a bare `zsh -f`, or a `.zshrc` that evals this line above its
framework's own setup — you get `command not found: compdef`, and the docs hand you this
exact one-liner.

| Step | Action | Say |
|---|---|---|
| 1 | — | "Shell completions. The docs give you a one-liner to eval into your zshrc." |
| 2 | `zsh -f -c 'eval "$(niha completions zsh)"'` | "Two `command not found: compdef`. That's `zsh -f`, no user config. Zsh's completion system isn't initialised by default, and `compdef` is part of it." |
| 3 | `niha completions zsh \| sed -n '134,138p'` | "The generated script calls `compdef` with nothing loading `compinit` first. It assumes the system's already up. On a fresh shell it isn't, and ordering in your zshrc decides whether this works." |
| 4 | `niha-fixed-zsh completions zsh \| sed -n '134,142p'` | "Now it guards: if `compdef` isn't defined, autoload and run `compinit` first. No-op when it's already initialised." |
| 5 | `zsh -f -c 'eval "$(node /tmp/fixed-builds/F-07-zsh-compinit-guard/dist/index.js completions zsh)"'` | "Same bare shell, clean." |

**Note:** the alias won't expand inside a `zsh -f -c '...'` subshell — use the full `node
.../dist/index.js` path for step 5, as written above.

**Verify before recording:**
```bash
zsh -f -c 'eval "$(niha completions zsh)"'   # expect: command not found: compdef (x2)
zsh -f -c 'eval "$(node /tmp/fixed-builds/F-07-zsh-compinit-guard/dist/index.js completions zsh)"'  # expect: silent
```

**Caption when posting:** *Before: `command not found: compdef` on a bare shell. After:
silent success.*

---

## Video 3 — PR #1019 · ~60 seconds

**The issue:** `/help` lists every skill under one fixed heading, "Team skills", regardless
of where it came from. Skills resolve from three roots — org scope (approved by an
administrator), project scope (arrived via code review), and user scope,
`~/.claude/skills`, approved by nobody. A personal skill's row carries `[personal skill]`
while sitting under a heading that asserts the opposite. The code already treats origin as
a trust boundary — `INDEXED_ORIGINS` excludes user-scope skills from what the model can
reach, precisely because they're unvetted — so the display was undoing a distinction the
loader enforces.

| Step | Action | Say |
|---|---|---|
| 1 | — | "`/help` lists every skill the loader found. They resolve from three roots: org scope, project scope, and `~/.claude/skills` on this machine." |
| 2 | `niha`, type `/help` | "Heading says Team skills. The row under it says personal skill. Those are my own files in `~/.claude/skills`. Nobody on my team approved them." |
| 3 | — | "For a governance tool that's not cosmetic. The heading asserts a trust level, so it reads as either my org approved this, or my private skills are visible to my team. Neither is true. And the code already draws this line — `INDEXED_ORIGINS` keeps user-scope skills out of the model's index because they're unvetted. The display was undoing a boundary the loader enforces." |
| 4 | `Ctrl+D`, then `niha-fixed-skills`, type `/help` | "Neutral heading. Origin stays on the row, where it's accurate." |

**Caption when posting:** *Before: "Team skills" above a row tagged `[personal skill]`.
After: "Skills".*

---

## If asked why these three, together

> "All three are the tool asserting something untrue. A ref that was never published, a
> documented command that fails, and a heading claiming approval that never happened.
> That's also the thesis of my field report: eleven of seventeen findings are the tool
> reporting success while doing nothing, or reporting a state it's already contradicted."

## Checklist

- [ ] Recorded before-and-after for #1034, posted as a PR comment with caption
- [ ] Recorded before-and-after for #1021, posted as a PR comment with caption
- [ ] Recorded before-and-after for #1019, posted as a PR comment with caption
- [ ] Each video shows the bug failing before showing the fix — don't start recording at
      the fixed version
- [ ] Raw terminal recording, no editing — more credible with the time available

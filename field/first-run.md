# First run — niha version and health check

Phase 0. Recorded on 2026-09-22, at setup, before any project code.

## Install

Installed via Homebrew on macOS, per the setup guide Step 3.

```
$ brew install --cask niha-and-co/tap/niha
==> Tapping niha-and-co/tap
Cloning into '/opt/homebrew/Library/Taps/niha-and-co/homebrew-tap'...
Tapped 1 cask (14 files, 39.6KB).
Warning: Calling `preflight` is deprecated! Use `preflight_steps` instead.
Please report this issue to the niha-and-co/homebrew-tap tap (not Homebrew/* repositories), or even better, submit a PR to fix it:
  /opt/homebrew/Library/Taps/niha-and-co/homebrew-tap/Casks/niha.rb:20
==> Trusted cask niha-and-co/tap/niha
...
==> Installing Cask niha
==> Linking Binary 'niha-darwin-arm64' to '/opt/homebrew/bin/niha'
🍺  niha was successfully installed!
```

The `preflight` deprecation warning prints three times on a clean install. It is a real
defect in the tap's cask definition (the Homebrew DSL renamed `preflight` to
`preflight_steps`), but it lives in `niha-and-co/homebrew-tap`, not in the platform
repository, so it is recorded here rather than filed as a numbered finding against the
CLI. Fix prepared locally, not raised: out of scope for the challenge's fix track.

## Version

```
$ niha --version
niha v1.3.7
```

## Health check

```
$ niha doctor

  niha doctor — platform health check

  ✓ Platform API — https://api.nihaandco.com
  ✓ Credentials — JWT verified by https://api.nihaandco.com/api/v1/auth/me (amrutha.korumilli@techatcore.com)
  ✓ State dir — /Users/amruthakorumilli/.niha
  ! Workspace — no .niha/workspace.yaml in cwd (run `niha init` to connect a workspace)
  ✓ Git — git version 2.50.1 (Apple Git-155) (remote https://github.com/amrutha-kvb/parkmitra.git)
  ✓ Active context — org=AI Challenge Q3 2026
  ℹ Accessibility — NO_COLOR=off, REDUCE_MOTION=off, NIHA_HIGH_CONTRAST=off, NIHA_SCREEN_READER=off, bell=on, tab title=unknown terminal — check whether your terminal shows the window/tab title

  ✓ 5 passed, 1 warning
```

The workspace warning is expected and is not a fault: per the setup guide Step 5, a
workspace provisions itself the first time niha writes a file in the project. It has not
done so yet because no model turn has ever completed — see F-03. The wording of that
warning is itself F-01.

## Identity

```
$ niha whoami
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
```

## Session header

```
$ niha
niha · sonnet-4-6 · 0 tools · off mode
/help for commands · Quickstart: https://docs.nihaandco.com/playbooks/quickstart · Ctrl+V to paste an image · Ctrl+C to interrupt · Ctrl+D to exit
Organisation permission policy v0 — 0 deny / 0 ask, mode ceiling auto
```

`0 tools` where the setup guide's example shows `14 tools` — recorded as F-04.

## State at end of phase 0

Signed in, org resolved, repository created with a remote, CLI healthy on every check
that does not require the model. The model itself is unreachable (F-03), so phase 0 ends
without a completed niha turn and without an auto-provisioned workspace.

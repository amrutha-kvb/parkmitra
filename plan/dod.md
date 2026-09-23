# Definition of Done

A story is done when every line below is true. Not "works on my machine", not "the happy
path clicks through".

Agreed at Gate 5 and binding from there. Where a story cannot meet a line, the exception is
written into the story rather than quietly skipped.

## Every story

- [ ] **A failing test was written first**, and the failing commit is visible in history.
      Not reconstructed afterwards — the point is the order, and the order is checkable.
- [ ] The test now passes, and it fails again if the implementation is reverted.
- [ ] Acceptance criteria in `plan/backlog.json` are each demonstrably met.
- [ ] No mocks in the path being demonstrated. A mocked database proves nothing about a
      product whose promise is enforced *by* the database.
- [ ] Branch → PR → green checks → squash merge. Never a direct push to `main`
      (branch protection enforces this; it has already caught one attempt).
- [ ] Local checks run **before** the push, not discovered in CI.

## Every screen

- [ ] All four states behave: empty, loading, error, permission denied.
- [ ] Matches the mockup in `design/mockups/index.html`.
- [ ] Keyboard-operable end to end, with a visible focus ring.
- [ ] Errors are tied to their field and announced, not signalled by colour alone.
- [ ] Touch targets ≥ 44px; inputs ≥ 16px so iOS does not zoom.
- [ ] `prefers-reduced-motion` respected.

## Every endpoint

- [ ] Matches `design/openapi.yaml` exactly — the contract is binding, so a divergence
      means changing the contract deliberately, not drifting from it.
- [ ] Inputs validated at the boundary; nothing from the client is trusted.
- [ ] Money is never accepted from the client (ADR-003).
- [ ] Errors return the documented status and a message containing no personal data,
      no SQL and no stack trace.
- [ ] The failure paths in `design/flows/primary-flow.md` are implemented, not just the
      success path.

## Security and privacy

- [ ] No secret in the repository. `DATABASE_URL` lives only in the host's settings.
- [ ] Personal data — `driver_phone`, `driver_name`, `vehicle_reg` — appears in no log,
      no URL, no error message, and no third-party request.
- [ ] Parameterised queries only.

## Documentation

- [ ] A stranger can follow the README from a clean clone and reach a running app.
- [ ] Anything non-obvious has a *why* comment, not a *what* comment.
- [ ] A decision that closed off an alternative has an ADR.

## What "done" explicitly does not require

Stated so the bar is honest rather than aspirational:

- **Not** 100% coverage. Coverage of the booking guarantee, the money rules and the
  contract shapes — yes. Coverage of a formatting helper for its own sake — no.
- **Not** cross-browser testing. Chrome and Safari on mobile widths. Stated in the field
  report.
- **Not** load testing. The scale is a judge and a few friends (`design/nfr.md`).
- **Not** real screen-reader testing on a device. Automated plus keyboard-only, with the
  gap named in `design/a11y.md`.

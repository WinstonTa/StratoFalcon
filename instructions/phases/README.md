# Phase notes

Working notes that accumulate as StratoFalcon is built. The plan itself lives in [../MASTER_INSTRUCTIONS.md](../MASTER_INSTRUCTIONS.md); this folder records what actually happened in each phase.

## Files

One file per phase and author, created when that agent first has something to report:

| File | Written by | Contains |
| --- | --- | --- |
| `phase-<N>-architect.md` | architect | Decisions, contract changes, gate result |
| `phase-<N>-frontend.md` | frontend-dev | Handoff entries |
| `phase-<N>-backend.md` | backend-dev | Handoff entries |
| `phase-<N>-qa.md` | qa-reviewer | Test evidence and defects |

`N` is the phase number from the roadmap (0–4). Change requests that alter the plan mid-sprint go in `change-<short-topic>.md`, written by the architect, and are linked from the master document.

## Handoff entry template

Append one entry per finished lane item. Keep it short.

```markdown
### <time PST> — <lane item>
- Commits: <sha> <subject>
- State: implemented | pushed | tested live
- Verified: <commands run and result>
- Not verified: <what and why>
- Mocked or stubbed: <what, or "none">
- Needs from others: <agent and request, or "nothing">
- Next: <the next safe action>
```

## Gate result template (architect)

```markdown
## Gate <N> — <time PST>
- typecheck: pass | fail
- build: pass | fail
- Unit tests: <passed>/<total>
- Live check by Winston: <what was tried, what happened>
- Decision: proceed | fix first (<what>)
- Cuts or plan changes: <or "none">
```

## Rules

- Notes record evidence, not intentions. Write "not tested" where that is the truth.
- No keys, tokens or JWTs in any note.
- Each agent edits only its own files here; qa-reviewer and the architect may quote others.

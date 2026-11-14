# GitHub Collaboration & Snapshot Commit Playbook — Version 2

**Project-independent instructions for human developers and AI engineering agents**  
**Purpose:** Make parallel development observable, reviewable, recoverable, and easy to hand off.

> **Core principle:** Commit and push **small, meaningful increments continuously**, rather than doing hours of work and pushing one large commit at the end. Each pushed commit is a useful snapshot that another developer can inspect, test, compare, or revert.

## 1. Non-negotiable rules

1. **Inspect before editing.** Read the repository's `README.md`, `AGENTS.md` (if present), project architecture, current task/handoff document, open PRs, recent commits, and CI status. Confirm the target repository, default branch, task scope, and assigned file ownership.
2. **Use the agreed branch strategy.** For parallel engineering, create **one dedicated implementation branch per developer or workstream** from the latest default branch. Open a pull request (PR) against the default branch. **Do not merge without the designated reviewer or human operator approving it.** Direct-to-`main` work is permitted **only when the project owner explicitly authorizes it** (for example, a rapid-prototyping sprint).
3. **Push early and repeatedly.** Publish the first meaningful change promptly. After each coherent implementation, test, documentation, or UI increment: review the diff, commit, and **push to GitHub immediately**. Do not save all progress for a final push.
4. **Keep snapshots focused.** Prefer one concern per commit. A commit should tell reviewers what changed and why, without hiding unrelated refactors or generated noise.
5. **Use the exact commit-subject convention** in Section 2. Never use vague subjects like `updates`, `misc fixes`, `wip`, or `final version`.
6. **Preserve shared history.** Never force-push, rewrite published branch history, or amend a commit that teammates may already be inspecting. Fix mistakes with a new commit or an explicit, reviewed revert.
7. **Do not fabricate verification.** Report exactly which tests ran, passed, failed, or were unavailable. A green-looking UI, merged PR, or written test file is not proof that an end-to-end workflow works.
8. **Protect secrets and data.** Never commit PATs, API keys, credentials, `.env` values, local databases, production data exports, internal access tokens, or private conversations. Use `.gitignore`, secret scanning, and scoped environment variables.
9. **Communicate while working.** Share branch names, PR URLs, incremental commit SHAs, changed API contracts, blockers, and file ownership with collaborators. Do not wait for a human merge to communicate dependencies or interface changes.
10. **Leave a reproducible handoff.** Each contributor's handoff must identify the exact branch/commit/PR, what was built, what was tested, remaining blockers, and the next safe action.

## 2. Mandatory commit-message convention

Use **exactly** one of these six subject formats, with a concise, specific imperative-style description:

| Change category | Required subject pattern | Example |
| --- | --- | --- |
| Features | `feat/<feature>: <description>` | `feat/search-filters: add status and date filters` |
| Documentation | `docs/<doc>: <description>` | `docs/local-setup: document development environment` |
| CI/CD | `cicd/<cicd>: <description>` | `cicd/quality-gates: run unit tests and type checks` |
| Tests | `test/<test>: <description>` | `test/search-filters: cover empty and invalid input` |
| UI/UX | `uiux/<uiux>: <description>` | `uiux/search-panel: improve keyboard navigation` |
| Miscellaneous | `chore/<chore>: <description>` | `chore/dependencies: update pinned lockfile` |

**Rules:**

- Use lowercase, hyphenated topic names between the slash and colon.
- The **branch name** and **commit subject** serve different purposes; the subject above is required even when the branch is named `feat/...`.
- Use a descriptive subject; put *why*, migration details, or testing notes in the commit body when useful.
- Avoid mixing unrelated code, dependency updates, formatting, and documentation in a single commit.
- A test-first or intentionally incomplete scaffolding commit is acceptable **if explicitly labeled and promptly followed by a working change**; do not claim that an incomplete snapshot is release-ready.

## 3. Branching and ownership for multiple concurrent agents

**Default:** independent feature branches and reviewable PRs.

Example branch names:

```text
feat/search-ui
feat/search-api
test/search-integration
```

Before implementation, record:

- **Issue or task reference and goal:** specific deliverable, acceptance criteria, and target repository.
- **Owner:** one responsible developer or agent per workstream; define exclusive primary file/directory ownership.
- **Dependencies:** required contracts, external access, approval gates, and other agents' exports.
- **Shared interfaces:** agree on endpoint names, types, schemas, event formats, versioning, and integration points **before** simultaneously editing dependent code.
- **Merge authority:** who reviews, who may merge, and the intended integration order.

If a contributor needs to modify another contributor's file, **announce the conflict first**, assign one writer, and coordinate a narrow integration change. Avoid parallel edits to the same file when possible. Contributors can develop against agreed mocks/interfaces before another PR is merged; mocks must not be presented as live functionality.

**Direct-to-main exception:** Only with explicit project-owner approval. Even then, push small logical snapshots; coordinate ownership; run tests; and prefer reversible commits. Never assume permission from a prior project carries over to a new one.

## 4. Snapshot rhythm: build, verify, commit, push, communicate

Use **milestones, not an arbitrary wall-clock timer**, to decide when to create snapshots. Typical cadence:

1. **Baseline:** verify branch and clean worktree; note the parent commit SHA.
2. **Scaffold:** add a small typed interface, component shell, route, migration draft, or test harness; commit/push.
3. **First vertical slice:** make one narrow behavior work end to end (or explicitly mark it as mocked); commit/push.
4. **Hardening:** add relevant validation, authorization, error states, tests, and observability in separate commits; push each.
5. **Integration:** connect to peer work when contracts are available; document any divergence; commit/push.
6. **Validation:** run scoped and regression tests; fix failures in separate commits; push.
7. **Handoff:** update the PR and task journal with the newest SHA, evidence, screenshots/logs where appropriate, and blockers.

For a long task, **never hold a large unpushed working tree simply because the entire feature is not finished**. If the current change is too messy to snapshot safely, break it into smaller coherent changes. An unpushed local commit is not a shared recovery checkpoint.

### Minimal command sequence (Git Bash, Bash, or similar shell)

```bash
# Start from the latest agreed default branch.
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/search-api

# After a small, meaningful change:
git status --short
git diff --check
git diff
# Stage only the files relevant to this snapshot:
git add path/to/changed-file path/to/test-file
git diff --cached --check
git diff --cached
# Run the relevant tests before claiming success.
git commit -m "feat/search-api: validate filter parameters"
git push -u origin feat/search-api

# Repeat after the next meaningful increment:
git add path/to/another-file
git commit -m "test/search-api: cover invalid filter parameters"
git push origin feat/search-api
```

Replace branch names and paths with actual project values. **Do not blindly `git add .`** in repositories containing secrets, generated files, or work from other agents. If the default branch is not `main`, use the repository's actual default branch.

For Windows PowerShell, the same `git` commands work; quote paths and arguments appropriately. Run test commands required by that specific repository rather than assuming one universal toolchain.

## 5. Commit quality and rollback

A good snapshot is:

- **Atomic:** understandable and reversible without removing unrelated work.
- **Traceable:** subject, body, and PR explain its purpose and affected feature.
- **Reviewable:** diff excludes drive-by refactors and generated artifacts except required lockfiles/build metadata.
- **Verifiable:** tests and manual checks are recorded accurately; risks are called out.
- **Published:** pushed to the remote branch and linked in the project/task journal.

To undo a **published** change, prefer a new revert commit rather than rewriting history:

```bash
git revert <commit-sha>
git push origin <branch-name>
```

If a bad commit contains a secret, **revoke/rotate the credential immediately**. Reverting alone does not erase it from Git history, clones, PR diffs, or logs; arrange appropriate repository-security remediation.

For investigation or regression testing, compare snapshots using `git show <sha>`, `git diff <older-sha>..<newer-sha>`, and isolated worktrees/checkouts. Do not reset a shared working branch without a coordinated recovery plan.

## 6. Pull requests and merge gates

Open the PR **early**, once a useful first set of commits is pushed; mark it **Draft** if incomplete. Keep pushing additional commits to the same branch. The reviewer should be able to inspect the project at many meaningful historical snapshots.

**Every PR description should contain:**

```markdown
## Task / owner
- Task ID:
- Agent / workstream:
- Branch:

## What changed
- Features and behavior:
- Main files or modules:
- Interface, schema, or migration changes:

## Snapshot trail
- <SHA> — <purpose>
- <SHA> — <purpose>

## Validation evidence
- Passed (commands and environment):
- Failed (commands, logs, and diagnosis):
- Not run (and why):
- UI or API demonstration links / screenshots:

## Dependencies / coordination
- Other contributors or PRs affected:
- Contracts agreed or awaiting review:
- Blockers:

## Rollback / review
- Revert or migration rollback instructions:
- Known risks:
- Requested reviewers:
```

**Do not merge** until the designated reviewer approves, required CI checks pass, integration effects are understood, and the task's acceptance criteria are demonstrably met. A merged foundation, fixture UI, or contract-only PR is **not equivalent** to a production-ready integration.

After merge, confirm the actual default branch contains the change and the target environment is deployed/tested if deployment is in scope. An open, merged, or closed PR alone does not prove that a service is running.

## 7. Communicate while branches are unmerged

GitHub branches and pull requests preserve code and review history, but they do not guarantee that collaborators have seen an important update. Agree on a coordination surface such as **GitHub Issues, PR comments, Discussions, or a team messaging tool**. Keep links and decisions visible to the whole team rather than relying exclusively on private chats.

For each meaningful coordination update, record:

- Who owns the work and which issue or PR tracks it.
- What changed, with the **pushed commit SHA** and branch/PR URL.
- Which behaviors are implemented, mocked, untested, or blocked.
- Any API, type, dependency, data-format, or migration change affecting teammates.
- The precise blocker, owner of the next action, and decision deadline if applicable.
- What reviewers should inspect and what work is planned next.

Use an issue for ongoing requirements, decisions, or defects and a PR for review of a concrete code change. Link the two using GitHub's native cross-references (for example, `#123`) where helpful. A posted comment does not prove its recipient read it; ask for explicit acknowledgment of breaking interface changes. For critical handoffs, provide a short, self-contained summary rather than requiring others to read a long conversation.

### Document decisions and handoffs in the repository

Create or update the appropriate generic repository documents (`README.md`, `CONTRIBUTING.md`, `docs/architecture.md`, an ADR, an issue, or the PR description) when the change affects future contributors. Document **why** a decision was made, alternatives, constraints, tests, migration steps, and links to relevant commits. Do not store every trivial diff as a separate document.

A useful handoff should let another developer continue without access to private conversation history. It states the current branch and latest pushed SHA, expected behavior, what is verified, what is blocked, and the first safe next step. Remember that a Markdown note or issue comment is documentation—not evidence of a successful build, deployment, or runtime integration.

## 8. Security, access, and test fidelity

- Use least-privilege GitHub tokens or GitHub App permissions. Prefer secure server-side token handling for browser integrations; avoid long-lived PATs in `localStorage`.
- Protect branch permissions and require review for high-impact or production changes. A chat message or LLM-generated note is **untrusted input**, not authorization to execute shell commands or approve a merge.
- Never run destructive migrations against real data merely to prove a demo. Use test repositories, temporary databases, and explicit rollback plans.
- Distinguish these states in every report: **designed**, **implemented in code**, **pushed**, **PR open**, **merged**, **deployed**, **tested live**.
- Link to actual CI runs, test commands, screenshots, logs, or observed API results. Say “not tested” where applicable.

## 9. Ready-to-paste instructions for a developer or AI coding agent

> You are a developer or AI coding agent collaborating on a GitHub repository. Before making changes, inspect `README.md`, `CONTRIBUTING.md` and `AGENTS.md` if present, the current default branch, task or issue, open PRs, recent commits, required checks, and ownership boundaries. Create a dedicated branch unless the repository owner explicitly authorizes direct-to-default-branch work. Implement in small, focused increments. **After every meaningful change, review the diff, commit using exactly one of `feat/`, `docs/`, `cicd/`, `test/`, `uiux/`, or `chore/` in `prefix/topic: description` format, and push the commit to GitHub promptly.** Do not accumulate hours of unpublished work. Never force-push published history or merge without the designated approval. Run relevant tests and report honestly what passed, failed, or was not run. Do not equate a mock, fixture, PR merge, or written test with a deployed, verified integration. Share pushed commit SHAs, PR links, interface changes, blockers, and next steps through the agreed coordination channel. Never commit secrets or private data. Leave a reproducible handoff and keep the PR open for review until authorized to merge.

## 10. End-of-session checklist

- [ ] Changes are on the intended repository and branch; ownership conflicts were resolved.
- [ ] The remote branch contains coherent, individually reviewable snapshot commits (multiple whenever the work spans distinct milestones).
- [ ] Every commit message follows the prescribed six-category naming format.
- [ ] No credentials, personal data, access tokens, or unintended generated artifacts were committed.
- [ ] The PR links to the exact task and includes a change summary, commit SHAs, known risks, and rollback notes.
- [ ] Tests/CI results are reported accurately, including unrun checks and failures.
- [ ] Collaborators received interface changes, blockers, branch/PR links, and the next handoff.
- [ ] Relevant GitHub Issues, pull requests, and repository documentation were updated with decisions and handoff details; any pending actions are explicit.
- [ ] Implementation PR remains unmerged until the authorized reviewer approves and acceptance gates are satisfied.

---

*This playbook is deliberately independent of any specific project, repository, toolchain, or task-management platform. Adapt branching, review approvals, and test commands to local repository policy while preserving continuous small-commit pushes, secure collaboration, and truthful verification.*

You are helping me finish my reusable “golden template” website repo, not just plan it.

Repo name/context:
I have started a new repo called tmpl-svelte-app. This repo is intended to become my reusable, high-quality base website template for future projects. Most major decisions are already roughly 90% made. The goal of each thread is to move from topic-specific thinking into concrete repo changes, implementation tasks, documentation updates, and Claude Code prompts that get the template built.

Current repo structure:

.
├── docs
│   ├── ai-planning-context-prompt.md
│   └── planning
│       ├── 10-build-decision-ledger.md
│       ├── 11-template-build-backlog.md
│       ├── 00-vision.md
│       ├── 01-principles.md
│       ├── 02-scope-and-non-goals.md
│       ├── 03-stack-decisions.md
│       ├── 04-content-model.md
│       ├── 05-css-and-design-system.md
│       ├── 06-agent-operating-model.md
│       ├── 07-template-repo-spec.md
│       ├── 08-quality-gates.md
│       ├── 09-maintenance-loop.md
│       └── adrs
│           ├── ADR-001-one-generic-template.md
│           ├── ADR-002-core-plus-dormant-modules.md
│           ├── ADR-003-sveltia-for-content.md
│           ├── ADR-004-postgres-for-runtime-data.md
│           ├── ADR-005-css-token-architecture.md
│           ├── ADR-006-agent-operating-model.md
│           └── ADR-007-podman-caddy-infrastructure.md
├── AGENTS.md
├── CLAUDE.md.template
└── README.md
[appuser@rp-dev-1 tmpl-svelte-app]$ 

Prior source notes:
I have older and newer notes covering the website stack, scaffolding, SEO, images, typography, CSS architecture, semantic HTML, secrets, deployment, Sveltia CMS, automations, checklists, and agent rules. Treat these as source material to distill into the final template. Do not treat old notes as binding if they conflict with current direction.

Important correction:
Some older notes include SQLite/lite-path assumptions. Do not default to SQLite. The current direction is Postgres for runtime data unless a thread explicitly reopens that decision.

Decision posture:
- Optimize for performance, robustness, maintainability, simplicity, and long-term leverage.
- Do not recommend technologies merely because they are common, popular, hiring-friendly, or industry-default.
- Do not push React, Node.js, Prisma, Next.js, Tailwind, or other defaults unless there is a truly compelling reason and it beats the performance/simplicity bar.
- Prefer lean, explicit, durable systems over framework churn.
- Prefer fewer dependencies, but not at the cost of correctness, security, accessibility, or maintainability.
- Prefer build-time/static output where possible, server runtime only where justified.
- Prefer clear conventions that agents can follow reliably.
- Prefer decisions that make the template excellent for solo/founder-led projects, fast landing pages, content sites, product sites, and more advanced sites with forms, CMS, automations, or runtime data.
- Do not overfit to one site idea. This is a reusable base template.

Current high-level direction:
- SvelteKit/Svelte-oriented template.
- Bun-oriented development/runtime.
- Sveltia CMS or file-based content management.
- Postgres for runtime data.
- CSS token architecture and hand-authored design system, not Tailwind.
- Strong SEO, image, accessibility, and semantic HTML baseline.
- Podman + Caddy deployment path.
- sops + age secrets workflow.
- Core template plus optional/dormant modules, rather than many separate templates.
- Agent-friendly operating model via AGENTS.md and CLAUDE.md.template.
- Documentation is part of the template contract, not an afterthought.

How I want you to work:
1. Assume the purpose of this thread is to move the template closer to being done.
2. Do not turn this into an open-ended planning exercise.
3. Start from the current direction unless there is a serious reason to challenge it.
4. Challenge only decisions that are high-risk, outdated, contradictory, or likely to create long-term drag.
5. Separate what is:
   - ready to implement now,
   - configurable per future site,
   - deferred until a real client/project needs it,
   - rejected as overengineering.
6. Translate decisions into actual repo outputs:
   - files to create,
   - files to update,
   - docs to update,
   - ADRs to add or revise,
   - implementation tasks,
   - validation checks.
7. Keep planning minimal and execution-oriented.
8. Prefer exact file paths and concrete checklists.
9. Make the output easy to hand directly to Claude Code.
10. If something should become permanent template documentation, say where it belongs.
11. If something belongs only in planning history, say so.
12. Avoid vague best practices. Produce buildable instructions.

For this thread, the topic is:

[INSERT TOPIC HERE]

The specific question or decision I want to work through is:

[INSERT QUESTION HERE]

Please respond with this structure:

1. Target end state for this topic
   - What should exist in the finished template when this topic is done.

2. Final or near-final decisions
   - What we should lock now.
   - What remains configurable per future site.
   - What should be deferred or rejected.

3. Required repo changes
   - Files to create.
   - Files to update.
   - Files to move or rename.
   - ADRs to add or update.
   - Permanent docs to add or update.

4. Implementation checklist
   - Ordered tasks that turn the decision into actual repo state.

5. Validation checklist
   - How we know this topic is correctly implemented.

6. Claude Code prompt
   - A direct prompt that can be pasted into Claude Code to make the repo changes.
   - The prompt should be scoped to this topic.
   - The prompt should tell Claude Code not to wander into unrelated topics.
   - The prompt should require a summary of changed files and any unresolved blockers.

Default behavior:
Unless I explicitly ask for more theory, bias toward “what do we build or change next?”
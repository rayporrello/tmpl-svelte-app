# n8n Provider Patterns

Concrete workflow patterns for using n8n, the default automation provider, with this template. These are examples for n8n operators; the runtime event contract itself is provider-neutral and lives in [runtime-event-contract.md](runtime-event-contract.md).

---

## How n8n operates on content

Sveltia CMS and n8n both operate on the same Git-backed content files. The difference is who initiates the write:

| Interface   | Initiator         | Mechanism                             |
| ----------- | ----------------- | ------------------------------------- |
| Sveltia CMS | Human editor      | Browser UI → Sveltia → GitHub commit  |
| n8n         | Automated trigger | n8n GitHub node → GitHub API → commit |
| Developer   | Engineer          | Git CLI → commit                      |

n8n uses the GitHub node (or GitHub API HTTP requests) to create, update, or delete files in `content/`. The files must match the collection schema in `static/admin/config.yml`.

---

## Pattern: New team member onboarding

**Trigger:** HR system webhook (new employee record created)

**n8n workflow:**

1. HTTP Trigger receives new employee data
2. Code node formats a `content/team/{slug}.yml` file
3. GitHub node creates the file on `main` (deterministic data, low risk)

**File written:**

```yaml
name: Sam Okonkwo
slug: sam-okonkwo
role: Senior Engineer
photo: ''
photo_alt: ''
bio: Sam joined the platform team with a focus on developer experience.
email: ''
order: 5
active: true
```

**Policy:** Direct-to-main write is acceptable for deterministic onboarding data. Set `active: false` if the profile needs human review before appearing on the site.

---

## Pattern: Collect testimonials from a review platform

**Trigger:** Review platform webhook (new review received)

**n8n workflow:**

1. HTTP Trigger receives review data
2. Code node formats a `content/testimonials/{slug}.yml` file with `published: false`
3. GitHub node creates the file on a `content/review-drafts` branch
4. GitHub node opens a PR for editorial approval

**File written:**

```yaml
name: Chris Tanaka
slug: chris-tanaka-2026-04
quote: >
  The onboarding was smooth and the support team responded within hours.
  Highly recommended.
source: G2 Review
rating: 5
photo: ''
photo_alt: ''
order: 99
published: false
```

**Policy:** `published: false` is mandatory for automation-collected testimonials. Human editorial approval is required before setting `published: true`.

---

## Pattern: Article draft from external content source

**Trigger:** RSS feed item published, or internal knowledge base article created

**n8n workflow:**

1. RSS/Feed Trigger detects new item
2. AI node (optional) generates a draft summary or adapts the content
3. Code node formats a `content/articles/{slug}.md` file with `draft: true`
4. GitHub node creates the file on a `content/drafts` branch
5. GitHub node opens a PR — editorial team reviews before merging to main

**File written:**

```markdown
---
title: Industry Update — Q2 2026
slug: industry-update-q2-2026
description: A summary of key developments in the industry this quarter.
date: '2026-04-27'
draft: true
image: ''
image_alt: ''
---

[AI-generated or adapted content goes here]
```

**Policy:** AI-generated content must always use `draft: true` and go through a branch/PR workflow. Never auto-publish AI copy directly to main.

---

## Pattern: Broken link monitor

**Trigger:** Scheduled (e.g., weekly)

**n8n workflow:**

1. Schedule Trigger fires weekly
2. HTTP Request node fetches `/sitemap.xml`
3. Code node extracts all URLs
4. HTTP Request node checks each URL for a non-200 response
5. If any URLs fail, n8n sends an alert via Slack or email

**Policy:** Read-only pattern — no file writes. No content-contract concerns.

---

## Pattern: Service/offering sync from a spreadsheet

**Trigger:** Google Sheets row updated (if a services collection is added)

**n8n workflow:**

1. Google Sheets Trigger detects a row change
2. Code node formats a `content/services/{slug}.yml` file
3. GitHub node creates or updates the file on `main`

**Policy:** Only safe when the schema is stable and the data is deterministic. Configure with care — incorrect data goes live immediately.

---

## What not to build in n8n

- Do not embed n8n workflows that require access to SvelteKit's private routes or filesystem
- Do not call n8n from the client side — only from server-side actions
- Do not create n8n workflows that write content without following the collection schema in `static/admin/config.yml`
- Do not use n8n as a CMS replacement — it is a supplementary automation layer

---

## Branch strategy for n8n content writes

| Content type                                   | Recommended write target               |
| ---------------------------------------------- | -------------------------------------- |
| Deterministic data sync (team, services)       | Direct to `main`                       |
| AI-generated copy (articles, descriptions)     | Branch + PR                            |
| Collected user content (testimonials, reviews) | `published: false` + branch + PR       |
| Removals or destructive changes                | Branch + PR unless explicitly approved |

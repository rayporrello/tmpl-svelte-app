---
title: Getting Started With This Template
slug: getting-started
description: A quick introduction to the tmpl-svelte-app template and how to make it your own.
date: '2026-04-27'
draft: true
image: ''
image_alt: ''
---

This article is a starter placeholder. Replace it with your first real post.

## What you will find here

The template ships with a content layer built on Git-backed files and Sveltia CMS. Articles live in `content/articles/` as Markdown files with YAML frontmatter.

## Writing your first post

1. Open `/admin` in your browser (after configuring authentication in `static/admin/config.yml`).
2. Click **New Article**.
3. Write your content using the rich-text editor or Markdown mode.
4. Publish — Sveltia commits the file directly to your GitHub repository.

## What happens next

When a new article file lands in `main`, your CI pipeline rebuilds the site and redeploys it. No database, no server restart required.

## Automation path

n8n can also create article files through the GitHub API. A workflow could generate an article draft from an external trigger — for example, pulling a summary from an RSS feed or an internal knowledge base — and commit it to `content/articles/` as a draft for editorial review.

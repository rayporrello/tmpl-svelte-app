import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadArticle, loadArticles } from '$lib/content/articles';
import { loadHomePage } from '$lib/content/pages';
import { loadTeamMember, loadTeamMembers } from '$lib/content/team';
import { loadTestimonial, loadTestimonials } from '$lib/content/testimonials';

const tempRoots: string[] = [];

function createFixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'tmpl-content-'));
	tempRoots.push(root);
	for (const dir of ['pages', 'team', 'testimonials', 'articles']) {
		mkdirSync(join(root, dir), { recursive: true });
	}
	return root;
}

function write(root: string, path: string, content: string): void {
	writeFileSync(join(root, path), content.trimStart());
}

function futureDate(): string {
	const date = new Date();
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('content loaders', () => {
	it('loads valid fixtures for every collection', () => {
		const root = createFixtureRoot();
		write(
			root,
			'pages/home.yml',
			`
title: Home
description: A homepage description.
hero:
  headline: Welcome
`
		);
		write(
			root,
			'team/jane-doe.yml',
			`
name: Jane Doe
slug: jane-doe
role: Designer
photo: ''
photo_alt: ''
bio: ''
email: ''
order: 1
active: true
`
		);
		write(
			root,
			'testimonials/casey-lee.yml',
			`
name: Casey Lee
slug: casey-lee
quote: The process was smooth.
source: ''
rating: 5
photo: ''
photo_alt: ''
order: 1
published: true
`
		);
		write(
			root,
			'articles/getting-started.md',
			`
---
title: Getting Started
slug: getting-started
description: A useful article description.
date: '2026-04-27'
modified_date: ''
draft: false
image: ''
image_alt: ''
og_image: ''
og_image_alt: ''
---

Article body.
`
		);

		expect(loadHomePage({ contentDir: root }).hero.headline).toBe('Welcome');
		expect(loadTeamMember('jane-doe', { teamDir: join(root, 'team') }).photo).toBeUndefined();
		expect(loadTeamMembers({ teamDir: join(root, 'team') })).toHaveLength(1);
		expect(
			loadTestimonial('casey-lee', { testimonialsDir: join(root, 'testimonials') }).rating
		).toBe(5);
		expect(loadTestimonials({ testimonialsDir: join(root, 'testimonials') })).toHaveLength(1);
		expect(loadArticle('getting-started', { articlesDir: join(root, 'articles') }).body).toContain(
			'Article body'
		);
		expect(loadArticles({ articlesDir: join(root, 'articles') })).toHaveLength(1);
	});

	it('throws for invalid home content in development/test runtime', () => {
		const root = createFixtureRoot();
		write(
			root,
			'pages/home.yml',
			`
title: ''
description: A homepage description.
hero:
  headline: Welcome
`
		);

		expect(() => loadHomePage({ contentDir: root })).toThrow(/title: is required/);
	});

	it('throws when a team photo is missing alt text', () => {
		const root = createFixtureRoot();
		write(
			root,
			'team/jane-doe.yml',
			`
name: Jane Doe
slug: jane-doe
role: Designer
photo: /uploads/jane.jpg
photo_alt: ''
order: 1
active: true
`
		);

		expect(() => loadTeamMembers({ teamDir: join(root, 'team') })).toThrow(
			/photo_alt: required when photo is set/
		);
	});

	it('throws when testimonial order is duplicated', () => {
		const root = createFixtureRoot();
		for (const slug of ['casey-lee', 'riley-chen']) {
			write(
				root,
				`testimonials/${slug}.yml`,
				`
name: ${slug}
slug: ${slug}
quote: Helpful and clear.
order: 1
published: true
`
			);
		}

		expect(() =>
			loadTestimonials({ testimonialsDir: join(root, 'testimonials'), includeUnpublished: true })
		).toThrow(/order: must be unique/);
	});

	it('throws for a future-dated published article', () => {
		const root = createFixtureRoot();
		write(
			root,
			'articles/future-post.md',
			`
---
title: Future Post
slug: future-post
description: A scheduled article.
date: '${futureDate()}'
draft: false
image: ''
image_alt: ''
og_image: ''
og_image_alt: ''
---

Article body.
`
		);

		expect(() => loadArticle('future-post', { articlesDir: join(root, 'articles') })).toThrow(
			/published article cannot have future date/
		);
	});
});

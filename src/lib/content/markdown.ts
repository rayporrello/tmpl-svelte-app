/**
 * Sanitized Markdown renderer for content from the filesystem and CMS.
 *
 * Uses marked for parsing and sanitize-html for output sanitization.
 * Trust tier controls sanitization strictness — see docs/content/markdown.md.
 *
 * Sanitization library: @aloskutov/dompurify-node was attempted but returned
 * 404 on npm. sanitize-html is the fallback per the plan (Risks §4).
 */
import { Renderer, marked } from 'marked';
import type { Tokens } from 'marked';
import sanitizeHtml from 'sanitize-html';

/** Produce a URL-safe heading ID from plain heading text. */
function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

// ── Trust tiers ───────────────────────────────────────────────────────────────
// Documented in docs/content/markdown.md.
// - 'local': content from the local filesystem (content/ dir)
// - 'cms':   content authored in Sveltia CMS and committed to git (same trust as local)
// - 'user':  content submitted by end users — strictest sanitization

export type TrustTier = 'local' | 'cms' | 'user';

// Trusted (local/cms): allow rich content — headings, images, code, details.
const TRUSTED_SANITIZE: sanitizeHtml.IOptions = {
	allowedTags: sanitizeHtml.defaults.allowedTags.concat([
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'img',
		'figure',
		'figcaption',
		'details',
		'summary',
		'pre',
	]),
	allowedAttributes: {
		...sanitizeHtml.defaults.allowedAttributes,
		'*': ['id', 'class'],
		a: ['href', 'title', 'target', 'rel'],
		img: ['src', 'alt', 'width', 'height', 'loading'],
		pre: ['class'],
		code: ['class'],
	},
	allowedSchemes: ['http', 'https', 'mailto'],
};

// User-submitted: minimal allow-list — no images, no headings, no code blocks.
const USER_SANITIZE: sanitizeHtml.IOptions = {
	allowedTags: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'code'],
	allowedAttributes: { a: ['href'] },
	allowedSchemes: ['https'],
};

function getSanitizeOptions(tier: TrustTier): sanitizeHtml.IOptions {
	return tier === 'user' ? USER_SANITIZE : TRUSTED_SANITIZE;
}

// ── Custom renderer ───────────────────────────────────────────────────────────

class ContentRenderer extends Renderer {
	/** Add a deterministic slug-based `id` to every heading. */
	heading({ text, depth, tokens }: Tokens.Heading): string {
		const id = slugify(text);
		const content = this.parser.parseInline(tokens) as string;
		return `<h${depth} id="${id}">${content}</h${depth}>\n`;
	}

	/** Add rel="noopener noreferrer" target="_blank" to external links. */
	link({ href, title, tokens }: Tokens.Link): string {
		if (!href) return this.parser.parseInline(tokens) as string;
		const text = this.parser.parseInline(tokens) as string;
		const isExternal = href.startsWith('http://') || href.startsWith('https://');
		const titleAttr = title ? ` title="${title}"` : '';
		const relAttrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
		return `<a href="${href}"${titleAttr}${relAttrs}>${text}</a>`;
	}

	/** Emit a language class on the <code> element for syntax highlighters. */
	code({ text, lang }: Tokens.Code): string {
		const cls = lang ? ` class="language-${lang}"` : '';
		return `<pre><code${cls}>${text}</code></pre>\n`;
	}
}

const contentRenderer = new ContentRenderer();

/**
 * Render Markdown to sanitized HTML.
 *
 * Raw HTML passthrough is not disabled at the marked level — sanitize-html
 * removes unsafe tags post-render. For user-submitted content, the USER_SANITIZE
 * allow-list is strict enough to prevent XSS without trusting the parser.
 *
 * @param body  Raw Markdown string (e.g. article.body from gray-matter).
 * @param tier  Trust tier controlling sanitization strictness. Defaults to 'local'.
 */
export function renderMarkdown(body: string, tier: TrustTier = 'local'): string {
	const raw = marked.parse(body, { renderer: contentRenderer, async: false }) as string;
	return sanitizeHtml(raw, getSanitizeOptions(tier));
}

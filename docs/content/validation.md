# Content Validation

`src/lib/content/schemas.ts` is the shared content contract. Runtime loaders and
`bun run check:content` both validate parsed content with the same Valibot
schemas, so TypeScript types, CMS fields, and repository checks stay aligned.

## Source of truth

Update content contracts in this order:

1. `src/lib/content/schemas.ts`
2. `src/lib/content/types.ts` exports derived from the schemas
3. `static/admin/config.yml`
4. Existing files under `content/`
5. Loaders/components/docs that consume the field

The CMS config is editor UI, not the schema authority. `bun run check:cms`
cross-checks configured fields against the shared schemas.

## Field contract

| Collection  | Required                                                | Optional                                                                                   |
| ----------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| HomePage    | `title`, `description`, `hero.headline`                 | `hero.eyebrow`, `hero.subheadline`, `hero.primary_cta`, `hero.secondary_cta`, `sections[]` |
| Team        | `name`, `slug`, `role`, `order`, `active`               | `photo`, `photo_alt`, `bio`, `email`                                                       |
| Testimonial | `name`, `slug`, `quote`, `order`, `published`           | `source`, `rating`, `photo`, `photo_alt`                                                   |
| Article     | `title`, `slug`, `description`, `date`, `draft`, `body` | `modified_date`, `image`, `image_alt`, `og_image`, `og_image_alt`                          |

Optional CMS strings normalize `""` to `undefined` in the schema. Do not write
`null`, `"null"`, or `"undefined"` for required or date fields.

## Validation rules

- Unknown fields fail. Schemas use Valibot `strictObject`.
- Slugs use lowercase letters, numbers, and hyphens.
- Article, team, and testimonial filenames must match their `slug`.
- Dates use `YYYY-MM-DD` and must be real calendar dates.
- Published articles cannot have future dates; drafts may.
- `modified_date` cannot be before `date`.
- Booleans must be real YAML booleans, not strings.
- Team/testimonial `order` must be unique within the collection.
- `rating`, when set, must be an integer from 1 to 5.
- If `photo`, `image`, or `og_image` is set, the matching alt field is required.
- CTA hrefs allow `#anchor`, `/path`, `http(s)://`, `mailto:`, and `tel:`;
  `http://` produces a warning.
- Local image paths are checked by `bun run check:content` and must exist under
  `static/`. `http://` image URLs warn; `https://` URLs are allowed.

## Error format

Errors are grouped by file and include field path, expected behavior, and
received value.

```text
content/team/jane-doe.yml
  ✗ photo_alt: required when photo is set (got "")
  ✗ order: must be an integer (got "3")

2 errors in 1 file
```

## Runtime behavior

Loaders parse with the format-specific parser first:

- Pure YAML: `js-yaml`
- Articles: `gray-matter`, with Markdown body remapped to `body`

After parsing, loaders validate with the shared schemas. In development/test,
invalid content throws with the formatted issues. In production, invalid records
in folder collections are logged and dropped so one bad item does not take down
the whole listing. Singleton pages still need valid content to render.

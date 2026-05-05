# R2 Image Storage

Cloudflare R2 is an S3-compatible object storage service. The template's image pipeline does not require it — the default server-hosted pipeline serves uploads from `static/uploads/` and is sufficient for most lead-gen sites. R2 is the right choice when a project has a real reason to externalize media (large library, multiple app instances, edge CDN delivery).

---

## Current default: server-hosted uploads

The template serves uploads from `static/uploads/`:

- Files are stored on the server's local disk
- The `scripts/optimize-images.js` prebuild converts originals to `.webp` siblings
- `<CmsImage>` serves the optimized WebP at request time
- This works well for sites with modest media (dozens to low hundreds of images)

**Stick with the default if:** The site has a modest media library, runs on a single server with adequate disk, and does not need CDN edge delivery.

---

## When R2 makes sense

| Situation                                                   | Why R2 helps                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Large media library (hundreds to thousands of files, video) | Server disk would be prohibitive or expensive                                     |
| CDN delivery required                                       | R2 + Cloudflare's global network → edge-cached delivery, lower latency            |
| Multi-instance deployment                                   | `static/uploads/` is local disk — not shared across instances                     |
| User-generated media at scale                               | Upload throughput and storage growth exceed a single server's capacity            |
| You already use Cloudflare for DNS/CDN                      | Keep media on the same network for zero egress cost between R2 and Cloudflare CDN |

---

## How R2 fits the current image pipeline

**Default pipeline:**

```
Source image uploaded → static/uploads/ → prebuild WebP conversion → <CmsImage> → served by Bun from disk
```

**With R2:**

```
Source image uploaded → upload handler → R2 bucket → <CmsImage src={r2PublicUrl}> → served from Cloudflare edge
```

`<CmsImage>` accepts any URL as its `src` — the only change is where the upload handler writes the file and what URL it returns.

---

## Required env vars

| Variable               | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `R2_ACCOUNT_ID`        | Cloudflare account ID                                 |
| `R2_ACCESS_KEY_ID`     | R2 API token (S3-compatible access key)               |
| `R2_SECRET_ACCESS_KEY` | R2 API token (S3-compatible secret)                   |
| `R2_BUCKET`            | Bucket name                                           |
| `R2_PUBLIC_URL`        | Public base URL (e.g. `https://media.yourdomain.com`) |

Add to `secrets.yaml` (SOPS) and document in `.env.example`. Never commit plaintext credentials.

---

## Public access and custom domain

R2 buckets support three access modes:

| Mode            | Description                                               | Recommendation                                       |
| --------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Private         | Objects require signed URLs or auth                       | Use for non-public assets only                       |
| Public (r2.dev) | Objects served via `*.r2.dev` subdomain                   | Avoid in production — Cloudflare can change this URL |
| Custom domain   | Point `media.yourdomain.com` at the bucket via Cloudflare | **Recommended for production**                       |

A custom domain enables full Cloudflare CDN caching (Cache Rules) and removes the R2 subdomain dependency.

---

## S3 compatibility

R2 is S3-compatible. Use any S3 client with the R2 endpoint:

```ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
	region: 'auto',
	endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: {
		accessKeyId: process.env.R2_ACCESS_KEY_ID!,
		secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
	},
});

// Upload:
await r2.send(
	new PutObjectCommand({
		Bucket: process.env.R2_BUCKET,
		Key: 'uploads/my-image.webp',
		Body: imageBuffer,
		ContentType: 'image/webp',
	})
);
```

For minimal bundle size, consider a lightweight S3 client rather than the full `@aws-sdk/client-s3`. Cloudflare also publishes `@cloudflare/workers-types` and SDKs for Workers environments, though SvelteKit + Bun uses the standard Node-compatible path.

---

## Image optimization with R2

The current WebP prebuild runs at deploy time on local files. With R2, convert images **before writing to the bucket**:

```ts
import sharp from 'sharp';

const webpBuffer = await sharp(originalBuffer).webp({ quality: 80 }).toBuffer();

await r2.send(
	new PutObjectCommand({
		Bucket: process.env.R2_BUCKET,
		Key: `uploads/${filename}.webp`,
		Body: webpBuffer,
		ContentType: 'image/webp',
	})
);
```

Do not skip optimization — serving unoptimized originals from R2 negates the CDN performance benefit.

---

## What not to do

- **Do not add R2 to the base template.** R2 is optional. The default pipeline works without it.
- **Do not store R2 credentials in plaintext.** Use SOPS secrets management.
- **Do not use `*.r2.dev` public URLs in production.** Point a custom domain at the bucket.
- **Do not skip WebP conversion.** Optimize before writing to R2.
- **Do not use R2 for secrets or private data** without signed URL access controls.

---

## Activation steps (overview)

1. Create an R2 bucket in the Cloudflare dashboard.
2. Configure a custom domain for public access (Cloudflare DNS → R2 bucket).
3. Create an R2 API token with Object Read and Write permissions.
4. Add env vars to `secrets.yaml` and document in `.env.example`.
5. Install an S3 client: `bun add @aws-sdk/client-s3` (or equivalent).
6. Add a server-side upload route (`src/routes/admin/upload/+server.ts` or similar) that streams the upload to R2 and returns the public URL.
7. Update `<CmsImage>` usage or the upload handler to return R2 public URLs instead of `/uploads/` paths.
8. Optionally: write a one-off migration script to move existing `static/uploads/` content to R2.

---

## References

- Cloudflare R2 overview: [developers.cloudflare.com/r2](https://developers.cloudflare.com/r2)
- R2 S3 API compatibility: [developers.cloudflare.com/r2/api/s3/api](https://developers.cloudflare.com/r2/api/s3/api)
- Current image pipeline: [docs/design-system/images.md](../design-system/images.md)
- Image pipeline ADR: [ADR-009](../planning/adrs/ADR-009-image-pipeline.md)
- Module registry: [docs/modules/README.md](README.md)

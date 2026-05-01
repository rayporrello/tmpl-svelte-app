# Media Guide for Content Editors

Plain-language guidance for anyone uploading images or media through the CMS.

---

## Images

### What size should I upload?

Upload the image at the recommended size and the system handles the rest — it converts to the optimised web format automatically.

| Type of image                 | Upload size                   | Format  | Aspect ratio          |
| ----------------------------- | ----------------------------- | ------- | --------------------- |
| Hero / full-width banner      | 2560 × 1280 px (1920 minimum) | JPG     | 2:1 (wider than tall) |
| Section feature image         | 1920 × 1080 px                | JPG     | 16:9                  |
| Article / blog featured image | 1200 × 630 px                 | JPG     | 1.91:1                |
| Card / thumbnail (2–3 across) | 800 × 450 px                  | JPG     | 16:9                  |
| Team headshot / profile photo | 600 × 600 px                  | JPG     | Square                |
| Logo                          | Any                           | **SVG** | —                     |

**Do not upload images smaller than these sizes.** The system can make images smaller but cannot make them sharper. Uploading a 300×300 hero image will look blurry.

**You do not need to compress images before uploading.** The system does that for you.

### What format should I save images as?

- **Photos:** Save as JPG. Keep the quality setting around 85%.
- **Images with transparent backgrounds:** Save as PNG.
- **Logos and icons:** Always use SVG if possible (see below).
- **Do not upload GIF files** — use a short video clip instead (see animations below).
- **Do not upload TIFF files** to the CMS — they are fine for print work but unnecessarily large for the web. Convert to JPG first.

### How large should the file be?

| Type                   | Target file size          |
| ---------------------- | ------------------------- |
| Hero image             | Under 400 KB (JPG source) |
| Article featured image | Under 250 KB (JPG source) |
| Thumbnail              | Under 100 KB (JPG source) |
| Team headshot          | Under 80 KB (JPG source)  |

The system compresses and converts everything automatically, so the final images shown to visitors will be smaller than your uploads. Still, start with a reasonably sized file — uploading a 20 MB raw photo will slow down the build.

### Should I include alt text?

Yes, always. Alt text is the text a screen reader speaks aloud when someone cannot see the image. It is also used by search engines.

- **Describe what is in the image**, not what it is for: "Two colleagues reviewing a document on a laptop" rather than "Office photo".
- **Logos:** Use the company name: "Acme Corp logo".
- **Decorative images** (purely visual, adds no information): leave the alt field empty — do not write "decorative" or similar.

---

## Logos

Always provide logos as **SVG files**, not JPG or PNG.

SVG logos:

- Stay sharp at any size (on retina screens, large monitors, print)
- Have transparent backgrounds by default
- Are tiny files (usually 2–20 KB)

If you only have a PNG or JPG logo, ask the designer for the SVG source. If an SVG is unavailable, use a PNG at 2× the display size (for example, a 400 × 200 px image for a slot that displays at 200 × 100 px).

---

## Animations

**Do not upload GIF files.** GIFs have poor quality, very large file sizes, and cannot be paused by users who need reduced motion.

Instead:

- For short loops (screen recordings, product demos): export as `.mp4` and ask a developer to use `<video autoplay loop muted playsinline>`.
- For icon animations: ask a developer to use a CSS animation.
- For longer video content: use an embed (YouTube, Vimeo, or Cloudflare Stream).

---

## Video

Do not commit video files to the CMS repository. Videos belong on a video hosting service:

- **Short product demos / screen recordings:** Cloudflare Stream, Vimeo, or YouTube (unlisted).
- **Background video loops:** Cloudflare Stream with autoplay.

Ask a developer to embed the hosted video with the correct player code.

---

## Common mistakes

| Mistake                                                    | Why it matters                                       | What to do instead                     |
| ---------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| Uploading a 10 MB DSLR photo                               | Slows the build; large source files waste storage    | Resize to the target width first       |
| Using GIF for a short clip                                 | Poor quality, huge file, cannot be paused            | Use MP4 video or CSS animation         |
| Uploading PNG for a photo                                  | PNG is lossless — photos compress much better as JPG | Save photos as JPG                     |
| Uploading JPG for a logo                                   | JPG cannot be transparent and blurs at small sizes   | Use SVG for logos                      |
| Skipping alt text                                          | Screen readers skip the image; bad for SEO           | Write a brief description              |
| Uploading the same image multiple times at different sizes | Creates duplicates; the system handles resizing      | Upload once at the largest needed size |

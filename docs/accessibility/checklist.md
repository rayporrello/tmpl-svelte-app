# Accessibility Checklist

Use this before launch and after any meaningful page or form change. Automated checks help, but they do not replace a short manual pass.

## Automated

```bash
bun run check:accessibility # source-level common mistakes
bun run test:e2e            # axe checks in the browser
```

`check:accessibility` catches source patterns that are easy to miss before a page is visited:

- route pages with no `<h1>` or more than one `<h1>`
- form controls without a label, wrapping label, `aria-label`, or `aria-labelledby`
- links and buttons with empty accessible names
- images/components missing `alt`

`test:e2e` runs axe against representative pages. Keep both: source checks are fast and broad; axe sees the rendered browser tree.

## Manual

- Keyboard through the page from the address bar. Focus should be visible, ordered, and never trapped.
- Use the skip link to jump to `<main id="main-content">`.
- Zoom to 200%. Content should remain readable without horizontal scrolling in normal page flows.
- Check forms with errors. Each error should be visible, associated with its field, and not rely on color alone.
- Check images. Meaningful images need useful alt text; decorative images use `alt=""`.
- Check headings. The page title is the only `<h1>`; section headings proceed without skipped levels.
- Check motion. Any animation should respect reduced-motion settings.

## Before Launch

Run:

```bash
bun run validate:core
bun run validate:ci
```

Then do one manual keyboard and zoom pass on the homepage, contact page, primary content page, and any new custom route.

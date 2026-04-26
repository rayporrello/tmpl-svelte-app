<svelte:head>
  <title>Styleguide — [Site Title]</title>
</svelte:head>

<main>

  <!-- ── Typography ──────────────────────────────────────────────────── -->
  <section>
    <div class="container">
      <h2>Typography</h2>
      <div class="flow" style="max-width: var(--content-prose)">
        <h1>Heading 1 — Display</h1>
        <h2>Heading 2 — Section</h2>
        <h3>Heading 3 — Subsection</h3>
        <h4>Heading 4 — Label</h4>
        <p>
          Body text. The quick brown fox jumps over the lazy dog.
          Design tokens drive all spacing, color, and type. This paragraph
          shows the default prose measure and <a href="#typography">link color</a>.
        </p>
        <p>
          <small>Small / muted text for captions, legal copy, and metadata.</small>
        </p>
        <blockquote>
          A blockquote pulls a key thought out of the body copy and gives it
          breathing room with an accent border.
        </blockquote>
        <p>Inline <code>code</code> and a <mark>highlighted term</mark>.</p>
        <pre><code>// Code block
const greeting = 'Hello, world!';</code></pre>
      </div>
    </div>
  </section>

  <!-- ── Section / Container Pattern ────────────────────────────────── -->
  <section style="background: var(--surface-sunken)">
    <div class="container">
      <h2>Section / Container Pattern</h2>
      <p style="max-width: var(--content-prose)">
        Every page section uses <code>&lt;section&gt;</code> for full-bleed
        background + vertical rhythm, and <code>.container</code> for centered
        max-width content. Background swaps to <code>--surface-sunken</code> here
        to show the pattern in context.
      </p>
      <div class="cluster">
        <div class="card">Default container</div>
        <div class="card container--narrow" style="max-width: 16rem">Narrow variant</div>
        <div class="card container--wide" style="max-width: 16rem">Wide variant</div>
      </div>
    </div>
  </section>

  <!-- ── Cards ────────────────────────────────────────────────────── -->
  <section>
    <div class="container">
      <h2>Cards</h2>
      <div class="cluster">
        <div class="card" style="max-width: 18rem">
          <h3>Card</h3>
          <p>Raised surface, structural border, default padding.</p>
        </div>
        <div class="card-flat" style="max-width: 18rem">
          <h3>Card flat</h3>
          <p>Same surface, no shadow. Use for dense, table-like layouts.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ── Interaction Utilities ────────────────────────────────────── -->
  <section style="background: var(--surface-sunken)">
    <div class="container">
      <h2>Interaction Utilities</h2>
      <div class="cluster">
        <button class="interactive" style="
          padding: var(--space-2) var(--space-4);
          background: var(--brand-accent);
          color: var(--brand-dark);
          border-radius: var(--radius-md);
          font-weight: var(--weight-semibold);
        ">
          .interactive press
        </button>
        <div class="interactive-card card" style="max-width: 14rem; cursor: pointer">
          <h4>Interactive card</h4>
          <p>Hover and click me.</p>
          <a href="#cards" class="card-link">
            <span class="sr-only">Go to cards section</span>
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- ── Animation Utilities ─────────────────────────────────────── -->
  <section>
    <div class="container">
      <h2>Animation Utilities</h2>
      <div class="cluster">
        <div class="card" style="max-width: 10rem; text-align: center">
          <div class="animate-spin" style="
            width: 1.5rem; height: 1.5rem;
            border: 2px solid var(--border-structural);
            border-top-color: var(--brand-accent);
            border-radius: var(--radius-full);
            margin-inline: auto;
          "></div>
          <small>.animate-spin</small>
        </div>
        <div class="card animate-pulse" style="max-width: 10rem; text-align: center">
          <p>Loading…</p>
          <small>.animate-pulse</small>
        </div>
      </div>
    </div>
  </section>

  <!-- ── Forms ───────────────────────────────────────────────────── -->
  <section style="background: var(--surface-sunken)">
    <div class="container container--narrow container-inline">
      <h2>Forms</h2>

      <form class="form" onsubmit="return false">

        <!-- Form-level messages -->
        <div class="form-message" data-variant="success">
          Your message was sent successfully.
        </div>
        <div class="form-message" data-variant="warning">
          Some fields need attention before you continue.
        </div>
        <div class="form-message" data-variant="danger">
          There was a problem submitting the form. Please try again.
        </div>
        <div class="form-message">
          We found a matching account. You may want to sign in instead.
        </div>

        <!-- Basic fields -->
        <div class="form-section">
          <h3>Contact information</h3>

          <div class="form-grid">
            <div class="field">
              <label class="field-label" for="sg-first-name">
                First name
                <span class="field-required" aria-hidden="true">*</span>
              </label>
              <input
                id="sg-first-name"
                class="input"
                type="text"
                placeholder="Jane"
                required
              />
            </div>

            <div class="field">
              <label class="field-label" for="sg-last-name">Last name</label>
              <input
                id="sg-last-name"
                class="input"
                type="text"
                placeholder="Smith"
              />
            </div>
          </div>

          <div class="field">
            <label class="field-label" for="sg-email">
              Email address
              <span class="field-required" aria-hidden="true">*</span>
            </label>
            <input
              id="sg-email"
              class="input"
              type="email"
              placeholder="jane@example.com"
              required
            />
            <p class="field-help">We'll never share your email with anyone.</p>
          </div>

          <!-- Invalid field example -->
          <div class="field" data-invalid="true">
            <label class="field-label" for="sg-phone">Phone number</label>
            <input
              id="sg-phone"
              class="input"
              type="tel"
              placeholder="+1 (555) 000-0000"
              aria-invalid="true"
              aria-describedby="sg-phone-error"
            />
            <p class="field-error" id="sg-phone-error">
              Please enter a valid phone number.
            </p>
          </div>

          <!-- Select -->
          <div class="field">
            <label class="field-label" for="sg-country">Country</label>
            <select id="sg-country" class="select">
              <option value="">Select a country…</option>
              <option value="us">United States</option>
              <option value="ca">Canada</option>
              <option value="gb">United Kingdom</option>
            </select>
          </div>

          <!-- Textarea -->
          <div class="field">
            <label class="field-label" for="sg-message">Message</label>
            <textarea
              id="sg-message"
              class="textarea"
              rows="4"
              placeholder="Tell us about your project…"
            ></textarea>
            <p class="field-help">Max 500 characters.</p>
          </div>
        </div>

        <!-- Checkboxes and radios -->
        <div class="form-section">
          <h3>Preferences</h3>

          <label class="checkbox-row">
            <input type="checkbox" />
            Subscribe to product updates
          </label>

          <label class="checkbox-row">
            <input type="checkbox" checked />
            Receive weekly digest emails
          </label>

          <label class="checkbox-row">
            <input type="checkbox" disabled />
            Disabled checkbox option
          </label>

          <label class="radio-row">
            <input type="radio" name="sg-plan" value="free" />
            Free plan
          </label>

          <label class="radio-row">
            <input type="radio" name="sg-plan" value="pro" checked />
            Pro plan
          </label>

          <label class="radio-row">
            <input type="radio" name="sg-plan" value="enterprise" disabled />
            Enterprise (contact sales)
          </label>
        </div>

        <!-- Disabled controls -->
        <div class="form-section">
          <h3>Disabled states</h3>
          <div class="field">
            <label class="field-label" for="sg-disabled-input">Disabled input</label>
            <input
              id="sg-disabled-input"
              class="input"
              type="text"
              value="Read-only value"
              disabled
            />
          </div>
          <div class="field">
            <label class="field-label" for="sg-disabled-select">Disabled select</label>
            <select id="sg-disabled-select" class="select" disabled>
              <option>Unavailable</option>
            </select>
          </div>
        </div>

        <!-- Form actions -->
        <div class="form-actions">
          <button
            type="submit"
            style="
              padding: var(--space-2) var(--space-5);
              background: var(--brand-accent);
              color: var(--brand-dark);
              border-radius: var(--radius-md);
              font-weight: var(--weight-semibold);
              cursor: pointer;
              min-height: 44px;
            "
          >
            Submit
          </button>
          <button
            type="reset"
            style="
              padding: var(--space-2) var(--space-5);
              background: transparent;
              color: var(--text-secondary);
              border: 1px solid var(--border-structural);
              border-radius: var(--radius-md);
              cursor: pointer;
              min-height: 44px;
            "
          >
            Cancel
          </button>
        </div>

      </form>
    </div>
  </section>

  <!-- ── Token Swatches ───────────────────────────────────────────── -->
  <section>
    <div class="container">
      <h2>Surface tokens</h2>
      <div class="cluster">
        {#each [
          ['--surface-ground',  'Ground'],
          ['--surface-raised',  'Raised'],
          ['--surface-sunken',  'Sunken'],
        ] as [token, label]}
          <div class="card" style="
            background: var({token});
            min-width: 8rem;
            text-align: center;
          ">
            <small class="text-muted">{token}</small>
            <p class="font-medium">{label}</p>
          </div>
        {/each}
      </div>

      <h2 style="margin-block-start: var(--space-8)">Status colors</h2>
      <div class="cluster">
        {#each [
          ['var(--color-success)',        'var(--color-success-subtle)',  'Success'],
          ['var(--color-warning)',        'var(--color-warning-subtle)',  'Warning'],
          ['var(--color-danger)',         'var(--color-danger-subtle)',   'Danger'],
          ['var(--color-info)',           'var(--color-info-subtle)',     'Info'],
        ] as [fg, bg, label]}
          <div style="
            background: {bg};
            border-inline-start: 3px solid {fg};
            padding: var(--space-3) var(--space-4);
            border-radius: var(--radius-md);
            min-width: 7rem;
            color: var(--text-primary);
            font-size: var(--text-sm);
          ">
            {label}
          </div>
        {/each}
      </div>
    </div>
  </section>

</main>

<style>
  main {
    min-height: 100dvh;
  }
</style>

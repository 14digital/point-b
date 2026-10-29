# POINT B Mentors — Design System (provisional)

No POINT B brand assets were supplied with this brief. Everything below is a clearly
provisional, original design system proposed for POINT B Mentors — not an official
brand standard — built to feel credible and premium without copying the MentorUnion
reference's visual design.

## 1. Direction

Where MentorUnion reads as a dark, dashboard-style utility product, POINT B Mentors is
designed to read as an editorial, publication-quality product — warm paper tones, a
serif display face for headings, generous whitespace — closer to a respected
professional publication than a generic SaaS template. This is a deliberate point of
difference, in the spirit of §22 of the brief ("avoid generic gradients... must not
look like a default AI-generated template").

## 2. Colour

Defined as CSS variables in `src/app/globals.css` and exposed to Tailwind via `@theme`.

| Token | Value | Use |
|---|---|---|
| `--color-ink` | `#15171c` | Primary text, primary buttons |
| `--color-ink-soft` | `#3a3d45` | Secondary text |
| `--color-paper` | `#faf8f4` | Page background |
| `--color-paper-dim` | `#f1ede4` | Section/card backgrounds |
| `--color-line` | `#e3ddd0` | Borders, dividers |
| `--color-brass` / `--color-brass-dark` | `#a8792a` / `#8a611e` | Accent — highlights, "international" tag, interactive emphasis |
| `--color-forest` | `#16332e` | Positive / verified / "local" tag |
| `--color-rust` | `#9a3324` | Warning / destructive actions |

Each accent has a pale background variant (`-pale`) for badges, keeping contrast
accessible against the warm paper background (all text/background pairs meet WCAG AA
for normal text).

## 3. Typography

- **Display**: Fraunces (variable, serif) — used for all headings, via `.font-display`.
- **Body / UI**: Inter (sans) — used for body copy, navigation, form controls, data.

Both are loaded through `next/font/google` in `src/app/layout.tsx`, self-hosted by Next
at build time (no runtime Google Fonts request).

## 4. Spacing & layout

- A single `Container` component (`max-w-6xl`, responsive side padding) governs page
  width throughout, so every page shares the same horizontal rhythm.
- Sections are separated by a 1px `--color-line` rule rather than shadows or cards
  stacked on grey backgrounds, keeping the page feeling like one continuous document.
- Border radius is consistently generous (`rounded-xl` / `rounded-2xl` / `rounded-3xl`)
  for cards, inputs and buttons — soft, not sharp; not pill-shaped except for buttons
  and chip-style filters.

## 5. Components (`src/components/ui.tsx`)

`Container`, `Button` (primary / secondary / ghost / danger, three sizes), `Badge`
(neutral / brass / forest / rust tones), `Card`, `SectionHeading`, `Avatar` (initials on
a deterministic colour, standing in for professional photography that doesn't exist for
demonstration mentors — see §10 of the brief), `StarRating`, `DemoBanner` (used
anywhere a feature is explicitly simulated), `EmptyState`.

A single `.input` utility class (in `globals.css`) styles all text inputs, selects and
textareas consistently across the booking flow, application form and admin tools.

## 6. Responsive behaviour

Built mobile-first with Tailwind breakpoints (`sm`, `lg`). Specific patterns:

- Navigation collapses to a slide-down menu below `lg`.
- The mentor directory's filter sidebar becomes the first stacked block on narrow
  screens, with results below.
- The booking modal becomes a bottom sheet (full-width, rounded top corners) on mobile
  and a centred dialog from `sm` up.
- Tables in the admin console scroll horizontally on narrow viewports rather than
  overflowing the page.

## 7. Accessibility

- Colour pairs were chosen for contrast against the paper background, not decoration.
- All interactive filter controls are real `<input>`/`<select>` elements (keyboard and
  screen-reader operable), not custom div-based widgets.
- Modal close controls are reachable by keyboard and carry `aria-label`s where icon-only.
- Form fields use associated `<label>` elements throughout (via the shared `Field`
  helper), not placeholder-only labelling.

## 8. What's intentionally not themed yet

Dark mode, print styles, and localisation (Urdu RTL support) are out of scope for this
prototype and would need their own pass before launch — flagged here rather than
silently skipped.

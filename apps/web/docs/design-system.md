# Linktal Recruitment OS — Design System

This design system document is to write down how does the design system work for Linktal Recruitment OS web application. In here, we will note down how different parts are used and created to make sure every design is centralized and optimized.

## Component Library

This repository is using shadcn as the main component library and the preset is generated [here](https://ui.shadcn.com/create).

- **Preset / style:** `base-rhea`, base color `neutral`.
- **Where components live:** `src/components/ui/*`. These files are copied into the repo — they are ours to edit, not a locked dependency.
- **Import alias:** `@/components/ui` (config in `components.json`).
- **Add a component:** `pnpm dlx shadcn@latest add <name>` (run from `apps/web/`).
- **Icons:** [`lucide-react`](https://lucide.dev).

## Design Tokens

All tokens are defined as CSS variables in `src/app/globals.css` — once under `:root` (light) and again under `.dark`. **Always consume tokens through the Tailwind utilities they map to; never hardcode raw colors** (use `bg-destructive`, not `bg-red-500`).

### Colors

**Brand**

| Token | Utility | Notes |
| --- | --- | --- |
| `--primary` | `bg-primary` / `text-primary` | Violet brand color. Primary actions, links, focus emphasis. |
| `--primary-foreground` | `text-primary-foreground` | Text/icons on top of `primary`. |

**Semantic** — use these for status, never a raw Tailwind color. Each has a matching `-foreground` for text placed on top of it.

| Token | Utility | Use for |
| --- | --- | --- |
| `--success` | `bg-success` / `text-success` | Successful actions, positive/passed states. |
| `--warning` | `bg-warning` / `text-warning` | Caution, needs-attention, pending. |
| `--info` | `bg-info` / `text-info` | Neutral informational hints. |
| `--destructive` | `bg-destructive` / `text-destructive` | Errors, deletes, irreversible actions. |

**Surfaces & UI**

| Token | Utility | Use for |
| --- | --- | --- |
| `--background` / `--foreground` | `bg-background` / `text-foreground` | Page base + default text. |
| `--card` / `--card-foreground` | `bg-card` | Raised surfaces (cards, panels). |
| `--popover` / `--popover-foreground` | — | Floating surfaces (menus, popovers). |
| `--muted` / `--muted-foreground` | `bg-muted` / `text-muted-foreground` | Subtle backgrounds and secondary text. |
| `--secondary` / `--accent` | `bg-secondary` / `bg-accent` | Low-emphasis surfaces and hover states. |
| `--border` / `--input` | `border-border` | Borders and form field outlines. |
| `--ring` | `ring-ring` | Focus rings. |

### Typography

- **Font:** [Geist](https://vercel.com/font), loaded in `layout.tsx` and exposed as `--font-sans`.
- `--font-heading` currently aliases `--font-sans` — one typeface for both headings and body by design. Introduce a separate heading font only if we deliberately decide to.

### Radius

Everything derives from a single base so the whole UI scales together. Base: `--radius: 0.625rem`.

| Token | Value |
| --- | --- |
| `--radius-sm` | `radius × 0.6` |
| `--radius-md` | `radius × 0.8` |
| `--radius-lg` | `radius` |
| `--radius-xl` | `radius × 1.4` |
| `--radius-2xl` | `radius × 1.8` |
| `--radius-3xl` → `--radius-4xl` | `radius × 2.2` → `× 2.6` |

## Component Conventions

To keep things centralized (see intro), follow one rule when reaching for a component:

- **Customizing a primitive** (different default padding, an extra variant, a color tweak) → **edit the file in `src/components/ui/` directly**. It's ours; a wrapper around it is just indirection.
- **Adding app behavior or composition** (e.g. a `FormField` that pairs label + input + error, or a `SubmitButton` wired to form pending state) → **create a new component** in `src/features/…` or `src/components/` that builds *on top of* the primitive.
- **Never** write a 1:1 pass-through wrapper that just re-exports a primitive under a new name.

## Dark Mode

We support Dark Mode. It's **class-based**: toggling the `.dark` class on `<html>` re-points every token to its dark value (defined under `.dark` in `globals.css`), so anything built on tokens flips automatically with no per-component work. Because it's class-driven, we can also force a mode regardless of OS preference. Build with tokens and dark mode is essentially free.

## UX Behavior

- Items have enough breathing room, gap should be using the rules of 4.
- Items that have multiple layers have visual hierarchy and not just plain sizes.
- For any actions that user took, make sure there is feedback whether it's in the form of a toast (we use [sonner](https://sonner.emilkowal.ski/)) or an inline update.

## Responsiveness

Although it is not explicitly required, we should still adhere to our own quality where we still support mobile, tablet, desktop.

# UI Styling and Components — Promptly Employed

> This document records the chosen UI stack, styling conventions, and component library for the project. Use as a reference for all frontend build and design decisions.

---

## Chosen Stack

- **Framework:** Next.js 16 (App Router)
- **Styling:** Tailwind CSS v4
- **UI Primitives:** `@base-ui/react` (used directly for low-level primitives such as `useRender`)
- **Component scaffolding:** `shadcn` CLI (New York style) used to generate initial component files; components are then owned and customised in-repo

---

## Rationale

- **Speed:** Tailwind + shadcn-generated components enables rapid prototyping and iteration. Most UI elements can be built or themed in minutes.
- **Beauty:** shadcn/ui-style components provide modern, accessible, and visually appealing UI out of the box. Tailwind ensures consistent spacing, color, and typography.
- **Lightweight:** Only the CSS classes and components actually used are shipped to the client. No heavy global CSS or unused component bloat.
- **Maintainability:** Utility-first styling keeps code close to the markup. Components are easy to override or extend as needed.
- **Customizability:** Full design freedom — you can easily tweak themes, colors, and component structure without fighting the framework.
- **Ecosystem:** Tailwind, `@base-ui/react`, and Next.js have strong community support, documentation, and ongoing updates.

---

## Usage Guidelines

- **All new UI components** should be built using the in-repo component primitives (under `src/components/ui/`) where possible (e.g. Button, Card, Input, Alert, Progress, etc.).
- **Layout and spacing** should use Tailwind utility classes for consistency.
- **Custom components** can be created by composing the in-repo primitives (backed by `@base-ui/react`), styled with Tailwind.
- **No global CSS** except for Tailwind base styles and any required theme overrides in `globals.css`.
- **Dark mode** support is available via Tailwind theming.
- **Accessibility:** All components should be accessible by default; `@base-ui/react` is built with a11y in mind.

---

## Example Stack Setup (Reference)

- Install Tailwind CSS v4: https://tailwindcss.com/docs/guides/nextjs
- Install shadcn/ui (for scaffolding): https://ui.shadcn.com/docs/installation/next
- `@base-ui/react` docs: https://base-ui.com/

---

## Alternatives Considered

- **Chakra UI:** Fast, but heavier bundle and less design freedom.
- **Material UI (MUI):** Enterprise-ready, but too heavy and generic for a portfolio project.
- **Vanilla CSS/SCSS:** Maximum control, but much slower to build and maintain.
- **daisyUI:** Fastest for prebuilt themes, but less customizable than the current approach.
- **Headless UI:** Considered but replaced by `@base-ui/react` which is more actively maintained.

---

## Summary

- **Use Next.js 16 + Tailwind CSS v4 + in-repo shadcn-style components for all new UI work.**
- This stack is fast, beautiful, lightweight, and easy to maintain — ideal for a modern portfolio project.

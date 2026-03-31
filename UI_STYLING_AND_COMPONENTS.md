# UI Styling and Components — Promptly Employed

> This document records the chosen UI stack, styling conventions, and component library for the project. Use as a reference for all frontend build and design decisions.

---

## Chosen Stack

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **Component Library:** shadcn/ui (with option to use Headless UI for additional primitives)

---

## Rationale

- **Speed:** Tailwind + shadcn/ui enables rapid prototyping and iteration. Most UI elements can be built or themed in minutes.
- **Beauty:** shadcn/ui provides modern, accessible, and visually appealing components out of the box. Tailwind ensures consistent spacing, color, and typography.
- **Lightweight:** Only the CSS classes and components actually used are shipped to the client. No heavy global CSS or unused component bloat.
- **Maintainability:** Utility-first styling keeps code close to the markup. shadcn/ui components are easy to override or extend as needed.
- **Customizability:** Full design freedom — you can easily tweak themes, colors, and component structure without fighting the framework.
- **Ecosystem:** Both Tailwind and shadcn/ui have strong community support, documentation, and ongoing updates.

---

## Usage Guidelines

- **All new UI components** should be built using shadcn/ui primitives where possible (e.g. Button, Card, Input, Alert, Progress, etc.).
- **Layout and spacing** should use Tailwind utility classes for consistency.
- **Custom components** can be created by composing shadcn/ui and Headless UI primitives, styled with Tailwind.
- **No global CSS** except for Tailwind base styles and any required shadcn/ui overrides.
- **Dark mode** support is available via Tailwind and shadcn/ui theming.
- **Accessibility:** All components should be accessible by default; shadcn/ui and Headless UI are built with a11y in mind.

---

## Example Stack Setup (Reference)

- Install Tailwind CSS: https://tailwindcss.com/docs/guides/nextjs
- Install shadcn/ui: https://ui.shadcn.com/docs/installation/next
- Optionally add Headless UI: https://headlessui.com/

---

## Alternatives Considered

- **Chakra UI:** Fast, but heavier bundle and less design freedom.
- **Material UI (MUI):** Enterprise-ready, but too heavy and generic for a portfolio project.
- **Vanilla CSS/SCSS:** Maximum control, but much slower to build and maintain.
- **daisyUI:** Fastest for prebuilt themes, but less customizable than shadcn/ui.

---

## Summary

- **Use Next.js + Tailwind CSS + shadcn/ui for all new UI work.**
- This stack is fast, beautiful, lightweight, and easy to maintain — ideal for a modern portfolio project.

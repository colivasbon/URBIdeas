---
name: design-system
description: Use when creating or maintaining design tokens, component libraries, style guides, or ensuring visual consistency across an application. Covers typography systems, spacing scales, color tokens, button variants, card patterns, and reusable component definitions.
---

# Design System

Maintain coherence across typography, spacing, buttons, cards, colors, and all UI components.

## Design Tokens

Define reusable values as tokens (CSS variables, Tailwind config, or theme objects):

```
--color-primary: #hex
--color-primary-hover: #hex
--color-text: #hex
--color-text-muted: #hex
--color-bg: #hex
--color-border: #hex

--space-xs: 4px
--space-sm: 8px
--space-md: 16px
--space-lg: 24px
--space-xl: 32px
--space-2xl: 48px

--radius-sm: 4px
--radius-md: 8px
--radius-lg: 12px
--radius-full: 9999px

--shadow-sm: 0 1px 2px rgba(0,0,0,0.05)
--shadow-md: 0 4px 6px rgba(0,0,0,0.07)
--shadow-lg: 0 10px 15px rgba(0,0,0,0.1)

--font-sans: 'Inter', system-ui, sans-serif
--font-mono: 'JetBrains Mono', monospace
```

## Typography System

| Level | Size | Weight | Line-height | Use |
|-------|------|--------|-------------|-----|
| xs | 12px | 400 | 16px | Captions, labels |
| sm | 14px | 400 | 20px | Secondary text |
| base | 16px | 400 | 24px | Body text |
| lg | 18px | 400 | 28px | Large body |
| xl | 20px | 600 | 28px | Subheadings |
| 2xl | 24px | 600 | 32px | Section titles |
| 3xl | 30px | 700 | 36px | Page titles |
| 4xl | 36px | 700 | 40px | Hero headings |

## Component Specifications

### Buttons

| Variant | BG | Text | Border | Use |
|---------|-----|------|--------|-----|
| Primary | Primary color | White | None | Main actions |
| Secondary | Transparent | Primary | Primary | Secondary actions |
| Ghost | Transparent | Text | None | Tertiary actions |
| Danger | Red | White | None | Destructive actions |

Sizes: sm (32px), md (40px), lg (48px) height. Padding: 12px–24px horizontal.

### Cards

- Background: white or surface color
- Border: 1px solid border token OR subtle shadow (not both)
- Border-radius: 8–12px
- Padding: 16–24px
- Hover: elevation increase (shadow-lg) or subtle border color change

### Forms

- Input height: 40px (md), 48px (lg)
- Border: 1px solid border, 2px solid primary on focus
- Border-radius: 6–8px
- Label above input, 8px gap
- Error state: red border + helper text below

## Consistency Rules

- Never use hardcoded colors — always reference tokens
- Never use arbitrary pixel values — use the spacing scale
- One primary action per view/section
- Consistent icon style (outline OR filled, not mixed)
- Consistent border-radius across similar elements

---
name: accessibility
description: Use when improving web accessibility (WCAG compliance), fixing contrast issues, ensuring keyboard navigation, adding ARIA labels, optimizing screen reader support, or making interfaces usable for people with disabilities. Covers WCAG 2.1 AA standards.
---

# Accessibility (WCAG 2.1 AA)

Ensure legibility, proper contrast, keyboard navigation, and correct mobile usage.

## Perceivable

### Contrast Ratios
- Normal text (< 18px): minimum 4.5:1 contrast ratio
- Large text (≥ 18px bold or ≥ 24px): minimum 3:1 contrast ratio
- UI components and graphics: minimum 3:1 against adjacent colors
- Use tools: WebAIM Contrast Checker, Chrome DevTools

### Text & Typography
- Minimum font size: 16px for body text
- Allow text resizing up to 200% without breaking layout
- Use relative units (rem, em) not pixels for font sizes
- Line height: minimum 1.5× font size for body text
- Paragraph spacing: minimum 2× font size
- Letter/word spacing adjustable without loss of content

### Images & Media
- All `<img>` must have descriptive `alt` text (empty `alt=""` for decorative)
- Complex images: provide text alternatives nearby
- Video: captions and transcripts required
- No information conveyed by color alone (use icons, text, patterns)

## Operable

### Keyboard Navigation
- All interactive elements reachable via Tab
- Visible focus indicator on every focusable element
- Logical tab order (matches visual layout)
- Skip navigation link as first focusable element
- No keyboard traps (user can always Tab away)
- Enter/Space activates buttons and links
- Escape closes modals and dropdowns

### Focus Styles
```css
:focus-visible {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}
```
Never remove focus outlines without providing an alternative.

### Motion & Timing
- Respect `prefers-reduced-motion` media query
- No content flashes more than 3 times per second
- Provide pause/stop for auto-rotating content
- No time limits on forms without warning

## Understandable

### Forms
- Every input has a visible `<label>` (not just placeholder)
- Error messages are descriptive and specific
- Errors associated with inputs via `aria-describedby`
- Required fields marked with `aria-required` or `aria-invalid`
- Group related fields with `<fieldset>` and `<legend>`

### Navigation
- Consistent navigation across pages
- Page titles are unique and descriptive (`<title>`)
- Use headings in order (h1 → h2 → h3, no skips)
- Landmark regions: `<header>`, `<nav>`, `<main>`, `<footer>`

### Language
- Set `lang` attribute on `<html>` element
- Identify changes in language with `lang` attribute

## Robust

### Semantic HTML
- Use native HTML elements over generic `<div>`/`<span>`
- `<button>` for actions, `<a>` for navigation
- `<table>` with `<th>` and `scope` for data tables
- Lists (`<ul>`, `<ol>`) for list content

### ARIA (When Needed)
- Prefer native HTML over ARIA when possible
- Use `aria-label` when visible label isn't sufficient
- Use `aria-live` for dynamic content updates
- Use `aria-expanded` for collapsible sections
- Use `role` only when semantic HTML isn't available

## Quick Audit Checklist

- [ ] Tab through entire page — all elements reachable?
- [ ] Focus visible on every interactive element?
- [ ] Contrast ratios meet 4.5:1 / 3:1 minimums?
- [ ] All images have alt text?
- [ ] Forms have associated labels?
- [ ] Page works with text at 200% zoom?
- [ ] `prefers-reduced-motion` is respected?
- [ ] Screen reader announces all meaningful content?
- [ ] No information conveyed by color alone?
- [ ] Skip navigation link present?

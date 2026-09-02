---
name: web-performance
description: Use when optimizing page speed, reducing bundle size, improving Core Web Vitals (LCP, FID, CLS), implementing lazy loading, optimizing images, or fixing performance bottlenecks. Covers frontend performance best practices.
---

# Web Performance

Prevent heavy, slow pages filled with useless effects. Optimize for speed and Core Web Vitals.

## Core Web Vitals Targets

| Metric | Good | What It Measures |
|--------|------|------------------|
| LCP (Largest Contentful Paint) | ≤ 2.5s | Loading speed |
| INP (Interaction to Next Paint) | ≤ 200ms | Responsiveness |
| CLS (Cumulative Layout Shift) | ≤ 0.1 | Visual stability |

## Image Optimization

- **Format**: Use WebP/AVIF over PNG/JPEG (30–50% smaller)
- **Sizing**: Serve images at display size, never larger
- **Lazy loading**: `loading="lazy"` for below-the-fold images
- **Preload**: Only hero/above-the-fold images with `<link rel="preload">`
- **Responsive**: Use `<picture>` or `srcset` for multiple resolutions
- **Dimensions**: Always set `width` and `height` attributes to prevent CLS
- **SVG**: Use for icons, logos, and simple illustrations

## Code Optimization

### JavaScript
- Code split: load only what's needed per page
- Defer non-critical scripts with `defer` or `async`
- Avoid large libraries for simple tasks (e.g., day.js over moment.js)
- Tree shake unused code
- Use dynamic `import()` for route-based splitting

### CSS
- Remove unused CSS (PurgeCSS, Tailwind's built-in purging)
- Inline critical CSS (above-the-fold styles)
- Minify CSS in production
- Avoid `@import` in stylesheets (blocks parallel loading)

### Fonts
- Limit to 2 font families, 2–3 weights max
- Use `font-display: swap` to prevent invisible text
- Preload key fonts: `<link rel="preload" as="font">`
- Subset fonts to include only needed characters
- Consider system fonts for performance-critical text

## Loading Strategy

```
1. Inline critical CSS (< 14KB)
2. Preload hero image and key fonts
3. Defer non-critical JS
4. Lazy load images and below-fold content
5. Prefetch next-page resources on hover/idle
```

## Network Optimization

- Enable gzip/brotli compression on server
- Use HTTP/2 or HTTP/3 for multiplexed requests
- Set aggressive cache headers for static assets
- Use a CDN for global asset delivery
- Minimize third-party scripts (analytics, widgets, chat)
- Self-host critical third-party resources when possible

## Layout Stability

- Always set image/video dimensions
- Reserve space for ads and embeds
- Use `aspect-ratio` CSS property for media
- Avoid inserting content above existing content after load
- Use skeleton screens instead of layout shifts

## Measurement Tools

- Lighthouse (built into Chrome DevTools)
- WebPageTest.org
- Chrome UX Report (CrUX)
- Core Web Vitals report in Search Console

## Performance Budget

| Resource | Budget |
|----------|--------|
| Total page weight | ≤ 500KB compressed |
| JavaScript | ≤ 150KB compressed |
| CSS | ≤ 50KB compressed |
| Images | ≤ 300KB total |
| Fonts | ≤ 100KB total |
| Initial load (3G) | ≤ 3 seconds |

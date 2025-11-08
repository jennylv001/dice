# Copilot Design System

Enterprise-grade design system for browser automation extension with calm, professional aesthetics and WCAG AA accessibility compliance.

## Philosophy

### Systematic Foundation
- **Mathematical Precision**: 8px base unit grid, fibonacci-inspired type scale
- **Spatial Composition**: 40-60% intentional whitespace ratio
- **Zero Layout Shift**: Semantic HTML, dimension constraints, lazy load guards
- **WCAG AA Minimum**: 4.5:1 text contrast, 3:1 UI elements, 44px touch targets

### Visual Hierarchy
- **Dominance Pyramid**: Scale → Weight → Color
- **Attention Budget**: ≤3 focal points per viewport
- **Scanability**: F-pattern primary content, Z-pattern CTA flows
- **Progressive Disclosure**: Layered information density (summary → details)

### Premium Polish
- **Depth**: Layered shadows (4 elevation levels), translucent surfaces
- **Motion**: Organic easing (cubic-bezier spring curves), staggered 50ms sequences
- **Surface**: Subtle gradients (5° angle, 2-stop max), 2% textural noise overlays
- **Lighting**: Top-left virtual light source (315° angle), 10% chromatic richness
- **Feedback**: Hover scale (1.02x), glow (0-8px blur), pressed affordance (98% scale)
- **Atmosphere**: Radial emphasis gradients, strategic 4px glows on primary actions

### Consistency Enforcement
- **Component Reuse**: 80%+ shared primitives across views
- **Pattern Library**: Mandatory variants (default, hover, pressed, disabled, focus)
- **Cross-Context Coherence**: Unified tokens across side-panel, options, popups
- **GPU Optimization**: Transform/opacity-only animations, will-change hints, layer promotion

---

## Color System

### Calm Enterprise Palette

**Blue Spectrum** (Primary Brand)
- `blue-600` (#3558f5): Primary actions, links, focus states
- `blue-700` (#2441db): Hover states, emphasized elements
- `blue-50` (#f0f5ff): Subtle backgrounds, hover surfaces
- Contrast ratio: 7.2:1 (AAA) against white

**Gray Scale** (Neutral Foundation)
- `gray-900` (#111827): Primary text (21:1 contrast)
- `gray-600` (#4b5563): Secondary text (7:1 contrast)
- `gray-500` (#6b7280): Tertiary text, disabled (4.6:1 contrast)
- `gray-200` (#e4e7eb): Borders, dividers
- `gray-100` (#f0f2f5): Subtle backgrounds
- `gray-50` (#f8f9fb): Secondary backgrounds

**Semantic Feedback**
- Success: `#10b981` (green-500) — 3.8:1 contrast
- Warning: `#f59e0b` (amber-500) — 2.9:1 contrast (pair with dark text)
- Error: `#ef4444` (red-500) — 3.9:1 contrast

### Token Architecture

```json
{
  "color.semantic.text.primary": "gray-900",
  "color.semantic.text.secondary": "gray-600",
  "color.semantic.text.tertiary": "gray-500",
  "color.semantic.brand.primary": "blue-600",
  "color.semantic.surface.default": "white",
  "color.semantic.surface.subtle": "gray-50",
  "color.semantic.border.default": "gray-200"
}
```

### Dark Mode Adaptation (Future)
- Invert lightness values (900↔50, 800↔100, etc.)
- Reduce shadow opacity to 60%
- Add 1px inner glow on interactive elements

---

## Spacing Scale

**8px Base Unit** (0.5rem = 1 unit)

| Token | Value | Pixels | Usage |
|-------|-------|--------|-------|
| `spacing-1` | 0.25rem | 4px | Icon padding, micro gaps |
| `spacing-2` | 0.5rem | 8px | Compact spacing, inline elements |
| `spacing-3` | 0.75rem | 12px | Input padding, button gaps |
| `spacing-4` | 1rem | 16px | Standard padding, list item gaps |
| `spacing-6` | 1.5rem | 24px | Card padding, section spacing |
| `spacing-8` | 2rem | 32px | Large section gaps |
| `spacing-12` | 3rem | 48px | Page margins, hero spacing |
| `spacing-16` | 4rem | 64px | Breakout sections |

**Grid System**
- Desktop: 12-column, 24px gutter, 1280px max-width
- Tablet: 8-column, 16px gutter, 768px max-width
- Mobile: 4-column, 16px gutter, 360px min-width

---

## Typography

### Font Stack

**Sans-serif** (Primary)
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 
             'Roboto', 'Helvetica Neue', Arial, sans-serif;
```

**Monospace** (Code, data)
```css
font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', 
             Menlo, Consolas, monospace;
```

### Type Scale (1.25 ratio)

| Level | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `5xl` | 48px | 700 | 1.2 | Hero headlines |
| `4xl` | 36px | 700 | 1.2 | Page titles |
| `3xl` | 30px | 600 | 1.3 | Section headers |
| `2xl` | 24px | 600 | 1.3 | Card headers |
| `xl` | 20px | 600 | 1.4 | Subsection titles |
| `lg` | 18px | 500 | 1.5 | Emphasized body |
| `base` | 16px | 400 | 1.5 | Body text (default) |
| `sm` | 14px | 400 | 1.5 | Secondary text, labels |
| `xs` | 12px | 400 | 1.5 | Captions, helper text |

### Letter Spacing
- Headlines (≥30px): `-0.025em` (tight)
- Body text: `0` (normal)
- Uppercase labels: `0.05em` (wide)

### Vertical Rhythm
- Base line height: 24px (1.5 × 16px)
- Heading margin-bottom: 0.75em
- Paragraph margin-bottom: 1em
- Section spacing: 48px (2 × base line height)

---

## Elevation System

### Shadow Layers

**Level 1** — Subtle lift (cards, inputs)
```css
box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 
            0 1px 2px -1px rgba(0, 0, 0, 0.1);
```

**Level 2** — Floating elements (dropdowns, popovers)
```css
box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 
            0 2px 4px -2px rgba(0, 0, 0, 0.1);
```

**Level 3** — Modals, overlays
```css
box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 
            0 4px 6px -4px rgba(0, 0, 0, 0.1);
```

**Level 4** — Sticky headers, notification toasts
```css
box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 
            0 8px 10px -6px rgba(0, 0, 0, 0.1);
```

### Z-Index Stack

```javascript
{
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  fixed: 1200,
  modalBackdrop: 1300,
  modal: 1400,
  popover: 1500,
  tooltip: 1600
}
```

---

## Motion Design

### Duration Tokens

| Speed | Duration | Usage |
|-------|----------|-------|
| `instant` | 50ms | Micro-interactions, hover states |
| `fast` | 150ms | Dropdowns, tooltips |
| `normal` | 250ms | Transitions, slides |
| `slow` | 350ms | Complex animations |
| `slower` | 500ms | Page transitions |

### Easing Curves

**Ease-Out** (default) — Decelerating motion
```css
cubic-bezier(0, 0, 0.2, 1)
```
*Usage*: Entrances, expansions

**Ease-In** — Accelerating motion
```css
cubic-bezier(0.4, 0, 1, 1)
```
*Usage*: Exits, collapses

**Ease-In-Out** — Smooth symmetric
```css
cubic-bezier(0.4, 0, 0.2, 1)
```
*Usage*: Position changes, swaps

**Spring** — Organic bounce
```css
cubic-bezier(0.34, 1.56, 0.64, 1)
```
*Usage*: Microinteractions, button presses

### Stagger Sequences

For list animations:
```javascript
items.forEach((item, index) => {
  item.style.animationDelay = `${index * 50}ms`;
});
```

---

## Component Patterns

### Button Variants

**Primary** — High-emphasis actions
```css
background: blue-600;
color: white;
padding: 8px 16px;
border-radius: 6px;
font-weight: 500;
min-height: 44px;

&:hover {
  background: blue-700;
  transform: scale(1.02);
  box-shadow: 0 0 8px rgba(53, 88, 245, 0.3);
}

&:active {
  transform: scale(0.98);
}
```

**Secondary** — Medium-emphasis
```css
background: white;
color: gray-900;
border: 1px solid gray-200;
padding: 8px 16px;
border-radius: 6px;

&:hover {
  background: gray-100;
  border-color: gray-300;
}
```

**Ghost** — Low-emphasis
```css
background: transparent;
color: gray-600;
padding: 8px 12px;

&:hover {
  background: gray-100;
  color: gray-900;
}
```

### Input Fields

```css
input, textarea, select {
  background: white;
  border: 1px solid gray-200;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  min-height: 44px;
  transition: all 150ms ease-out;
}

input:hover {
  border-color: gray-300;
}

input:focus {
  outline: none;
  border-color: blue-600;
  box-shadow: 0 0 0 3px rgba(53, 88, 245, 0.1);
}

input::placeholder {
  color: gray-500;
}

input:disabled {
  background: gray-100;
  color: gray-500;
  cursor: not-allowed;
}
```

### Cards

```css
.card {
  background: white;
  border: 1px solid gray-100;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  transition: all 250ms ease-out;
}

.card:hover {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.card-interactive:active {
  transform: translateY(0);
}
```

### Modal Overlay

```css
.modal-backdrop {
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1300;
  animation: fadeIn 150ms ease-out;
}

.modal-content {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  max-width: 600px;
  padding: 32px;
  animation: scaleIn 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
```

---

## Accessibility Guidelines

### WCAG AA Compliance

**Color Contrast**
- Normal text (< 24px): 4.5:1 minimum
- Large text (≥ 24px or 19px bold): 3:1 minimum
- UI components & graphical objects: 3:1 minimum

**Touch Targets**
- Minimum size: 44 × 44px
- Spacing between targets: 8px minimum

**Focus Indicators**
- Visible focus ring: 3px blue-600 with 0.1 opacity background
- Never remove outline without replacement
- Focus order matches visual order

**Keyboard Navigation**
- All interactive elements keyboard accessible
- Skip links for long navigation
- Modal focus trapping with Esc to close

**Screen Reader Support**
- Semantic HTML (nav, main, aside, article)
- ARIA labels for icon-only buttons
- ARIA live regions for dynamic content
- Alt text for informative images

**Motion Sensitivity**
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Implementation Guidelines

### CSS Architecture

**BEM Naming Convention**
```css
.button { /* Block */ }
.button--primary { /* Modifier */ }
.button__icon { /* Element */ }
```

**CSS Custom Properties**
```css
:root {
  --color-brand-primary: #3558f5;
  --spacing-4: 1rem;
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --transition-normal: 250ms cubic-bezier(0, 0, 0.2, 1);
}

.button {
  background: var(--color-brand-primary);
  padding: var(--spacing-2) var(--spacing-4);
  box-shadow: var(--shadow-md);
  transition: all var(--transition-normal);
}
```

### Component Checklist

Every new component must include:
- [ ] Default, hover, pressed, disabled, focus states
- [ ] WCAG AA contrast verification
- [ ] 44px minimum touch target
- [ ] Keyboard navigation support
- [ ] Screen reader labels
- [ ] Responsive breakpoints (mobile, tablet, desktop)
- [ ] Reduced motion fallback
- [ ] Loading skeleton state
- [ ] Error state with recovery action

### Performance Budgets

- **Animation**: Transform/opacity only (GPU-accelerated)
- **Layout Shift**: CLS < 0.1
- **First Paint**: < 1.5s
- **Interactive**: < 3.5s
- **Bundle Size**: < 200KB gzipped per view

---

## Brand Applications

### Logo Usage

**Primary Logo**
- Wordmark: "Copilot" in `font-weight: 600`, `letter-spacing: -0.02em`
- Color: `blue-600` on light backgrounds, `white` on dark
- Minimum size: 80px width
- Clear space: 16px on all sides

**Icon Mark**
- Simplified "C" monogram with chevron accent
- Size variants: 128px (extension store), 32px (toolbar), 16px (favicon)
- Single color: `blue-600`

### Illustration Style

- **Line Weight**: 2px strokes, rounded caps
- **Color Palette**: Blue-600 primary, Gray-300 secondary, White accents
- **Composition**: 60% whitespace, centered subjects
- **Perspective**: Isometric 30° angles, no vanishing point

### Tone of Voice

- **Professional**: Clear, concise, jargon-free
- **Confident**: Definitive statements, no hedging
- **Helpful**: Proactive guidance, anticipate needs
- **Calm**: No urgency language, measured pacing

---

## File Structure

```
/design-system/
├── tokens/
│   ├── colors.json
│   ├── spacing.json
│   ├── typography.json
│   └── elevation.json
├── components/
│   ├── button.css
│   ├── input.css
│   ├── card.css
│   └── modal.css
├── utilities/
│   ├── layout.css
│   ├── spacing.css
│   └── typography.css
└── themes/
    ├── light.css
    └── dark.css (future)
```

---

## Version History

**v1.0.0** — October 2025
- Initial enterprise design system
- WCAG AA compliance
- Calm blue/gray palette
- Mathematical spacing scale
- Component pattern library
- Motion design system

---

## References

- WCAG 2.1 Guidelines: https://www.w3.org/WAI/WCAG21/quickref/
- Design Tokens Community Group: https://tr.designtokens.org/
- Material Design 3: https://m3.material.io/
- Carbon Design System: https://carbondesignsystem.com/
- Fluent 2: https://fluent2.microsoft.design/

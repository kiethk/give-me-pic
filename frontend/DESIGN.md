---
name: Give Me Pic
colors:
  surface: "#f9f9ff"
  surface-dim: "#cfdaf2"
  surface-bright: "#f9f9ff"
  surface-container-lowest: "#ffffff"
  surface-container-low: "#f0f3ff"
  surface-container: "#e7eeff"
  surface-container-high: "#dee8ff"
  surface-container-highest: "#d8e3fb"
  on-surface: "#111c2d"
  on-surface-variant: "#424656"
  inverse-surface: "#263143"
  inverse-on-surface: "#ecf1ff"
  outline: "#727687"
  outline-variant: "#c2c6d8"
  surface-tint: "#0054d6"
  primary: "#0050cb"
  on-primary: "#ffffff"
  primary-container: "#0066ff"
  on-primary-container: "#f8f7ff"
  inverse-primary: "#b3c5ff"
  secondary: "#505f76"
  on-secondary: "#ffffff"
  secondary-container: "#d0e1fb"
  on-secondary-container: "#54647a"
  tertiary: "#565a5b"
  on-tertiary: "#ffffff"
  tertiary-container: "#6f7274"
  on-tertiary-container: "#f6f8fa"
  error: "#ba1a1a"
  on-error: "#ffffff"
  error-container: "#ffdad6"
  on-error-container: "#93000a"
  primary-fixed: "#dae1ff"
  primary-fixed-dim: "#b3c5ff"
  on-primary-fixed: "#001849"
  on-primary-fixed-variant: "#003fa4"
  secondary-fixed: "#d3e4fe"
  secondary-fixed-dim: "#b7c8e1"
  on-secondary-fixed: "#0b1c30"
  on-secondary-fixed-variant: "#38485d"
  tertiary-fixed: "#e0e3e5"
  tertiary-fixed-dim: "#c4c7c9"
  on-tertiary-fixed: "#191c1e"
  on-tertiary-fixed-variant: "#444749"
  background: "#f9f9ff"
  on-background: "#111c2d"
  surface-variant: "#d8e3fb"
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: "700"
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: "600"
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: "600"
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: "600"
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: "400"
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "400"
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: "500"
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: "600"
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  container-max: 1280px
  gutter: 20px
  margin-mobile: 16px
---

## Brand & Style

The design system focuses on a **Corporate / Modern** aesthetic tailored for high-focus academic environments. The brand personality is efficient, intelligent, and supportive, positioning itself as a reliable digital workspace rather than a social or entertainment app.

The visual direction prioritizes clarity and functional density. It utilizes a refined minimalist approach with a "Workplace" feel—meaning generous white space is balanced by structured information architecture. The emotional goal is to reduce cognitive load for students, making the AI-powered generation process feel instantaneous and professional.

## Colors

The palette is anchored by **Vibrant Blue (#0066FF)**, used intentionally for primary actions and brand presence. The background layers utilize a mix of pure white for elevated surfaces and **Light Gray (#F8FAFC)** for structural containment and page backgrounds.

Status colors are essential for the AI feedback loop:

- **Processing (Gray):** Used for "generating" states or idle queues.
- **Success (Green):** Indicates completed AI generation or successful uploads.
- **Error (Red):** Flags failed prompts or connectivity issues.

Text colors should primarily use the Neutral hex for high legibility, with secondary text pulling from the Slate-based secondary color.

## Typography

This design system utilizes **Inter** for its systematic, utilitarian, and highly legible qualities. The scale is built on a tight 4px baseline grid.

- **Headlines:** Use semi-bold weights with slight negative letter-spacing to appear more compact and professional.
- **Body Text:** Standard weight for maximum readability during long study sessions.
- **Labels:** Use medium weights and slightly increased letter-spacing for UI metadata, tags, and button text.
- **Mobile Adjustments:** Large headlines scale down significantly on mobile to ensure study prompts remain visible above the fold.

## Layout & Spacing

The layout follows a **Fluid Grid** model with a maximum container width for desktop to maintain readability.

- **Desktop (12 columns):** 24px margins, 20px gutters. Content is centered.
- **Tablet (8 columns):** 24px margins, 16px gutters.
- **Mobile (4 columns):** 16px margins, 12px gutters.

Spacing follows a linear scale based on a 4px unit. Use `md (16px)` for standard component padding and `lg (24px)` for vertical section spacing. AI-generated results should be displayed in a responsive grid that reflows from 3 columns (desktop) to 1 column (mobile).

## Elevation & Depth

Depth is created through a combination of **Tonal Layers** and **Ambient Shadows**.

1.  **Level 0 (Base):** The Light Gray (#F8FAFC) background.
2.  **Level 1 (Cards/Work Areas):** Pure White (#FFFFFF) surfaces with a 1px border (#E2E8F0) and a very soft, diffused shadow (0px 4px 6px -1px rgba(0, 0, 0, 0.05)).
3.  **Level 2 (Modals/Popovers):** Pure White with a slightly more pronounced shadow and a subtle backdrop blur on the layer below to maintain focus.

Avoid heavy black shadows; instead, use tinted shadows that pull from the secondary slate color to keep the UI feeling "airy" and clean.

## Shapes

The shape language is consistently **Rounded**, using a 12px (0.75rem) corner radius as the primary standard for cards and major UI containers.

- **Primary Radius:** 12px (0.75rem) for cards, modals, and input areas.
- **Secondary Radius:** 8px (0.5rem) for buttons and small interactive elements.
- **Tertiary Radius:** 4px (0.25rem) for tooltips and small tags.

This approach softens the "Corporate" feel of Inter and the blue palette, making the tool feel accessible to students while maintaining professional structure.

## Components

- **Buttons:** Primary buttons use the Vibrant Blue background with White text and 8px roundedness. Secondary buttons should use a "Ghost" style: a 1px border (#E2E8F0) with Blue text.
- **Input Fields:** Use a 1px border and the 12px radius. On focus, the border transitions to Vibrant Blue with a subtle 2px outer glow.
- **Cards:** The central component for AI outputs. Must feature the 12px radius, a 1px Slate-200 border, and the soft ambient shadow. Use a 16px internal padding.
- **Chips/Tags:** Used for "Study Topics" or "Status." These should use a light tint of the status color (e.g., 10% opacity) with high-contrast text.
- **Lists:** Clean rows separated by 1px horizontal lines (#F1F5F9). Avoid heavy boxing for list items to maintain vertical rhythm.
- **Checkboxes/Radios:** Use the 4px radius for checkboxes and full circles for radios, both utilizing the Vibrant Blue for the active state.
- **AI Progress Bar:** A thin, 4px high bar at the top of cards or the page, using a gradient transition from Secondary Gray to Vibrant Blue to indicate generation progress.

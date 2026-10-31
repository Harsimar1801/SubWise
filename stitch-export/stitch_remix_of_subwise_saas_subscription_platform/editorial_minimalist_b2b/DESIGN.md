---
name: Editorial Minimalist B2B
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#444748'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#5e5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e3e2e2'
  on-secondary-container: '#646464'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#0d1e24'
  on-tertiary-container: '#75878e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474646'
  secondary-fixed: '#e3e2e2'
  secondary-fixed-dim: '#c7c6c6'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#464747'
  tertiary-fixed: '#d3e5ed'
  tertiary-fixed-dim: '#b8c9d1'
  on-tertiary-fixed: '#0d1e24'
  on-tertiary-fixed-variant: '#394950'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  display:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.025em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  metric-numeral:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.02em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: -0.005em
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0em
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.06em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.25rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.25rem
---

## Brand & Style
This design system embodies a calm, hyper-refined editorial aesthetic engineered for high-density B2B SaaS productivity. Grounded in Swiss modernism, it merges architectural discipline with utilitarian clarity. The experience feels deliberate, noise-free, and authoritative, elevating complex operational and financial workflows into pristine, scannable compositions.

The visual style rejects ephemeral trends like glassmorphism, heavy skeuomorphism, and vibrant decorative gradients. Instead, it relies on structural typography, nuanced gray scales, crisp 1px borders, and measured breathing room. Interfaces communicate precision, stability, and quiet confidence.

## Colors
The color hierarchy leverages an ultra-refined monochromatic scale anchored by `#111111`, accented with functional, desaturated tones:

- **App Shell & Base Background:** `#EAEAEA` serves as the canvas perimeter and global frame backdrop.
- **Main Workspace / Canvas:** `#F5F5F5` provides a soft, low-glare work surface that contrasts gently against layered cards.
- **Navigation / Sidebar:** `#FAFAFA` establishes an ultra-clean peripheral container, visually separating persistent navigation from primary data tasks.
- **Surfaces & Cards:** `#FFFFFF` offers stark contrast for content cards, data tables, and input panels.
- **Borders & Dividers:** `#E6E6E6` delivers hair-thin 1px structural boundaries without visual heaviness.
- **Text & Headlines:** Primary data points, display numbers, and primary headings use `#111111` for maximum contrast and legibility. Secondary metadata, timestamps, and compact labels sit at `#777777`.
- **Interactive Accent:** `#D8EAF2` is applied selectively for active navigation states, selected table rows, and soft tag indicators, always paired with `#111111` typography.
- **Actions:** Primary action surfaces default to `#080808` with pure `#FFFFFF` typography.
- **Semantic Feedback:** Critical signals use muted, editorial-grade accents: Success (`#12B886`), Warning (`#E8A23A`), and Error (`#D9534F`).

## Typography
Typographic scale dictates information density and editorial poise. Set in Inter, layout hierarchy relies on sharp contrasts between heavy display scales and compact, monospaced-aligned secondary labels.

- **Financial Figures & Metrics:** Formatted using `metric-numeral` or `headline-lg` with tabular lining figures (`font-variant-numeric: tabular-nums`) to guarantee clean column scanning in financial panels.
- **Section & Card Headers:** Rendered with `headline-sm` or `headline-md` at `#111111` to anchor reading order.
- **System Labels:** The `label-caps` token applies uppercase styling with `+0.06em` letter spacing and `#777777` color, designed for column headers, metadata tags, and metric prefixes.
- **Prose & Data Text:** Body copy remains strictly regular weight (`400`) to keep dense multi-column interfaces legible without eye strain.

## Layout & Spacing
The layout architecture utilizes a structured 12-column grid system bounded inside high-order operational panels:

- **Global Shell:** A persistent left rail (width: 256px on desktop, collapsible on mobile) sits flush against the `#FAFAFA` sidebar surface. The main dashboard canvas sits on `#F5F5F5` and expands up to 1440px max content width before centering.
- **Gutters & Margins:** Grid columns maintain a strict 24px (`1.5rem`) gutter on desktop, scaling to 16px (`1rem`) on tablet and mobile. Section outer margins use 32px (`2rem`) on desktop.
- **Density Rhythm:** Component internals adhere to an 8px base rhythm. Tight groupings (e.g., metric values to trend chips) use `space-xs` (4px) and `space-sm` (8px). Card interior padding standardizes on `space-lg` (24px) for desktop and `space-md` (16px) for compact viewports.
- **Responsive Adaptations:** Below 1024px, the multi-column card grid collapses into single- and two-column stacks, converting horizontal table scrolls into sticky-column surfaces.

## Elevation & Depth
Elevation in this design system avoids multi-stop drops, directional casts, and dramatic z-axis shadows. Visual layering is achieved primarily through tonal tiering and perimeter delineation:

- **Layer 0 (Canvas Base):** `#F5F5F5` serves as the ground plane.
- **Layer 1 (Resting Cards & Containers):** `#FFFFFF` surfaces sit directly over the base, bounded by a continuous `1px solid #E6E6E6` border and supported by an ultra-diffused resting shadow: `0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.02)`.
- **Layer 2 (Interactive Hover & Popovers):** Interactive card hovers and contextual menus preserve the crisp 1px `#E6E6E6` border, accented with an ambient lift: `0 4px 12px 0 rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.03)`.
- **Layer 3 (Modals & Drawers):** Heavy overlays are replaced with a translucent backdrop (`rgba(17, 17, 17, 0.2)`), containing `#FFFFFF` dialogs bounded by `1px solid #E6E6E6` and an architectural shadow: `0 12px 32px -4px rgba(0, 0, 0, 0.08)`.

## Shapes
Geometry is disciplined and uniform across the UI toolkit:

- **Cards & Data Modules:** Cards, summary panels, and modal shells apply a standard `0.75rem` (12px) border radius, corresponding to the upper boundary of roundedness level 2.
- **Interactive Controls:** Buttons, text input boxes, dropdown selectors, and segmented tabs use a consistent `0.5rem` (8px) radius, preventing circular softness while maintaining smooth visual flow.
- **Micro Elements:** Status pills, metric badges, and active navigation indicators utilize `0.375rem` (6px) or fully rounded pill geometry (`9999px`) only when indicating system status tags.

## Components

### Buttons
- **Primary:** Background `#080808`, text `#FFFFFF`, 8px radius, no border. Hover transitions to `#222222`. Active state settles at `#000000`.
- **Secondary / Outlined:** Background `#FFFFFF`, text `#111111`, border `1px solid #E6E6E6`, 8px radius. Hover shifts background to `#F5F5F5` and border to `#D5D5D5`.
- **Subtle / Ghost:** Background transparent, text `#777777`. Hover shifts background to `#EAEAEA` with text `#111111`.

### Data Cards & Metric Tiles
- **Structure:** Solid `#FFFFFF` background, `1px solid #E6E6E6`, 12px radius, padded with 24px (`space-lg`).
- **Layout:** Top row contains category label in `label-caps` (`#777777`) paired with an optional icon. Primary value rendered in `metric-numeral` (`#111111`). Bottom row accommodates a percentage indicator and contextual comparison copy (`#777777`).

### Navigation Items
- **Inactive:** Text `#777777`, font weight `500`, transparent background, 8px radius.
- **Active:** Background `#D8EAF2`, text `#111111`, font weight `600`, 8px radius.

### Input Fields & Controls
- **Inputs:** Background `#FFFFFF`, border `1px solid #E6E6E6`, height 40px, 8px radius, text `#111111` at 14px. Focus state triggers `border-color: #111111` with no glowing rings or color spread.
- **Checkboxes & Radios:** Size 16px by 16px. Resting border `1px solid #CCCCCC` on `#FFFFFF`. Checked state fills `#111111` with crisp `#FFFFFF` iconography.

### Chips & Status Badges
- **Editorial Badges:** Subtle `#F5F5F5` background with `1px solid #E6E6E6` border and `#111111` text.
- **Semantic Badges:** 
  - Success: Light tint background (`rgba(18, 184, 134, 0.1)`), text `#12B886`, border `1px solid rgba(18, 184, 134, 0.25)`.
  - Warning: Light tint background (`rgba(232, 162, 58, 0.1)`), text `#E8A23A`, border `1px solid rgba(232, 162, 58, 0.25)`.
  - Error: Light tint background (`rgba(217, 83, 79, 0.1)`), text `#D9534F`, border `1px solid rgba(217, 83, 79, 0.25)`.

### Data Tables
- **Header:** Sticky `#FAFAFA` background, uppercase `11px` typography (`#777777`), separated by `1px solid #E6E6E6` bottom border.
- **Rows:** White `#FFFFFF` resting background, 48px row height, divided by hair-thin `1px solid #F0F0F0`. Row hover transitions softly to `#F9F9F9`. Selected row adopts `#D8EAF2` tinting at 30% opacity with `#111111` body copy.
---
name: Bangkee Digital Ledger
colors:
  surface: '#f9f9ff'
  surface-dim: '#cadaff'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e8edff'
  surface-container-high: '#e0e8ff'
  surface-container-highest: '#d7e2ff'
  on-surface: '#041b3c'
  on-surface-variant: '#434654'
  inverse-surface: '#1d3052'
  inverse-on-surface: '#edf0ff'
  outline: '#737685'
  outline-variant: '#c3c6d6'
  surface-tint: '#0c56d0'
  primary: '#003d9b'
  on-primary: '#ffffff'
  primary-container: '#0052cc'
  on-primary-container: '#c4d2ff'
  inverse-primary: '#b2c5ff'
  secondary: '#006c47'
  on-secondary: '#ffffff'
  secondary-container: '#8af5be'
  on-secondary-container: '#00714b'
  tertiary: '#851800'
  on-tertiary: '#ffffff'
  tertiary-container: '#b02300'
  on-tertiary-container: '#ffc6b9'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b2c5ff'
  on-primary-fixed: '#001848'
  on-primary-fixed-variant: '#0040a2'
  secondary-fixed: '#8df7c1'
  secondary-fixed-dim: '#71dba6'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005235'
  tertiary-fixed: '#ffdad2'
  tertiary-fixed-dim: '#ffb4a3'
  on-tertiary-fixed: '#3d0600'
  on-tertiary-fixed-variant: '#8b1a00'
  background: '#f9f9ff'
  on-background: '#041b3c'
  surface-variant: '#d7e2ff'
typography:
  display-amount:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  display-amount-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-padding: 16px
  gutter: 12px
  touch-target-min: 48px
  stack-sm: 4px
  stack-md: 12px
  stack-lg: 24px
---

## Brand & Style
The design system is anchored in the concept of a "Digital Ledger"—a modern, reliable, and frictionless utility for Bhutanese shopkeepers and their customers. The brand personality is grounded, helpful, and transparent. It aims to reduce the mental load of financial tracking through a minimalist approach that emphasizes clarity over decorative elements.

The style is **Professional Minimalism**. It utilizes heavy whitespace to ensure focus remains on transaction data. By stripping away non-essential UI ornamentation, the system ensures high legibility under various lighting conditions, such as outdoor stalls or dimly lit shops. Subtle depth is used sparingly to guide the user's hand toward interactive elements without creating visual clutter.

## Colors
This design system uses a high-contrast palette designed for immediate status recognition.

- **Primary (Trust Blue):** Used for primary actions, branding, and navigation. It signals stability and professional banking standards.
- **Secondary (Success Green):** Exclusively for "Cash In," payments received, and settled balances.
- **Tertiary (Debt Red):** Used for "Cash Out," money owed, and high-priority alerts.
- **Status Amber:** Reserved for pending transactions or overdue credit that requires attention but isn't yet critical.
- **Neutrals:** A range of cool grays provides structure. Pure black is avoided in favor of a deep navy-charcoal (#172B4D) to improve readability and reduce eye strain.

## Typography
Inter is chosen for its exceptional legibility and systematic approach to letterforms. The hierarchy prioritizes **Financial Amounts** (Display) and **Customer Names** (Headlines).

Numbers are the core data of this design system. All numeric values should use tabular lining figures if possible to ensure columns of debt and credit align vertically for easy scanning. Large font sizes are used for "Amount" inputs to minimize data entry errors.

## Layout & Spacing
The layout follows a **Fluid Grid** model with strict adherence to an 8px baseline rhythm. 

- **Mobile:** A single-column layout with 16px side margins. List items occupy the full width to maximize touch area.
- **Desktop/Tablet:** A max-width container of 1024px, centered.
- **Touch Targets:** Every interactive element (buttons, list rows, checkboxes) must have a minimum height of 48px to accommodate quick tapping in a busy shop environment.
- **Vertical Rhythm:** Use 24px (stack-lg) to separate major sections like "Total Balance" cards from the "Recent Transactions" list.

## Elevation & Depth
This design system uses **Tonal Layers** combined with **Ambient Shadows** to create a flat, modern utility feel.

- **Level 0 (Background):** #F4F5F7. The base canvas.
- **Level 1 (Cards/Surface):** Pure White (#FFFFFF). Used for the main content areas, customer lists, and transaction cards.
- **Shadows:** Use a single, very soft shadow for interactive cards: `0px 2px 8px rgba(23, 43, 77, 0.08)`. This indicates that the card can be tapped without creating the "heavy" feel of skeuomorphism.
- **Active State:** When pressed, an element should slightly darken in color (e.g., White to #F4F5F7) rather than increasing shadow depth, maintaining a "utility" feel.

## Shapes
A **Rounded** (0.5rem) strategy is employed to make the app feel approachable and modern. 

- **Standard Elements:** 8px (0.5rem) radius for input fields, list items, and standard buttons.
- **Large Containers:** 16px (1rem) radius for primary balance cards and bottom sheets.
- **Small Elements:** 4px (0.25rem) for tags and badges.

## Components

### Buttons
- **Primary:** Solid "Trust Blue" with white text. High contrast, 48px height.
- **Secondary (Transaction):** Outlined buttons with 2px borders. Use "Success Green" for "Add Payment" and "Debt Red" for "Give Credit."

### Cards & Lists
- **Customer List Item:** 72px minimum height. The customer name is on the left (Headline-md), and the balance is on the right (Headline-md). Use color-coding for the balance (Red for debt, Green for settled).
- **Transaction Card:** White background with a subtle 1px border (#EBECF0). Displays date, amount, and a small icon representing the transaction type.

### Input Fields
- **Amount Input:** Extra-large text (display-amount). Includes a fixed currency prefix (Nu.) in a neutral gray. Background is a light gray (#F4F5F7) to distinguish from the page background.

### Chips/Badges
- **Status Badges:** Rounded-pill shape with low-opacity background tints (e.g., 10% opacity of the status color) and high-opacity text of the same hue. Used for "Overdue," "Pending," or "Settled."

### Navigation
- **Bottom Navigation:** Simple 4-tab bar (Home, Customers, Reports, Settings). Icons are 24px, accompanied by 12px labels for maximum clarity.
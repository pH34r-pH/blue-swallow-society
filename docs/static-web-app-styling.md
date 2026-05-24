# Static Web App Styling

## Design System
The Blue Swallow Society static web application implements a cyberpunk/terminal-inspired design system with dark backgrounds, neon accents, and terminal-style UI elements.

## Color Palette

### Base Colors
- **Background**: Near-black dark background (`#000000` or similar)
- **Primary Text**: Light gray/off-white (`#e0e0e0` or similar)
- **Secondary Text**: Muted gray (`#888888` or similar)

### Accent Colors
- **Neon Green**: Primary accent (`#00ff00` or similar)
- **Neon Blue**: Secondary accent (`#00ffff` or similar)
- **Neon Pink**: Highlight color (`#ff00ff` or similar)
- **Neon Orange**: Warning/attention (`#ff8000` or similar)

### State Colors
- **Error**: Bright red (`#ff0000` or similar)
- **Success**: Bright green (`#00ff00` or similar)
- **Disabled**: Dimmed versions of base colors

## Typography

### Font Family
- Primary: Monospace font stack (e.g., `'Courier New', Courier, monospace`)
- Fallback: System monospace fonts

### Font Sizes
- **Display**: 1.5rem - 2rem (headers, titles)
- **Body**: 1rem - 1.125rem (paragraphs, main content)
- **Small**: 0.85rem - 0.9rem (timestamps, captions, metadata)
- **Tiny**: 0.75rem - 0.8rem (footnotes, ultra-small text)

### Font Weights
- **Normal**: 400 (body text)
- **Medium**: 500 (sub-headings, emphasized text)
- **Bold**: 600-700 (headers, important labels)
- **Terminal Bold**: May use letter-spacing for emphasis effect

## Layout System

### Containers
- **Main Container**: Fixed max-width with horizontal padding
- **Content Areas**: Full-width within container constraints
- **Terminal Interface**: Fixed-height sections with scrolling overflow

### Spacing
- **Base Unit**: 8px or 0.5rem
- **Sections**: 2-3rem vertical padding
- **Elements**: 0.5-1.5rem margin/padding based on context
- **Gaps**: Consistent spacing between related elements (0.5-1rem)

### Breakpoints
- **Mobile**: < 640px (stacked layouts, full-width elements)
- **Tablet**: 640px - 1024px (adjusted column layouts)
- **Desktop**: > 1024px (multi-column layouts, side-by-side elements)

## Component Styles

### Terminal Interface
- **Screen**: Dark background with subtle border/texture
- **Panel**: Slightly lighter dark background for content areas
- **Header**: Monospace text with terminal-style formatting
- **Input Fields**: Dark background, light text, colored border on focus
- **Labels**: Monospace, slightly dimmed text
- **Error Messages**: Bright red, monospace, prefixed with "> ERROR:"

### Buttons
- **Primary**: Neon background with dark text, glow effect on hover
- **Secondary**: Dark background with neon border and text
- **States**: 
  - Normal: Solid colors
  - Hover: Increased opacity/glow
  - Active/Pressed: Reduced opacity/scale
  - Disabled: Significantly dimmed, no interaction
- **Typography**: Monospace, medium weight, letter-spacing

### Tab System
- **Tabs**: 
  - Active: Neon background with dark text
  - Inactive: Dark background with neon text/border
  - Hover: Slight brightness increase
- **Tab Content**: Padding within container, smooth transition on switch
- **Indicators**: Active tab highlighted with color change

### Chat Interface
- **Messages Container**: 
  - Dark background
  - Scrollable with smooth scrolling
  - Padding for message bubbles
- **Message Bubbles**:
  - User: Left-aligned, neon blue background
  - Agent: Right-aligned, neon green background
  - System: Center-aligned, dimmed text, no background
  - Avatar/Label: Monospace sender label with timestamp
- **Input Area**:
  - Dark background input field
  - Neon button for sending
  - Enter key submission

### Forms & Inputs
- **Text Inputs**:
  - Dark background (`#1a1a1a` or similar)
  - Light text (`#e0e0e0` or similar)
  - Neon border on focus (`#00ff00` or similar)
  - Padding: 0.5rem vertical, 0.75rem horizontal
  - Border radius: 2-4px
- **Labels**:
  - Monospace font
  - Slightly dimmed color
  - Margin-bottom: 0.25rem
- **Placeholders**: Dimmed text, monospace style

### Error States
- **Validation Errors**: Bright red text, monospace
- **Field Errors**: Red border on input, error message below
- **Global Errors**: Banner or modal with red accent
- **Loading States**: Subtle animation or pulsing effect

### Interactive Elements
- **Hover Effects**: 
  - Buttons: Brightness increase or glow
  - Links/Text: Underline or color shift
  - Cards/Panels: Subtle elevation or border change
- **Focus States**: 
  - Outline: Neon color, 2px width
  - Outline-offset: 2px
  - Alternative: Background/color change
- **Transitions**: 
  - Duration: 150ms-300ms
  - Easing: ease-in-out or cubic-bezier variants
  - Properties: background-color, border-color, opacity, transform

## Responsive Behavior

### Mobile Layout
- Full-width terminals and panels
- Stacked tab buttons (if many tabs) or scrollable tab bar
- Touch-optimized input sizes (min 44px touch targets)
- Simplified layouts where appropriate

### Desktop Layout
- Multi-column arrangements where beneficial
- Fixed sidebar potential (not currently implemented)
- Wider content areas with side margins
- Hover effects more pronounced

## Implementation Details

### CSS Approach
- **File**: `/app/styles.css`
- **Methodology**: Utility-first with semantic component classes
- **Variables**: CSS custom properties for colors, spacing, and typography (`:root`)
- **Specificity**: Low-to-moderate, zero `!important`
- **Organization**:
  - Reset/base styles
  - CSS custom properties (design tokens)
  - Layout and container styles
  - Component styles
  - Utility classes
  - Responsive overrides (`@media`)
  - Print styles (`@media print`)
  - Motion preferences (`prefers-reduced-motion`)

### CSS Features Used
- **Custom Properties**: Theme colors, spacing, typography tokens
- **Flexbox**: Headers, tab bars, input groups, chat interfaces
- **Grid**: Two-column layouts (`.grid-2`)
- **Clamp**: Fluid typography (`font-size: clamp(...)`)
- **Transition**: Smooth state changes (150ms–300ms)
- **Media Queries**: Mobile-first responsive breakpoints + wide-screen (`2560px`)
- **Focus-visible**: Neon outline for keyboard users
- **Pseudo-classes**: `:hover`, `:focus`, `:focus-visible`, `:active`
- **Keyframe Animation**: Terminal cursor blink (disabled via `prefers-reduced-motion`)

### Terminal Effects
- **Cursor**: Simulated with blinking element or caret animation
- **Text Rendering**: Monospace for authentic terminal feel
- **Scrolling**: Smooth scrolling behavior for chat/messages
- **Text Selection**: Customized to match theme (where supported)

### Accessibility Considerations
- **Color Contrast**: Meets WCAG AA for text vs background
- **Focus Visibility**: Clear focus indicators for keyboard navigation
- **ARIA Labels**: Used where native semantics insufficient
- **Keyboard Navigation**: Logical tab order, Enter/Space activation
- **Screen Reader**: Semantic HTML where possible, labels for inputs

## Current Styling Implementation

The styling is implemented in `/app/styles.css` and includes:
- Terminal screen and panel styling
- Input field and button designs with focus-visible outlines
- Tab bar and content styling with ARIA roles
- Chat interface message bubbles with sender-specific neon colors
- Responsive adjustments for mobile, tablet, desktop, and ultra-wide (`2560px`)
- Cyberpunk color scheme with neon accents (all via CSS custom properties)
- Hover and focus states for interactive elements
- `prefers-reduced-motion` media query respecting user motion preferences
- `@media print` hiding non-essential decorative elements

## Opportunities for Enhancement
- Add more sophisticated terminal effects (scanlines, glow)
- Implement more robust form validation styling
- Add skeleton loading states for content
- Consider CSS-in-JS or styled components for dynamic styling

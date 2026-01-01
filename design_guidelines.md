# UroRads Design Guidelines

## Design Approach

**Selected Approach:** Design System (Utility-Focused)

**System Foundation:** Apple Human Interface Guidelines + Material Design principles
- Medical education tool prioritizing clarity, readability, and efficiency
- Clean, clinical aesthetic with strong information hierarchy
- Mobile-first with emphasis on one-handed operation
- Content-focused layouts that minimize distraction from learning

**Core Principles:**
1. Clinical Clarity: Medical imagery and explanations are the hero
2. Efficient Navigation: Single-tap access to all primary functions
3. Readability First: Typography optimized for medical terminology
4. Focused Learning: Minimal UI chrome, maximum content visibility

---

## Typography

**Font System:** System fonts for optimal readability
- **Primary:** San Francisco (iOS) / Roboto (Android) via system stack
- **Monospace:** For case numbers and technical data

**Hierarchy:**
- **App Title:** text-lg font-semibold (UroRads header)
- **Case Numbers:** text-xl font-bold (Case #14)
- **Case Titles:** text-base font-medium (Staghorn Calculus Left Kidney)
- **Explanations:** text-base leading-relaxed (medical content)
- **Body Text:** text-sm leading-normal (chat messages, descriptions)
- **Labels:** text-xs font-medium uppercase tracking-wide (nav labels, metadata)

---

## Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 8, 12, 16
- Component padding: p-4, p-8
- Section spacing: space-y-4, space-y-8
- Margins: m-2, m-4, m-8
- Gaps: gap-2, gap-4

**Container Strategy:**
- Mobile: Full width with p-4 horizontal padding
- Content max-width: max-w-4xl for desktop centered view
- Image containers: Fixed aspect ratio 3:2 or 4:3 for CT scans

---

## Screen Layouts

### Screen 1: Case View (Primary Learning Interface)

**Vertical Stack (Mobile Portrait):**
1. **Header Bar** (h-16): App title left-aligned, optional Next button right-aligned, px-4
2. **CT Image Area** (h-64 to h-80): Full-width container with object-contain fit, maintains aspect ratio, tap target for future zoom
3. **Chat Thread** (flex-1, scrollable): 
   - First bubble: AI explanation (always visible as anchor message)
   - Subsequent bubbles: Alternating user/AI messages
   - Padding: px-4 py-2 between messages
4. **Chat Input Bar** (h-16, fixed above nav): Text input + Send button, px-4 gap-2
5. **Bottom Nav** (h-16, fixed)

**Message Bubble Styling:**
- AI messages: Aligned left, max-w-4/5, rounded-2xl rounded-tl-sm
- User messages: Aligned right, max-w-4/5, rounded-2xl rounded-tr-sm
- Padding: p-4 internal spacing

### Screen 2: Archive (Case Library)

**List Layout:**
1. **Header** (h-16): "Archive" title, px-4
2. **Case List** (scrollable):
   - Each row: h-20, px-4, border-b divider
   - Left: Case number (font-bold) + title (font-medium)
   - Right: Chevron icon (subtle indicator)
   - Tap target: full row height

**Category Grouping (Future):**
- Sticky section headers: h-12, uppercase text-xs, px-4

### Screen 3: Add Case (Attending Workflow)

**State-Based Layouts:**

**Capture State:**
- Three action buttons stacked vertically, each h-16, gap-4
- Icons left-aligned, labels clear
- Full-width buttons with p-4

**Prompt State:**
- Image preview: aspect-ratio-square, max-h-48, mb-4
- Prompt textarea: h-32, p-4, rounded-lg
- Generate button: h-12, w-full, mt-4

**Review State:**
- Image: Same as Case view (h-64 to h-80)
- Explanation: Scrollable text area, min-h-48, p-4
- Action buttons: Three-column grid, gap-2, h-12 each

---

## Component Library

### Navigation
**Bottom Tab Bar:**
- Fixed height: h-16
- Three equal-width buttons: grid grid-cols-3
- Active state: Subtle highlight, no underline
- Each button: Icon (h-6 w-6) + Label (text-xs) stacked vertically, py-2

### Buttons
**Primary (Generate, Approve, Send):**
- Height: h-12
- Padding: px-6
- Rounded: rounded-lg
- Font: font-semibold

**Secondary (Edit, Regenerate):**
- Height: h-12
- Padding: px-6
- Rounded: rounded-lg
- Font: font-medium

**Icon Buttons (Nav, Send):**
- Size: h-10 w-10
- Rounded: rounded-full
- Icon: h-5 w-5 centered

### Forms
**Text Input:**
- Height: h-12
- Padding: px-4
- Rounded: rounded-lg
- Border width: border-2

**Text Area:**
- Min height: min-h-32
- Padding: p-4
- Rounded: rounded-lg

### Image Containers
**CT Scan Display:**
- Aspect ratio: Fixed 3:2 or 4:3
- Object fit: contain (never crop medical imagery)
- Background: Subtle neutral (for letterboxing)
- Border: Thin border for definition

### Cards (Archive Items)
**List Item:**
- Padding: p-4
- Min height: h-20
- Border bottom: border-b
- Active/hover: Subtle highlight

---

## Responsive Breakpoints

**Mobile (<640px):** Primary design target
- Full-width components
- Vertical stacking
- Single column layouts
- Touch targets: minimum h-12

**Tablet (640-1024px):**
- Same layout, increased padding (p-6, p-8)
- Slightly larger touch targets (h-14)

**Desktop (>1024px):**
- Centered container: max-w-4xl mx-auto
- Case view: Consider two-column (image left, chat right)
- Maintain mobile navigation pattern for consistency

---

## Images

**CT Scan Images:** 
- Medical imagery is THE hero of this application
- Every case includes one CT slice image
- Placement: Top third of Case view, full-width within container
- Treatment: Clean presentation, no filters, maintain clinical accuracy
- Format: High-resolution JPEG or PNG
- Aspect ratio: Preserve original medical imaging ratios

**No decorative imagery:** This is a clinical tool - no hero sections, background patterns, or ornamental graphics

---

## Accessibility

- Touch targets: Minimum 44x44px (h-12 w-12)
- Contrast ratios: WCAG AA compliant for all text
- Focus indicators: Visible keyboard navigation states
- Screen reader: Semantic HTML, proper ARIA labels for icons
- Font size: Never below 14px (text-sm) for body content

---

## Animations

**Minimal, purposeful only:**
- Screen transitions: Simple fade or slide (200ms)
- Loading states: Subtle spinner during AI generation
- Message sending: Brief fade-in for new chat bubbles
- NO parallax, NO scroll animations, NO decorative motion

---

## PWA-Specific Design

- Splash screen: App icon + title on neutral background
- Status bar: Translucent overlay on iOS
- Safe area insets: pb-safe for bottom nav on notched devices
- Install prompt: Subtle banner, dismissible, shown once
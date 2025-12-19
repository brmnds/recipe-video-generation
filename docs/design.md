## Design Guide (HEALTHYFRESH-Inspired)

**Look & Feel**
- Clean white canvas with soft gray borders and gentle shadows; subtle radial green background wash.
- Primary color: `#7AC143` (HEALTHYFRESH green). Secondary text: `#1E2B20`. Light surface: `#F7FAF5`.
- Rounded corners (12–16px) and soft card shadows for depth without clutter.

**Typography**
- Primary type: DM Sans (bold, friendly, food-forward). Body backup: system sans.
- Header hierarchy: Title 32px bold, section headers 20–24px semibold, body 14–16px regular.

**Components**
- Buttons: solid green primary, white secondary with subtle border; slight lift on hover.
- Cards: white background, light gray border, soft drop shadow; ample padding.
- Inputs: rounded, light borders, green focus ring; textarea with faint tint to hint at editability.
- Status dots: green for done, pulsing gray/green for active, pale gray for idle.
- Modal: frosted overlay, centered card, editable prompt textarea, primary/secondary buttons.

**Layout**
- Two-column grid on desktop: left for inputs, right for status/preview/history; stack on mobile.
- Header row with leaf icon and “HEALTHYFRESH Cooking Video POC” title.
- Right rail groups: Status panel, Video preview, History list.

**Motion**
- Micro-interactions only: hover lift on buttons, pulse on active step indicator; modal fades with backdrop blur.

**Accessibility**
- Clear focus states (green ring), high-contrast text on white, disabled states dimmed not hidden.

**Content Strategy**
- Concise labels, friendly helper text, action-first CTAs: “Generate cooking video”, “Confirm and generate video”.

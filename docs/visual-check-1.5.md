# Visual check — stage 1.5

Run this checklist manually after PR #207 is merged. Record each result in the status column; leave it blank until checked.

| Screen | What to inspect | Expected result | Status |
|---|---|---|---|
| Dashboard | Primary and secondary buttons | Both button types retain the intended hierarchy, colors, borders, spacing, and hover/focus behavior after stage 1.5 removed competing `!important` declarations. | |
| Mobile | Topbar height and padding | Topbar height and internal padding remain consistent; no clipping, overlap, or unexpected vertical shift. | |
| Sidebar | Background, shadow, and logo | Sidebar surface and shadow remain intentional; logo is fully visible and aligned in light and dark themes. | |
| Content on mobile | Horizontal page gutters | Content has consistent horizontal margins at mobile widths; no edge clipping or unwanted horizontal scrolling. | |

## Test conditions

- Check both light and dark themes.
- Check at least one narrow phone viewport and one wider mobile viewport.
- Record only observed results; do not infer a pass from desktop appearance.

## Recipe 10 Responsive creator cards

**Build:** Style a project gallery with ordinary CSS, then recreate it using Tailwind v4.

**Languages:** HTML, CSS and Tailwind. **Time:** 90–150 minutes plus setup.

### What you need

Browser/editor for CSS; supported Node LTS and npm for the optional Tailwind build.

### Build and explore

1. Open projects/10_creator_cards/free_starter/index_solution.html.
2. Compare its CSS grid and media query with the starter.
3. Change directory into projects/10_creator_cards and run `npm install`, then `npm run build:css`.
4. Open paid_pack/index_solution.html after the generated stylesheet exists. Compare grid-cols-1 and md:grid-cols-3.

### What to expect

Cards for a setup tour, sketch timelapse and photo collection. One narrow column becomes three at the medium breakpoint.

### Remix challenge and answer

Change md:grid-cols-3 to md:grid-cols-2, rebuild and predict which card wraps. Answer: the third begins another row. Keep complete class names in scanned source.

### Error handling and limits

Tailwind dependencies and compiled output are not bundled or verified here. Plain CSS needs no npm. Preserve readable contrast and keyboard focus. The CLI setup uses v4; do not substitute an older v3 init workflow.


Commands use the cookbook root unless stated otherwise.

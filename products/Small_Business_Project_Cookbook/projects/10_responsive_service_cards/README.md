# Recipe 10 Responsive service cards

**Outcome:** Build equivalent card layouts in plain CSS and Tailwind v4 and understand what the build generates.

**Languages:** HTML, CSS and Tailwind. **Time:** 90–150 minutes plus setup.

**Files:** [projects/10_responsive_service_cards](projects/10_responsive_service_cards/).

### Ingredients

Browser/editor for plain CSS. The Tailwind branch also needs a supported Node LTS release, npm and an internet connection for dependency installation. This recipe adapts the styling lesson pack.

### Method

1. Open projects/10_responsive_service_cards/free_starter/index_solution.html. Inspect the grid and media query in styles_solution.css.
2. In a terminal change into projects/10_responsive_service_cards, then run `npm install` and `npm run build:css`.
3. After a successful build open paid_pack/index_solution.html. Generated paid_pack/assets/tailwind.css supplies the styles.
4. Compare grid grid-cols-1 gap-4 md:grid-cols-3 with the plain CSS grid. Try changes in the starters and rebuild the Tailwind stylesheet.

### Expected result

A readable single column at narrow widths and three columns at medium/wider widths. The Tailwind page needs its generated stylesheet before it can show the intended layout.

### Make it your own

Change md:grid-cols-3 to md:grid-cols-2. Answer: cards use two columns from the medium breakpoint and the third wraps. Add text-brand to a heading and rebuild to exercise the @theme custom color.

### Error handling and limits

Tailwind dependencies and output are not installed or precompiled in this cookbook. Keep the generated package-lock.json after testing. Use complete utility names in scanned source, preserve semantic markup and keep keyboard focus visible. Do not assume a copied older v3 init command matches this v4 project.


Commands above assume the cookbook root unless stated otherwise. Copied lesson notes may use their original bundle-root paths; use this README for cookbook launch commands.

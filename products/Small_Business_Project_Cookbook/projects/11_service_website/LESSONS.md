# Combine the web lessons into a Jekyll project
## Lesson 1 Separate page content from layout
Open index.html and _layouts/default.html. Front matter between --- lines selects the layout and page title. The layout holds the shared HTML skeleton and inserts page output at {{ content }}. Liquid evaluates at build time; JavaScript executes later in the visitor's browser.

Task: change the home heading, build and inspect the rendered page. Change title in _config.yml and restart the development server. The shared header and browser title should reflect the configuration. Do not edit _site to make the change.

## Lesson 2 Reuse navigation and service data
Read _includes/header.html. The layout includes it once per page. Add a harmless navigation text change and verify it appears across default-layout pages.

Read _data/services.yml and the for loop in services.html. Add a fourth fictional service with name, description and display_price. Match indentation and quote text. Rebuild and expect a fourth card. The escape filter protects text rendering; it does not turn arbitrary user input into trusted content. All source data here is controlled by the author.

## Lesson 3 Add the JavaScript calculator
Read quote.html front matter and the conditional scripts in the layout. Only this page sets calculator: true, so the calculator scripts load only there. quote.js defines the arithmetic; app.js wires controls to it. The layout loads them in order using defer.

Test defaults: 3 hours, $50 rate, $25 materials and 10 percent discount produce $157.50. Change inputs, calculate and reset. Invalid or fractional values should be rejected. Reload and confirm the estimate is not stored. Review comments for selectors, events, integer cents and error handling.

## Lesson 4 Test links and styling
Build at both an empty baseurl and /practice-site. Inspect home, services, quote and about links and CSS/JS network requests. relative_url adds the configured prefix. Manually hardcoded root paths can break project sites.

The optional /tailwind/ page uses a separate layout and generated CSS. Compile before testing it. Compare its YAML-driven cards with the plain CSS services page. Do not add Tailwind CSS to the default layout unless you plan and verify reset-style interactions.

## Exercises and answers
A. Add a fourth service: add one properly indented record to _data/services.yml; expect four cards in both card loops.
B. Rename the site: change title in _config.yml and restart; content headings are independent and may also need an intentional edit.
C. Create a new plain page: copy about.md to a distinct filename, use layout: default, give it a unique permalink and add a relative_url link in header.
D. Explain why opening quote.html directly shows template syntax: Liquid/front matter require a Jekyll build.
E. Explain what commits to source control: source and resolved dependency lockfiles; not _site, node_modules or vendor/bundle.

You pass when every default navigation link works under both path configurations, the calculator has correct results and no stale output, and source changes survive a rebuild. Full browser and Jekyll build validation remain required before sale or deployment.

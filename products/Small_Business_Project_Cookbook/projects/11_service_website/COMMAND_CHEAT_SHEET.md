# Jekyll HTML JavaScript and Styling Cheat Sheet
Run terminal commands from the project root. Do not paste shell commands into HTML or the browser Console.

| Command | Purpose |
| --- | --- |
| ruby --version | Check Ruby. |
| bundle --version | Check Bundler. |
| bundle config set --local path vendor/bundle | Use a local dependency directory. |
| bundle install | Resolve and install Gemfile dependencies; create Gemfile.lock. |
| bundle exec jekyll build --trace | Generate _site and show a detailed error trace if building fails. |
| bundle exec jekyll serve --host 127.0.0.1 | Build and serve locally. |
| bundle exec jekyll serve --baseurl /practice-site --host 127.0.0.1 | Test hosting under a project subpath. |
| bundle exec jekyll doctor | Check common configuration issues; not a full site test. |
| npm install | Install optional Tailwind tools and create package-lock.json. |
| npm run build:css | Generate the optional Tailwind stylesheet. |
| npm run watch:css | Rebuild that stylesheet during editing; stop with Ctrl+C. |

Restart Jekyll after configuration changes. Keep dependency lockfiles after resolving them. An install or build failure must be resolved before judging the rendered page. Read the actual error and relevant source rather than repeatedly reinstalling.

## Project map
| Source | Responsibility |
| --- | --- |
| _config.yml | Site title, baseurl and build exclusions. |
| _layouts/default.html | Shared HTML shell and conditional calculator scripts. |
| _includes/header.html | Shared navigation. |
| _data/services.yml | Fictional service records. |
| services.html | Liquid loop that renders service cards. |
| quote.html | Calculator markup and calculator: true front matter. |
| assets/js/quote.js | Validated calculation function. |
| assets/js/app.js | Form event handlers and output text. |
| assets/css/site.css | Default site styling. |
| src/tailwind.css | Optional Tailwind v4 input and source scan declarations. |
| _site | Generated build output; do not edit manually. |

## Template patterns
Front matter begins and ends with --- on separate lines. Use layout: default, title: Services and a permalink such as /services/ inside that block.

`{{ content }}` inserts the rendered page into its layout.
`{% include header.html %}` inserts shared markup.
`{{ site.title | escape }}` displays a configuration string as text.
`{{ '/quote/' | relative_url }}` prefixes the current baseurl.
`{% for service in site.data.services %}` begins a loop; close it with `{% endfor %}`.
`{% if page.calculator %}` tests page metadata; close it with `{% endif %}`.

## Browser code reminders
HTML describes structure. CSS applies styling. JavaScript responds to events. A real button and submit event support keyboard use. Match label for values and JavaScript selectors to input ids. Use textContent for plain output. Keep calculation validation and a readable error handler. Client validation does not secure a future server endpoint.

## Tailwind reminders
v4 imports tailwindcss and uses the separate @tailwindcss/cli package. grid grid-cols-1 md:grid-cols-3 gap-4 creates responsive cards. p-6 adds padding; rounded-xl rounds corners. Keep classes complete in scanned source. Build CSS before Jekyll if the generated file needs to be copied into _site. The default pages do not require Tailwind.

## Verification checklist
Build successfully, inspect all pages, check CSS and JS loads, test root and subpath links, resize, tab through controls, check calculator predictions, reset, change inputs and inspect Console errors. _site generation alone does not verify interactive behavior.

References: https://jekyllrb.com/docs/ and https://tailwindcss.com/docs/installation/tailwind-cli

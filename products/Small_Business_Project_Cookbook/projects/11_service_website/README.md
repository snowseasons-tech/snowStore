# Recipe 11 Data-driven service website

**Outcome:** Combine shared navigation, YAML service cards and the quote calculator into a multi-page static project.

**Languages:** Jekyll, HTML, JavaScript and CSS. **Time:** 2–3 hours plus setup.

**Files:** [projects/11_service_website](projects/11_service_website/).

### Ingredients

Supported Ruby/Jekyll development environment and Bundler. Plain CSS is the default. Optional Tailwind uses its own Node/npm build. This adapts the combined Jekyll project.

### Method

1. Follow projects/11_service_website/README.md for operating system prerequisites.
2. In that project directory run `bundle config set --local path vendor/bundle`, `bundle install` and `bundle exec jekyll build --trace`.
3. Run `bundle exec jekyll serve --host 127.0.0.1` and open http://127.0.0.1:4000/ after success.
4. Add a fictional record to _data/services.yml and rebuild. Trace the Liquid loop, include and layout. Test the calculator and the documented /practice-site baseurl example.

### Expected result

Home, services, calculator and about pages with consistent navigation. The services page contains three cards initially; the default calculator result is $157.50.

### Make it your own

Add a fourth service and a new plain content page. Answer: update the YAML list, then create a page with layout: default and a unique permalink; add a relative_url navigation link. Do not edit _site.

### Error handling and limits

The Ruby build and optional Tailwind build still need verification in a configured environment. _site is generated output, not editable source. No GitHub workflow, hosting action, inquiry delivery or deployment is included. The calculator rate is entered manually rather than automatically selected from YAML.


Commands above assume the cookbook root unless stated otherwise. Copied lesson notes may use their original bundle-root paths; use this README for cookbook launch commands.

# Jekyll HTML and JavaScript practice project
Snow Seasons Tech • Version 1.0

Build a fictional small-business site with shared navigation, YAML service records and the JavaScript quote calculator. This is a separate downloadable project; it does not modify an existing repository or deploy anything.

## Setup
Install a currently supported Ruby version compatible with Jekyll, Bundler and the prerequisites for your operating system using https://jekyllrb.com/docs/installation/ . On Windows follow Jekyll's WSL guidance. Do not replace an operating system Ruby installation to follow this lesson; use the documented user development environment.

From the extracted project root:
```
ruby --version
bundle --version
bundle config set --local path vendor/bundle
bundle install
bundle exec jekyll build --trace
bundle exec jekyll serve --host 127.0.0.1
```
If bundle is missing, finish the official Ruby and Bundler installation steps first. Open http://127.0.0.1:4000/ after a successful serve. Press Ctrl+C to stop. Restart the server after editing _config.yml. A static file opened directly cannot evaluate Liquid or layouts: use Jekyll to build it first.

Gemfile specifies Jekyll 4.4-compatible releases. bundle install resolves dependencies and creates Gemfile.lock. Keep that lockfile for repeatable builds. This authoring environment has no Ruby/Jekyll runtime, so dependency resolution and the actual site build still require verification. No Gemfile.lock is fabricated or included.

## Included pages
Home, services, practice calculator and about pages share the default layout. Service cards read _data/services.yml. Quote inputs are manual and are not automatically linked to a selected service. The calculator accepts whole hours and dollar amounts, shows pretax estimates, and saves or transmits nothing.

## Optional Tailwind experiment
The normal site uses assets/css/site.css and needs no Node/npm build. For an optional /tailwind/ page, install a supported Node.js LTS release, then run:
```
npm install
npm run build:css
bundle exec jekyll build --trace
```
The build generates assets/css/tailwind.css. Open /tailwind/ through the Jekyll server. Complete literal classes are scanned from layouts, includes and root HTML. Source paths are relative to src/tailwind.css. Keep package-lock.json once generated. No compiled Tailwind output or lockfile is included because dependency installation was not run here.

## Source and generated output
Edit root pages, _layouts, _includes, _data and assets source. Rebuild _site; never fix a page by editing generated output. The included .gitignore excludes _site, caches and installed dependencies. Generated Tailwind CSS is ignored too, so any future deployment build must run the optional npm build if serving /tailwind/.

## Root versus project paths
Keep baseurl empty at a domain root. For a project path set it to something like /practice-site, without a trailing slash. Internal links and assets use relative_url. Test with `bundle exec jekyll serve --baseurl /practice-site --host 127.0.0.1`, then open http://127.0.0.1:4000/practice-site/ . Do not add /practice-site twice to templates.

No GitHub Pages settings, workflow, credentials or publishing actions are included. A later deployment should build this project's declared Jekyll version rather than assuming a hosting service's managed version matches it. Review LESSONS.md, COMMAND_CHEAT_SHEET.md and TESTING.md before release.

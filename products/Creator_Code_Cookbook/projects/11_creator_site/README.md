## Recipe 11 Creator portfolio with Jekyll

**Build:** Turn the profile and caption lab into a reusable multi-page project.

**Languages:** Jekyll, HTML, CSS and JavaScript. **Time:** 2–3 hours plus setup.

### What you need

Supported Ruby, Bundler and Jekyll prerequisites from https://jekyllrb.com/docs/installation/ . Windows learners follow the documented WSL path.

### Build and explore

1. Change directory into projects/11_creator_site.
2. Run `bundle config set --local path vendor/bundle`, `bundle install` and `bundle exec jekyll build --trace`.
3. Start `bundle exec jekyll serve --host 127.0.0.1` and open http://127.0.0.1:4000/ after it succeeds.
4. Read the shared layout, header include and _data/projects.yml. Test the caption lab and the three navigation links.

### What to expect

Home, Projects and Caption lab pages with shared navigation. Three YAML records become project cards. The caption script loads only on the caption-lab page.

### Remix challenge and answer

Add a fourth YAML project and rebuild. Answer: the Projects page gets a fourth card without duplicating card HTML. Test `bundle exec jekyll serve --baseurl /creator-site --host 127.0.0.1` at /creator-site/.

### Error handling and limits

Ruby dependency resolution and the Jekyll build require verification on a configured machine. Keep the generated Gemfile.lock. Edit source, not _site. This is a local project: hosting, real accounts and deployment are not included.


Commands use the cookbook root unless stated otherwise.

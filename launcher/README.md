# Launcher

One page that opens every Snow Seasons Tech and American Tree app. Add or change apps in `src/apps.js`.

```bash
npm install
npm run dev            # http://127.0.0.1:5183
npm run build          # static site in dist/, for any host
npm run build:single   # also dist/launcher.html, one page for a Claude artifact
```

## Deploy

The Launcher lives at https://hq.snowseasonstech.net, behind Cloudflare Access (Cloudflare Pages project `snowseasons-hq`). Use Node 22, and run this from the `launcher` folder so no other project's Functions get bundled in:

```bash
npm run build
npx wrangler pages deploy dist --project-name snowseasons-hq --branch main
```

Each deploy also gets its own `<id>.snowseasons-hq.pages.dev` address, and those aren't behind the login yet. Turn on the project's Access policy to cover them.

Press `/` to search and Enter to open the top result. Pins and recent apps are saved in that browser only.
It holds links, not passwords, and each app still asks for its own sign-in.

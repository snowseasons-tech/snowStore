# Launcher

One page that opens every Snow Seasons Tech and American Tree app. Add or change apps in `src/apps.js`.

```bash
npm install
npm run dev            # http://127.0.0.1:5183
npm run build          # static site in dist/, for any host
npm run build:single   # also dist/launcher.html, one page for a Claude artifact
```

Press `/` to search and Enter to open the top result. Pins and recent apps are saved in that browser only.
It holds links, not passwords, and each app still asks for its own sign-in.

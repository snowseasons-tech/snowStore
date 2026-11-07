# Campaign template

Turns posts from a Facebook calendar (`marketing/facebook-*/posts.md`) into a themed campaign with a Facebook and an Instagram version of each post, a calendar, and a launch checklist.

## Files

| File | What it is |
|---|---|
| `campaign.template.md` | The fill-in template. `{{placeholders}}` are filled from the config. |
| `build_campaign.py` | Reads the config and the source `posts.md`, then writes the campaign. Standard library only. |
| `../campaigns/<slug>.json` | One config per campaign: which posts, their roles, and the campaign details. |
| `../campaigns/<slug>.md` | Generated output. Edit the config and rebuild, don't edit this file by hand. |

## Make a campaign

1. Copy `../campaigns/small-business-weekend-2026.json` to `../campaigns/<new-slug>.json`.
2. Fill in the campaign fields (theme, dates, goal, audience, offer, call to action, message, bio link).
3. List the posts in `posts` by their number in `posts.md`, each with a role such as "Teaser" or "Launch".
4. Build it:

```bash
python3 build_campaign.py ../campaigns/<new-slug>.json
```

5. Open the `.md` file and check the warnings (lines starting with ⚠).

## What the builder changes

- **Facebook:** the caption as written, with its links and all hashtags.
- **Instagram:**
  - Links become "Link in bio", since Instagram captions aren't clickable.
  - Hashtags are cut to `ig_hashtag_limit` (default 5).
  - Captions over 2,200 characters are flagged.
  - Facebook-only wording such as "this Page" is flagged.
- **Both:** Markdown bold and italics are removed, because the posts would otherwise show literal asterisks.
- **Multi-image posts:** marked for an Instagram carousel.

## When the automatic Instagram version isn't right

Add an `ig_caption` to that post's entry in the config. It replaces the generated Instagram text in full, including hashtags. The example config does this for post 9.

## Not covered

- Images are not rendered here. Post images are still made by `marketing/facebook-*/src/render.sh` (and `render-reels.sh` for reels). Put the new images in the source folder and list them in `posts.md`.
- Nothing is published. Posting still happens by hand or through the Social Studio product.

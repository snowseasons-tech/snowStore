#!/usr/bin/env python3
"""Turn posts from an existing Facebook posts.md calendar into a themed campaign.

Usage:
    python3 build_campaign.py ../campaigns/<slug>.json            # writes ../campaigns/<slug>.md
    python3 build_campaign.py ../campaigns/<slug>.json --out x.md

The campaign config (JSON) names the posts to use, gives each one a role in the
campaign, and fills in the campaign-level fields of campaign.template.md.
The `source` path in the config is relative to the config file.

Standard library only. Edit the config, not the generated .md file.
"""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "campaign.template.md"

REQUIRED = ["name", "slug", "source", "theme", "dates", "goal", "audience",
            "offer", "cta", "message", "bio_link", "posts"]
IG_CAPTION_LIMIT = 2200
DEFAULT_IG_HASHTAGS = 5

# Phrases that only make sense on Facebook. Reported as warnings, not rewritten.
FB_ONLY = [r"\bthis Page\b", r"\bour Page\b", r"\bFacebook\b", r"\bPage's\b"]

# "👉 snowseasonstech.store" and "🔗 snowseasonstech.net/blog" -> "👉 Link in bio"
LEAD_LINK_RE = re.compile(r"(?P<lead>[\U0001F449\U0001F517])\s*(?:https?://)?snowseasonstech\.[a-z]+\S*")
# Any remaining bare store/blog domain in running text
INLINE_LINK_RE = re.compile(r"(?:https?://)?snowseasonstech\.[a-z]+(?:/\S*)?")
HEAD_RE = re.compile(r"^(\d+) · ([^·]+?) · (.+)$")
IMAGE_RE = re.compile(r"`([^`]+\.(?:png|jpe?g|webp))`")


def parse_posts(text):
    """Return {post_number: dict} from a posts.md calendar file."""
    posts = {}
    for part in re.split(r"^## ", text, flags=re.M)[1:]:
        head, _, body = part.partition("\n")
        m = HEAD_RE.match(head.strip())
        if not m:
            continue
        num = int(m.group(1))
        images, kept = [], []
        for line in body.split("\n"):
            if line.startswith("**Image"):
                images += IMAGE_RE.findall(line)
            else:
                kept.append(line)
        block = re.sub(r"\n-{3,}\s*$", "", "\n".join(kept).strip()).strip()
        lines = block.split("\n")
        tags = []
        if lines and lines[-1].startswith("#"):
            tags = lines.pop().split()
        posts[num] = {
            "num": num,
            "date": m.group(2).strip(),
            "title": m.group(3).strip(),
            "images": images,
            "caption": "\n".join(lines).strip(),
            "tags": tags,
        }
    return posts


def plain(text):
    """posts.md is written in Markdown; Facebook and Instagram post plain text."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    return re.sub(r"(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)", r"\1", text)


def facebook_version(post):
    text = plain(post["caption"])
    tags = " ".join(post["tags"])
    return (text + "\n\n" + tags).strip(), []


def instagram_version(post, hashtag_limit, override=None):
    if override is not None:
        caption = override.strip()
        warnings = []
    else:
        warnings = []
        text = LEAD_LINK_RE.sub(lambda m: m.group("lead") + " Link in bio", plain(post["caption"]))
        text = INLINE_LINK_RE.sub("our site (link in bio)", text)
        if len(post["tags"]) > hashtag_limit:
            warnings.append(f"Hashtags trimmed from {len(post['tags'])} to {hashtag_limit}; "
                            f"dropped {' '.join(post['tags'][hashtag_limit:])}")
        tags = " ".join(post["tags"][:hashtag_limit])
        caption = (text + "\n\n" + tags).strip()
        for pattern in FB_ONLY:
            for hit in sorted(set(re.findall(pattern, post["caption"]))):
                warnings.append(f"Facebook-only wording \"{hit}\" in the caption; "
                                f"add an \"ig_caption\" override for this post in the config")
    if len(caption) > IG_CAPTION_LIMIT:
        warnings.append(f"Caption is {len(caption)} characters; Instagram allows {IG_CAPTION_LIMIT}")
    return caption, warnings


def fenced(text):
    return "```text\n" + text + "\n```"


def render_posts(selected, cfg):
    out = []
    for post, role, override in selected:
        fb, fb_warn = facebook_version(post)
        ig, ig_warn = instagram_version(post, cfg["ig_hashtag_limit"], override)
        images = post["images"]
        img_line = ", ".join(f"`{i}`" for i in images) if images else "_none listed_"
        if len(images) > 1:
            img_line += " (Instagram: post as a carousel)"
        out.append(f"### {role} · Post {post['num']} · {post['date']}")
        out.append("")
        out.append(f"**Source:** {post['title']}  ")
        out.append(f"**Images:** {img_line}")
        out.append("")
        out.append("#### Facebook")
        out.append("")
        out.append(fenced(fb))
        out.append("")
        out.append("#### Instagram")
        out.append("")
        out.append(fenced(ig))
        warnings = fb_warn + ig_warn
        if warnings:
            out.append("")
            for w in warnings:
                out.append(f"> ⚠ {w}")
        out.append("")
    return "\n".join(out).rstrip()


def render_calendar(selected):
    rows = ["| # | Date | Role | Post | Images |", "|---|---|---|---|---|"]
    for post, role, _ in selected:
        imgs = ", ".join(f"`{i}`" for i in post["images"]) or "none listed"
        rows.append(f"| {post['num']} | {post['date']} | {role} | {post['title']} | {imgs} |")
    return "\n".join(rows)


def fill(template, values):
    missing = set()

    def sub(m):
        key = m.group(1)
        if key not in values:
            missing.add(key)
            return m.group(0)
        return str(values[key])

    result = re.sub(r"\{\{\s*(\w+)\s*\}\}", sub, template)
    if missing:
        sys.exit(f"Template placeholders with no value: {', '.join(sorted(missing))}")
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("config", type=Path, help="campaign JSON file")
    ap.add_argument("--out", type=Path, help="output path (default: config path with .md)")
    args = ap.parse_args()

    cfg = json.loads(args.config.read_text(encoding="utf-8"))
    absent = [k for k in REQUIRED if k not in cfg]
    if absent:
        sys.exit(f"Config is missing: {', '.join(absent)}")
    cfg.setdefault("ig_hashtag_limit", DEFAULT_IG_HASHTAGS)

    source = (args.config.parent / cfg["source"]).resolve()
    all_posts = parse_posts(source.read_text(encoding="utf-8"))

    selected = []
    for item in cfg["posts"]:
        num = item["post"]
        if num not in all_posts:
            sys.exit(f"Post {num} is not in {source}")
        selected.append((all_posts[num], item["role"], item.get("ig_caption")))

    values = dict(cfg)
    values["calendar"] = render_calendar(selected)
    values["posts"] = render_posts(selected, cfg)

    out = args.out or args.config.with_suffix(".md")
    out.write_text(fill(TEMPLATE.read_text(encoding="utf-8"), values).rstrip() + "\n", encoding="utf-8")
    print(f"Wrote {out} ({len(selected)} posts from {source.name})")


if __name__ == "__main__":
    main()

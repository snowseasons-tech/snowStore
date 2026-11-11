---
name: mascot-generator
description: Design an original brand mascot: concept, personality, visual design, voice, and an image-generation prompt. Use when asked to create, invent, design or brainstorm a mascot, brand character, logo character or company character for a business, product, store or campaign.
---

You design one original mascot that fits a brand and can be drawn consistently. You deliver a design brief and a paste-ready image prompt; you do not generate images.

## Inputs

- **Brand:** name, what it sells, who buys it (required). Read the project's files (README, brand or marketing folders, existing characters) before asking; use what is there and stay consistent with any existing mascot or voice.
- **Personality:** 3 traits the brand wants to project. If not given, derive them from the brand and say so.
- **Style:** flat vector logo style (default), retro cartoon, 3D toy, pixel, or hand-drawn. For retro cartoon art, hand the visuals to the `looney-tunes-art-director` skill's rules.
- **Uses:** logo, sticker, social avatar, product page, merch, animation. This sets how simple the design must be.
- **Constraints:** colors, name length, things to avoid.

Ask at most one question, only if the brand is unclear and not discoverable in the files.

## Brief: fill every section

1. **Name and tagline:** a short, easy-to-say name (1-2 words) that connects to the brand, plus a one-line tagline.
2. **Concept:** what it is (animal, object, creature, person) and why it fits the brand. Choose something the audience will warm to and the brand can own. Prefer a concrete link to the product or setting over a random cute animal.
3. **Personality:** 3 traits, one quirk, one flaw that makes it likable, and what it cares about.
4. **Visual design:**
   - **Silhouette:** one memorable, simple shape that reads at 32 px.
   - **Palette:** 3-4 colors with hex codes, tied to the brand colors when known.
   - **Signature features:** at most 3 distinctive details (a scarf, glasses, a tool).
   - **Expressions:** list 5 core ones (happy, thinking, surprised, determined, celebrating).
   - **Simplification rules:** what to drop for a favicon or one-color version.
5. **Voice:** how it talks (sentence length, vocabulary, humor), with 4 sample lines: a greeting, a product tip, a celebration, a sign-off.
6. **Use cases:** 3-5 concrete placements with the pose or expression for each.
7. **Do and don't:** 3 each, for keeping the character consistent (for example, "always wears the scarf", "never shown with a mouth open wider than the head").
8. **Image prompt:** one paragraph naming the subject, silhouette, outfit, pose, expression, palette with color names, style and finish, background (plain white or transparent-style for logos), and framing. Add an **Avoid** line (text, extra limbs, gradients if flat, background clutter, watermark).
9. **Variations to test:** two alternative concepts in one line each.

## Quality bar

- Original and distinct. It must not resemble an existing mascot or franchise character. If your first idea does, change it.
- Simple enough to draw the same way ten times. If a feature needs a paragraph to describe, cut it.
- Tied to the brand through the concept, the colors, or the name, not just cute.
- Works in one color on a small avatar.
- Friendly and suitable for all ages unless the brand says otherwise.

## Output format

A markdown brief with a heading per section above, in order, about 500-800 words. End with one line asking whether to expand any pose or expression into its own prompt, or to produce the character sheet prompt (front, three-quarter and back views, five expressions, plain background).

## Rules

- Original characters only: no copyrighted characters, no real people, no trademarked brand mascots.
- Use only facts the user or the project files give about the brand. Do not invent products, staff, history or slogans presented as real.
- No readable text inside the image unless the user supplies the exact words.
- Do not trademark-check or promise availability of the name; suggest the user search before using it commercially.
- Save to a file only if asked; the default is to answer in chat.

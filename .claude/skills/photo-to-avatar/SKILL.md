---
name: photo-to-avatar
description: Turn a person's photo into a cartoon or anime-style avatar or portrait by describing the photo and writing a paste-ready image-to-image prompt. Use when asked to cartoonize, animate, anime-fy or stylize a photo, selfie, headshot or pet picture, or to make a profile picture, avatar, portrait, caricature or sticker from a photo.
---

You look at the user's photo and write the prompt (and settings advice) that turns it into a stylized avatar or portrait. You do not edit or generate the image yourself; the user runs the prompt in an image-to-image tool with the photo attached.

## Inputs

- **Photo:** an image the user attached or a file path to read (required). If there is none, ask for it.
- **Style:** one of the list below. If not named, offer the three that fit best and recommend one.
- **Use:** profile picture, social avatar, sticker, print portrait, team page, game character. This sets the crop and detail level.
- **Tool:** if named (Midjourney, DALL-E, Stable Diffusion, Flux, Photoshop generative fill, a phone app), match its syntax; otherwise write plain natural language.
- **Extras:** keep or change hair, outfit, background, expression, pet or props.

Ask at most one question, and only if the photo or the style is missing.

## Styles

| Style | Look |
|---|---|
| Anime portrait | Large expressive eyes, clean cel shading, soft gradients on hair, simple nose and mouth, pastel or dramatic sky backdrop |
| Retro cartoon | Bold black outlines, flat cel color, squash-and-stretch expression, gouache-style backdrop (see `looney-tunes-art-director`) |
| Comic book | Heavy ink lines, halftone dots, hard shadows, punchy primary colors |
| Pixar-style 3D | Soft rounded 3D character, big eyes, subsurface-scattered skin, cinematic soft light |
| Flat vector avatar | Simple geometric shapes, 3-5 flat colors, no outlines, works at 32 px |
| Watercolor storybook | Loose ink line, soft washes, paper grain, warm tones |
| Sticker | Thick white border, flat color, plain or transparent background, one strong expression |

Use plain descriptions of the style. Do not name living artists, studios or franchises, and do not ask for a specific copyrighted character's look.

## Steps

1. **Read the photo.** Describe only what you can see, as neutral visual facts: face shape, hair color, length and texture, facial hair, glasses, skin tone as a visual description, expression, head angle, clothing, accessories, background, lighting. Never name or guess who the person is, and never infer age, ethnicity, health or other traits beyond what is visible.
2. **Choose what to preserve.** The avatar must stay recognizable to the people who know the subject. List the 4-6 identity anchors to keep exactly (for example: curly dark hair, round glasses, gap-toothed smile, freckles, a beard). Keep skin tone and features faithful; stylize rather than slim, lighten or "fix" them unless asked.
3. **Choose what to simplify.** Drop clutter in the background, fine skin texture and stray hair. Keep the pose and expression unless the user wants a different one.
4. **Write the prompt** as one paragraph: the style and medium, the subject with the identity anchors, expression and pose, clothing, background, lighting, palette, framing and aspect ratio (square 1:1 headshot for avatars unless told otherwise), and finish.
5. **Add settings advice** for image-to-image tools: attach the photo as the reference, use a medium transformation strength (around 40-60% in tools that expose it) so the likeness survives, raise it for a bolder style, lower it if the face drifts.
6. **Add an Avoid line:** changed face shape, different hair color, extra fingers, distorted eyes, garbled text, watermark, over-smoothed skin, anything off-style.
7. **Offer variations:** the same photo in two other styles, or the same style with a different background.

## Output format

```
What I see: <neutral description of the photo>
Keep (identity anchors): <4-6 items>
Style: <chosen style, one line why>

Prompt:
<one paragraph, ready to paste>

Avoid: <negative prompt>

Settings: <reference image, strength, aspect ratio, crop>

Tweaks if it goes wrong: <two lines, e.g. likeness drifted, style too weak>
```

## Rules

- **Consent and privacy.** Only work on photos of the user, people who have agreed, or pets and objects. Do not process photos of private individuals that the user appears to have taken or found without their knowledge. Do not help make a stylized likeness of a real public figure to mislead others, or any sexualized image of a real person.
- **No minors in revealing or sexualized styles.** For photos of children, keep the style innocent: wholesome, fully clothed, age-appropriate.
- **No identification.** Do not say who anyone is, even if the face seems familiar, and do not state guesses about identity.
- Keep photos on the user's machine. Do not upload or send the image anywhere; the user runs the prompt in their own tool.
- Be honest about limits: face likeness varies by tool, and a first result often needs one or two strength or prompt tweaks.
- Do not claim to have generated or edited any image. This skill produces the prompt and settings only.
- Store use: if the avatars are for customers of the store, do not make claims about the tool's results or promise a likeness; describe only what the user tested.

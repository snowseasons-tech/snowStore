---
name: prompt-refiner-pro
description: Expand a short phrase into a production-grade prompt for AI image generation (or a detailed text prompt). Use when asked to refine, improve, optimize, expand, upgrade or "make better" a prompt, or given a bare idea like "grumpy santa" to turn into a detailed image prompt with style, camera, lighting, color palette and mood.
---

You turn a basic idea into a detailed, ready-to-paste prompt. Add specifics the user did not give, but never change what they asked for.

## Inputs

- **Seed:** the phrase to expand (required).
- **Target:** image (default) or text/LLM. If the user names a tool (Midjourney, DALL-E, Stable Diffusion, Flux, Imagen), match its syntax; otherwise write plain natural language that works anywhere.
- **Use:** where the result will be used (product photo, social post, poster, icon, banner). Infer it from context; if the shape matters and is unclear, pick the most likely and say so.
- **Aspect ratio and constraints:** keep any the user states exactly.

Ask at most one question, and only if the seed is too ambiguous to refine (for example, one word with two unrelated meanings). Otherwise decide and go.

## Image prompts: fill every slot

Build the prompt from these parts, in this order, as one flowing description (not a bullet list):

1. **Subject:** who or what, with concrete visual detail (age, build, clothing, expression, pose, props, action).
2. **Setting:** where and when (place, time of day, weather, background elements, depth).
3. **Style:** one clear medium or look (35mm film photograph, oil painting, flat vector illustration, 3D render, watercolor, pixel art). Pick one; do not mix unless asked.
4. **Camera and composition:** shot type (close-up, medium, wide), angle (eye level, low, overhead), lens feel (35mm, 85mm portrait, macro), depth of field, framing (rule of thirds, centered, negative space).
5. **Lighting:** the setup and direction (soft window light, golden hour backlight, harsh overhead, neon rim light, candlelit), plus quality (soft, hard, diffuse).
6. **Color palette:** three to five named colors or a scheme (warm amber and deep red, muted teal and cream).
7. **Mood and emotion:** the feeling and the expression that carries it.
8. **Finish:** texture and polish (film grain, crisp detail, matte, high dynamic range).

Then add a short **Avoid** line (negative prompt) for the usual failures: extra fingers, warped text, blur, watermark, plus anything that clashes with the seed.

### Example

Seed: `grumpy santa`

> A grumpy elderly Santa Claus with a thick white beard and deep frown lines, arms crossed, glaring at the viewer from an overstuffed armchair in a cluttered workshop, a half-wrapped toy and a cold mug of cocoa on the table beside him. Cinematic 35mm film photograph, medium shot at eye level, 50mm lens, shallow depth of field, subject framed on the left third. Warm tungsten lamp as the key light from camera right with soft shadows, cool blue dusk light through the window behind. Palette of deep red, worn cream, walnut brown and tarnished gold. Mood: weary, sardonic, comically unimpressed. Fine film grain, crisp detail on the beard and fabric.
>
> Avoid: extra fingers, distorted face, garbled text, watermark, oversaturation.

## Text prompts

When the target is an LLM, expand into: role, task, context, constraints, output format, and a quality bar (what a good answer includes). Keep it under about 200 words, and use placeholders like `{{audience}}` for anything the user must supply.

## Output format

Return exactly this unless asked for more:

```
Prompt:
<one paragraph, ready to paste>

Avoid: <negative prompt, image only>

Choices I made: <one line listing the guesses the user may want to change, such as style, era, or mood>
```

If asked for variations, give 3 that differ in one major axis each (style, lighting and palette, or mood), labeled A, B, C.

## Rules

- Preserve the seed's meaning: every noun and adjective the user wrote must still be in the result.
- Be specific and visual. Replace vague words ("beautiful", "epic", "amazing") with things a model can render.
- No real people's names, living artists' names, or trademarked characters unless the user asks. Describe the look instead.
- Do not generate the image or call any tool. This skill only writes the prompt.
- Keep the prompt to one dominant style and one dominant mood; stacking contradictory ones produces muddy output.
- If the seed is for a store product or brand asset, follow the brand voice in the project files when it exists.

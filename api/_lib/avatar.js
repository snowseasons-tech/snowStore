// Photo Avatar Pack: styles, prompts and photo checks. Prompts are built here from a style id, never taken from the
// browser, so a paid order can't be used to run arbitrary prompts through the image API.
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const KEEP = 'Keep the person clearly recognizable: same face shape, hairstyle and hair color, skin tone, facial hair, glasses and expression. Stylize the rendering only; do not slim, lighten, age or otherwise change their features.';
const SHAPE = 'Head-and-shoulders portrait, centered, square framing, one person only, no text, no watermark.';

const STYLES = {
  anime: { name: 'Anime portrait', prompt: `Redraw this photo as a polished anime portrait: large expressive eyes, clean cel shading, soft gradients in the hair, simple nose and mouth, soft pastel sky background. ${KEEP} ${SHAPE}` },
  retro: { name: 'Retro cartoon', prompt: `Redraw this photo as a bold mid-century theatrical cartoon character: confident black ink outlines, flat cel color with one simple shadow tone, slightly exaggerated expression, hand-painted gouache-style background with paper grain. ${KEEP} ${SHAPE}` },
  comic: { name: 'Comic book', prompt: `Redraw this photo as a comic book portrait: heavy ink lines, halftone dot shading, hard shadows, punchy limited palette, simple graphic background. ${KEEP} ${SHAPE}` },
  toy3d: { name: '3D animated', prompt: `Redraw this photo as a friendly 3D animated-movie character: soft rounded forms, large eyes, smooth skin, cinematic soft lighting, gentle blurred background. ${KEEP} ${SHAPE}` },
  vector: { name: 'Flat vector', prompt: `Redraw this photo as a flat vector avatar: simple geometric shapes, 3 to 5 flat colors, no outlines, clean plain background, readable at small sizes. ${KEEP} ${SHAPE}` },
  watercolor: { name: 'Watercolor', prompt: `Redraw this photo as a watercolor storybook portrait: loose ink linework, soft washes of color, visible paper grain, warm tones, white paper background. ${KEEP} ${SHAPE}` },
};

// Identify the file from its first bytes. The browser-supplied type is not trusted.
function detectImage(bytes) {
  const b = bytes;
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const styleList = () => Object.entries(STYLES).map(([id, s]) => ({ id, name: s.name }));

module.exports = { MAX_PHOTO_BYTES, STYLES, styleList, detectImage, has };

// Turns dist/ into one page body for publishing as a Claude artifact: dist/launcher.html.
import fs from 'node:fs';

const assets = fs.readdirSync('dist/assets');
const read = (ext) => fs.readFileSync(`dist/assets/${assets.find((f) => f.endsWith(ext))}`, 'utf8');
const fonts = fs.readFileSync('index.html', 'utf8').match(/<link rel="stylesheet"[^>]*>/)[0];
const js = read('.js').replace(/<\/script/g, '<\\/script');
fs.writeFileSync('dist/launcher.html', `<title>Launcher</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style>${read('.css')}</style>\n<div id="root"></div>\n<script type="module">${js}</script>\n`);

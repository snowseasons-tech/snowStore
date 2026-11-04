#!/usr/bin/env node
// Builds dist/ for Cloudflare Pages from an allowlist, so products/, private-files/, api/, scripts/, tests/
// and env files can never be published. Functions are picked up from functions/ at the project root.
const fs = require('fs');
const path = require('path');

const PUBLIC_DIRS = ['storefront', 'img', 'blog'];
const PUBLIC_FILES = ['page.css', 'store-theme.css'];
const isPublic = (name) => !name.startsWith('.') && !name.endsWith('.md');

function build({ root = path.join(__dirname, '..'), out = path.join(root, 'dist') } = {}) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const copy = (rel) => {
    const from = path.join(root, rel);
    if (!fs.existsSync(from)) throw new Error(`missing ${rel}`);
    fs.cpSync(from, path.join(out, rel), { recursive: true, filter: (src) => isPublic(path.basename(src)) });
  };
  const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
  if (!pages.includes('index.html')) throw new Error('missing index.html');
  [...pages, ...PUBLIC_FILES, ...PUBLIC_DIRS].forEach(copy);
  // Publish only the nine course card illustrations from products/, never seller files or course archives.
  const courseIcons = {
    'creator-code-cookbook': 'Creator_Code_Cookbook/Candy coding cookbook with creator tools-1.png',
    'html-for-small-business': 'HTML_bundle/Sweet HTML coding tutorial-1.png',
    'javascript-for-small-business': 'JS_bundle/Candy-style JavaScript learning icon-3.png',
    'jekyll-html-js-project': 'Jekyll_HTML_JS_project/Candy-Style Jekyll Coding Tutorial Icon-7.png',
    'small-business-project-cookbook': 'Small_Business_Project_Cookbook/Candy-Style Coding Cookbook-6.png',
    'css-tailwind-for-small-business': 'Tailwind_CSS_bundle/Pastel candy CSS and Tailwind tutorial-2.png',
    'bash-for-small-business': 'bash_course_bundle/Pastel Candy Bash Tutorial Icon-2.png',
    'python-for-small-business': 'python_course_bundle/Candy Python coding learning icon-4.png',
    'sql-for-small-business': 'sql_bundle/Sweet SQL learning icon-5.png',
  };
  const iconOut = path.join(out, 'img', 'course-icons');
  fs.mkdirSync(iconOut, { recursive: true });
  for (const [id, source] of Object.entries(courseIcons)) {
    const from = path.join(root, 'products', source);
    if (!fs.existsSync(from)) throw new Error(`missing course icon: ${source}`);
    fs.copyFileSync(from, path.join(iconOut, `${id}.png`));
  }
  const demos = {
    'sql-for-small-business': 'products/sql_bundle/demo.html',
    'small-business-project-cookbook': 'products/Small_Business_Project_Cookbook/projects/06_receivables/demo.html',
    'lead-generator': 'Lead-Pipeline/demo.html',
    'invoice-generator': 'products/invoice-generator/demo.html',
    'documentation-platform-entitlements': 'documentation_platform/portal_api/entitlements-demo.html',
  };
  const demoOut = path.join(out, 'demos');
  fs.mkdirSync(demoOut, { recursive: true });
  for (const [id, source] of Object.entries(demos)) {
    const from = path.join(root, source);
    if (!fs.existsSync(from)) throw new Error(`missing demo: ${source}`);
    fs.copyFileSync(from, path.join(demoOut, `${id}.html`));
  }
  fs.copyFileSync(path.join(root, 'pages', '_headers'), path.join(out, '_headers'));
  return out;
}

if (require.main === module) console.log(`built ${build()}`);
module.exports = { build };

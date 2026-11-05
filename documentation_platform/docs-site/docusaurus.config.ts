import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Snow Seasons Tech',
  tagline: 'Enterprise SaaS Documentation',
  favicon: 'img/favicon.svg',

  future: {
    v4: true,
  },

  url: 'https://docs.snowseasonstech.store',
  baseUrl: '/',

  organizationName: 'snow-seasons-tech',
  projectName: 'documentation_platform',

  onBrokenLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Snow Seasons Tech',
      logo: {
        alt: 'Snow Seasons Tech Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'productSidebar',
          position: 'left',
          label: 'Products',
        },
        {to: '/blog', label: 'Blog', position: 'left'},
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Products',
          items: [
            {
              label: 'Documentation Center',
              to: '/docs/intro',
            },
          ],
        },
        {
          title: 'Company',
          items: [
            {
              label: 'Store',
              href: 'https://snowseasonstech.store',
            },
            {
              label: 'Portal',
              href: 'https://portal.snowseasonstech.net',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Snow Seasons Tech. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;

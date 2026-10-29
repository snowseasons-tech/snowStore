import type {SideBarItem} from '@docusaurus/plugin-content-docs';

const sidebars: Record<string, SideBarItem[]> = {
  productSidebar: [
    {
      type: 'category',
      label: 'Product Documentation',
      items: [
        {
          type: 'category',
          label: 'CDOT Stations',
          items: [
            'cdot-stations/product-overview',
            'cdot-stations/getting-started',
            'cdot-stations/user-manual',
            'cdot-stations/faq',
            'cdot-stations/release-notes',
          ],
        },
        {
          type: 'category',
          label: 'AutoBlogger',
          items: [
            'auto-blogger/product-overview',
            'auto-blogger/getting-started',
            'auto-blogger/user-manual',
            'auto-blogger/faq',
            'auto-blogger/release-notes',
          ],
        },
        {
          type: 'category',
          label: 'AutoScheduler',
          items: [
            'auto-scheduler/product-overview',
            'auto-scheduler/getting-started',
            'auto-scheduler/user-manual',
            'auto-scheduler/faq',
            'auto-scheduler/release-notes',
          ],
        },
        {
          type: 'category',
          label: 'Lead Intelligence',
          items: [
            'lead-intelligence/product-overview',
            'lead-intelligence/getting-started',
            'lead-intelligence/user-manual',
            'lead-intelligence/faq',
            'lead-intelligence/release-notes',
          ],
        },
        {
          type: 'category',
          label: 'MailHub',
          items: [
            'mailhub/product-overview',
            'mailhub/getting-started',
            'mailhub/user-manual',
            'mailhub/faq',
            'mailhub/release-notes',
          ],
        },
      ],
    },
  ],
};

export default sidebars;

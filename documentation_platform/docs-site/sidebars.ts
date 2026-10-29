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
        // Other products will be added dynamically by the pipeline
      ],
    },
  ],
};

export default sidebars;

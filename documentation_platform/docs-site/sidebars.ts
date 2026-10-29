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
            'cdot-stations/product_overview',
            'cdot-stations/getting_started',
            'cdot-stations/user_manual',
            'cdot-stations/faq',
            'cdot-stations/release_notes',
          ],
        },
        // Other products will be added dynamically by the pipeline
      ],
    },
  ],
};

export default sidebars;

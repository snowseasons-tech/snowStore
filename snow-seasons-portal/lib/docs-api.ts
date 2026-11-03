import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_DOCS_API_URL || 'http://localhost:8081';

export type ProductDocs = {
  product: string;
  access_level: string;
  documents: string[];
};

export const docsApi = {
  /**
   * Fetch available documents for a specific product
   */
  async getProductDocs(productId: string, token: string): Promise<ProductDocs> {
    const response = await axios.get<ProductDocs>(`${API_BASE_URL}/docs/${encodeURIComponent(productId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },

  /**
   * Get a secure download link for a specific document
   */
  async downloadDocument(productId: string, filename: string, token: string): Promise<Blob> {
    const response = await axios.get<Blob>(`${API_BASE_URL}/docs/${encodeURIComponent(productId)}/download/${encodeURIComponent(filename)}`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'blob',
    });
    return response.data;
  },
};

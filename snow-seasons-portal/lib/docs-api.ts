import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_DOCS_API_URL || 'http://localhost:8081';

export const docsApi = {
  /**
   * Fetch available documents for a specific product
   */
  async getProductDocs(productId, token) {
    const response = await axios.get(`${API_BASE_URL}/docs/${productId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },

  /**
   * Get a secure download link for a specific document
   */
  async downloadDocument(productId, filename, token) {
    const response = await axios.get(`${API_BASE_URL}/docs/${productId}/download/${filename}`, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: 'blob',
    });
    return response.data;
  },
};

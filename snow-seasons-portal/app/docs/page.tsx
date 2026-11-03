"use client";

import React, { useEffect, useState } from 'react';
import { docsApi, type ProductDocs } from '../../lib/docs-api';

export default function DocumentationCenter() {
  const [products, setProducts] = useState<ProductDocs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mock token for now - in production this comes from Auth context
  const token = 'mock_token';

  useEffect(() => {
    async function fetchMyProducts(): Promise<void> {
      try {
        // In a real app, we would first fetch the list of products the user owns
        // For this demo, we'll try the known core products
        const coreProducts = ['cdot-stations', 'mailhub', 'lead-intelligence', 'autoblogger', 'autoscheduler'];
        const entitlements: ProductDocs[] = [];

        for (const id of coreProducts) {
          try {
            const data = await docsApi.getProductDocs(id, token);
            entitlements.push(data);
          } catch {
            // Product not owned, skip it
          }
        }

        setProducts(entitlements);
      } catch {
        setError('Failed to load documentation center.');
      } finally {
        setLoading(false);
      }
    }

    void fetchMyProducts();
  }, []);

  const handleDownload = async (productId: string, filename: string): Promise<void> => {
    try {
      const blob = await docsApi.downloadDocument(productId, filename, token);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert('Download failed. Please check your subscription.');
    }
  };

  if (loading) return <div className="p-8 text-center">Loading your documentation...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  return (
    <div className="max-w-6xl mx-auto p-8">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Documentation Center</h1>
        <p className="text-slate-600">Access your product guides, API references, and user manuals.</p>
      </header>

      {products.length === 0 ? (
        <div className="text-center p-12 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
          <p className="text-slate-500">No active product entitlements found.</p>
          <a href="/store" className="text-blue-600 font-semibold hover:underline">Visit the store to get started</a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product: ProductDocs) => (
            <div key={product.product} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold text-slate-900 capitalize">
                    {product.product.replace('-', ' ')}
                  </h3>
                  <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full uppercase">
                    {product.access_level}
                  </span>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Available Documents</p>
                  <div className="flex flex-col gap-2">
                    {product.documents.map((doc: string) => (
                      <button
                        key={doc}
                        onClick={() => void handleDownload(product.product, doc)}
                        className="flex items-center justify-between p-2 text-sm text-slate-700 bg-slate-50 rounded hover:bg-slate-100 transition-colors group"
                      >
                        <span className="truncate">{doc.replace('_', ' ').replace('.md', '').replace('.pdf', '').toLowerCase()}</span>
                        <span className="text-slate-400 group-hover:text-blue-500">
                          {doc.endsWith('.pdf') ? '📄' : '📝'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 p-4 border-t border-slate-200">
                <button className="w-full py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                  Launch Application
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

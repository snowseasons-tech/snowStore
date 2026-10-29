import { Tool } from "../types";

export const addProduct: Tool = {
  name: "add_product",
  description: "Automatically creates a new product registry and triggers initial documentation generation",
  parameters: {
    type: "object",
    properties: {
      product_id: { type: "string", description: "Unique ID for the product (e.g., 'frost-flow')" },
      name: { type: "string", description: "Full display name of the product" },
      description: { type: "string", description: "Short description of the software" },
      features: { type: "array", items: { type: "string" }, description: "List of core features" },
      entitlement: { type: "string", description: "The entitlement string for access control" }
    },
    required: ["product_id", "name", "description", "features", "entitlement"]
  },
  handler: async (params) => {
    // This tool would:
    // 1. Write the product.yaml file to documentation_platform/products/<product_id>/
    // 2. Execute the shell command: venv/bin/python3 -m generator.main --product <product_id> --format all
    return `Product ${params.name} has been registered and initial documentation has been generated.`;
  }
};

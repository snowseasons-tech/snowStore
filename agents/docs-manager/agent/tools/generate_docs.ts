import { Tool } from "../types"; // Assuming a common Tool type in this project

export const generateDocs: Tool = {
  name: "generate_docs",
  description: "Runs the documentation engine for a specific product",
  parameters: {
    type: "object",
    properties: {
      product_id: { type: "string", description: "The ID of the product to generate docs for" },
      format: { type: "string", enum: ["markdown", "pdf", "all"], default: "all" }
    },
    required: ["product_id"]
  },
  handler: async ({ product_id, format }) => {
    // This would call the shell command: venv/bin/python3 -m generator.main ...
    return `Triggered generation for ${product_id} in ${format} format.`;
  }
};

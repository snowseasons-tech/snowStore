import argparse
from pathlib import Path
from .registry import load_product
from .renderer import DocumentRenderer
from .pdf_export import PDFExporter

def main():
    parser = argparse.ArgumentParser(description="Snow Seasons Tech Documentation Generator")
    parser.add_argument("--product", required=True, help="ID of the product to generate docs for")
    parser.add_argument("--format", default="all", choices=["markdown", "pdf", "all"], help="Format of documents to generate")
    parser.add_argument("--out", default="build", help="Output directory")
    
    args = parser.parse_args()
    
    # 1. Load Product
    try:
        product_reg = load_product(args.product)
    except Exception as e:
        print(f"Error loading product {args.product}: {e}")
        return

    # 2. Initialize Renderer and Exporter
    renderer = DocumentRenderer()
    exporter = PDFExporter()
    
    # 3. Determine which documents to generate
    docs_to_generate = product_reg.product.documentation.generate
    
    # 4. Generate
    out_dir = Path(args.out) / args.product
    out_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"Generating documents for {product_reg.product.name}...")
    
    for doc_id in docs_to_generate:
        try:
            # Render Markdown
            content = renderer.render(product_reg, doc_id)
            md_filename = f"{doc_id.replace('_', '-')}.md"
            md_path = out_dir / md_filename
            md_path.write_text(content)
            
            # Handle format request
            if args.format in ["pdf", "all"]:
                pdf_filename = f"{doc_id.replace('_', '-')}.pdf"
                pdf_path = out_dir / pdf_filename
                exporter.export_markdown_to_pdf(
                    content, 
                    pdf_path, 
                    title=f"{product_reg.product.name} - {doc_id.replace('_', ' ').title()}"
                )
                print(f"  [✓] {md_filename} & {pdf_filename}")
            else:
                print(f"  [✓] {md_filename}")
                
        except Exception as e:
            print(f"  [✗] Failed to generate {doc_id}: {e}")

    print(f"\nDone. Documents available in: {out_dir}")

if __name__ == "__main__":
    main()

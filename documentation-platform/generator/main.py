import yaml
import jinja2
import argparse
from pathlib import Path
from documentation_platform.generator.pdf_export import export_all_to_pdf

def load_product(product_id: str):
    product_file = Path(f"documentation-platform/products/{product_id}/product.yaml")
    if not product_file.exists():
        raise FileNotFoundError(f"Product definition not found for: {product_id}")

    with open(product_file, 'r') as f:
        data = yaml.safe_load(f)
        return data['product']

def render_document(product, template_name: str):
    template_path = Path(f"documentation-platform/templates/{template_name}.md.j2")
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_name}")

    # Setup Jinja2 environment
    env = jinja2.Environment(loader=jinja2.FileSystemLoader("documentation-platform/templates"))
    template = env.get_template(f"{template_name}.md.j2")

    return template.render(product=product)

def main():
    parser = argparse.ArgumentParser(description="Snow Seasons Tech Doc Generator")
    parser.add_argument("--product", required=True, help="Product ID to generate docs for")
    parser.add_argument("--template", help="Specific template name (without extension). If omitted, generates all listed in product.yaml")
    parser.add_argument("--output-dir", help="Directory to save generated files")
    parser.add_argument("--pdf", action="store_true", help="Also export generated documents to PDF")

    args = parser.parse_args()

    try:
        product = load_product(args.product)

        # Determine which templates to render
        if args.template:
            templates_to_render = [args.template]
        else:
            templates_to_render = product.get('documentation', {}).get('generate', [])
            if not templates_to_render:
                print(f"No documentation listed for generation in {args.product}.yaml")
                return

        # Setup output directory
        output_base = Path(args.output_dir) if args.output_dir else Path(f"build/{args.product}")
        output_base.mkdir(parents=True, exist_ok=True)

        print(f"Generating documentation for {product['name']}...")

        for template_name in templates_to_render:
            try:
                content = render_document(product, template_name)
                output_file = output_base / f"{template_name}.md"

                with open(output_file, 'w') as f:
                    f.write(content)
                print(f"  ✅ Generated: {output_file}")
            except FileNotFoundError:
                print(f"  ❌ Template missing: {template_name}. Skipping.")
            except Exception as e:
                print(f"  ❌ Error rendering {template_name}: {e}")

        print(f"\nAll documents saved to: {output_base.absolute()}")

        if args.pdf:
            export_all_to_pdf(output_base)

    except Exception as e:
        print(f"Critical Error: {e}")

if __name__ == "__main__":
    main()

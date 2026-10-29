import jinja2
from pathlib import Path
from .registry import ProductRegistry

class DocumentRenderer:
    def __init__(self, template_dir: str = "templates"):
        self.template_loader = jinja2.FileSystemLoader(searchpath=template_dir)
        self.env = jinja2.Environment(loader=self.template_loader)

    def render(self, product: ProductRegistry, template_name: str) -> str:
        # The template file is expected to be like 'product-overview.md.j2'
        # but we allow passing 'product_overview' (snake_case)
        formatted_template_name = template_name.replace('_', '-') + ".md.j2"
        template = self.env.get_template(formatted_template_name)
        
        # Render using the product metadata object
        return template.render(product=product.product)

if __name__ == "__main__":
    # Simple test run
    from .registry import load_product
    try:
        prod = load_product("cdot-stations")
        renderer = DocumentRenderer()
        output = renderer.render(prod, "product_overview")
        print(output)
    except Exception as e:
        print(f"Error: {e}")

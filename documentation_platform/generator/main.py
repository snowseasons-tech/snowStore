import yaml
import jinja2
import argparse
from pathlib import Path
from .pdf_export import export_all_to_pdf
from .ai_assistant import AIDocAssistant
from .doc_critic import DocCritic

def load_product(product_id: str):
    product_file = Path(f"documentation_platform/products/{product_id}/product.yaml")
    if not product_file.exists():
        raise FileNotFoundError(f"Product definition not found for: {product_id}")

    with open(product_file, 'r') as f:
        data = yaml.safe_load(f)
        return data['product']

def render_document(product, template_name: str):
    # Normalize template name: replace underscores with hyphens to match filenames
    normalized_name = template_name.replace('_', '-')
    template_path = Path(f"documentation_platform/templates/{normalized_name}.md.j2")
    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {normalized_name}.md.j2")

    # Setup Jinja2 environment
    env = jinja2.Environment(loader=jinja2.FileSystemLoader("documentation_platform/templates"))
    template = env.get_template(f"{normalized_name}.md.j2")

    return template.render(product=product)

def sync_to_docusaurus(product_id: str, build_dir: Path):
    """
    Copies generated markdown files into the Docusaurus docs folder
    organized by product.
    """
    docusaurus_docs_dir = Path("documentation_platform/docs-site/docs")
    product_docs_dir = docusaurus_docs_dir / product_id
    product_docs_dir.mkdir(parents=True, exist_ok=True)

    md_files = list(build_dir.glob("*.md"))
    print(f"Syncing {len(md_files)} files to Docusaurus...")

    for md_file in md_files:
        # Docusaurus likes specific frontmatter. We'll prepend it if missing.
        with open(md_file, 'r') as f:
            content = f.read()

        # Basic frontmatter based on filename
        title = md_file.stem.replace('_', ' ').title()
        frontmatter = f"---\ntitle: {title}\n--- \n\n"

        if not content.startswith("---"):
            content = frontmatter + content

        dest_file = product_docs_dir / md_file.name
        with open(dest_file, 'w') as f:
            f.write(content)
        print(f"  ✅ Synced: {dest_file.name}")

def main():
    parser = argparse.ArgumentParser(description="Snow Seasons Tech Doc Generator")
    parser.add_argument("--product", required=True, help="Product ID to generate docs for")
    parser.add_argument("--template", help="Specific template name (without extension). If omitted, generates all listed in product.yaml")
    parser.add_argument("--output-dir", help="Directory to save generated files")
    parser.add_argument("--pdf", action="store_true", help="Also export generated documents to PDF")
    parser.add_argument("--sync", action="store_true", help="Sync generated Markdown to Docusaurus site")
    parser.add_argument("--ai-draft", help="Generate an AI draft for a specific document type (e.g., 'faq')")
    parser.add_argument("--validate", action="store_true", help="Run the AI draft through the Critic validation loop")

    args = parser.parse_args()

    try:
        product = load_product(args.product)

        # AI Drafting & Validation Loop
        if args.ai_draft:
            print(f"🤖 Generating AI draft for {args.ai_draft}...")
            assistant = AIDocAssistant()
            draft = assistant.generate_draft(args.product, args.ai_draft)

            # Optional Validation Pass
            if args.validate:
                print(f"🧐 Running Critic Validation Loop...")
                critic = DocCritic()

                # Gather ground truth for the critic
                from documentation_platform.generator.source_analyzer import SourceAnalyzer
                analyzer = SourceAnalyzer(args.product)
                truth = analyzer.get_full_context()
                truth_str = f"Product Registry: {product}\nTechnical Notes: {truth['technical_notes']}\nAPI Spec: {truth['openapi']}"

                findings, approved = critic.validate_draft(draft, truth_str)

                if not approved:
                    print(f"  ❌ Draft Rejected by Critic!")
                    for f in findings:
                        print(f"    - [{f.severity}] {f.section}: {f.issue} (Suggest: {f.suggestion})")
                    print(f"\nDraft is marked as UNAPPROVED. Please review manually.")
                else:
                    print(f"  ✅ Draft Approved by Critic!")
            else:
                print(f"  ⚠️  Draft generated without validation.")

            # Save the draft regardless of approval, but note it in the filename if rejected
            draft_dir = Path(f"documentation_platform/products/{args.product}/drafts")
            draft_dir.mkdir(parents=True, exist_ok=True)

            prefix = "review_required_"
            if args.validate and 'approved' in locals() and approved:
                prefix = "approved_"

            draft_file = draft_dir / f"{prefix}{args.ai_draft}_ai_draft.md"

            with open(draft_file, 'w') as f:
                f.write(draft)
            print(f"  ✅ AI draft saved to: {draft_file}")
            return # Exit after drafting to avoid triggering standard generation

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

        if args.sync:
            sync_to_docusaurus(args.product, output_base)

    except Exception as e:
        print(f"Critical Error: {e}")

if __name__ == "__main__":
    main()

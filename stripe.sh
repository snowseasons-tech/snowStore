# Set STRIPE_SECRET_KEY in your shell before running this script. Never commit a key.
: "${STRIPE_SECRET_KEY:?Set STRIPE_SECRET_KEY first}"
python stripe_issuing_workflow.py

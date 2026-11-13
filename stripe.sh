#!/usr/bin/env bash
# Runs the Stripe issuing workflow. The key is read from the environment, never stored in this file:
#   export STRIPE_SECRET_KEY="rk_live_..."   (or put it in .env, which git ignores, and `source .env`)
: "${STRIPE_SECRET_KEY:?Set STRIPE_SECRET_KEY first (see the comment at the top of this file)}"
export STRIPE_SECRET_KEY
python stripe_issuing_workflow.py

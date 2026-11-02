#!/bin/sh
set -eu
python -m pip check
python -m pytest -q
node --check app/static/studio.js

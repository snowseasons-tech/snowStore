# Use an official lightweight Python image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies (for Pandoc if PDF export is used in API)
RUN apt-get update && apt-get install -y \
    pandoc \
    weasyprint \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY documentation_platform/pyproject.toml .
RUN pip install --no-cache-dir fastapi uvicorn jinja2 pyyaml requests

# Copy the application code
COPY . .

# Expose the port FastAPI runs on
EXPOSE 8000

# Command to run the API
CMD ["uvicorn", "documentation_platform.portal-api.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM python:3.13-slim
WORKDIR /srv
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock
COPY app ./app
COPY static ./static
RUN useradd -u 10001 -m studio
USER studio
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

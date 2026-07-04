FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
# non-root
RUN useradd -u 10001 -m app && chown -R app /app
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8080/underscore-app/healthz').status==200 else 1)"
# Serve the prefix-mounting parent (`root`), which owns /underscore-app/*.
CMD ["uvicorn", "app:root", "--host", "0.0.0.0", "--port", "8080"]

FROM python:3.12-slim

# ffmpeg : décodage des formats audio des dictaphones et téléphones
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
# torch (CPU) est installé séparément, via l'index PyTorch dédié : sans ça, pip
# tirerait par défaut la version CUDA (plusieurs Go, inutile sur Railway).
RUN pip install --no-cache-dir torch==2.5.1 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Railway injecte la variable PORT automatiquement
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

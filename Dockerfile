FROM python:3.12-slim

WORKDIR /app

# Install uv for reproducible dependency installation
RUN pip install --no-cache-dir uv==0.5.14

# Layer-cache dependencies before copying source
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Source code (packages on PYTHONPATH via WORKDIR, fxgb entry points)
COPY packages/ packages/
COPY fxgb/ fxgb/

# Shared data cache volume mount point
ENV DATA_CACHE=/data/fxgb

# Default: in-process demo (overridden per-service in docker-compose.yml)
CMD ["uv", "run", "python", "-m", "fxgb.demo"]

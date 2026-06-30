FROM python:3.10-slim

# Hugging Face Spaces requirements: Run as a non-root user
RUN useradd -m -u 1000 user
USER user

# Set environment variables
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1

WORKDIR $HOME/app

# Copy requirements and install them first (Docker caching optimization)
COPY --chown=user:user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application files
COPY --chown=user:user . .

# Ensure the back-end directory has write permissions
# This is necessary for the SQLite database and LEAP Excel file generation
RUN mkdir -p back-end/output && \
    chmod -R 777 back-end

# Change working directory to the back-end where main.py is located
WORKDIR $HOME/app/back-end

# Seed the initial users into the SQLite database
# Note: In Hugging Face, unless persistent storage is used, 
# this DB will reset to the seeded state upon every container restart.
RUN python seed_users.py

# Hugging Face Spaces strictly requires exposing port 7860
EXPOSE 7860

# Boot the FastAPI server via Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]

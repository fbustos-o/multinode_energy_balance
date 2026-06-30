import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.database import engine, Base
from api.routers import router as api_router
from api.auth_router import router as auth_router

# Auto-generate database tables if they do not exist
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Multinode Energy Modeler API",
    description="Engine services to reconcile APEC database figures with bottom-up end-use energy branches.",
    version="10.0.0"
)

# Configure CORS for modern browser dashboards
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for development and deployment flexibility
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes with the API suffix
app.include_router(auth_router, prefix="/api")
app.include_router(api_router, prefix="/api")

# Serve the frontend dashboard statically at root
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "front-end"))
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


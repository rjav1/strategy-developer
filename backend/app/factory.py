from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title=settings.app_title, version=settings.app_version)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount routers
    from api import router as api_router
    app.include_router(api_router)

    @app.get("/")
    async def root():
        return {"message": settings.app_title, "version": settings.app_version}

    return app 
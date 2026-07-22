"""Environment-driven settings, validated once at process boot (fail fast, not on first request)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "dev"

    database_url: str = "postgresql+asyncpg://casewright:casewright@localhost:5432/casewright"
    database_url_sync: str = "postgresql+psycopg://casewright:casewright@localhost:5432/casewright"

    jwt_secret: str = "dev-only-change-me-before-any-real-deploy"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    s3_endpoint_url: str = "http://localhost:9000"
    s3_public_endpoint_url: str = ""
    """Used only for presigned-URL generation. Falls back to s3_endpoint_url when unset —
    override this in Compose, where s3_endpoint_url is the container-internal "minio:9000"
    host (unreachable from a browser) but the presigned URL needs a browser-reachable host."""
    s3_access_key: str = "casewright"
    s3_secret_key: str = "casewright123"
    s3_bucket: str = "casewright-documents"
    s3_region: str = "us-east-1"

    # LLM provider: Ollama Cloud via its OpenAI-compatible API (plan §3 named Anthropic; no
    # ANTHROPIC_API_KEY was available in this environment, Ollama Cloud credentials were —
    # see docs/internal/PROJECT_LOG.md for the swap rationale). llm.py is the only module that knows this.
    ollama_api_key: str = ""
    ollama_base_url: str = "https://ollama.com/v1"
    reasoning_model: str = "glm-5.2"
    fast_model: str = "nemotron-3-nano:30b"
    vision_model: str = "gemma4:31b"
    """Separate from fast_model: OCR-fallback needs image input, and not every fast/cheap
    tool-calling model on Ollama Cloud also accepts images (confirmed by hand — see
    docs/internal/PROJECT_LOG.md for which models were actually tested)."""
    voyage_api_key: str = ""

    cors_origins: str = "http://localhost:5173,http://localhost:8080"
    sentry_dsn: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

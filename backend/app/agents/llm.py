"""The only module that talks to the Anthropic SDK directly (plan §12). Model choice is
env-routed (REASONING_MODEL / FAST_MODEL) so pricing policy lives in one place. Structured
outputs are forced through tool-use and validated against a Pydantic schema with one
self-repair retry — the validation error is fed back in-context, per plan §5.
"""

import base64
from typing import Literal, TypeVar

from anthropic import AsyncAnthropic
from pydantic import BaseModel, ValidationError

from app.config import get_settings

settings = get_settings()

T = TypeVar("T", bound=BaseModel)

_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _client
    if not settings.anthropic_api_key:
        raise LLMNotConfigured("ANTHROPIC_API_KEY is not set")
    if _client is None:
        _client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


class LLMNotConfigured(RuntimeError):
    """Raised when a node needs the Anthropic API but no key is configured."""


MODEL_TIERS = {
    "reasoning": settings.reasoning_model,
    "fast": settings.fast_model,
}


async def call_structured(
    *,
    tier: Literal["reasoning", "fast"],
    system: str,
    user: str,
    response_model: type[T],
    max_tokens: int = 4096,
) -> T:
    """One tool-forced call; on a Pydantic validation failure, retries once with the error
    fed back to the model. Raises on a second failure — callers surface that as a node error,
    never a silently-empty result."""
    client = _get_client()
    model = MODEL_TIERS[tier]
    tool = {
        "name": "emit_result",
        "description": "Return the structured result for this task.",
        "input_schema": response_model.model_json_schema(),
    }
    messages: list[dict] = [{"role": "user", "content": user}]

    last_error: ValidationError | None = None
    for attempt in range(2):
        # The tool/message payloads are built dynamically from a Pydantic JSON schema, which
        # doesn't line up with the SDK's precise TypedDict overloads — the payload shape is
        # exactly what the API expects, so this is a mypy-only mismatch, not a runtime one.
        response = await client.messages.create(  # type: ignore[call-overload]
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
            tools=[tool],
            tool_choice={"type": "tool", "name": "emit_result"},
        )
        tool_use = next((block for block in response.content if block.type == "tool_use"), None)
        if tool_use is None:
            raise RuntimeError("Model did not call emit_result")

        try:
            return response_model.model_validate(tool_use.input)
        except ValidationError as exc:
            last_error = exc
            if attempt == 0:
                messages.append({"role": "assistant", "content": response.content})
                messages.append(
                    {
                        "role": "user",
                        "content": (
                            f"That output failed schema validation: {exc}. "
                            "Call emit_result again with a corrected input."
                        ),
                    }
                )

    assert last_error is not None
    raise last_error


async def extract_page_text_via_vision(png_bytes: bytes) -> str:
    """OCR fallback for scanned/low-text pages (plan §7 tiered OCR). Fast-tier, plain text out."""
    client = _get_client()
    response = await client.messages.create(
        model=MODEL_TIERS["fast"],
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": base64.b64encode(png_bytes).decode("ascii"),
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "Transcribe every word of visible text on this document page exactly, "
                            "in reading order. Output only the transcribed text, nothing else."
                        ),
                    },
                ],
            }
        ],
    )
    text_block = next((block for block in response.content if block.type == "text"), None)
    return text_block.text if text_block else ""

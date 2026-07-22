"""The only module that talks to the model provider directly (plan §12). Provider is Ollama
Cloud via its OpenAI-compatible API — plan §3 named Anthropic, but no ANTHROPIC_API_KEY was
available in this environment and working Ollama Cloud credentials were (see PROJECT_LOG.md
for the swap rationale and the model choices, each confirmed by hand against the live API
before being wired in). Model choice is env-routed (REASONING_MODEL / FAST_MODEL / VISION_MODEL)
so pricing/capability policy lives in one place. Structured outputs are forced through
tool-calling and validated against a Pydantic schema with one self-repair retry — the
validation error is fed back in-context, per plan §5.
"""

import base64
import json
from typing import Literal, TypeVar

from openai import AsyncOpenAI
from pydantic import BaseModel, ValidationError

from app.config import get_settings

settings = get_settings()

T = TypeVar("T", bound=BaseModel)

_client: AsyncOpenAI | None = None


class LLMNotConfigured(RuntimeError):
    """Raised when a node needs the model API but no key is configured."""


def _get_client() -> AsyncOpenAI:
    global _client
    if not settings.ollama_api_key:
        raise LLMNotConfigured("OLLAMA_API_KEY is not set")
    if _client is None:
        _client = AsyncOpenAI(base_url=settings.ollama_base_url, api_key=settings.ollama_api_key)
    return _client


MODEL_TIERS = {
    "reasoning": settings.reasoning_model,
    "fast": settings.fast_model,
}

TOOL_NAME = "emit_result"
MAX_ATTEMPTS = 3
"""Was 2 (one self-repair retry, per plan §5). Raised to 3 after a live run against Ollama
Cloud (glm-5.2) showed forced tool_choice isn't honored 100% of the time on complex nested
schemas (DraftedSection's citations list) — a second retry meaningfully improved reliability
without materially changing cost, since most calls still succeed on the first attempt."""


async def call_structured(
    *,
    tier: Literal["reasoning", "fast"],
    system: str,
    user: str,
    response_model: type[T],
    max_tokens: int = 4096,
) -> T:
    """Tool-forced call with up to MAX_ATTEMPTS tries; on failure, the error (or a nudge, if
    the model skipped the tool call entirely) is fed back in-context before retrying. Raises
    after MAX_ATTEMPTS — callers surface that as a node error, never a silently-empty result."""
    client = _get_client()
    model = MODEL_TIERS[tier]
    tool = {
        "type": "function",
        "function": {
            "name": TOOL_NAME,
            "description": "Return the structured result for this task.",
            "parameters": response_model.model_json_schema(),
        },
    }
    messages: list[dict] = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    for attempt in range(MAX_ATTEMPTS):
        last_attempt = attempt == MAX_ATTEMPTS - 1
        response = await client.chat.completions.create(  # type: ignore[call-overload]
            model=model,
            max_tokens=max_tokens,
            messages=messages,
            tools=[tool],
            tool_choice={"type": "function", "function": {"name": TOOL_NAME}},
        )
        message = response.choices[0].message
        tool_calls = message.tool_calls

        if not tool_calls:
            # Observed for real against Ollama Cloud (glm-5.2, complex nested schemas):
            # forced tool_choice isn't honored 100% of the time — the model sometimes answers
            # in plain text instead. Retry with an explicit nudge rather than failing the node
            # on the first miss; this is not hypothetical, it happened on a live run.
            if last_attempt:
                raise RuntimeError(f"Model did not call emit_result after {MAX_ATTEMPTS} attempts")
            messages.append({"role": "assistant", "content": message.content})
            messages.append(
                {"role": "user", "content": "You must call the emit_result tool — do not answer in plain text."}
            )
            continue

        call = tool_calls[0]
        try:
            arguments = json.loads(call.function.arguments)
            return response_model.model_validate(arguments)
        except (json.JSONDecodeError, ValidationError) as exc:
            if last_attempt:
                raise
            # OpenAI's tool-calling protocol requires a "tool" role reply immediately after
            # an assistant message that made a tool call — a plain "user" follow-up isn't
            # valid there, unlike Anthropic's looser content-block convention.
            messages.append(
                {
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": "function",
                            "function": {"name": call.function.name, "arguments": call.function.arguments},
                        }
                    ],
                }
            )
            retry_note = f"That output failed schema validation: {exc}. Call emit_result again with a corrected input."
            messages.append({"role": "tool", "tool_call_id": call.id, "content": retry_note})

    raise AssertionError("unreachable — the loop above always returns or raises")


async def extract_page_text_via_vision(png_bytes: bytes) -> str:
    """OCR fallback for scanned/low-text pages (plan §7 tiered OCR). Uses a dedicated
    vision-capable model — not every fast tool-calling model on Ollama Cloud also accepts
    image input (confirmed by hand; see PROJECT_LOG.md)."""
    client = _get_client()
    response = await client.chat.completions.create(
        model=settings.vision_model,
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Transcribe every word of visible text on this document page exactly, "
                            "in reading order. Output only the transcribed text, nothing else."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{base64.b64encode(png_bytes).decode('ascii')}"},
                    },
                ],
            }
        ],
    )
    return response.choices[0].message.content or ""

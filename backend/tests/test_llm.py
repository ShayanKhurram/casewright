"""call_structured's retry logic — including the "model answered in plain text instead of
calling the tool" case, found by actually running a graph against a live model (Ollama Cloud,
glm-5.2): forced tool_choice isn't honored 100% of the time on complex nested schemas. See
PROJECT_LOG.md for the live-run context this fix came from."""

from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from app.agents import llm


class _Result(BaseModel):
    value: str


def _make_response(*, tool_calls=None, content=None):
    message = SimpleNamespace(tool_calls=tool_calls, content=content)
    choice = SimpleNamespace(message=message)
    return SimpleNamespace(choices=[choice])


def _make_tool_call(arguments: str, call_id: str = "call_1"):
    function = SimpleNamespace(name=llm.TOOL_NAME, arguments=arguments)
    return SimpleNamespace(id=call_id, function=function)


class _FakeClient:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = 0

    @property
    def chat(self):
        return SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs):
        self.calls += 1
        return self._responses.pop(0)


async def test_retries_when_model_answers_in_plain_text_instead_of_calling_the_tool(monkeypatch):
    fake = _FakeClient(
        [
            _make_response(tool_calls=None, content="Sure, the value is x."),
            _make_response(tool_calls=[_make_tool_call('{"value": "x"}')]),
        ]
    )
    monkeypatch.setattr(llm, "_get_client", lambda: fake)

    result = await llm.call_structured(tier="fast", system="sys", user="usr", response_model=_Result)

    assert result.value == "x"
    assert fake.calls == 2


async def test_raises_if_model_never_calls_the_tool_after_all_retries(monkeypatch):
    fake = _FakeClient([_make_response(tool_calls=None, content="No.") for _ in range(llm.MAX_ATTEMPTS)])
    monkeypatch.setattr(llm, "_get_client", lambda: fake)

    with pytest.raises(RuntimeError, match="did not call emit_result"):
        await llm.call_structured(tier="fast", system="sys", user="usr", response_model=_Result)

    assert fake.calls == llm.MAX_ATTEMPTS


async def test_retries_on_schema_validation_failure(monkeypatch):
    fake = _FakeClient(
        [
            _make_response(tool_calls=[_make_tool_call('{"value": 123}')]),  # wrong type
            _make_response(tool_calls=[_make_tool_call('{"value": "fixed"}')]),
        ]
    )
    monkeypatch.setattr(llm, "_get_client", lambda: fake)

    result = await llm.call_structured(tier="fast", system="sys", user="usr", response_model=_Result)

    assert result.value == "fixed"
    assert fake.calls == 2

import os

import pytest

import pronto_kafka.v1.kafka.producer as producer_module
from pronto_kafka.v1 import (
    close_producer,
    get_producer,
    init_producer_from_env,
    make_producer_lifespan,
    send,
)


@pytest.fixture(autouse=True)
async def reset_producer():
    yield
    if producer_module._producer is not None:
        await close_producer()


# ---------------------------------------------------------------------------
# Unit tests — no real Kafka required
# ---------------------------------------------------------------------------


async def test_get_producer_raises_before_init():
    with pytest.raises(RuntimeError, match="not initialised"):
        get_producer()


async def test_send_raises_before_init():
    with pytest.raises(RuntimeError, match="not initialised"):
        await send("topic", b"value")


async def test_init_producer_from_env_missing_var():
    var = "PRONTO_KAFKA_NONEXISTENT_12345"
    os.environ.pop(var, None)
    with pytest.raises(RuntimeError, match=var):
        await init_producer_from_env(var)


async def test_init_producer_from_env_empty_var():
    var = "PRONTO_KAFKA_EMPTY_SERVERS"
    os.environ[var] = ""
    try:
        with pytest.raises(RuntimeError, match=var):
            await init_producer_from_env(var)
    finally:
        del os.environ[var]


# ---------------------------------------------------------------------------
# Integration tests — skipped when KAFKA_BOOTSTRAP_SERVERS is not set
# ---------------------------------------------------------------------------

_servers = os.environ.get("KAFKA_BOOTSTRAP_SERVERS", "")
needs_kafka = pytest.mark.skipif(
    not _servers, reason="KAFKA_BOOTSTRAP_SERVERS not set — skipping integration tests"
)


@needs_kafka
async def test_init_producer_from_env_starts():
    await init_producer_from_env("KAFKA_BOOTSTRAP_SERVERS")
    assert producer_module._producer is not None


@needs_kafka
async def test_get_producer_returns_instance():
    await init_producer_from_env("KAFKA_BOOTSTRAP_SERVERS")
    p = get_producer()
    assert p is not None


@needs_kafka
async def test_send_produces_message():
    await init_producer_from_env("KAFKA_BOOTSTRAP_SERVERS")
    meta = await send("pronto-kafka-test", b"hello")
    assert meta.topic == "pronto-kafka-test"


@needs_kafka
async def test_close_producer_resets_state():
    await init_producer_from_env("KAFKA_BOOTSTRAP_SERVERS")
    assert producer_module._producer is not None
    await close_producer()
    assert producer_module._producer is None


@needs_kafka
async def test_make_producer_lifespan_starts_and_stops():
    lifespan = make_producer_lifespan("KAFKA_BOOTSTRAP_SERVERS")
    async with lifespan(None):
        p = get_producer()
        assert p is not None
    assert producer_module._producer is None

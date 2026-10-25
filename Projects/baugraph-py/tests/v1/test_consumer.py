import os

import pytest

from pronto_kafka.v1 import create_consumer_from_env


# ---------------------------------------------------------------------------
# Unit tests — no real Kafka required
# ---------------------------------------------------------------------------


async def test_create_consumer_from_env_missing_var():
    var = "PRONTO_KAFKA_NONEXISTENT_12345"
    os.environ.pop(var, None)
    with pytest.raises(RuntimeError, match=var):
        async with create_consumer_from_env("topic", group_id="g", env_var=var):
            pass


async def test_create_consumer_from_env_empty_var():
    var = "PRONTO_KAFKA_EMPTY_SERVERS"
    os.environ[var] = ""
    try:
        with pytest.raises(RuntimeError, match=var):
            async with create_consumer_from_env("topic", group_id="g", env_var=var):
                pass
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
async def test_create_consumer_from_env_starts():
    async with create_consumer_from_env(
        "pronto-kafka-test",
        group_id="pronto-kafka-test-group",
    ) as consumer:
        assert consumer is not None

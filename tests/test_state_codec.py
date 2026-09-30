import json
import pytest
from worker.state_codec import encode_state, decode_state


def test_large_lockfile_state_roundtrips_with_comment_budget():
    state = {"status":"verified", "patch":{"uv.lock":"package = 'fixture'\n"*4000}, "verification":[{"exit_code":0}]}
    encoded = encode_state(state)
    assert len(encoded) < 59000
    assert json.loads(encoded)["encoding"] == "gzip-base64"
    assert decode_state(encoded) == state


def test_state_checksum_and_expansion_budget_fail_closed():
    encoded = json.loads(encode_state({"logs":"a"*70000}))
    encoded["sha256"] = "0"*64
    with pytest.raises(ValueError, match="checksum"):
        decode_state(json.dumps(encoded))
    encoded["bytes"] = 250001
    with pytest.raises(ValueError, match="size"):
        decode_state(json.dumps(encoded))
    with pytest.raises(ValueError, match="persistence budget"):
        encode_state({"logs":"a"*250001})


def test_redaction_does_not_corrupt_json_structure():
    value = decode_state(encode_state({"logs":'password=hunter2', "evidence":['Bearer synthetic-value']}))
    assert value == {"logs":"password=[REDACTED]", "evidence":["[REDACTED]"]}

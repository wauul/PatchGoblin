"""Bounded GitHub comment encoding for canonical lockfiles; compression is not encryption."""
import base64
import gzip
import hashlib
import json
import zlib
from worker.security import redact_data

MAX_STATE_BYTES = 250_000


def encode_state(state):
    text = json.dumps(redact_data(state), ensure_ascii=False)
    raw = text.encode()
    if len(raw) > MAX_STATE_BYTES:
        raise ValueError("Job state exceeds 250 KB persistence budget")
    if len(raw) < 59000:
        return text
    envelope = {"encoding":"gzip-base64", "bytes":len(raw), "sha256":hashlib.sha256(raw).hexdigest(),
                "payload":base64.b64encode(gzip.compress(raw, mtime=0)).decode()}
    result = json.dumps(envelope)
    if len(result) > 59000:
        raise ValueError("Compressed job state exceeds comment budget")
    return result


def decode_state(text):
    value = json.loads(text)
    if value.get("encoding") != "gzip-base64":
        return value
    if not isinstance(value.get("bytes"), int) or not 0 < value["bytes"] <= MAX_STATE_BYTES:
        raise ValueError("Invalid state size")
    decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
    raw = decoder.decompress(base64.b64decode(value["payload"], validate=True), MAX_STATE_BYTES + 1)
    if not decoder.eof or decoder.unused_data or len(raw) != value["bytes"] or len(raw) > MAX_STATE_BYTES:
        raise ValueError("Invalid compressed state")
    if hashlib.sha256(raw).hexdigest() != value["sha256"]:
        raise ValueError("State checksum mismatch")
    return json.loads(raw)

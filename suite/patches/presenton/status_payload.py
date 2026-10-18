"""Patch the pinned official Presenton file; never edit the research checkout."""
from pathlib import Path
import hashlib
import json
import sys

EXPECTED = "993d5e656367e5b29e6b0c3a35317c91acd90e8d36b56c18a9ef1a8734c5ab6b"
OLD = """    response = status.model_copy(deep=True)
    if response.data:
        response.data = absolute_mcp_result_links(request, response.data)
    return response
"""
NEW = """    # Serialize the response separately from SQLAlchemy's instrumented state.
    # Deep-copying a SQLModel also copies its weak ORM parent reference.
    response = status.model_dump(mode="json")
    if response.get("data"):
        response["data"] = absolute_mcp_result_links(request, response["data"])
    return response
"""

def patch(source: bytes) -> bytes:
    if hashlib.sha256(source).hexdigest() != EXPECTED:
        raise ValueError("Official Presenton source does not match the audited image")
    text = source.decode()
    if text.count(OLD) != 1:
        raise ValueError("Expected exactly one status response block")
    return text.replace(OLD, NEW).encode()

if __name__ == "__main__":
    source = Path(sys.argv[1]).read_bytes()
    output = Path(sys.argv[2])
    output.parent.mkdir(parents=True, exist_ok=True)
    result = patch(source)
    output.write_bytes(result)
    output.with_suffix(".provenance.json").write_text(json.dumps({
        "upstream": "https://github.com/presenton/presenton",
        "image": "ghcr.io/presenton/presenton@sha256:ddf0d1f26397764856acdf94489dbbae5a2c0644a280723fd80bc7a80de338ba",
        "original_sha256": EXPECTED,
        "patched_sha256": hashlib.sha256(result).hexdigest(),
        "license": "Apache-2.0",
        "change": "Return a JSON payload instead of mutating a deep-copied SQLAlchemy instrumented model",
    }, indent=2) + "\n")

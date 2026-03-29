import base64
import hashlib
import hmac
import json
import time
import os

JWT_SECRET = os.environ.get("JWT_SECRET", "ir-project-dev-secret")
JWT_EXP_SECONDS = 60 * 60 * 24  # 1 day


def _b64url_encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data):
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def create_token(payload):
    header = {"alg": "HS256", "typ": "JWT"}
    body = {
        **payload,
        "exp": int(time.time()) + JWT_EXP_SECONDS,
    }

    header_segment = _b64url_encode(json.dumps(header).encode())
    payload_segment = _b64url_encode(json.dumps(body).encode())

    signing_input = f"{header_segment}.{payload_segment}".encode()
    signature = hmac.new(
        JWT_SECRET.encode(),
        signing_input,
        hashlib.sha256
    ).digest()

    return f"{header_segment}.{payload_segment}.{_b64url_encode(signature)}"


def decode_token(token):
    try:
        header_segment, payload_segment, signature_segment = token.split(".")
    except ValueError:
        raise ValueError("Invalid token format")

    signing_input = f"{header_segment}.{payload_segment}".encode()
    expected_signature = hmac.new(
        JWT_SECRET.encode(),
        signing_input,
        hashlib.sha256
    ).digest()

    actual_signature = _b64url_decode(signature_segment)

    if not hmac.compare_digest(actual_signature, expected_signature):
        raise ValueError("Invalid token signature")

    payload = json.loads(_b64url_decode(payload_segment))

    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("Token expired")

    return payload
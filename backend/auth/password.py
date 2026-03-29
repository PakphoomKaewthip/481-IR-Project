import hashlib
import secrets
import hmac

def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)

    derived = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=2**14,
        r=8,
        p=1,
    )

    return f"{salt}${derived.hex()}"


def verify_password(password, password_hash):
    try:
        salt, _ = password_hash.split("$", 1)
    except ValueError:
        return False

    candidate = hash_password(password, salt)
    return hmac.compare_digest(candidate, password_hash)
"""Generate a bcrypt hash for the admin password.
Usage:  python scripts/hash_password.py 'yourStrongPassword'
Copy the output into Render env var ADMIN_PASSWORD_HASH.
"""
import sys
from passlib.context import CryptContext

ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python hash_password.py <password>")
        sys.exit(1)
    print(ctx.hash(sys.argv[1]))

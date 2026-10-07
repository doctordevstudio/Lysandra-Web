"""Generate a bcrypt hash for the admin password.
Usage:  python scripts/hash_password.py 'yourStrongPassword'
Put the output in the env var ADMIN_PASSWORD_HASH (and remove ADMIN_PASSWORD)."""
import sys

import bcrypt

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python hash_password.py <password>")
        sys.exit(1)
    print(bcrypt.hashpw(sys.argv[1].encode(), bcrypt.gensalt(12)).decode())

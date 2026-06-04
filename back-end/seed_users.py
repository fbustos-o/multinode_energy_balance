import os
import sys

# Ensure the backend directory is in the python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from core.database import SessionLocal
from core.models import User
from core.auth import get_password_hash, generate_api_key

def seed():
    db = SessionLocal()
    try:
        # Check and create admin user
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            print("Creating 'admin' user...")
            admin_user = User(
                username="admin",
                email="admintest@aperc.or.jp",
                hashed_password=get_password_hash("admin123"),
                is_admin=True,
                api_key=generate_api_key()
            )
            db.add(admin_user)
        else:
            print("'admin' user already exists.")

        # Check and create testuser
        test_user = db.query(User).filter(User.username == "testuser").first()
        if not test_user:
            print("Creating 'testuser'...")
            test_user = User(
                username="testuser",
                email="test@aperc.or.jp",
                hashed_password=get_password_hash("test123"),
                is_admin=False
            )
            db.add(test_user)
        else:
            print("'testuser' already exists.")

        db.commit()
        print("Database seeding completed successfully.")
    except Exception as e:
        db.rollback()
        print(f"An error occurred during seeding: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()

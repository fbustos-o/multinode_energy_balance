from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
from passlib.context import CryptContext
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import User

# Security Configuration
# TODO: Move SECRET_KEY to an environment variable in production
SECRET_KEY = "placeholder_secret_key"
ALGORITHM = "HS256"

# Password Hashing Context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain password against the hashed version.
    """
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """
    Generates a bcrypt hash for the provided password.
    """
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None, infinite: bool = False) -> str:
    """
    Creates a JWT access token.
    If infinite=True, sets the expiration to 20 years in the future.
    Otherwise, uses expires_delta or defaults to 12 hours.
    """
    to_encode = data.copy()
    
    if infinite:
        # 20 years = 365 * 20 days (approx)
        expire = datetime.now(timezone.utc) + timedelta(days=365 * 20)
    elif expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        # Default expiration: 12 hours
        expire = datetime.now(timezone.utc) + timedelta(hours=12)
        
    to_encode.update({"exp": expire})
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    Dependency to validate the JWT and return the authenticated User object.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
        
    if user.valid_until:
        valid_dt = user.valid_until
        if valid_dt.tzinfo is None:
            valid_dt = valid_dt.replace(tzinfo=timezone.utc)
        if valid_dt < datetime.now(timezone.utc):
            raise HTTPException(status_code=403, detail="Account or API Key has expired")
            
    return user

def get_current_admin_user(current_user: User = Depends(get_current_user)):
    """
    Dependency to validate the JWT and ensure the user has admin privileges.
    """
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current_user

def generate_api_key() -> str:
    """
    Generates a secure, random 32-byte URL-safe API key.
    """
    return secrets.token_urlsafe(32)

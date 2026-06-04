from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Any, List

from core.database import get_db
from core.models import User
from core.auth import get_password_hash, verify_password, create_access_token, get_current_admin_user, generate_api_key
from api.schemas import UserCreate, UserRead, Token, UserCreateAdmin

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/admin/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user_admin(
    user_in: UserCreateAdmin, 
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user)
) -> Any:
    """
    Create a new user (Admin only).
    Generates an API key automatically.
    """
    # Check if username or email exists
    user_exists = db.query(User).filter(
        (User.username == user_in.username) | (User.email == user_in.email)
    ).first()
    
    if user_exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The username or email is already in use."
        )
        
    hashed_password = get_password_hash(user_in.password)
    api_key = generate_api_key()
    
    new_user = User(
        username=user_in.username,
        email=user_in.email,
        hashed_password=hashed_password,
        is_admin=user_in.is_admin,
        api_key=api_key,
        valid_until=user_in.valid_until
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("/admin/users", response_model=List[UserRead])
def get_all_users(
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user)
) -> Any:
    """
    Get all users (Admin only).
    """
    users = db.query(User).all()
    return users

@router.post("/login", response_model=Token)
def login_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)) -> Any:
    """
    OAuth2 compatible token login, getting an access token for future requests.
    """
    user = db.query(User).filter(User.username == form_data.username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token = create_access_token(data={"sub": user.username})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "is_admin": user.is_admin
    }

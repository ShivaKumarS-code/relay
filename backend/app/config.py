import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # API Keys
    GEMINI_API_KEY: Optional[str] = None
    RECALL_API_KEY: Optional[str] = None
    MEETINGBAAS_API_KEY: Optional[str] = None
    SLACK_BOT_TOKEN: Optional[str] = None
    SLACK_CHANNEL: str = "#relay-tasks"
    NOTION_TOKEN: Optional[str] = None
    NOTION_DATABASE_ID: Optional[str] = None
    GMAIL_USER_EMAIL: Optional[str] = None
    WEBHOOK_URL: Optional[str] = None
    
    # Supabase / PostgreSQL Configuration
    # Example format: postgresql://postgres.xxxx:[password]@aws-0-us-west-1.pooler.supabase.com:6543/postgres
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/relay"
    
    # Simulation Settings
    SIMULATION_SPEED_MULTIPLIER: float = 3.0
    
    # Port / Host configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    @property
    def has_gemini(self) -> bool:
        return bool(self.GEMINI_API_KEY)
        
    @property
    def has_slack(self) -> bool:
        return bool(self.SLACK_BOT_TOKEN)
        
    @property
    def has_notion(self) -> bool:
        return bool(self.NOTION_TOKEN and self.NOTION_DATABASE_ID)
        
    @property
    def has_recall(self) -> bool:
        return bool(self.RECALL_API_KEY)

    @property
    def has_meetingbaas(self) -> bool:
        return bool(self.MEETINGBAAS_API_KEY)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

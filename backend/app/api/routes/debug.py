"""
Temporary debugging endpoint to inspect upload requests
"""

from fastapi import APIRouter, Request, UploadFile, File, Form
from typing import Optional
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/debug-upload")
async def debug_upload(
    request: Request,
    file: UploadFile = File(None),  # Make optional for debugging
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    temporary: Optional[str] = Form(None),  # String instead of bool
):
    """Debug endpoint to see what we're actually receiving."""

    logger.info("=" * 50)
    logger.info("DEBUG UPLOAD REQUEST")
    logger.info(f"Headers: {dict(request.headers)}")
    logger.info(f"file: {file}")
    logger.info(f"file.filename: {file.filename if file else 'None'}")
    logger.info(f"file.content_type: {file.content_type if file else 'None'}")
    logger.info(f"title: {title}")
    logger.info(f"description: {description}")
    logger.info(f"temporary (raw): {temporary} (type: {type(temporary)})")
    logger.info("=" * 50)

    return {
        "received": {
            "file": file.filename if file else None,
            "content_type": file.content_type if file else None,
            "title": title,
            "temporary": temporary,
        }
    }

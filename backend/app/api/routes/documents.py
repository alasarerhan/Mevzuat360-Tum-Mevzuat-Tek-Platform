"""
Document upload and management API routes.
"""

import logging
from typing import List, Optional
from io import BytesIO
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse

from app.models.schemas import DocumentResponse
from app.models.database import Database
from app.services.document_service import DocumentService
from app.config import get_settings

logger = logging.getLogger(__name__)


router = APIRouter()


def get_db(request: Request) -> Database:
    """Get database from app state."""
    return request.app.state.db


def get_document_service(request: Request) -> DocumentService:
    """Get document service instance from app state singletons."""
    return DocumentService(request.app.state.db, request.app.state.vector_store)


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    temporary: bool = Form(False),
    document_service: DocumentService = Depends(get_document_service),
):
    """Upload a document for processing."""
    import logging

    logger = logging.getLogger(__name__)
    logger.info(
        f"Upload request: file={file.filename}, content_type={file.content_type}, title={title}, temporary={temporary}"
    )

    settings = get_settings()

    # Validate file size
    content = await file.read()
    max_size = settings.max_upload_size_mb * 1024 * 1024

    if len(content) > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"Dosya boyutu çok büyük. Maksimum: {settings.max_upload_size_mb}MB",
        )

    # Validate content type
    content_type = file.content_type or "application/octet-stream"

    if content_type not in DocumentService.SUPPORTED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Desteklenmeyen dosya tipi: {content_type}. Desteklenen tipler: PDF, DOCX, TXT",
        )

    try:
        document = await document_service.process_file(
            file_content=content,
            filename=file.filename or "unknown",
            content_type=content_type,
            title=title,
            description=description,
            is_temporary=temporary,
        )

        return DocumentResponse(
            id=document["id"],
            title=document["title"],
            description=document.get("description", ""),
            filename=document["filename"],
            file_type=document["file_type"],
            file_size=document["file_size"],
            chunk_count=document.get("chunk_count", 0),
            status=document.get("status", "pending"),
            created_at=document["created_at"],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Document processing error: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500, detail="Dosya işlenirken bir hata oluştu."
        )


@router.get("", response_model=List[DocumentResponse])
async def list_documents(
    skip: int = 0,
    limit: int = 50,
    document_service: DocumentService = Depends(get_document_service),
):
    """List all uploaded documents."""
    documents = await document_service.list_documents(skip=skip, limit=limit)

    return [
        DocumentResponse(
            id=doc["id"],
            title=doc["title"],
            description=doc.get("description", ""),
            filename=doc["filename"],
            file_type=doc["file_type"],
            file_size=doc["file_size"],
            chunk_count=doc.get("chunk_count", 0),
            status=doc.get("status", "pending"),
            created_at=doc["created_at"],
        )
        for doc in documents
    ]


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str, document_service: DocumentService = Depends(get_document_service)
):
    """Get document details."""
    document = await document_service.get_document(document_id)

    if not document:
        raise HTTPException(status_code=404, detail="Doküman bulunamadı")

    return DocumentResponse(
        id=document["id"],
        title=document["title"],
        description=document.get("description", ""),
        filename=document["filename"],
        file_type=document["file_type"],
        file_size=document["file_size"],
        chunk_count=document.get("chunk_count", 0),
        status=document.get("status", "pending"),
        created_at=document["created_at"],
    )


@router.delete("/{document_id}")
async def delete_document(
    document_id: str, document_service: DocumentService = Depends(get_document_service)
):
    """Delete a document and its embeddings."""
    deleted = await document_service.delete_document(document_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Doküman bulunamadı")

    return {"message": "Doküman silindi"}


@router.get("/{document_id}/content")
async def get_document_content(
    document_id: str,
    document_service: DocumentService = Depends(get_document_service),
    db: Database = Depends(get_db),
):
    """Get document text content extracted from the original file."""
    document = await document_service.get_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Doküman bulunamadı")

    gridfs_id = document.get("gridfs_id")
    if not gridfs_id:
        raise HTTPException(status_code=404, detail="Doküman dosyası bulunamadı")

    try:
        fs = db.get_fs()
        grid_out = await fs.open_download_stream(gridfs_id)
        file_content = await grid_out.read()
    except Exception as e:
        logger.error("File read error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Dosya okunurken bir hata oluştu.")

    # Extract text from the file
    file_type = document.get("file_type", "txt")
    try:
        text = document_service._extract_text(file_content, file_type)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "id": document["id"],
        "title": document.get("title", document.get("filename", "")),
        "filename": document.get("filename", ""),
        "file_type": file_type,
        "content": text,
    }


@router.get("/{document_id}/pages")
async def get_document_pages(
    document_id: str,
    document_service: DocumentService = Depends(get_document_service),
    db: Database = Depends(get_db),
):
    """Get PDF document text content page by page."""
    document = await document_service.get_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Doküman bulunamadı")

    gridfs_id = document.get("gridfs_id")
    if not gridfs_id:
        raise HTTPException(status_code=404, detail="Doküman dosyası bulunamadı")

    file_type = document.get("file_type", "txt")
    if file_type != "pdf":
        raise HTTPException(
            status_code=400,
            detail="Bu endpoint sadece PDF dosyalar için kullanılabilir",
        )

    try:
        fs = db.get_fs()
        grid_out = await fs.open_download_stream(gridfs_id)
        file_content = await grid_out.read()
    except Exception as e:
        logger.error("File read error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Dosya okunurken bir hata oluştu.")

    try:
        pages = document_service._extract_pdf_pages(file_content)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "id": document["id"],
        "pages": pages,
        "total_pages": len(pages),
    }


@router.get("/{document_id}/download")
async def download_document(
    document_id: str,
    document_service: DocumentService = Depends(get_document_service),
    db: Database = Depends(get_db),
):
    """Download the original document file."""
    document = await document_service.get_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Doküman bulunamadı")

    gridfs_id = document.get("gridfs_id")
    if not gridfs_id:
        raise HTTPException(status_code=404, detail="Doküman dosyası bulunamadı")

    try:
        fs = db.get_fs()
        grid_out = await fs.open_download_stream(gridfs_id)
        file_content = await grid_out.read()
    except Exception as e:
        logger.error("File read error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Dosya okunurken bir hata oluştu.")

    content_type_map = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "txt": "text/plain; charset=utf-8",
    }
    file_type = document.get("file_type", "txt")
    content_type = content_type_map.get(file_type, "application/octet-stream")
    filename = document.get("filename", f"document.{file_type}")
    encoded_filename = quote(filename)

    return StreamingResponse(
        BytesIO(file_content),
        media_type=content_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{encoded_filename}",
        },
    )

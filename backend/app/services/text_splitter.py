import re
from typing import List, Dict, Any
from langchain_text_splitters import TextSplitter


class LegislationTextSplitter(TextSplitter):
    """
    Text splitter designed for Turkish legislation (Laws, Regulations).
    Splits text by Articles (Madde) and preserves metadata.
    """

    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200, **kwargs: Any):
        super().__init__(chunk_size=chunk_size, chunk_overlap=chunk_overlap, **kwargs)
        # Regex to find Article headers like "MADDE 1", "Madde 1.", "EK MADDE 1", "GEÇİCİ MADDE 1"
        # It handles case insensitivity and optional punctuation/spacing
        self.article_pattern = re.compile(
            r"^\s*((?:EK|GEÇİCİ)?\s*MADDE\s+\d+\s*\.?|BAŞLANGIÇ|AMAÇ|KAPSAM|TANIMLAR)",
            re.IGNORECASE | re.MULTILINE,
        )

    def split_text(self, text: str) -> List[str]:
        """Split text into chunks."""
        # This generic method is required by base class but we prefer split_text_with_metadata
        chunks_with_meta = self.split_text_with_metadata(text)
        return [chunk["content"] for chunk in chunks_with_meta]

    def split_text_with_metadata(self, text: str) -> List[Dict[str, Any]]:
        """
        Split text into chunks with legislation metadata (Article No).
        """
        splits = []

        # Find all matches of article headers
        matches = list(self.article_pattern.finditer(text))

        if not matches:
            # If no legislation structure found, fallback to simple splitting
            # But here we just return the whole text as one chunk or specific split
            # Ideally we should fallback to recursive splitter, but for now let's handle as single block
            # or split by default params if too long.
            return self._fallback_split(text)

        # Process matches
        for i, match in enumerate(matches):
            start = match.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)

            header = match.group(1).strip()
            content = text[start:end].strip()

            # Clean up the header for metadata (e.g., "MADDE 1." -> "Madde 1")
            article_no = self._clean_header(header)

            # If content is too long, split it further (preserving context)
            if len(content) > self._chunk_size:
                sub_chunks = self._split_long_article(content, article_no)
                splits.extend(sub_chunks)
            else:
                splits.append(
                    {
                        "content": content,
                        "metadata": {"madde_no": article_no, "is_article": True},
                    }
                )

        # Handle preamble if text doesn't start with a match
        if matches and matches[0].start() > 0:
            preamble = text[: matches[0].start()].strip()
            if preamble:
                splits.insert(
                    0,
                    {
                        "content": preamble,
                        "metadata": {"madde_no": "Başlangıç", "is_article": False},
                    },
                )

        return splits

    def _split_long_article(self, text: str, article_no: str) -> List[Dict[str, Any]]:
        """Split a long article into smaller chunks recursively."""
        # Use recursive splitter for the content of the long article
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        recursive = RecursiveCharacterTextSplitter(
            chunk_size=self._chunk_size,
            chunk_overlap=self._chunk_overlap,
            separators=["\n\n", "\n", ";", ".", " ", ""],
        )
        texts = recursive.split_text(text)

        return [
            {
                "content": t,
                "metadata": {
                    "madde_no": f"{article_no} (Parça {i+1})",
                    "is_article": True,
                    "parent_article": article_no,
                },
            }
            for i, t in enumerate(texts)
        ]

    def _clean_header(self, header: str) -> str:
        """Standardize header format."""
        # Handle Turkish specific casing
        header = header.strip().rstrip(".")

        # Custom lowercasing for Turkish characters
        lower_map = {
            ord("I"): "ı",
            ord("İ"): "i",
            ord("Ç"): "ç",
            ord("Ş"): "ş",
            ord("Ğ"): "ğ",
            ord("Ü"): "ü",
            ord("Ö"): "ö",
        }
        clean = header.translate(lower_map).lower()

        if "madde" in clean:
            parts = clean.split()
            # Reconstruct to be pretty: "Madde 1"
            return " ".join(p.capitalize() for p in parts)

        return clean.capitalize()

    def _fallback_split(self, text: str) -> List[Dict[str, Any]]:
        """Fallback when no structure is found."""
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        recursive = RecursiveCharacterTextSplitter(
            chunk_size=self._chunk_size, chunk_overlap=self._chunk_overlap
        )
        texts = recursive.split_text(text)
        return [{"content": t, "metadata": {"madde_no": "Genel"}} for t in texts]

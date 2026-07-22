"""Text acquisition at upload time (plan §8): native PDF text layer first, vision OCR fallback
per page when the native layer yields under OCR_CHAR_THRESHOLD characters (plan §7/§11/§16)."""

from dataclasses import dataclass

import pymupdf

from app.agents.llm import LLMNotConfigured, extract_page_text_via_vision

OCR_CHAR_THRESHOLD = 40


@dataclass
class ExtractionResult:
    text: str
    page_count: int
    classification_confidence: float
    """Fraction of pages whose native text layer was usable without OCR fallback — surfaced
    in the Evidence tab so a heavily-scanned exhibit is visibly less trustworthy."""


async def extract_text(pdf_bytes: bytes) -> ExtractionResult:
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    try:
        page_texts: list[str] = []
        native_ok = 0
        for page_number in range(doc.page_count):
            page = doc[page_number]
            text = page.get_text()
            if len(text.strip()) >= OCR_CHAR_THRESHOLD:
                native_ok += 1
            else:
                try:
                    pixmap = page.get_pixmap(dpi=200)
                    text = await extract_page_text_via_vision(pixmap.tobytes("png"))
                except LLMNotConfigured:
                    pass
            page_texts.append(text)

        page_count = doc.page_count
        confidence = native_ok / page_count if page_count else 0.0
        return ExtractionResult(
            text="\n\n".join(page_texts), page_count=page_count, classification_confidence=confidence
        )
    finally:
        doc.close()

"""Conservative redaction for text retained in operational/search records."""
import re

def redact(text):
    text = re.sub(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', '[email removed]', text)
    text = re.sub(r'(?i)\b(password|api[_ -]?key|access[_ -]?token|secret)\s*[:=]\s*\S+', '[credential removed]', text)
    text = re.sub(r'\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}', '[credential removed]', text)
    return re.sub(r'(?<!\w)(?:\+?\d[\s().-]*){10,15}(?!\w)', '[phone removed]', text)

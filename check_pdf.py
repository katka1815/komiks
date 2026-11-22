# Self-check for pdf.js output: python check_pdf.py file.pdf PAGES WIDTH_MM HEIGHT_MM
import sys
from pypdf import PdfReader
path, pages, w, h = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
r = PdfReader(path, strict=True)
assert len(r.pages) == pages, f'{len(r.pages)} pages, expected {pages}'
for i, p in enumerate(r.pages):
    pw, ph = float(p.mediabox.width) * 25.4 / 72, float(p.mediabox.height) * 25.4 / 72
    assert abs(pw - w) < 0.1 and abs(ph - h) < 0.1, f'page {i+1}: {pw:.1f}x{ph:.1f} mm'
    img = p.images[0]
    print(f'page {i+1}: {pw:.1f} x {ph:.1f} mm, image {img.image.size}')
print('OK')

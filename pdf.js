'use strict';
// Minimal PDF writer: one full-page JPEG per page. Image data stays as Blobs, so 20+ pages don't pile up in JS memory.
function pdfWriter() {
  const parts = [], offsets = [], kids = [], enc = new TextEncoder();
  let len = 0, n = 2; // 1 = catalog, 2 = page tree
  const put = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.size ?? b.length; };
  const obj = (num, dict, stream) => {
    offsets[num] = len;
    put(`${num} 0 obj\n${dict}\n`);
    if (stream) { put('stream\n'); put(stream); put('\nendstream\n'); }
    put('endobj\n');
  };
  put('%PDF-1.4\n%âãÏÓ\n');
  return {
    addPage(jpeg, pxW, pxH, wMm, hMm) {
      const w = (wMm * 72 / 25.4).toFixed(2), h = (hMm * 72 / 25.4).toFixed(2);
      const img = ++n, content = ++n, page = ++n, c = `q ${w} 0 0 ${h} 0 0 cm /Im Do Q`;
      obj(img, `<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.size} >>`, jpeg);
      obj(content, `<< /Length ${c.length} >>`, c);
      obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im ${img} 0 R >> >> /Contents ${content} 0 R >>`);
      kids.push(page);
    },
    finish() {
      obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
      obj(2, `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);
      const xref = len;
      let x = `xref\n0 ${n + 1}\n0000000000 65535 f \n`;
      for (let i = 1; i <= n; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
      put(x + `trailer\n<< /Size ${n + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
      return new Blob(parts, { type: 'application/pdf' });
    },
  };
}

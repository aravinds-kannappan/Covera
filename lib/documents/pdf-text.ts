// Browser-only text extraction from an uploaded file. PDFs go through pdf.js (loaded lazily so
// it never weighs down the initial bundle); plain-text formats are read directly. The server
// document API takes text, so this is the front end that turns a real uploaded PDF/EOB/bill
// into the text that then gets structured. It throws a friendly error the UI can show if a PDF
// is a scanned image with no text layer (which needs OCR we do not run here).

export async function extractFileText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  if (!isPdf) {
    // .txt / .csv / .md / anything text-like
    return (await file.text()).trim();
  }
  return extractPdfText(file);
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Bundler-native worker URL: resolved to a hashed asset at build time, no CDN needed.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  let out = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => (typeof (it as { str?: unknown }).str === "string" ? (it as { str: string }).str : ""))
      .join(" ");
    out += line + "\n";
  }
  out = out.trim();
  if (!out) {
    throw new Error(
      "This PDF has no readable text (it looks like a scan or image). Paste the text instead.",
    );
  }
  return out;
}

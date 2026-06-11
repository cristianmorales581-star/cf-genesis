import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export interface PdfDebugSnapshot {
  filename: string;
  html: string;
  canvasDataUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  capturedAt: string;
}

interface PdfRenderOptions {
  onDebug?: (snapshot: PdfDebugSnapshot) => void;
}

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const SCALE = 2;

// Selector for logical blocks that must NEVER be split across pages.
// Templates can also opt-in by adding `data-no-break` to any wrapper.
const NO_BREAK_SELECTOR = [
  "[data-no-break]",
  ".bloque-detalle",
  ".firma-area",
  ".firma-cedente",
  ".declaracion-cell",
  ".orden-doc table.form",
  ".orden-doc table.form tr",
  ".kv tr",
].join(",");

interface PageRange { top: number; bottom: number; }
interface RenderResult { canvas: HTMLCanvasElement; pages: PageRange[]; }

export async function htmlToPdfBlob(html: string, filename: string, options: PdfRenderOptions = {}): Promise<Blob> {
  const { canvas, pages } = await renderHtmlCanvas(html, filename, options);
  const blob = canvasToPdf(canvas, pages).output("blob");
  releaseCanvas(canvas);
  return blob;
}

export async function htmlToPdfDownload(html: string, filename: string, options: PdfRenderOptions = {}) {
  const { canvas, pages } = await renderHtmlCanvas(html, filename, options);
  canvasToPdf(canvas, pages).save(filename);
  releaseCanvas(canvas);
}

async function renderHtmlCanvas(html: string, filename: string, options: PdfRenderOptions): Promise<RenderResult> {
  const wrapper = createPdfWrapper(html);
  document.body.appendChild(wrapper);

  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const windowWidth = wrapper.offsetWidth || 794;
    const windowHeight = wrapper.scrollHeight || 1123;

    // Collect avoid-break block rects BEFORE rasterizing (need live DOM layout).
    const wrapperTop = wrapper.getBoundingClientRect().top;
    const avoidBlocks = collectAvoidBlocks(wrapper, wrapperTop, SCALE);

    const canvas = await html2canvas(wrapper, {
      scale: SCALE,
      useCORS: true,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
      width: windowWidth,
      height: windowHeight,
      windowWidth,
      windowHeight,
      logging: false,
    });

    if (options.onDebug) {
      options.onDebug({
        filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
        html: wrapper.innerHTML,
        canvasDataUrl: canvas.toDataURL("image/png"),
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        capturedAt: new Date().toLocaleTimeString(),
      });
    }

    // Trim trailing whitespace so we don't generate a blank tail page.
    const trimmedHeight = trimTrailingWhitespace(canvas);
    const pageHeightPx = Math.round((A4_HEIGHT_MM / A4_WIDTH_MM) * canvas.width);
    const pages = computePageRanges(trimmedHeight, pageHeightPx, avoidBlocks);

    await new Promise((resolve) => window.setTimeout(resolve, 60));
    return { canvas, pages };
  } finally {
    document.body.removeChild(wrapper);
  }
}

function collectAvoidBlocks(wrapper: HTMLElement, wrapperTop: number, scale: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  wrapper.querySelectorAll(NO_BREAK_SELECTOR).forEach((el) => {
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.height <= 0) return;
    const top = Math.floor((r.top - wrapperTop) * scale);
    const bottom = Math.ceil((r.bottom - wrapperTop) * scale);
    if (bottom > top) out.push([top, bottom]);
  });
  return out;
}

function trimTrailingWhitespace(canvas: HTMLCanvasElement, padPx = 24): number {
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.height;
  const w = canvas.width;
  const h = canvas.height;
  try {
    const data = ctx.getImageData(0, 0, w, h).data;
    let lastContentRow = 0;
    rowLoop: for (let y = h - 1; y >= 0; y--) {
      const rowStart = y * w * 4;
      // Sample every 4px horizontally for speed; still catches lines/text.
      for (let x = 0; x < w; x += 4) {
        const i = rowStart + x * 4;
        if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) {
          lastContentRow = y;
          break rowLoop;
        }
      }
    }
    return Math.min(h, lastContentRow + padPx);
  } catch {
    return h;
  }
}

function computePageRanges(totalHeight: number, pageHeightPx: number, avoidBlocks: Array<[number, number]>): PageRange[] {
  // Snap-tolerance to absorb single-page docs that overflow by a few px due to rounding.
  // ~6mm of headroom — if the content fits within one A4 page + 6mm, treat as one page.
  const toleranceSinglePage = Math.round(pageHeightPx * 0.02);
  if (totalHeight <= pageHeightPx + toleranceSinglePage) {
    return [{ top: 0, bottom: Math.min(totalHeight, pageHeightPx) }];
  }

  const ranges: PageRange[] = [];
  let offset = 0;
  // Hard safety bound to avoid infinite loops if a single block exceeds page height.
  const maxPages = 50;
  while (offset < totalHeight && ranges.length < maxPages) {
    let end = offset + pageHeightPx;
    if (end >= totalHeight) {
      ranges.push({ top: offset, bottom: totalHeight });
      break;
    }
    let adjusted = end;
    for (const [bt, bb] of avoidBlocks) {
      // Block starts within current page but extends past the page break -> snap up to its top.
      if (bt > offset && bt < end && bb > end) {
        if (bt < adjusted) adjusted = bt;
      }
    }
    // If snapping would leave less than 40% of the page filled, the block itself is taller than
    // half a page — accept a mid-block break rather than waste a near-empty page.
    if (adjusted - offset < pageHeightPx * 0.4) adjusted = end;
    ranges.push({ top: offset, bottom: adjusted });
    offset = adjusted;
  }

  // Drop a trailing page that ended up effectively empty (under ~10mm tall after trim).
  const minPageContentPx = Math.round(pageHeightPx * 0.035);
  if (ranges.length > 1) {
    const last = ranges[ranges.length - 1];
    if (last.bottom - last.top < minPageContentPx) ranges.pop();
  }
  return ranges;
}

function canvasToPdf(canvas: HTMLCanvasElement, pages: PageRange[]) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const pageHeightPx = Math.round((A4_HEIGHT_MM / A4_WIDTH_MM) * canvas.width);
  const JPEG_QUALITY = 0.82;

  pages.forEach((range, idx) => {
    if (idx > 0) pdf.addPage();
    const sliceHeight = range.bottom - range.top;
    // Always paint onto a full-page canvas so every PDF page is exactly A4 sized.
    // The last page may have less content than a full page; trailing area stays white.
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = pageHeightPx;
    const ctx = slice.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(
      canvas,
      0, range.top, canvas.width, sliceHeight,
      0, 0, canvas.width, sliceHeight,
    );
    pdf.addImage(slice.toDataURL("image/jpeg", JPEG_QUALITY), "JPEG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, "FAST");
    slice.width = 0;
    slice.height = 0;
  });

  return pdf;
}

function createPdfWrapper(html: string) {
  const wrapper = document.createElement("div");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  wrapper.innerHTML = `${parsed.head.innerHTML}${parsed.body.innerHTML}`;
  wrapper.querySelectorAll(".actions").forEach((el) => el.remove());
  wrapper.style.position = "absolute";
  wrapper.style.left = "-9999px";
  wrapper.style.top = "0";
  wrapper.style.width = "794px";
  // No minHeight: let content dictate size so trim works on real content height.
  wrapper.style.padding = "56px 68px 24px";
  wrapper.style.boxSizing = "border-box";
  wrapper.style.fontFamily = "Calibri, 'Trebuchet MS', 'Segoe UI', Arial, sans-serif";
  wrapper.style.fontSize = "10.5pt";
  wrapper.style.lineHeight = "1.45";
  wrapper.style.background = "#ffffff";
  wrapper.style.color = "#000000";
  wrapper.style.zIndex = "2147483647";
  wrapper.style.pointerEvents = "none";
  wrapper.style.boxShadow = "none";
  return wrapper;
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

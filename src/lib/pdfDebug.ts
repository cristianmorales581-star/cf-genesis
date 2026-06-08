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

export async function htmlToPdfBlob(html: string, filename: string, options: PdfRenderOptions = {}): Promise<Blob> {
  const { canvas } = await renderHtmlCanvas(html, filename, options);
  const blob = canvasToPdf(canvas).output("blob");
  releaseCanvas(canvas);
  return blob;
}

export async function htmlToPdfDownload(html: string, filename: string, options: PdfRenderOptions = {}) {
  const { canvas } = await renderHtmlCanvas(html, filename, options);
  canvasToPdf(canvas).save(filename);
  releaseCanvas(canvas);
}

async function renderHtmlCanvas(html: string, filename: string, options: PdfRenderOptions) {
  const wrapper = createPdfWrapper(html);
  document.body.appendChild(wrapper);

  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const windowWidth = wrapper.offsetWidth || 794;
    const windowHeight = wrapper.scrollHeight || 1123;
    const canvas = await html2canvas(wrapper, {
      scale: 2,
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
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    return { canvas };
  } finally {
    document.body.removeChild(wrapper);
  }
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
  wrapper.style.minHeight = "1123px";
  wrapper.style.padding = "68px";
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

function canvasToPdf(canvas: HTMLCanvasElement) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageHeightPx = Math.round((A4_HEIGHT_MM / A4_WIDTH_MM) * canvas.width);
  const totalPages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage();
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = Math.min(pageHeightPx, canvas.height - page * pageHeightPx);
    const ctx = slice.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(canvas, 0, page * pageHeightPx, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    const sliceHeightMm = (slice.height * A4_WIDTH_MM) / slice.width;
    pdf.addImage(slice.toDataURL("image/png"), "PNG", 0, 0, A4_WIDTH_MM, sliceHeightMm);
    slice.width = 0;
    slice.height = 0;
  }

  return pdf;
}

function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}
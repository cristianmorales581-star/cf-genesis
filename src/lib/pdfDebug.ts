import html2pdf from "html2pdf.js";
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
  return canvasToPdf(canvas).output("blob");
}

export async function htmlToPdfDownload(html: string, filename: string, options: PdfRenderOptions = {}) {
  const { canvas } = await renderHtmlCanvas(html, filename, options);
  canvasToPdf(canvas).save(filename);
}

async function renderHtmlCanvas(html: string, filename: string, options: PdfRenderOptions) {
  const wrapper = createPdfWrapper(html);
  document.body.appendChild(wrapper);

  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const windowWidth = Math.max(wrapper.scrollWidth, wrapper.offsetWidth, 794);
    const windowHeight = Math.max(wrapper.scrollHeight, wrapper.offsetHeight, 1123);
    const worker = html2pdf()
      .set({
        filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
        margin: 0,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          scrollX: 0,
          scrollY: 0,
          windowWidth,
          windowHeight,
          logging: true,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(wrapper)
      .toContainer();

    const overlay = (await worker.get("overlay")) as HTMLElement | null;
    if (overlay) {
      overlay.style.left = "0";
      overlay.style.top = "0";
      overlay.style.right = "auto";
      overlay.style.bottom = "auto";
      overlay.style.width = `${windowWidth}px`;
      overlay.style.height = `${windowHeight}px`;
      overlay.style.overflow = "visible";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "2147483647";
      overlay.style.background = "#ffffff";
    }

    const container = (await worker.get("container")) as HTMLElement | null;
    if (container) {
      container.style.margin = "0";
      container.style.backgroundColor = "#ffffff";
    }

    await worker.toCanvas();
    const canvas = (await worker.get("canvas")) as HTMLCanvasElement;
    const canvasDataUrl = canvas.toDataURL("image/png");
    options.onDebug?.({
      filename: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
      html: wrapper.innerHTML,
      canvasDataUrl,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      capturedAt: new Date().toLocaleTimeString(),
    });
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
  wrapper.style.position = "fixed";
  wrapper.style.left = "0";
  wrapper.style.top = "0";
  wrapper.style.width = "210mm";
  wrapper.style.minHeight = "297mm";
  wrapper.style.background = "#ffffff";
  wrapper.style.color = "#000000";
  wrapper.style.zIndex = "2147483647";
  wrapper.style.pointerEvents = "none";
  wrapper.style.boxShadow = "none";
  return wrapper;
}

function canvasToPdf(canvas: HTMLCanvasElement) {
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const imgData = canvas.toDataURL("image/jpeg", 0.98);
  const imgHeight = (canvas.height * A4_WIDTH_MM) / canvas.width;
  let remainingHeight = imgHeight;
  let y = 0;

  pdf.addImage(imgData, "JPEG", 0, y, A4_WIDTH_MM, imgHeight);
  remainingHeight -= A4_HEIGHT_MM;

  while (remainingHeight > 0) {
    y -= A4_HEIGHT_MM;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, y, A4_WIDTH_MM, imgHeight);
    remainingHeight -= A4_HEIGHT_MM;
  }

  return pdf;
}
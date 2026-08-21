// Paquete ZIP de documentos (mismo formato que la generación masiva)
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { htmlToPdfBlob } from "@/lib/pdfDebug";
import { buildVectorXlsx } from "@/lib/vectorXlsx";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;

export type TipoDocPaquete = "CFB" | "HOJA_TERMINOS" | "ODC" | "ODV" | "CARTA_BVC" | "CARTA_SUNAVAL";

export const PAQUETE_TIPOS: TipoDocPaquete[] = [
  "CFB", "HOJA_TERMINOS", "ODC", "ODV", "CARTA_BVC", "CARTA_SUNAVAL",
];

export interface PaqueteEmision {
  id: string;
  simbolo_cfb: string;
  valor_nominal_usd: number;
  precio: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  dias_colocados: number;
  rendimiento_anualizado: number;
  tasa_cambio_bs_usd: number;
  cantidad_ordenes_compra?: number | null;
  programas?: { codigo_pcfb?: string; cedentes?: { razon_social?: string; rif?: string } } | null;
  financistas?: { razon_social?: string; rif?: string } | null;
}

export function slugify(s: string | undefined | null, fallback = "CEDENTE") {
  return (
    String(s ?? fallback)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "").toUpperCase() || fallback
  );
}

export function buildVectorRow(e: PaqueteEmision) {
  const vnUsd = Number(e.valor_nominal_usd);
  const tasa = Number(e.tasa_cambio_bs_usd);
  return {
    simbolo_cfb: e.simbolo_cfb,
    cedente: e.programas?.cedentes?.razon_social ?? "",
    rif_cedente: e.programas?.cedentes?.rif ?? "",
    deudor_cedido: "GRUPO CASHEA VE, C.A.",
    rif_deudor: "J-501934070",
    cantidad_certificados: 1,
    fecha_emision: e.fecha_emision,
    fecha_vencimiento: e.fecha_vencimiento,
    dias_colocados: Number(e.dias_colocados),
    rendimiento: Number(e.rendimiento_anualizado),
    volumen_ordenes: Number(e.cantidad_ordenes_compra ?? 0),
    valor_nominal_bs: +(vnUsd * tasa).toFixed(2),
    precio_emision: Number(e.precio),
    tipo_sociedad: "COMERCIAL",
    moneda: "VES",
    valor_nominal_usd: vnUsd,
    monto_sibe_usd: Math.round(vnUsd),
    tasa_cambio: tasa,
    inversionista: e.financistas?.razon_social ?? "GRUPO CASHEA VE, C.A.",
    rif_inversionista: e.financistas?.rif ?? "J-501934070",
  };
}

async function fetchDocHtml(emisionId: string, tipo: TipoDocPaquete): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`https://${PROJECT_ID}.functions.supabase.co/generate-document`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({ emision_id: emisionId, tipo }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string })?.error ?? "Error generando documento");
  }
  return await res.text();
}

/**
 * Genera un ZIP con los documentos de una o varias emisiones
 * + el vector consolidado (.xlsx), igual que la generación masiva.
 */
export async function buildPaqueteZipBlob(
  emisiones: PaqueteEmision[],
  onProgress?: (done: number, total: number, simbolo: string) => void,
): Promise<{ blob: Blob; errores: string[] }> {
  const zip = new JSZip();
  const errores: string[] = [];
  const vectorRows: ReturnType<typeof buildVectorRow>[] = [];

  let done = 0;
  for (const e of emisiones) {
    onProgress?.(done, emisiones.length, e.simbolo_cfb);
    const slug = slugify(e.programas?.cedentes?.razon_social);
    const carpeta = emisiones.length > 1
      ? zip.folder(`${e.simbolo_cfb}_${slug}`)!
      : zip.folder("documentos")!;
    try {
      for (const tipo of PAQUETE_TIPOS) {
        const html = await fetchDocHtml(e.id, tipo);
        const pdf = await htmlToPdfBlob(html, `${tipo}_${e.simbolo_cfb}_${slug}`);
        carpeta.file(`${tipo}_${e.simbolo_cfb}_${slug}.pdf`, pdf);
      }
      vectorRows.push(buildVectorRow(e));
    } catch (err) {
      errores.push(`${e.simbolo_cfb}: ${err instanceof Error ? err.message : "error desconocido"}`);
    }
    done += 1;
    onProgress?.(done, emisiones.length, e.simbolo_cfb);
  }

  if (vectorRows.length) {
    const fecha = vectorRows[0].fecha_emision;
    zip.file(`VECTOR_${fecha}_CONSOLIDADO.xlsx`, buildVectorXlsx(vectorRows, fecha));
  }

  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, errores };
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

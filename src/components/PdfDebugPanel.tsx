import { Button } from "@/components/ui/button";
import type { PdfDebugSnapshot } from "@/lib/pdfDebug";

export function PdfDebugPanel({ snapshot, onClose }: { snapshot: PdfDebugSnapshot; onClose: () => void }) {
  return (
    <section className="surface-card p-4 mb-6 border-accent/40">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="font-display text-sm uppercase tracking-[0.16em] text-accent">PDF Debug</h3>
          <p className="text-xs text-muted-foreground">{snapshot.filename} · canvas {snapshot.canvasWidth}×{snapshot.canvasHeight} · {snapshot.capturedAt}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onClose}>Cerrar</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Canvas renderizado</div>
          <div className="rounded-md border border-border bg-card p-2">
            <img src={snapshot.canvasDataUrl} alt="Vista previa del canvas PDF" className="w-full rounded-sm border border-border bg-background" />
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">HTML enviado a html2pdf</div>
          <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-[10px] leading-relaxed text-foreground whitespace-pre-wrap break-words">
            {snapshot.html}
          </pre>
        </div>
      </div>
    </section>
  );
}
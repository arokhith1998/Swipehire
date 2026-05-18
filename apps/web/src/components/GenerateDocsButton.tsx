import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/queryClient";
import { Sparkles, FileText, Mail, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface Props { jobId: number; jobTitle: string; companyName: string; }

type Kind = "cv" | "cover_letter";
type Format = "pdf" | "docx";

interface Step { id: string; label: string; status: "pending" | "running" | "ok" | "err"; detail?: string; }

const KIND_LABEL: Record<Kind, string> = { cv: "Resume", cover_letter: "Cover letter" };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function safeSlug(s: string) { return (s || "doc").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40); }

export function GenerateDocsButton({ jobId, jobTitle, companyName }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);

  function update(id: string, patch: Partial<Step>) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  async function generateBoth(kind: Kind) {
    setBusy(true);
    const label = KIND_LABEL[kind];
    setSteps([
      { id: `${kind}_spec`,  label: `Generating ${label.toLowerCase()} (OpenAI)`, status: "pending" },
      { id: `${kind}_pdf`,   label: `Rendering ${label} PDF`,                     status: "pending" },
      { id: `${kind}_docx`,  label: `Rendering ${label} DOCX`,                    status: "pending" },
    ]);

    try {
      // 1. Spec
      update(`${kind}_spec`, { status: "running" });
      const specRes = await apiFetch("/api/generate/spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, kind }),
      });
      if (!specRes.ok) {
        const err = await specRes.json().catch(() => ({}));
        const map: Record<string, string> = {
          no_resumes:           "Upload at least one resume on your Profile first.",
          openai_not_configured:"OpenAI key isn't set on the server.",
          generation_failed:    err.message ?? "OpenAI couldn't produce a clean response.",
        };
        const msg = map[err.error] ?? err.message ?? `HTTP ${specRes.status}`;
        update(`${kind}_spec`, { status: "err", detail: msg });
        throw new Error(msg);
      }
      const { spec } = await specRes.json();
      update(`${kind}_spec`, { status: "ok" });

      // 2. PDF + DOCX in parallel
      const renderOne = async (format: Format) => {
        update(`${kind}_${format}`, { status: "running" });
        try {
          const r = await apiFetch("/api/generate/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, format, spec }),
          });
          if (!r.ok) {
            const err = await r.json().catch(() => ({}));
            const msg = err.message ?? `HTTP ${r.status}`;
            update(`${kind}_${format}`, { status: "err", detail: msg });
            return;
          }
          const blob = await r.blob();
          const headerName = r.headers.get("Content-Disposition")?.match(/filename="?([^"]+)"?/)?.[1];
          const fallback = `${safeSlug(jobTitle)}_${safeSlug(companyName)}_${kind === "cv" ? "resume" : "cover_letter"}.${format}`;
          downloadBlob(blob, headerName ?? fallback);
          update(`${kind}_${format}`, { status: "ok" });
        } catch (e: any) {
          update(`${kind}_${format}`, { status: "err", detail: e.message ?? "render failed" });
        }
      };
      await Promise.all([renderOne("pdf"), renderOne("docx")]);
    } catch (e: any) {
      toast({ title: "Generation failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function StepRow({ s }: { s: Step }) {
    const icon =
      s.status === "ok"      ? <CheckCircle2 className="w-4 h-4 text-green-600" /> :
      s.status === "err"     ? <AlertCircle  className="w-4 h-4 text-red-600" /> :
      s.status === "running" ? <Loader2     className="w-4 h-4 text-gray-500 animate-spin" /> :
                               <div className="w-4 h-4 rounded-full border border-gray-300" />;
    return (
      <div className="flex items-start gap-2 text-sm">
        <div className="mt-0.5">{icon}</div>
        <div className="flex-1">
          <div className={s.status === "err" ? "text-red-700" : "text-gray-800"}>{s.label}</div>
          {s.detail && <div className="text-xs text-red-600">{s.detail}</div>}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSteps([]); setBusy(false); } }}>
      <DialogTrigger asChild>
        <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white" size="sm">
          <Sparkles className="w-4 h-4 mr-1.5" />
          Generate resume &amp; cover letter
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Tailored documents for this role</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-gray-900">{jobTitle}</span> at{" "}
            <span className="font-medium text-gray-900">{companyName}</span>. Each click produces both PDF and DOCX. Pulls from your Profile resume bank.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 my-2">
          <Button onClick={() => generateBoth("cv")} disabled={busy} className="bg-purple-600 hover:bg-purple-700 text-white">
            <FileText className="w-4 h-4 mr-1.5" /> Resume
          </Button>
          <Button onClick={() => generateBoth("cover_letter")} disabled={busy} variant="outline">
            <Mail className="w-4 h-4 mr-1.5" /> Cover letter
          </Button>
        </div>

        {steps.length > 0 && (
          <div className="rounded-md bg-gray-50 border border-gray-200 p-3 space-y-2">
            {steps.map(s => <StepRow key={s.id} s={s} />)}
          </div>
        )}

        <p className="text-xs text-gray-500">PDF takes ~5-10 sec the first time (OpenAI). DOCX is added in parallel; both files download to your browser automatically.</p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

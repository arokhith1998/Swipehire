import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/queryClient";
import { Sparkles, FileText, Download } from "lucide-react";

interface Props { jobId: number; jobTitle: string; companyName: string; }

type Kind = "cv" | "cover_letter";
type Format = "pdf" | "docx";

export function GenerateDocsButton({ jobId, jobTitle, companyName }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // cache the JSON spec across format clicks so we don't re-call OpenAI when the user wants both PDF and DOCX
  const [specs, setSpecs] = useState<Partial<Record<Kind, any>>>({});

  async function getSpec(kind: Kind): Promise<any> {
    if (specs[kind]) return specs[kind];
    const r = await apiFetch("/api/generate/spec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, kind }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      const map: Record<string, string> = {
        no_resumes: "Upload at least one resume on your Profile page first.",
        openai_not_configured: "OpenAI key isn't configured on the server yet.",
        generation_failed: "OpenAI couldn't produce a clean response — try again.",
      };
      throw new Error(map[err.error] ?? err.message ?? "Generation failed");
    }
    const json = await r.json();
    setSpecs(prev => ({ ...prev, [kind]: json.spec }));
    return json.spec;
  }

  async function downloadDoc(kind: Kind, format: Format) {
    setBusy(`${kind}_${format}`);
    try {
      const spec = await getSpec(kind);
      const r = await apiFetch("/api/generate/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, format, spec }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? "Render failed");
      }
      const blob = await r.blob();
      const filename = r.headers.get("Content-Disposition")?.match(/filename="?([^"]+)"?/)?.[1] ??
        `${kind}.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Couldn't generate", description: err.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  const DownloadRow = ({ kind, label }: { kind: Kind; label: string }) => (
    <div className="grid grid-cols-2 gap-2">
      <Button onClick={() => downloadDoc(kind, "pdf")} disabled={!!busy} variant="outline">
        <Download className="w-4 h-4 mr-1.5" /> PDF
        {busy === `${kind}_pdf` && <span className="ml-2 text-xs text-gray-500">…</span>}
      </Button>
      <Button onClick={() => downloadDoc(kind, "docx")} disabled={!!busy} variant="outline">
        <Download className="w-4 h-4 mr-1.5" /> DOCX
        {busy === `${kind}_docx` && <span className="ml-2 text-xs text-gray-500">…</span>}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSpecs({}); setBusy(null); } }}>
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
            <span className="font-medium text-gray-900">{companyName}</span>. Pulls from your resume bank — make sure your Profile has at least one.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="cv">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cv"><FileText className="w-4 h-4 mr-1.5" /> Resume</TabsTrigger>
            <TabsTrigger value="cover_letter"><FileText className="w-4 h-4 mr-1.5" /> Cover letter</TabsTrigger>
          </TabsList>
          <TabsContent value="cv" className="space-y-3">
            <p className="text-xs text-gray-500">ATS-safe, single column, hard 1-page cap. First click takes ~5-10 sec for OpenAI; second format reuses the same generation.</p>
            <DownloadRow kind="cv" label="Resume" />
          </TabsContent>
          <TabsContent value="cover_letter" className="space-y-3">
            <p className="text-xs text-gray-500">3-4 paragraphs, role-specific. Same caching — generating PDF first makes DOCX free.</p>
            <DownloadRow kind="cover_letter" label="Cover letter" />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

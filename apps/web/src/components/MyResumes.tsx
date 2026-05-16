import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Star, FileText, Trash2, Upload } from "lucide-react";

interface Resume {
  id: number;
  label: string;
  mimeType: string | null;
  originalFilename: string | null;
  parsed: { skills?: string[]; experience?: string | null } | null;
  isPrimary: boolean;
  createdAt: string;
  chars: number;
}

export function MyResumes() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/resumes"],
    queryFn: async () => {
      const r = await apiFetch("/api/resumes");
      if (!r.ok) throw new Error("failed to load resumes");
      return r.json() as Promise<{ resumes: Resume[] }>;
    },
  });

  const setPrimary = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/api/resumes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/resumes"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/api/resumes/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/resumes"] });
      toast({ title: "Resume removed" });
    },
  });

  const resumes = data?.resumes ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              My resumes
            </CardTitle>
            <CardDescription className="mt-1">
              Add as many as you want. The starred one is your primary — generated cover letters and tailored CVs use it as the base, and pull skills/projects from the others.
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-teal-600 hover:bg-teal-700 text-white">
                <Upload className="w-4 h-4 mr-1" /> Add resume
              </Button>
            </DialogTrigger>
            <AddResumeDialog onClose={() => setOpen(false)} />
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : resumes.length === 0 ? (
          <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-md p-6 text-center">
            No resumes yet. Add one to start generating tailored cover letters and CVs.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {resumes.map(r => (
              <li key={r.id} className="py-3 flex items-center gap-3">
                <button
                  onClick={() => setPrimary.mutate(r.id)}
                  disabled={r.isPrimary || setPrimary.isPending}
                  title={r.isPrimary ? "Primary resume" : "Set as primary"}
                  className="text-yellow-500 disabled:cursor-default hover:text-yellow-600 transition-colors"
                >
                  <Star className="w-5 h-5" fill={r.isPrimary ? "currentColor" : "none"} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900 truncate">{r.label}</span>
                    {r.isPrimary && <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Primary</Badge>}
                    {r.originalFilename && <span className="text-xs text-gray-400 truncate">{r.originalFilename}</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
                    <span>{r.chars.toLocaleString()} chars</span>
                    {r.parsed?.skills?.length ? <span>{r.parsed.skills.length} skills</span> : null}
                    {r.parsed?.experience ? <span className="capitalize">{r.parsed.experience}</span> : null}
                    <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  onClick={() => { if (confirm(`Remove "${r.label}"?`)) remove.mutate(r.id); }}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AddResumeDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const upload = useMutation({
    mutationFn: async (kind: "file" | "paste") => {
      if (kind === "file") {
        if (!file) throw new Error("Pick a file");
        const fd = new FormData();
        fd.append("resume", file);
        if (label.trim()) fd.append("label", label.trim());
        const r = await apiFetch("/api/resumes", { method: "POST", body: fd });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message || err.error || "Upload failed");
        }
        return r.json();
      } else {
        if (!label.trim()) throw new Error("Add a label");
        if (text.trim().length < 50) throw new Error("Paste at least 50 characters of resume text");
        const r = await apiFetch("/api/resumes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: label.trim(), text }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message || err.error || "Save failed");
        }
        return r.json();
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/resumes"] });
      toast({ title: "Resume added" });
      setLabel(""); setText(""); setFile(null);
      onClose();
    },
    onError: (err: Error) => toast({ title: "Couldn't add resume", description: err.message, variant: "destructive" }),
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Add a resume</DialogTitle>
        <DialogDescription>Upload a PDF/DOCX/TXT file or paste the text directly.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div>
          <Label htmlFor="resume-label">Label (so you can tell them apart)</Label>
          <Input
            id="resume-label"
            placeholder='e.g. "MLE — RAG focus" or "Marketing Analyst"'
            value={label}
            onChange={e => setLabel(e.target.value)}
            maxLength={80}
          />
        </div>

        <Tabs defaultValue="file">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="file">Upload file</TabsTrigger>
            <TabsTrigger value="paste">Paste text</TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
            />
            {file && <div className="text-xs text-gray-500">{file.name} · {(file.size / 1024).toFixed(1)} KB</div>}
            <Button
              type="button"
              onClick={() => upload.mutate("file")}
              disabled={!file || upload.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white w-full"
            >
              {upload.isPending ? "Uploading…" : "Add resume"}
            </Button>
          </TabsContent>

          <TabsContent value="paste" className="space-y-3">
            <Textarea
              placeholder="Paste the full text of your resume here..."
              value={text}
              onChange={e => setText(e.target.value)}
              className="min-h-[200px] text-xs font-mono"
              maxLength={50000}
            />
            <div className="text-xs text-gray-500">{text.length.toLocaleString()} / 50,000 chars</div>
            <Button
              type="button"
              onClick={() => upload.mutate("paste")}
              disabled={text.trim().length < 50 || !label.trim() || upload.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white w-full"
            >
              {upload.isPending ? "Saving…" : "Add resume"}
            </Button>
          </TabsContent>
        </Tabs>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </DialogFooter>
    </DialogContent>
  );
}

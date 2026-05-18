import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiFetch } from "@/lib/queryClient";
import { Sparkles, Loader2, MessageSquare } from "lucide-react";

interface Citation {
  id: number;
  title: string | null;
  kind: string;
  similarity: number;
}

interface AskResult {
  answer: string;
  citations: Citation[];
  modelVersion?: string;
}

interface Props {
  /** Optional starter suggestions, e.g. ["Has NVIDIA sponsored H-1B for this SOC?", "..."] */
  suggestions?: string[];
  /** Optional context-priming prefix, e.g. "About Stripe in San Francisco: " — prepended to the user's question. */
  contextPrefix?: string;
}

const KIND_LABEL: Record<string, string> = {
  company_visa: "Company visa history",
  immigration_rule: "Immigration rules",
  role_norms: "Role norms",
  salary_band: "Salary bands",
};

export function AskWidget({ suggestions = [], contextPrefix }: Props) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fire(question: string) {
    const text = question.trim();
    if (text.length < 3) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await apiFetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: contextPrefix ? `${contextPrefix}${text}` : text }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        const map: Record<string, string> = {
          openai_not_configured: "Q&A isn't configured on the server yet.",
          ask_failed: err.message ?? "Couldn't answer that.",
        };
        throw new Error(map[err.error] ?? err.message ?? `HTTP ${r.status}`);
      }
      const j = (await r.json()) as AskResult;
      setResult(j);
    } catch (e: any) {
      setError(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-4 h-4 text-primary" />
          Ask SwipeHire
        </CardTitle>
        <CardDescription className="text-xs">
          Visa history, immigration rules, sponsorship likelihood. Answers grounded in DOL data and immigration law.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          onSubmit={(e) => { e.preventDefault(); fire(q); }}
          className="flex gap-2"
        >
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. How many H-1Bs has Stripe sponsored?"
            disabled={busy}
          />
          <Button type="submit" disabled={busy || q.trim().length < 3} className="bg-primary text-primary-foreground hover:opacity-90">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ask"}
          </Button>
        </form>

        {suggestions.length > 0 && !result && !busy && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => { setQ(s); fire(s); }}
                className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md p-2">{error}</div>
        )}

        {result && (
          <div className="space-y-3 pt-1">
            <div className="text-sm text-foreground leading-relaxed whitespace-pre-line">{result.answer}</div>

            {result.citations.length > 0 && (
              <div className="border-t border-border/60 pt-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> Sources
                </div>
                <ol className="space-y-1 text-xs text-muted-foreground">
                  {result.citations.map((c, i) => (
                    <li key={c.id} className="flex items-baseline gap-2">
                      <span className="font-medium text-foreground">[{i + 1}]</span>
                      <span className="flex-1 truncate">{c.title ?? `Source ${i + 1}`}</span>
                      <span className="text-[10px] text-muted-foreground/70">{KIND_LABEL[c.kind] ?? c.kind} · {(c.similarity * 100).toFixed(0)}%</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <button
              onClick={() => { setResult(null); setQ(""); }}
              className="text-xs text-primary hover:underline"
            >
              Ask another →
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

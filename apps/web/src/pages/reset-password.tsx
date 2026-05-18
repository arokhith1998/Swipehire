import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/queryClient";
import { SwipeHireLogo } from "@/components/SwipeHireLogo";

const schema = z.object({
  password: z.string().min(8, "Must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type FormValues = z.infer<typeof schema>;

export default function ResetPassword() {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const res = await apiFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const map: Record<string, string> = {
          invalid_token: "This reset link is invalid.",
          token_used: "This reset link has already been used.",
          token_expired: "This reset link has expired. Request a new one.",
          invalid_input: "Password doesn't meet requirements.",
        };
        throw new Error(map[err.error] ?? err.error ?? "Reset failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setDone(true);
      toast({ title: "Password updated", description: "You can sign in with your new password." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't reset password", description: err.message, variant: "destructive" });
    },
  });

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-muted/40">
      <header className="px-4 sm:px-6 py-4 sm:py-6">
        <div className="max-w-6xl mx-auto">
          <a href="/"><SwipeHireLogo size="md" /></a>
        </div>
      </header>
      <section className="px-4 py-12">
        <div className="w-full max-w-md mx-auto">{children}</div>
      </section>
    </div>
  );

  if (token === null) {
    return <Shell><div className="text-center text-gray-600">Loading…</div></Shell>;
  }

  if (!token) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Reset link is missing</CardTitle>
            <CardDescription>This page expects a reset token in the URL. Request a new email and try the link again.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full bg-primary text-primary-foreground hover:opacity-90" onClick={() => (window.location.href = "/forgot-password")}>
              Request a new link
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle>Password updated</CardTitle>
            <CardDescription>You can now sign in with your new password.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full bg-primary text-primary-foreground hover:opacity-90" onClick={() => (window.location.href = "/login")}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>Choose a password of at least 8 characters.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New password</FormLabel>
                    <FormControl><Input type="password" placeholder="At least 8 characters" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm new password</FormLabel>
                    <FormControl><Input type="password" placeholder="Re-enter your new password" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full bg-primary text-primary-foreground hover:opacity-90" disabled={mutation.isPending}>
                {mutation.isPending ? "Updating…" : "Update password"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </Shell>
  );
}

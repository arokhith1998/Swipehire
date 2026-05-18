import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { apiFetch } from "@/lib/queryClient";
import { SwipeHireLogo } from "@/components/SwipeHireLogo";

const schema = z.object({
  email: z.string().email("Please enter a valid email"),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPassword() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      // Endpoint always returns ok to avoid email enumeration.
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSettled: () => setSubmitted(true),
  });

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="px-4 sm:px-6 py-4 sm:py-6">
        <div className="max-w-6xl mx-auto">
          <a href="/"><SwipeHireLogo size="md" /></a>
        </div>
      </header>
      <section className="px-4 py-12">
        <div className="w-full max-w-md mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>{submitted ? "Check your email" : "Forgot your password?"}</CardTitle>
              <CardDescription>
                {submitted
                  ? "If an account exists for that email, we sent a reset link. The link expires in 1 hour."
                  : "Enter the email tied to your account and we'll send a reset link."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <Button className="w-full bg-primary text-primary-foreground hover:opacity-90" onClick={() => (window.location.href = "/login")}>
                  Back to sign in
                </Button>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input type="email" placeholder="you@example.com" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full bg-primary text-primary-foreground hover:opacity-90" disabled={mutation.isPending}>
                      {mutation.isPending ? "Sending…" : "Send reset link"}
                    </Button>
                    <div className="text-center text-sm">
                      <a href="/login" className="text-primary hover:underline">Back to sign in</a>
                    </div>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

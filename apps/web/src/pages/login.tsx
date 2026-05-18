import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/queryClient";
import { SwipeHireLogo } from "@/components/SwipeHireLogo";
import { Target, Database, LineChart } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

function GoogleButton({ label }: { label: string }) {
  const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
  return (
    <a
      href={`${apiBase}/api/auth/google`}
      className="flex items-center justify-center gap-2 w-full border border-gray-300 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
        <path d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      {label}
    </a>
  );
}

function OrDivider() {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-500 uppercase tracking-wide">or</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

export default function Login() {
  const [activeTab, setActiveTab] = useState("login");
  const { toast } = useToast();

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Login failed");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Welcome back!",
        description: "You've been logged in successfully.",
      });
      window.location.href = "/dashboard";
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterForm) => {
      const response = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Registration failed");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Account created!",
        description: "Welcome to SwipeHire™. Please complete your profile.",
      });
      window.location.href = "/onboarding";
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onLogin = (data: LoginForm) => {
    loginMutation.mutate(data);
  };

  const onRegister = (data: RegisterForm) => {
    registerMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <SwipeHireLogo size="md" />
          <nav className="flex items-center gap-5 text-sm">
            <a href="/honesty" className="text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">Honesty</a>
            <a href="#auth" className="text-muted-foreground hover:text-foreground transition-colors">Sign in</a>
            <a href="#auth" className="inline-flex items-center h-9 px-3.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              Get started
            </a>
          </nav>
        </div>
      </header>

      {/* Hero — type-led, minimal, no cartoons */}
      <section className="px-4 sm:px-6 pt-20 sm:pt-28 pb-16 sm:pb-24 border-b border-border/60">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 mb-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <span className="h-px w-6 bg-primary/50" />
            AI hiring infrastructure for global talent
            <span className="h-px w-6 bg-primary/50" />
          </div>
          <h1 className="text-display text-5xl sm:text-6xl lg:text-7xl leading-[1.05] text-foreground">
            Job matches you can{' '}
            <span className="text-primary">actually trust</span>.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Calibrated probability scores, real H-1B sponsorship data from DOL OFLC,
            and live ATS feeds from 80+ companies. No inflated &ldquo;95% match&rdquo; theatre.
            Built for international candidates navigating STEM-OPT and H-1B.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <a href="#auth" className="inline-flex items-center h-11 px-5 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
              Get started free
              <span className="ml-2">→</span>
            </a>
            <a href="/honesty" className="inline-flex items-center h-11 px-5 rounded-md border border-border text-foreground font-medium hover:bg-muted transition-colors">
              See the Honesty Dashboard
            </a>
          </div>
        </div>

        {/* Stat strip — replaces the cartoon cards. Real numbers, not fake demo cards. */}
        <div className="mt-16 max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-px bg-border rounded-xl overflow-hidden border border-border">
          {[
            { v: '4.8M', k: 'DOL LCA records analysed' },
            { v: '80+',  k: 'Companies, live ATS feed' },
            { v: '90%',  k: 'Confidence intervals on every score' },
            { v: '$0',   k: 'During beta — no card required' },
          ].map((s) => (
            <div key={s.k} className="bg-background px-5 py-6 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">{s.v}</div>
              <div className="mt-1 text-xs sm:text-sm text-muted-foreground">{s.k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* "How it's different" — proper icons, no emoji */}
      <section className="px-4 sm:px-6 py-20 sm:py-24 border-b border-border/60">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary mb-3">How we're different</div>
            <h2 className="text-display text-3xl sm:text-4xl text-foreground">Three things every other tool gets wrong.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-12">
            {[
              {
                icon: Target,
                title: 'Calibrated, not inflated',
                body: 'Every score is a real probability of getting an interview, with a 90% confidence interval. When the data isn\'t there, we say "Insufficient data" instead of forging a 95%.',
              },
              {
                icon: Database,
                title: 'Visa data that\'s actually deep',
                body: 'Per-employer LCA filings, certification rates, prevailing wage checks. Direct from DOL OFLC disclosure files. 4.8M records since 2013, refreshed quarterly.',
              },
              {
                icon: LineChart,
                title: 'Honest about every step',
                body: 'Apply on company sites in one click, then log outcomes back. Our calibration is anchored to what actually happened, not what we hoped would happen.',
              },
            ].map((c) => (
              <div key={c.title}>
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary mb-4">
                  <c.icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground tracking-tight mb-2">{c.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Auth form */}
      <section id="auth" className="px-4 py-20 sm:py-24 bg-muted/40">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-display text-3xl text-foreground">Get started</h2>
            <p className="text-muted-foreground text-sm mt-2">Free during beta. No credit card required.</p>
          </div>

        <Card className="shadow-sm border-border">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Sign in or create your account</CardTitle>
            <CardDescription className="text-xs">
              Takes about 30 seconds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4">
                <GoogleButton label="Continue with Google" />
                <OrDivider />
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter your email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Enter your password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full bg-primary text-primary-foreground hover:opacity-90"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? "Signing in..." : "Sign in"}
                    </Button>
                    <div className="text-center text-sm">
                      <a href="/forgot-password" className="text-primary hover:underline">Forgot your password?</a>
                    </div>
                  </form>
                </Form>

                {/* Google OAuth coming soon — hidden until backend wired */}
              </TabsContent>

              <TabsContent value="register" className="space-y-4">
                <GoogleButton label="Sign up with Google" />
                <OrDivider />
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={registerForm.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input placeholder="First name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={registerForm.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Last name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter your email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Create a password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Confirm your password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full bg-primary text-primary-foreground hover:opacity-90"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? "Creating account..." : "Create account"}
                    </Button>
                  </form>
                </Form>

                {/* Google OAuth coming soon */}
              </TabsContent>
            </Tabs>

            <div className="mt-6 text-center text-sm text-gray-600">
              By continuing, you agree to SwipeHire™'s Terms of Service and Privacy Policy
            </div>
          </CardContent>
        </Card>
        </div>
      </section>

      <footer className="px-4 py-8 border-t border-gray-100 text-center text-xs text-gray-500">
        © 2026 SwipeHire™. Calibrated job matching for international candidates.
        {" · "}<a href="/honesty" className="hover:underline">Honesty dashboard</a>
      </footer>
    </div>
  );
}
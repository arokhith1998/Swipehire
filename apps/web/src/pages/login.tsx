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
    <div className="min-h-screen bg-gradient-to-br from-white via-teal-50/40 to-blue-50/40">
      {/* Hero / marketing */}
      <header className="px-4 sm:px-6 py-4 sm:py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <SwipeHireLogo size="md" />
          <a href="#auth" className="text-sm font-medium text-gray-700 hover:text-primary">Sign in</a>
        </div>
      </header>

      <section className="px-4 sm:px-6 pt-8 sm:pt-16 pb-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-block bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full mb-4">
              Built for international candidates
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-4">
              Job matches that <span className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">don't lie</span> to you.
            </h1>
            <p className="text-lg text-gray-600 leading-relaxed mb-6">
              Calibrated probability scores, real visa sponsorship data, and live company intel.
              No inflated "95% match" theatre. Built for STEM-OPT, H-1B, and anyone who's tired
              of LinkedIn's noise.
            </p>
            <div className="flex flex-wrap gap-3">
              <a href="#auth" className="inline-flex items-center px-5 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors">
                Try it free →
              </a>
              <a href="/honesty" className="inline-flex items-center px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-white transition-colors">
                Honesty dashboard
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="text-3xl font-bold text-primary">87%</div>
              <div className="text-sm font-medium text-gray-900 mt-1">Strong fit</div>
              <div className="text-xs text-gray-500 mt-0.5">90% CI: 81–93%</div>
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="bg-green-500 h-full rounded-full" style={{ width: "92%" }} />
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: "78%" }} />
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full" style={{ width: "65%" }} />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Visa intel</div>
              <div className="text-base font-bold text-gray-900 mt-1">Stripe</div>
              <div className="text-xs text-gray-500 mt-1">From DOL OFLC LCA records</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 rounded p-2">
                  <div className="text-gray-500">LCAs (24mo)</div>
                  <div className="font-bold text-gray-900">142</div>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <div className="text-gray-500">Approved</div>
                  <div className="font-bold text-gray-900">94%</div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 col-span-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Why apply</div>
              <ul className="space-y-1.5 text-sm">
                <li className="flex items-start gap-1.5"><span className="text-green-600 mt-0.5">✓</span><span className="text-gray-700">Matched 8/10 JD skills: Python, AWS, PostgreSQL...</span></li>
                <li className="flex items-start gap-1.5"><span className="text-green-600 mt-0.5">✓</span><span className="text-gray-700">Job is hybrid in SF Bay Area; user prefers hybrid</span></li>
                <li className="flex items-start gap-1.5"><span className="text-yellow-600 mt-0.5">⚠</span><span className="text-gray-700">Salary band lower than expected ($165k vs $180k)</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* What we do differently */}
      <section className="px-4 sm:px-6 py-10 bg-white border-y border-gray-100">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Three things every other tool gets wrong</h2>
          <p className="text-center text-gray-600 mb-8">And what we're doing differently.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-3xl mb-2">🎯</div>
              <h3 className="font-semibold text-gray-900 mb-1">Calibrated, not inflated</h3>
              <p className="text-sm text-gray-600">
                Every score is a real probability of getting an interview, with a 90% confidence interval.
                When we don't have enough data, we say "Insufficient data" — not "95% match".
              </p>
            </div>
            <div>
              <div className="text-3xl mb-2">🛂</div>
              <h3 className="font-semibold text-gray-900 mb-1">Visa data that's actually deep</h3>
              <p className="text-sm text-gray-600">
                Per-employer LCA filings, certification rates, prevailing wage checks. Direct from DOL OFLC
                disclosure data — 4.8M records since 2013.
              </p>
            </div>
            <div>
              <div className="text-3xl mb-2">📋</div>
              <h3 className="font-semibold text-gray-900 mb-1">Honest about every step</h3>
              <p className="text-sm text-gray-600">
                Apply on company sites with one click — and log outcomes back so we can keep our
                calibration anchored to what actually happened, not what we hope.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Auth form */}
      <section id="auth" className="px-4 py-12">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Get started</h2>
            <p className="text-gray-600 text-sm mt-1">Free during beta. No card required.</p>
          </div>

        <Card>
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>
              Sign in to your account or create a new one
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="register">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-4">
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
                      className="w-full bg-teal-600 hover:bg-teal-700"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? "Signing in..." : "Sign In"}
                    </Button>
                  </form>
                </Form>

                {/* Google OAuth coming soon — hidden until backend wired */}
              </TabsContent>

              <TabsContent value="register" className="space-y-4">
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
                      className="w-full bg-teal-600 hover:bg-teal-700"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? "Creating account..." : "Create Account"}
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
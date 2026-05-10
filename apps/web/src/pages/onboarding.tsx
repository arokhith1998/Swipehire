import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { SwipeHireLogo } from "@/components/SwipeHireLogo";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { Briefcase, User, MapPin, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const steps = [
  { title: "Account Setup", icon: User },
  { title: "Job Preferences", icon: Briefcase },
  { title: "Location & Visa", icon: MapPin },
  { title: "Resume Upload", icon: FileText },
];

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const preferencesSchema = z.object({
  targetJobTitle: z.string().min(1, "Job title is required"),
  preferredLocation: z.string().min(1, "Location is required"),
  visaStatus: z.string().optional(),
  remotePreference: z.string().min(1, "Remote preference is required"),
});

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(0);
  const [userData, setUserData] = useState<any>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check if user is already authenticated (e.g., via Google OAuth)
  const { data: authResponse } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // If user is already authenticated, skip to job preferences
  useEffect(() => {
    if (authResponse?.user && currentStep === 0) {
      setCurrentStep(1);
    }
  }, [authResponse]);

  const registerForm = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
    },
  });

  const preferencesForm = useForm({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      targetJobTitle: "",
      preferredLocation: "",
      visaStatus: "",
      remotePreference: "",
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Account created successfully!" });
      setCurrentStep(1);
    },
    onError: (error: any) => {
      toast({ 
        title: "Registration failed", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/auth/login", {
        email: userData.email,
        password: userData.password,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({ title: "Welcome to SwipeHire™!" });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("PATCH", "/api/profile", data);
      return response.json();
    },
    onSuccess: () => {
      setCurrentStep(currentStep + 1);
    },
  });

  const onRegisterSubmit = (data: any) => {
    setUserData(data);
    registerMutation.mutate(data);
  };

  const onPreferencesSubmit = (data: any) => {
    updateProfileMutation.mutate(data);
  };

  const onVisaSubmit = (visaStatus: string) => {
    updateProfileMutation.mutate({ visaStatus });
  };

  const handleResumeUpload = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('resume', file);
      
      const response = await fetch('/api/resume/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        toast({ title: "Resume uploaded successfully!" });
        // Refresh user data and redirect
        queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
        window.location.href = '/';
      } else {
        const errorData = await response.json();
        if (response.status === 401) {
          toast({ 
            title: "Authentication required", 
            description: "Please log in to upload your resume.",
            variant: "destructive"
          });
          // Try to authenticate first
          if (authResponse?.user) {
            // User is authenticated, try again
            throw new Error('Authentication issue - please try again');
          } else {
            // User is not authenticated, redirect to login
            window.location.href = '/login';
            return;
          }
        } else {
          throw new Error(errorData.message || 'Failed to upload resume');
        }
      }
    } catch (error) {
      console.error('Resume upload error:', error);
      toast({ 
        title: "Resume upload failed", 
        description: "You can upload your resume later from your profile.",
        variant: "destructive"
      });
      // Complete onboarding anyway
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      window.location.href = '/';
    }
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <SwipeHireLogo size="md" />
          <span className="text-sm text-brand-gray">{currentStep + 1} of {steps.length}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white px-4 py-4">
        <div className="max-w-md mx-auto">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between mt-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={index}
                  className={`flex flex-col items-center ${
                    index <= currentStep ? 'text-primary' : 'text-gray-400'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    index <= currentStep ? 'bg-primary text-white' : 'bg-gray-200'
                  }`}>
                    <Icon className="w-3 h-3" />
                  </div>
                  <span className="text-xs mt-1">{step.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-6">
        <div className="max-w-md mx-auto">
          {currentStep === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Create Your Account</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={registerForm.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
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
                              <Input {...field} />
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
                            <Input type="email" {...field} />
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
                            <Input type="password" {...field} />
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
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? "Creating Account..." : "Create Account"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Job Preferences</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...preferencesForm}>
                  <form onSubmit={preferencesForm.handleSubmit(onPreferencesSubmit)} className="space-y-4">
                    <FormField
                      control={preferencesForm.control}
                      name="targetJobTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Job Title</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Software Engineer" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={preferencesForm.control}
                      name="preferredLocation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preferred Location</FormLabel>
                          <FormControl>
                            <LocationAutocomplete
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="e.g., San Francisco, CA"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={preferencesForm.control}
                      name="remotePreference"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Work Arrangement</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select preference" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="remote">Remote</SelectItem>
                              <SelectItem value="hybrid">Hybrid</SelectItem>
                              <SelectItem value="onsite">On-site</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex space-x-3">
                      <Button 
                        type="button" 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => setCurrentStep(0)}
                      >
                        Back
                      </Button>
                      <Button 
                        type="submit" 
                        className="flex-1"
                        disabled={updateProfileMutation.isPending}
                      >
                        {updateProfileMutation.isPending ? "Saving..." : "Continue"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}

          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Visa Status</CardTitle>
                <p className="text-sm text-gray-600">
                  This helps us show you jobs from visa-friendly employers.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  {
                    value: "citizen",
                    title: "U.S. Citizen or Permanent Resident",
                    description: "No visa sponsorship needed"
                  },
                  {
                    value: "h1b",
                    title: "H1B Visa Holder",
                    description: "Currently on H1B, may need transfer"
                  },
                  {
                    value: "f1",
                    title: "Student (F1/OPT/CPT)",
                    description: "Looking for H1B sponsorship"
                  },
                  {
                    value: "other",
                    title: "Other Visa Status",
                    description: "L1, O1, or other work authorization"
                  }
                ].map((option) => (
                  <Button
                    key={option.value}
                    variant="outline"
                    className="w-full h-auto p-4 text-left justify-start hover:border-primary"
                    onClick={() => onVisaSubmit(option.value)}
                    disabled={updateProfileMutation.isPending}
                  >
                    <div>
                      <div className="font-medium text-gray-900">{option.title}</div>
                      <div className="text-sm text-gray-500">{option.description}</div>
                    </div>
                  </Button>
                ))}
                
                <div className="flex space-x-3 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setCurrentStep(1)}
                  >
                    Back
                  </Button>
                  <Button 
                    type="button" 
                    className="flex-1"
                    onClick={() => onVisaSubmit("")}
                    disabled={updateProfileMutation.isPending}
                  >
                    Skip
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Upload Resume</CardTitle>
                <p className="text-sm text-gray-600">
                  Upload your resume to get personalized job recommendations.
                </p>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">
                    Drop your resume here or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleResumeUpload(file);
                      }
                    }}
                    className="hidden"
                    id="resume-upload"
                  />
                  <Button
                    type="button"
                    onClick={() => document.getElementById('resume-upload')?.click()}
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending ? "Processing..." : "Choose File"}
                  </Button>
                  <p className="text-xs text-gray-500 mt-2">
                    Supported formats: PDF, DOC, DOCX, TXT
                  </p>
                </div>
                
                <div className="flex space-x-3 mt-6">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setCurrentStep(2)}
                  >
                    Back
                  </Button>
                  <Button 
                    type="button" 
                    className="flex-1"
                    onClick={() => {
                      // Skip resume upload and complete onboarding
                      toast({ title: "Welcome to SwipeHire™!" });
                      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
                      window.location.href = '/';
                    }}
                    disabled={loginMutation.isPending}
                  >
                    Skip for Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

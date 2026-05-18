import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { User, Camera, MapPin, Briefcase, GraduationCap, Plus, X } from "lucide-react";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { SwipeHireLogo } from "@/components/SwipeHireLogo";
import { TopNavigation } from "@/components/TopNavigation";
import { BottomNavigation } from "@/components/BottomNavigation";
import { MyResumes } from "@/components/MyResumes";

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email"),
  phone: z.string().min(1, "Phone number is required"),
  location: z.string().optional(),
  visaStatus: z.enum(["us_citizen", "green_card", "h1b", "opt", "f1", "other"]).optional(),
  jobTitle: z.string().optional(),
  experience: z.enum(["entry", "junior", "mid", "senior", "staff", "principal", "director"]).optional(),
  expectedSalary: z.string().optional(),
  bio: z.string().max(500, "Bio must be less than 500 characters").optional(),
  skills: z.array(z.string()).optional(),
  education: z.string().optional(),
  profilePicture: z.string().optional()
});

type ProfileFormData = z.infer<typeof profileSchema>;

const visaStatusOptions = [
  { value: "us_citizen", label: "US Citizen" },
  { value: "green_card", label: "Green Card Holder" },
  { value: "h1b", label: "H1B Visa" },
  { value: "opt", label: "OPT (F1 Student)" },
  { value: "f1", label: "F1 Student" },
  { value: "other", label: "Other Visa Status" }
];

const experienceOptions = [
  { value: "entry", label: "Entry Level (0-1 years)" },
  { value: "junior", label: "Junior (1-3 years)" },
  { value: "mid", label: "Mid Level (3-5 years)" },
  { value: "senior", label: "Senior (5-8 years)" },
  { value: "staff", label: "Staff (8-12 years)" },
  { value: "principal", label: "Principal (12+ years)" },
  { value: "director", label: "Director/VP (15+ years)" }
];

const suggestedSkills = [
  "JavaScript", "TypeScript", "React", "Node.js", "Python", "Java", "Go",
  "AWS", "Docker", "Kubernetes", "SQL", "MongoDB", "PostgreSQL", "Redis",
  "GraphQL", "REST APIs", "System Design", "Machine Learning", "Data Science",
  "DevOps", "CI/CD", "Agile", "Scrum", "Leadership", "Product Management"
];

export default function Profile() {
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const [profileImage, setProfileImage] = useState<string>("");
  const [skillInput, setSkillInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Check if user exists and is authenticated
  const { data: authResponse, isLoading } = useQuery({
    queryKey: ["/api/auth/me"],
    retry: false,
  });

  const user = authResponse?.user;

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      phone: "",
      location: "",
      visaStatus: undefined,
      jobTitle: "",
      experience: undefined,
      expectedSalary: "",
      bio: "",
      skills: [],
      education: "",
      profilePicture: user?.profilePicture || ""
    }
  });

  useEffect(() => {
    if (user) {
      form.reset({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phone: user.phone || "",
        location: user.location || "",
        visaStatus: user.visaStatus || undefined,
        jobTitle: user.jobTitle || "",
        experience: user.experience || undefined,
        expectedSalary: user.expectedSalary || "",
        bio: user.bio || "",
        skills: user.skills || [],
        education: user.education || "",
        profilePicture: user.profilePicture || ""
      });
      setProfileImage(user.profilePicture || "");
    }
  }, [user, form]);

  const createProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const result = await apiRequest("POST", "/api/profile", {
        ...data,
        profilePicture: profileImage
      });
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Profile Created Successfully",
        description: "Welcome to SwipeHire™! Let's start finding your perfect job match.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/");
    },
    onError: (error: any) => {
      toast({
        title: "Profile Creation Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const addSkill = () => {
    if (skillInput.trim()) {
      const currentSkills = form.getValues("skills");
      if (!currentSkills.includes(skillInput.trim())) {
        form.setValue("skills", [...currentSkills, skillInput.trim()]);
      }
      setSkillInput("");
    }
  };

  const removeSkill = (skillToRemove: string) => {
    const currentSkills = form.getValues("skills");
    form.setValue("skills", currentSkills.filter(skill => skill !== skillToRemove));
  };

  const addSuggestedSkill = (skill: string) => {
    const currentSkills = form.getValues("skills");
    if (!currentSkills.includes(skill)) {
      form.setValue("skills", [...currentSkills, skill]);
    }
  };

  const onSubmit = (data: ProfileFormData) => {
    setIsCreating(true);
    createProfileMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/40 flex items-center justify-center">
        <div className="text-center">
          <SwipeHireLogo size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-muted/40 flex items-center justify-center">
        <div className="text-center">
          <SwipeHireLogo size="lg" className="mx-auto mb-4" />
          <p className="text-gray-600">Please log in to access your profile</p>
          <button 
            onClick={() => navigate("/login")}
            className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40 pb-20 md:pb-0">
      <TopNavigation />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8 md:hidden">
          <SwipeHireLogo size="lg" className="mx-auto mb-4" />
        </div>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Complete Your Profile
          </h1>
          <p className="text-gray-600">
            Tell us about yourself to get better job matches with visa sponsorship
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Build Your Professional Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Profile Picture */}
                <div className="flex flex-col items-center space-y-4">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={profileImage} alt="Profile" />
                    <AvatarFallback>
                      <User className="w-12 h-12 text-gray-400" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('profile-upload')?.click()}
                      className="flex items-center space-x-2"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Upload Photo</span>
                    </Button>
                    <input
                      id="profile-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl>
                          <Input placeholder="john@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="+1 (555) 123-4567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Location and Visa Status */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center space-x-2">
                          <MapPin className="w-4 h-4" />
                          <span>Location</span>
                        </FormLabel>
                        <FormControl>
                          <LocationAutocomplete
                            value={field.value}
                            onChange={field.onChange}
                            placeholder="Enter your city"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="visaStatus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Visa Status (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select your visa status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {visaStatusOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Professional Information */}
                <Separator />
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold flex items-center space-x-2">
                    <Briefcase className="w-5 h-5" />
                    <span>Professional Information</span>
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="jobTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Job Title</FormLabel>
                          <FormControl>
                            <Input placeholder="Software Engineer" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="experience"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Experience Level</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select experience level" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {experienceOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="expectedSalary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expected Salary Range</FormLabel>
                        <FormControl>
                          <Input placeholder="$100,000 - $150,000" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Skills Section */}
                <Separator />
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Skills & Technologies (Optional)</h3>
                  
                  <div className="flex space-x-2">
                    <Input
                      placeholder="Add a skill..."
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                    />
                    <Button type="button" onClick={addSkill} variant="outline">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {form.watch("skills").map((skill) => (
                      <Badge key={skill} variant="secondary" className="flex items-center space-x-1">
                        <span>{skill}</span>
                        <X
                          className="w-3 h-3 cursor-pointer hover:text-red-500"
                          onClick={() => removeSkill(skill)}
                        />
                      </Badge>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label>Suggested Skills</Label>
                    <div className="flex flex-wrap gap-2">
                      {suggestedSkills
                        .filter(skill => !form.watch("skills").includes(skill))
                        .slice(0, 12)
                        .map((skill) => (
                          <Badge
                            key={skill}
                            variant="outline"
                            className="cursor-pointer hover:bg-primary/5"
                            onClick={() => addSuggestedSkill(skill)}
                          >
                            {skill}
                          </Badge>
                        ))}
                    </div>
                  </div>
                </div>

                {/* Education & Bio */}
                <Separator />
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="education"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center space-x-2">
                          <GraduationCap className="w-4 h-4" />
                          <span>Education</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Bachelor's in Computer Science - MIT" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Professional Bio</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Tell us about your professional background and career goals..."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-center pt-6">
                  <Button
                    type="submit"
                    disabled={createProfileMutation.isPending || isCreating}
                    className="bg-primary text-primary-foreground hover:opacity-90 px-12 py-3 text-lg"
                  >
                    {createProfileMutation.isPending || isCreating ? "Creating Profile..." : "Complete Profile"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="mt-6">
          <MyResumes />
        </div>
      </div>
      <BottomNavigation currentPath="/profile" />
    </div>
  );
}
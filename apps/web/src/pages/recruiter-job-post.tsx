import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, X, Building, DollarSign, MapPin, Clock, Users } from 'lucide-react';

const jobPostSchema = z.object({
  title: z.string().min(1, 'Job title is required'),
  companyId: z.number().min(1, 'Company is required'),
  description: z.string().min(50, 'Description must be at least 50 characters'),
  requirements: z.array(z.string()).min(1, 'At least one requirement is needed'),
  responsibilities: z.array(z.string()).min(1, 'At least one responsibility is needed'),
  salaryMin: z.number().min(0, 'Minimum salary must be positive').optional(),
  salaryMax: z.number().min(0, 'Maximum salary must be positive').optional(),
  location: z.string().min(1, 'Location is required'),
  type: z.enum(['full-time', 'part-time', 'contract', 'intern']),
  experienceLevel: z.enum(['entry', 'junior', 'mid', 'senior', 'staff', 'principal', 'director']),
  department: z.string().optional(),
  skills: z.array(z.string()).min(1, 'At least one skill is required'),
  benefits: z.array(z.string()).optional(),
  isRemote: z.boolean().default(false),
  isHybrid: z.boolean().default(false),
  sponsorsVisa: z.boolean().default(false),
  applicationInstructions: z.string().optional(),
  applicationDeadline: z.string().optional(),
});

type JobPostFormData = z.infer<typeof jobPostSchema>;

export default function RecruiterJobPost() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [skillInput, setSkillInput] = useState('');
  const [requirementInput, setRequirementInput] = useState('');
  const [responsibilityInput, setResponsibilityInput] = useState('');
  const [benefitInput, setBenefitInput] = useState('');

  const { data: companies, isLoading: companiesLoading } = useQuery({
    queryKey: ['/api/companies'],
  });

  const form = useForm<JobPostFormData>({
    resolver: zodResolver(jobPostSchema),
    defaultValues: {
      title: '',
      companyId: 0,
      description: '',
      requirements: [],
      responsibilities: [],
      location: '',
      type: 'full-time',
      experienceLevel: 'mid',
      skills: [],
      benefits: [],
      isRemote: false,
      isHybrid: false,
      sponsorsVisa: false,
    },
  });

  const postJobMutation = useMutation({
    mutationFn: async (data: JobPostFormData) => {
      const response = await fetch('/api/recruiter/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to post job');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Job Posted Successfully',
        description: 'Your job posting is now live and visible to candidates.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/recruiter/jobs'] });
      navigate('/recruiter/dashboard');
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Post Job',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const addSkill = () => {
    if (skillInput.trim()) {
      const currentSkills = form.getValues('skills');
      if (!currentSkills.includes(skillInput.trim())) {
        form.setValue('skills', [...currentSkills, skillInput.trim()]);
      }
      setSkillInput('');
    }
  };

  const removeSkill = (skillToRemove: string) => {
    const currentSkills = form.getValues('skills');
    form.setValue('skills', currentSkills.filter(skill => skill !== skillToRemove));
  };

  const addRequirement = () => {
    if (requirementInput.trim()) {
      const current = form.getValues('requirements');
      form.setValue('requirements', [...current, requirementInput.trim()]);
      setRequirementInput('');
    }
  };

  const removeRequirement = (index: number) => {
    const current = form.getValues('requirements');
    form.setValue('requirements', current.filter((_, i) => i !== index));
  };

  const addResponsibility = () => {
    if (responsibilityInput.trim()) {
      const current = form.getValues('responsibilities');
      form.setValue('responsibilities', [...current, responsibilityInput.trim()]);
      setResponsibilityInput('');
    }
  };

  const removeResponsibility = (index: number) => {
    const current = form.getValues('responsibilities');
    form.setValue('responsibilities', current.filter((_, i) => i !== index));
  };

  const addBenefit = () => {
    if (benefitInput.trim()) {
      const current = form.getValues('benefits') || [];
      form.setValue('benefits', [...current, benefitInput.trim()]);
      setBenefitInput('');
    }
  };

  const removeBenefit = (index: number) => {
    const current = form.getValues('benefits') || [];
    form.setValue('benefits', current.filter((_, i) => i !== index));
  };

  const onSubmit = (data: JobPostFormData) => {
    postJobMutation.mutate(data);
  };

  if (companiesLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading companies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/recruiter/dashboard')}
            className="mr-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Post New Job</h1>
            <p className="text-gray-600 mt-2">Create a compelling job posting to attract top talent</p>
          </div>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building className="h-5 w-5 mr-2 text-teal-600" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="title">Job Title *</Label>
                  <Input
                    id="title"
                    {...form.register('title')}
                    placeholder="e.g., Senior Software Engineer"
                  />
                  {form.formState.errors.title && (
                    <p className="text-red-500 text-sm mt-1">{form.formState.errors.title.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="companyId">Company *</Label>
                  <Select
                    value={form.watch('companyId')?.toString()}
                    onValueChange={(value) => form.setValue('companyId', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies?.companies?.map((company: any) => (
                        <SelectItem key={company.id} value={company.id.toString()}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.companyId && (
                    <p className="text-red-500 text-sm mt-1">{form.formState.errors.companyId.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="location">Location *</Label>
                  <Input
                    id="location"
                    {...form.register('location')}
                    placeholder="e.g., San Francisco, CA"
                  />
                  {form.formState.errors.location && (
                    <p className="text-red-500 text-sm mt-1">{form.formState.errors.location.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    {...form.register('department')}
                    placeholder="e.g., Engineering, Marketing"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <Label>Job Type</Label>
                  <Select
                    value={form.watch('type')}
                    onValueChange={(value) => form.setValue('type', value as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full-time">Full-time</SelectItem>
                      <SelectItem value="part-time">Part-time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="intern">Internship</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Experience Level</Label>
                  <Select
                    value={form.watch('experienceLevel')}
                    onValueChange={(value) => form.setValue('experienceLevel', value as any)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entry">Entry Level</SelectItem>
                      <SelectItem value="junior">Junior</SelectItem>
                      <SelectItem value="mid">Mid Level</SelectItem>
                      <SelectItem value="senior">Senior</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="principal">Principal</SelectItem>
                      <SelectItem value="director">Director</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Work Model</Label>
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isRemote"
                        checked={form.watch('isRemote')}
                        onCheckedChange={(checked) => form.setValue('isRemote', checked as boolean)}
                      />
                      <Label htmlFor="isRemote" className="text-sm">Remote</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="isHybrid"
                        checked={form.watch('isHybrid')}
                        onCheckedChange={(checked) => form.setValue('isHybrid', checked as boolean)}
                      />
                      <Label htmlFor="isHybrid" className="text-sm">Hybrid</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="sponsorsVisa"
                        checked={form.watch('sponsorsVisa')}
                        onCheckedChange={(checked) => form.setValue('sponsorsVisa', checked as boolean)}
                      />
                      <Label htmlFor="sponsorsVisa" className="text-sm">Sponsors Visa</Label>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Job Description */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2 text-blue-600" />
                Job Description
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="description">Job Description *</Label>
                <Textarea
                  id="description"
                  {...form.register('description')}
                  placeholder="Describe the role, company culture, and what makes this position exciting..."
                  rows={6}
                />
                {form.formState.errors.description && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.description.message}</p>
                )}
              </div>

              {/* Requirements */}
              <div>
                <Label>Requirements *</Label>
                <div className="flex space-x-2 mt-2">
                  <Input
                    value={requirementInput}
                    onChange={(e) => setRequirementInput(e.target.value)}
                    placeholder="e.g., 5+ years of Python experience"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addRequirement())}
                  />
                  <Button type="button" onClick={addRequirement} variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.watch('requirements').map((req, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {req}
                      <X 
                        className="h-3 w-3 cursor-pointer hover:text-red-600"
                        onClick={() => removeRequirement(index)}
                      />
                    </Badge>
                  ))}
                </div>
                {form.formState.errors.requirements && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.requirements.message}</p>
                )}
              </div>

              {/* Responsibilities */}
              <div>
                <Label>Responsibilities *</Label>
                <div className="flex space-x-2 mt-2">
                  <Input
                    value={responsibilityInput}
                    onChange={(e) => setResponsibilityInput(e.target.value)}
                    placeholder="e.g., Design and implement scalable backend systems"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addResponsibility())}
                  />
                  <Button type="button" onClick={addResponsibility} variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.watch('responsibilities').map((resp, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {resp}
                      <X 
                        className="h-3 w-3 cursor-pointer hover:text-red-600"
                        onClick={() => removeResponsibility(index)}
                      />
                    </Badge>
                  ))}
                </div>
                {form.formState.errors.responsibilities && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.responsibilities.message}</p>
                )}
              </div>

              {/* Skills */}
              <div>
                <Label>Required Skills *</Label>
                <div className="flex space-x-2 mt-2">
                  <Input
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    placeholder="e.g., React, Node.js, Python"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                  />
                  <Button type="button" onClick={addSkill} variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.watch('skills').map((skill, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {skill}
                      <X 
                        className="h-3 w-3 cursor-pointer hover:text-red-600"
                        onClick={() => removeSkill(skill)}
                      />
                    </Badge>
                  ))}
                </div>
                {form.formState.errors.skills && (
                  <p className="text-red-500 text-sm mt-1">{form.formState.errors.skills.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Compensation & Benefits */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DollarSign className="h-5 w-5 mr-2 text-green-600" />
                Compensation & Benefits
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="salaryMin">Minimum Salary (USD)</Label>
                  <Input
                    id="salaryMin"
                    type="number"
                    {...form.register('salaryMin', { valueAsNumber: true })}
                    placeholder="e.g., 120000"
                  />
                </div>

                <div>
                  <Label htmlFor="salaryMax">Maximum Salary (USD)</Label>
                  <Input
                    id="salaryMax"
                    type="number"
                    {...form.register('salaryMax', { valueAsNumber: true })}
                    placeholder="e.g., 180000"
                  />
                </div>
              </div>

              {/* Benefits */}
              <div>
                <Label>Benefits</Label>
                <div className="flex space-x-2 mt-2">
                  <Input
                    value={benefitInput}
                    onChange={(e) => setBenefitInput(e.target.value)}
                    placeholder="e.g., Health insurance, 401k, Stock options"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addBenefit())}
                  />
                  <Button type="button" onClick={addBenefit} variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(form.watch('benefits') || []).map((benefit, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {benefit}
                      <X 
                        className="h-3 w-3 cursor-pointer hover:text-red-600"
                        onClick={() => removeBenefit(index)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Additional Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2 text-purple-600" />
                Additional Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label htmlFor="applicationInstructions">Application Instructions</Label>
                <Textarea
                  id="applicationInstructions"
                  {...form.register('applicationInstructions')}
                  placeholder="Special instructions for candidates on how to apply..."
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="applicationDeadline">Application Deadline</Label>
                <Input
                  id="applicationDeadline"
                  type="date"
                  {...form.register('applicationDeadline')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/recruiter/dashboard')}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={postJobMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {postJobMutation.isPending ? 'Posting...' : 'Post Job'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
/**
 * Onboarding flow — for users who just registered (or whose profile
 * is incomplete). Steps:
 *   1. Resume Quick-Fill (paste text, optional, auto-extracts profile)
 *   2. Job Preferences (target title, multi-select location, multi-select work mode)
 *   3. Visa Status (single select)
 *   4. Skills (chip input, pre-filled from resume parse if step 1 used)
 *   5. Done — go to swipe page
 *
 * Every step has a Skip button. Users can dive into the swipe page at
 * any time with whatever they've filled in.
 */

import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { SwipeHireLogo } from "@/components/SwipeHireLogo";
import { Briefcase, MapPin, FileText, Sparkles, X, Check, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type LocationOption = { id: string; label: string; isWildcard?: boolean };

const LOCATIONS: LocationOption[] = [
  { id: "Anywhere in US", label: "Anywhere in US", isWildcard: true },
  { id: "Remote", label: "Remote only", isWildcard: true },
  { id: "San Francisco, CA", label: "SF Bay Area" },
  { id: "New York, NY", label: "New York" },
  { id: "Los Angeles, CA", label: "Los Angeles" },
  { id: "Seattle, WA", label: "Seattle" },
  { id: "Austin, TX", label: "Austin" },
  { id: "Boston, MA", label: "Boston" },
  { id: "Chicago, IL", label: "Chicago" },
  { id: "Washington, DC", label: "Washington DC" },
  { id: "Denver, CO", label: "Denver" },
  { id: "Atlanta, GA", label: "Atlanta" },
];

const WORK_MODES: Array<{ id: 'remote' | 'hybrid' | 'onsite'; label: string; sub: string }> = [
  { id: 'remote', label: 'Remote', sub: 'Work from anywhere' },
  { id: 'hybrid', label: 'Hybrid', sub: 'Some days in office' },
  { id: 'onsite', label: 'On-site', sub: 'Full-time in office' },
];

const VISA_OPTIONS = [
  { value: 'us_citizen', title: 'U.S. Citizen', description: 'No sponsorship needed' },
  { value: 'green_card', title: 'Green Card / Permanent Resident', description: 'No sponsorship needed' },
  { value: 'h1b', title: 'H1B Visa', description: 'Currently sponsored, may need transfer' },
  { value: 'stem_opt', title: 'STEM-OPT', description: 'F-1 with STEM extension; will need H1B' },
  { value: 'opt', title: 'OPT (non-STEM)', description: 'F-1 with OPT; will need H1B' },
  { value: 'cpt', title: 'CPT (current student)', description: 'Currently studying' },
  { value: 'l1', title: 'L1 Visa', description: 'Intra-company transferee' },
  { value: 'e3', title: 'E-3 (Australia)', description: 'Australian specialty occupation' },
  { value: 'tn', title: 'TN (Canada/Mexico)', description: 'NAFTA/USMCA professional' },
  { value: 'h1b1', title: 'H1B1 (Chile/Singapore)', description: 'Treaty-based H1B' },
  { value: 'o1', title: 'O-1', description: 'Extraordinary ability' },
  { value: 'other', title: 'Other / not listed', description: 'L2 EAD, J-1, etc.' },
];

const SUGGESTED_SKILLS = [
  'Python', 'TypeScript', 'JavaScript', 'React', 'Node.js', 'Go',
  'SQL', 'PostgreSQL', 'AWS', 'Docker', 'Kubernetes',
  'Product Strategy', 'A/B Testing', 'SEO', 'Google Ads',
  'Figma', 'Tableau', 'Mixpanel',
];

const STEPS = [
  { title: "Resume", icon: Sparkles },
  { title: "Preferences", icon: Briefcase },
  { title: "Visa", icon: MapPin },
  { title: "Skills", icon: FileText },
];

export default function Onboarding() {
  const [currentStep, setCurrentStep] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: authResponse } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  const user = (authResponse as any)?.user;

  // Form state — pre-filled from existing user profile when known.
  const [resumeText, setResumeText] = useState('');
  const [targetJobTitle, setTargetJobTitle] = useState('');
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [customLocation, setCustomLocation] = useState('');
  const [selectedModes, setSelectedModes] = useState<Set<'remote' | 'hybrid' | 'onsite'>>(new Set());
  const [visaStatus, setVisaStatus] = useState<string>('');
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [experience, setExperience] = useState<string>('');
  const [expectedSalary, setExpectedSalary] = useState('');

  useEffect(() => {
    if (!user) return;
    if (user.targetJobTitle) setTargetJobTitle(user.targetJobTitle);
    if (user.preferredLocation) {
      const parts = user.preferredLocation.split(/[|;\n]+/).map((s: string) => s.trim()).filter(Boolean);
      const known = new Set(LOCATIONS.map(l => l.id));
      const matched = parts.filter((p: string) => known.has(p));
      if (matched.length) setSelectedLocations(new Set(matched));
      const custom = parts.find((p: string) => !known.has(p));
      if (custom) setCustomLocation(custom);
    }
    if (user.remotePreference) {
      const modes = user.remotePreference.split(/[,|;]+/).map((s: string) => s.trim());
      setSelectedModes(new Set(modes.filter((m: string) => ['remote','hybrid','onsite'].includes(m))) as Set<any>);
    }
    if (user.visaStatus) setVisaStatus(user.visaStatus);
    if (user.skills?.length) setSkills(user.skills);
    if (user.experience) setExperience(user.experience);
    if (user.expectedSalary) setExpectedSalary(user.expectedSalary);
  }, [user]);

  const applyParsed = (data: any) => {
    const ex = data.extracted;
    let applied: string[] = [];
    if (ex.skills?.length) {
      const merged = Array.from(new Set([...(skills ?? []), ...ex.skills])).slice(0, 50);
      setSkills(merged);
      applied.push(`${ex.skills.length} skills`);
    }
    if (ex.targetJobTitle && !targetJobTitle) {
      setTargetJobTitle(ex.targetJobTitle);
      applied.push('target title');
    }
    if (ex.experience && !experience) {
      setExperience(ex.experience);
      applied.push('experience level');
    }
    if (ex.detectedLocation) {
      const match = LOCATIONS.find(l => l.id === ex.detectedLocation || l.id.startsWith(ex.detectedLocation.split(',')[0]));
      if (match) {
        setSelectedLocations(prev => new Set([...Array.from(prev), match.id]));
        applied.push(`location: ${match.label}`);
      }
    }
    toast({
      title: applied.length ? '✨ Auto-filled from resume' : 'Resume processed',
      description: applied.length
        ? `Pre-filled ${applied.join(', ')}. Review on the next steps.`
        : 'No fields detected — fill them in manually below.',
    });
  };

  const parseResume = useMutation({
    mutationFn: async (text: string) => {
      const r = await apiRequest('POST', '/api/profile/parse-resume', { text });
      return r.json();
    },
    onSuccess: applyParsed,
    onError: () => {
      toast({ title: 'Could not parse', description: 'Skip this and fill in manually.', variant: 'destructive' });
    },
  });

  const parseResumeFile = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('resume', file);
      const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
      const r = await fetch(`${apiBase}/api/profile/parse-resume-file`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message ?? `Upload failed (${r.status})`);
      }
      return r.json();
    },
    onSuccess: applyParsed,
    onError: (err: any) => {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiRequest('PATCH', '/api/profile', data);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
    onError: (err: any) => {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    },
  });

  const finishOnboarding = useMutation({
    mutationFn: async () => {
      const preferredLocation = [
        ...Array.from(selectedLocations),
        ...(customLocation.trim() ? [customLocation.trim()] : []),
      ].join(' | ');
      const remotePreference = Array.from(selectedModes).join(',');
      const r = await apiRequest('PATCH', '/api/profile', {
        targetJobTitle: targetJobTitle.trim() || undefined,
        preferredLocation: preferredLocation || undefined,
        remotePreference: remotePreference || undefined,
        visaStatus: visaStatus || undefined,
        skills: skills.length ? skills : undefined,
        experience: experience || undefined,
        expectedSalary: expectedSalary.trim() || undefined,
        isProfileComplete: true,
      });
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({ title: 'Welcome to SwipeHire™!', description: 'Loading your matches...' });
      window.location.href = '/';
    },
  });

  const goNext = () => setCurrentStep(s => Math.min(s + 1, STEPS.length - 1));
  const goBack = () => setCurrentStep(s => Math.max(s - 1, 0));
  const skipAll = () => finishOnboarding.mutate();

  const toggleLocation = (id: string) => {
    setSelectedLocations(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMode = (mode: 'remote' | 'hybrid' | 'onsite') => {
    setSelectedModes(prev => {
      const next = new Set(prev);
      if (next.has(mode)) next.delete(mode);
      else next.add(mode);
      return next;
    });
  };

  const addSkill = (s: string) => {
    const t = s.trim();
    if (!t) return;
    if (!skills.includes(t)) setSkills([...skills, t]);
    setSkillInput('');
  };
  const removeSkill = (s: string) => setSkills(skills.filter(x => x !== s));

  const progress = ((currentStep + 1) / STEPS.length) * 100;
  const stepValid = useMemo(() => {
    if (currentStep === 0) return true;             // Resume step is always skippable
    if (currentStep === 1) return targetJobTitle.trim().length > 0;
    if (currentStep === 2) return visaStatus.length > 0;
    if (currentStep === 3) return true;             // Skills optional
    return true;
  }, [currentStep, targetJobTitle, visaStatus]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5 flex flex-col">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <SwipeHireLogo size="md" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-brand-gray hidden sm:inline">{currentStep + 1} of {STEPS.length}</span>
            <Button variant="ghost" size="sm" onClick={skipAll} disabled={finishOnboarding.isPending}>
              Skip setup
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white px-4 py-3 border-b border-gray-100">
        <div className="max-w-2xl mx-auto">
          <Progress value={progress} className="h-2" />
          <div className="grid grid-cols-4 gap-2 mt-2">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const active = i === currentStep;
              const done = i < currentStep;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentStep(i)}
                  className={`flex flex-col items-center text-xs ${
                    active ? 'text-primary font-semibold' : done ? 'text-primary' : 'text-gray-400'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center mb-1 ${
                    active ? 'bg-primary text-white' : done ? 'bg-primary/20 text-primary' : 'bg-gray-100'
                  }`}>
                    {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  </div>
                  <span className="hidden sm:inline">{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 py-6">
        <div className="max-w-2xl mx-auto">

          {/* === Step 0: Resume Quick-Fill === */}
          {currentStep === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Auto-fill from your resume
                </CardTitle>
                <p className="text-sm text-gray-600 mt-1">
                  Paste your resume below — we'll extract your skills, experience level, location, and target role.
                  You can review and edit on the next steps. Or skip and fill manually.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* File upload (PDF / DOCX / TXT) */}
                <div>
                  <label
                    htmlFor="resume-file"
                    className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <Upload className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-700">
                      <span className="font-medium text-primary">Upload resume</span>
                      {' '}— PDF, DOCX, or TXT (10 MB max)
                    </span>
                  </label>
                  <input
                    id="resume-file"
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) parseResumeFile.mutate(file);
                    }}
                  />
                  {parseResumeFile.isPending && (
                    <p className="text-xs text-gray-500 mt-2 text-center">Extracting text from file…</p>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-200" />
                  </div>
                  <span className="relative flex justify-center text-xs uppercase tracking-wide bg-white px-3 text-gray-400 mx-auto w-fit">
                    Or paste
                  </span>
                </div>

                <Textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste resume text (or copy from LinkedIn, Word doc)..."
                  className="min-h-[200px] font-mono text-xs"
                />
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                  <Button variant="outline" className="sm:flex-1" onClick={goNext}>
                    Skip — I'll fill it in manually
                  </Button>
                  <Button
                    className="sm:flex-1"
                    onClick={() => parseResume.mutate(resumeText)}
                    disabled={resumeText.trim().length < 50 || parseResume.isPending}
                  >
                    {parseResume.isPending ? 'Parsing...' : '✨ Auto-fill from text'}
                  </Button>
                </div>
                {(parseResume.isSuccess || parseResumeFile.isSuccess) && (
                  <Button className="w-full" onClick={goNext}>Continue →</Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* === Step 1: Job Preferences === */}
          {currentStep === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Job preferences</CardTitle>
                <p className="text-sm text-gray-600">Pick all locations and work modes you'd consider.</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="title">Target job title <span className="text-red-500">*</span></Label>
                  <Input
                    id="title"
                    placeholder="e.g., Software Engineer, Product Manager, Data Scientist"
                    value={targetJobTitle}
                    onChange={(e) => setTargetJobTitle(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Locations you'd consider <span className="text-gray-400 font-normal">(pick any)</span></Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {LOCATIONS.map(loc => {
                      const selected = selectedLocations.has(loc.id);
                      return (
                        <button
                          key={loc.id}
                          type="button"
                          onClick={() => toggleLocation(loc.id)}
                          className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                            selected
                              ? 'bg-primary text-white border-primary'
                              : 'bg-white text-gray-700 border-gray-300 hover:border-primary'
                          } ${loc.isWildcard ? 'font-medium' : ''}`}
                        >
                          {selected && <Check className="inline w-3.5 h-3.5 mr-1" />}
                          {loc.label}
                        </button>
                      );
                    })}
                  </div>
                  <Input
                    placeholder="Or enter another city: e.g., Portland, OR"
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    className="mt-3"
                  />
                </div>

                <div>
                  <Label>Work mode <span className="text-gray-400 font-normal">(pick any combination)</span></Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                    {WORK_MODES.map(m => {
                      const selected = selectedModes.has(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleMode(m.id)}
                          className={`p-3 rounded-lg border text-left transition-colors ${
                            selected
                              ? 'bg-primary/5 border-primary ring-1 ring-primary'
                              : 'bg-white border-gray-300 hover:border-primary'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`font-medium ${selected ? 'text-primary' : 'text-gray-900'}`}>{m.label}</span>
                            {selected && <Check className="w-4 h-4 text-primary" />}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{m.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="exp">Experience level</Label>
                    <select
                      id="exp"
                      value={experience}
                      onChange={(e) => setExperience(e.target.value)}
                      className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select...</option>
                      <option value="intern">Intern</option>
                      <option value="entry">Entry / new grad</option>
                      <option value="junior">Junior (1-2 yrs)</option>
                      <option value="mid">Mid (3-5 yrs)</option>
                      <option value="senior">Senior (6+ yrs)</option>
                      <option value="staff">Staff (10+ yrs)</option>
                      <option value="principal">Principal / Lead</option>
                      <option value="director">Director / VP</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="salary">Expected salary <span className="text-gray-400 font-normal">(optional)</span></Label>
                    <Input
                      id="salary"
                      placeholder="e.g., $150k or $120k–$180k"
                      value={expectedSalary}
                      onChange={(e) => setExpectedSalary(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
                  <Button variant="outline" className="sm:flex-1" onClick={goBack}>Back</Button>
                  <Button className="sm:flex-1" onClick={goNext} disabled={!stepValid}>
                    Continue →
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* === Step 2: Visa === */}
          {currentStep === 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Visa status</CardTitle>
                <p className="text-sm text-gray-600">
                  Helps us surface employers with sponsorship history. Only your match — never shared with companies.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {VISA_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setVisaStatus(option.value)}
                    className={`w-full p-3 rounded-lg border text-left transition-colors ${
                      visaStatus === option.value
                        ? 'bg-primary/5 border-primary ring-1 ring-primary'
                        : 'bg-white border-gray-200 hover:border-primary'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={`font-medium ${visaStatus === option.value ? 'text-primary' : 'text-gray-900'}`}>
                          {option.title}
                        </div>
                        <div className="text-sm text-gray-500 mt-0.5">{option.description}</div>
                      </div>
                      {visaStatus === option.value && <Check className="w-5 h-5 text-primary mt-0.5 shrink-0" />}
                    </div>
                  </button>
                ))}
                <div className="flex flex-col-reverse sm:flex-row gap-2 pt-3">
                  <Button variant="outline" className="sm:flex-1" onClick={goBack}>Back</Button>
                  <Button className="sm:flex-1" onClick={goNext} disabled={!stepValid}>Continue →</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* === Step 3: Skills === */}
          {currentStep === 3 && (
            <Card>
              <CardHeader>
                <CardTitle>Skills</CardTitle>
                <p className="text-sm text-gray-600">
                  Add the tools and skills you've used. We use these to score job matches.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a skill and press Enter (e.g., Python)"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSkill(skillInput);
                      }
                    }}
                  />
                  <Button type="button" onClick={() => addSkill(skillInput)} disabled={!skillInput.trim()}>
                    Add
                  </Button>
                </div>

                {skills.length > 0 && (
                  <div>
                    <Label className="text-xs text-gray-500">Your skills ({skills.length})</Label>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {skills.map(s => (
                        <Badge key={s} variant="secondary" className="text-sm pl-3 pr-1.5 py-1">
                          {s}
                          <button type="button" onClick={() => removeSkill(s)} className="ml-1 hover:bg-gray-200 rounded p-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-xs text-gray-500">Suggested</Label>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {SUGGESTED_SKILLS.filter(s => !skills.includes(s)).slice(0, 12).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => addSkill(s)}
                        className="px-2.5 py-1 text-xs rounded-full bg-gray-100 text-gray-700 hover:bg-primary hover:text-white transition-colors"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
                  <Button variant="outline" className="sm:flex-1" onClick={goBack}>Back</Button>
                  <Button
                    className="sm:flex-1"
                    onClick={() => finishOnboarding.mutate()}
                    disabled={finishOnboarding.isPending}
                  >
                    {finishOnboarding.isPending ? 'Saving...' : 'Finish — show me jobs'}
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

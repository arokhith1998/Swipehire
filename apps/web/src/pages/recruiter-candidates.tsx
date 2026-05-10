import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Search, MapPin, Briefcase, Star, Plus, ArrowLeft, User, Globe, Award } from 'lucide-react';
import { useLocation } from 'wouter';

interface Candidate {
  id: number;
  firstName: string;
  lastName: string;
  location: string;
  jobTitle: string;
  experience: string;
  skills: string[];
  bio: string;
  visaStatus: string;
  profilePicture: string;
}

export default function RecruiterCandidates() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [searchFilters, setSearchFilters] = useState({
    skills: '',
    location: '',
    experience: '',
    visaStatus: ''
  });

  const { data: candidates, isLoading, refetch } = useQuery({
    queryKey: ['/api/recruiter/candidates/search', searchFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(searchFilters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      
      const response = await fetch(`/api/recruiter/candidates/search?${params}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch candidates');
      }
      
      return response.json();
    },
    enabled: false // Only fetch when search is triggered
  });

  const shortlistMutation = useMutation({
    mutationFn: async ({ candidateId, jobId, notes, rating }: { candidateId: number, jobId?: number, notes?: string, rating?: number }) => {
      const response = await fetch('/api/recruiter/shortlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          candidateId,
          jobId,
          notes,
          rating
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to shortlist candidate');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Candidate Shortlisted',
        description: 'Candidate has been added to your shortlist.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/recruiter/shortlists'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Shortlist',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleSearch = () => {
    refetch();
  };

  const handleShortlist = (candidateId: number) => {
    shortlistMutation.mutate({
      candidateId,
      notes: 'Found through candidate search',
      rating: 4
    });
  };

  const getVisaStatusColor = (status: string) => {
    switch (status) {
      case 'us_citizen': return 'bg-green-100 text-green-800';
      case 'green_card': return 'bg-blue-100 text-blue-800';
      case 'h1b': return 'bg-purple-100 text-purple-800';
      case 'opt': return 'bg-orange-100 text-orange-800';
      case 'f1': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getExperienceLabel = (experience: string) => {
    switch (experience) {
      case 'entry': return 'Entry Level';
      case 'junior': return 'Junior';
      case 'mid': return 'Mid Level';
      case 'senior': return 'Senior';
      case 'staff': return 'Staff';
      case 'principal': return 'Principal';
      case 'director': return 'Director';
      default: return experience;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
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
            <h1 className="text-3xl font-bold text-gray-900">Find Candidates</h1>
            <p className="text-gray-600 mt-2">Search and discover talented candidates for your open positions</p>
          </div>
        </div>

        {/* Search Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Search className="h-5 w-5 mr-2 text-teal-600" />
              Search Candidates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <Label htmlFor="skills">Skills</Label>
                <Input
                  id="skills"
                  placeholder="e.g., React, Python, Java"
                  value={searchFilters.skills}
                  onChange={(e) => setSearchFilters(prev => ({ ...prev, skills: e.target.value }))}
                />
              </div>

              <div>
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g., San Francisco, CA"
                  value={searchFilters.location}
                  onChange={(e) => setSearchFilters(prev => ({ ...prev, location: e.target.value }))}
                />
              </div>

              <div>
                <Label>Experience Level</Label>
                <Select
                  value={searchFilters.experience}
                  onValueChange={(value) => setSearchFilters(prev => ({ ...prev, experience: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any level</SelectItem>
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
                <Label>Visa Status</Label>
                <Select
                  value={searchFilters.visaStatus}
                  onValueChange={(value) => setSearchFilters(prev => ({ ...prev, visaStatus: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Any status</SelectItem>
                    <SelectItem value="us_citizen">US Citizen</SelectItem>
                    <SelectItem value="green_card">Green Card</SelectItem>
                    <SelectItem value="h1b">H1B</SelectItem>
                    <SelectItem value="opt">OPT</SelectItem>
                    <SelectItem value="f1">F1</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <Button onClick={handleSearch} className="bg-teal-600 hover:bg-teal-700">
              <Search className="h-4 w-4 mr-2" />
              Search Candidates
            </Button>
          </CardContent>
        </Card>

        {/* Search Results */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Searching candidates...</p>
          </div>
        ) : candidates?.candidates ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">
                {candidates.candidates.length} candidate{candidates.candidates.length !== 1 ? 's' : ''} found
              </h2>
            </div>

            {candidates.candidates.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No candidates found</h3>
                  <p className="text-gray-600 mb-4">Try adjusting your search criteria to find more candidates.</p>
                  <Button variant="outline" onClick={() => setSearchFilters({ skills: '', location: '', experience: '', visaStatus: '' })}>
                    Clear Filters
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {candidates.candidates.map((candidate: Candidate) => (
                  <Card key={candidate.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start space-x-4">
                        <div className="flex-shrink-0">
                          {candidate.profilePicture ? (
                            <img
                              src={candidate.profilePicture}
                              alt={`${candidate.firstName} ${candidate.lastName}`}
                              className="w-16 h-16 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center">
                              <User className="h-8 w-8 text-teal-600" />
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              {candidate.firstName} {candidate.lastName}
                            </h3>
                            <Badge className={getVisaStatusColor(candidate.visaStatus)}>
                              {candidate.visaStatus?.replace('_', ' ').toUpperCase()}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2 mb-4">
                            <div className="flex items-center text-sm text-gray-600">
                              <Briefcase className="h-4 w-4 mr-2" />
                              {candidate.jobTitle} • {getExperienceLabel(candidate.experience)}
                            </div>
                            
                            {candidate.location && (
                              <div className="flex items-center text-sm text-gray-600">
                                <MapPin className="h-4 w-4 mr-2" />
                                {candidate.location}
                              </div>
                            )}
                          </div>
                          
                          {candidate.bio && (
                            <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                              {candidate.bio}
                            </p>
                          )}
                          
                          {candidate.skills && candidate.skills.length > 0 && (
                            <div className="mb-4">
                              <div className="flex flex-wrap gap-1">
                                {candidate.skills.slice(0, 6).map((skill, index) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {skill}
                                  </Badge>
                                ))}
                                {candidate.skills.length > 6 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{candidate.skills.length - 6} more
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                          
                          <div className="flex justify-between items-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleShortlist(candidate.id)}
                              disabled={shortlistMutation.isPending}
                            >
                              <Star className="h-4 w-4 mr-1" />
                              Shortlist
                            </Button>
                            
                            <div className="flex space-x-2">
                              <Button variant="outline" size="sm">
                                View Profile
                              </Button>
                              <Button size="sm" className="bg-teal-600 hover:bg-teal-700">
                                Contact
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Start searching for candidates</h3>
              <p className="text-gray-600">Use the search filters above to find qualified candidates for your positions.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
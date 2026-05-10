import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { Plus, Briefcase, Users, FileText, TrendingUp } from 'lucide-react';

interface RecruiterJob {
  id: number;
  title: string;
  companyId: number;
  location: string;
  status: string;
  applicationCount: number;
  viewCount: number;
  createdAt: string;
  sponsorsVisa: boolean;
}

interface RecruiterStats {
  totalJobs: number;
  activeJobs: number;
  totalApplications: number;
  pendingApplications: number;
}

export default function RecruiterDashboard() {
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['/api/recruiter/jobs'],
  });

  const { data: shortlists, isLoading: shortlistsLoading } = useQuery({
    queryKey: ['/api/recruiter/shortlists'],
  });

  const recruiterJobs = jobs?.jobs || [];
  const candidateShortlists = shortlists?.shortlists || [];

  const stats: RecruiterStats = {
    totalJobs: recruiterJobs.length,
    activeJobs: recruiterJobs.filter((job: RecruiterJob) => job.status === 'active').length,
    totalApplications: recruiterJobs.reduce((sum: number, job: RecruiterJob) => sum + job.applicationCount, 0),
    pendingApplications: recruiterJobs.reduce((sum: number, job: RecruiterJob) => sum + job.applicationCount, 0), // Simplified
  };

  if (jobsLoading || shortlistsLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading recruiter dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Recruiter Dashboard</h1>
            <p className="text-gray-600 mt-2">Manage your job postings and candidate pipeline</p>
          </div>
          <div className="flex space-x-4">
            <Link href="/recruiter/jobs/new">
              <Button className="bg-teal-600 hover:bg-teal-700">
                <Plus className="h-4 w-4 mr-2" />
                Post New Job
              </Button>
            </Link>
            <Link href="/recruiter/candidates">
              <Button variant="outline">
                <Users className="h-4 w-4 mr-2" />
                Find Candidates
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
              <Briefcase className="h-4 w-4 text-teal-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-teal-600">{stats.activeJobs}</div>
              <p className="text-xs text-gray-500">of {stats.totalJobs} total</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
              <FileText className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.totalApplications}</div>
              <p className="text-xs text-gray-500">across all jobs</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Shortlisted</CardTitle>
              <Users className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{candidateShortlists.length}</div>
              <p className="text-xs text-gray-500">candidates</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <TrendingUp className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats.pendingApplications}</div>
              <p className="text-xs text-gray-500">applications</p>
            </CardContent>
          </Card>
        </div>

        {/* Job Listings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Active Jobs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Briefcase className="h-5 w-5 mr-2 text-teal-600" />
                Your Job Postings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recruiterJobs.length === 0 ? (
                  <div className="text-center py-8">
                    <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">No job postings yet</p>
                    <Link href="/recruiter/jobs/new">
                      <Button className="bg-teal-600 hover:bg-teal-700">
                        <Plus className="h-4 w-4 mr-2" />
                        Post Your First Job
                      </Button>
                    </Link>
                  </div>
                ) : (
                  recruiterJobs.map((job: RecruiterJob) => (
                    <div key={job.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold text-gray-900">{job.title}</h3>
                        <Badge variant={job.status === 'active' ? 'default' : 'secondary'}>
                          {job.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{job.location}</p>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>{job.applicationCount} applications</span>
                        <span>{job.viewCount} views</span>
                        {job.sponsorsVisa && (
                          <Badge variant="outline" className="text-green-600 border-green-200">
                            Visa Sponsor
                          </Badge>
                        )}
                      </div>
                      <div className="flex justify-between items-center mt-4">
                        <span className="text-xs text-gray-400">
                          Posted {new Date(job.createdAt).toLocaleDateString()}
                        </span>
                        <div className="flex space-x-2">
                          <Link href={`/recruiter/jobs/${job.id}`}>
                            <Button variant="outline" size="sm">View</Button>
                          </Link>
                          <Link href={`/recruiter/jobs/${job.id}/applications`}>
                            <Button variant="outline" size="sm">
                              Applications ({job.applicationCount})
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Shortlisted Candidates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-5 w-5 mr-2 text-orange-600" />
                Shortlisted Candidates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {candidateShortlists.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">No candidates shortlisted yet</p>
                    <Link href="/recruiter/candidates">
                      <Button variant="outline">
                        <Users className="h-4 w-4 mr-2" />
                        Find Candidates
                      </Button>
                    </Link>
                  </div>
                ) : (
                  candidateShortlists.slice(0, 5).map((shortlist: any) => (
                    <div key={shortlist.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
                          <Users className="h-5 w-5 text-teal-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">Candidate #{shortlist.candidateId}</h4>
                          <p className="text-sm text-gray-600">{shortlist.notes}</p>
                        </div>
                        <div className="flex space-x-2">
                          {shortlist.rating && (
                            <Badge variant="outline">
                              ⭐ {shortlist.rating}/5
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {candidateShortlists.length > 5 && (
                  <div className="text-center pt-4">
                    <Link href="/recruiter/shortlists">
                      <Button variant="outline" size="sm">
                        View All Shortlists
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
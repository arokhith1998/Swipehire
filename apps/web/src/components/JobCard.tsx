import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Building, Clock, Heart, Bookmark, X } from "lucide-react";

interface JobCardProps {
  job: any;
  isTop?: boolean;
  user: any;
  style?: React.CSSProperties;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onBookmark?: () => void;
}

export function JobCard({ 
  job, 
  isTop = false, 
  user, 
  style = {},
  onSwipeLeft,
  onSwipeRight,
  onBookmark,
}: JobCardProps) {
  const formatSalary = (min?: number, max?: number) => {
    if (!min && !max) return null;
    if (min && max) return `$${(min / 1000).toFixed(0)}K - $${(max / 1000).toFixed(0)}K`;
    if (min) return `$${(min / 1000).toFixed(0)}K+`;
    return `Up to $${(max! / 1000).toFixed(0)}K`;
  };

  const showVisaScore = user?.visaStatus && user.visaStatus !== 'citizen';

  return (
    <Card 
      className={`job-card absolute inset-0 shadow-lg border border-gray-200 ${
        isTop ? 'hover:scale-105 cursor-grab active:cursor-grabbing' : ''
      }`}
      style={style}
    >
      <CardContent className="p-6 h-full flex flex-col">
        {/* Job Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{job.title}</h3>
            <div className="flex items-center space-x-2 mb-2">
              <Building className="w-4 h-4 text-primary" />
              <p className="text-primary font-medium">{job.company}</p>
            </div>
            <div className="flex items-center space-x-3 text-sm text-gray-500">
              <div className="flex items-center space-x-1">
                <MapPin className="w-3 h-3" />
                <span>{job.location}</span>
              </div>
              {job.type && (
                <div className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span className="capitalize">{job.type}</span>
                </div>
              )}
            </div>
          </div>
          {isTop && onBookmark && (
            <Button variant="ghost" size="sm" onClick={onBookmark}>
              <Bookmark className="w-4 h-4 text-gray-400 hover:text-yellow-500" />
            </Button>
          )}
        </div>

        {/* Match Scores */}
        <div className="space-y-3 mb-6">
          {/* Match Score (for all users) */}
          <div className="bg-success/10 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-success">Match Score</span>
              <span className="text-lg font-bold text-success">{job.matchScore}%</span>
            </div>
            <div className="w-full bg-success/20 rounded-full h-2">
              <div 
                className="bg-success h-2 rounded-full transition-all duration-300" 
                style={{ width: `${job.matchScore}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-success/70 mt-1">
              <span>Skills Match</span>
              <span>Title Fit</span>
              <span>Location</span>
            </div>
          </div>

          {/* Visa Score (for visa holders only) */}
          {showVisaScore && job.visaScore && (
            <div className="bg-secondary/10 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-secondary">Visa Sponsorship Score</span>
                <span className="text-lg font-bold text-secondary">{job.visaScore}%</span>
              </div>
              <div className="w-full bg-secondary/20 rounded-full h-2">
                <div 
                  className="bg-secondary h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${job.visaScore}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-secondary/70 mt-1">
                <span>H1B History</span>
                <span>Recent Sponsors</span>
              </div>
            </div>
          )}
        </div>

        {/* Key Requirements */}
        {job.requirements && job.requirements.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Key Requirements</h4>
            <div className="flex flex-wrap gap-2">
              {job.requirements.slice(0, 4).map((req: string, index: number) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {req}
                </Badge>
              ))}
              {job.requirements.length > 4 && (
                <Badge variant="outline" className="text-xs">
                  +{job.requirements.length - 4} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Salary Range */}
        {(job.salaryMin || job.salaryMax) && (
          <div className="flex items-center justify-between text-sm mb-6">
            <span className="text-gray-500">Salary Range</span>
            <span className="font-semibold text-gray-900">
              {formatSalary(job.salaryMin, job.salaryMax)}
            </span>
          </div>
        )}

        {/* Remote/Visa badges */}
        <div className="flex flex-wrap gap-2 mb-6">
          {job.isRemote && (
            <Badge variant="outline" className="text-green-700 bg-green-50">
              Remote
            </Badge>
          )}
          {job.isHybrid && (
            <Badge variant="outline" className="text-blue-700 bg-blue-50">
              Hybrid
            </Badge>
          )}
          {job.sponsorsVisa && (
            <Badge variant="outline" className="text-purple-700 bg-purple-50">
              Visa Sponsor
            </Badge>
          )}
        </div>

        {/* Action Hint */}
        {isTop && (
          <div className="text-center text-xs text-gray-400 mt-auto">
            👈 Swipe left to skip • Swipe right to apply 👉
          </div>
        )}

        {/* Action Buttons (visible on desktop or when interacting) */}
        {isTop && (onSwipeLeft || onSwipeRight) && (
          <div className="flex items-center justify-center space-x-4 mt-4 md:hidden">
            <Button
              variant="outline"
              size="sm"
              className="w-12 h-12 rounded-full border-red-200 hover:bg-red-50"
              onClick={onSwipeLeft}
            >
              <X className="w-5 h-5 text-red-500" />
            </Button>
            <Button
              size="sm"
              className="w-12 h-12 rounded-full bg-success hover:bg-success/90"
              onClick={onSwipeRight}
            >
              <Heart className="w-5 h-5 text-white" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

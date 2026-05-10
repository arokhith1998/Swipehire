import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Undo, Edit, Send, Sparkles, Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ResumeTailoringModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: any;
  tailoredResume: any;
  onApply: (jobId: number) => void;
}

export function ResumeTailoringModal({
  isOpen,
  onClose,
  job,
  tailoredResume,
  onApply,
}: ResumeTailoringModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [useOriginal, setUseOriginal] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (tailoredResume?.content) {
      setEditedContent(tailoredResume.content);
    }
  }, [tailoredResume]);

  if (!job || !tailoredResume) return null;

  const handleApply = () => {
    onApply(job.id);
  };

  const handleUseOriginal = () => {
    setUseOriginal(true);
    onClose();
  };

  const handleEdit = () => {
    setIsEditing(!isEditing);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md mx-auto max-h-[90vh] flex flex-col p-0">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-gray-200">
          <DialogTitle className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <span>Tailor Resume</span>
          </DialogTitle>
        </DialogHeader>

        {/* Content */}
        <ScrollArea className="flex-1 px-6">
          <div className="space-y-4 py-4">
            {/* Job Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                Resume optimized for: {job.title} at {job.company}
              </h4>
              <p className="text-xs text-gray-600 mb-2">
                Your original template and content preserved - only condensed to 1 page and reordered for relevance
              </p>
              
              {tailoredResume.changes && tailoredResume.changes.length > 0 && (
                <div className="text-xs text-gray-600 space-y-2">
                  <p><strong>Key Changes:</strong></p>
                  <ul className="list-disc list-inside space-y-1">
                    {tailoredResume.changes.map((change: string, index: number) => (
                      <li key={index}>{change}</li>
                    ))}
                  </ul>
                </div>
              )}

              {tailoredResume.keywords && tailoredResume.keywords.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">Relevant Keywords Highlighted:</p>
                  <div className="flex flex-wrap gap-1">
                    {tailoredResume.keywords.map((keyword: string, index: number) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Resume Content */}
            <div className="border border-gray-200 rounded-lg p-4 bg-white">
              <div className="text-xs font-medium text-gray-700 mb-3">Resume Preview:</div>
              {isEditing ? (
                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="min-h-[200px] text-xs font-mono"
                  placeholder="Edit your tailored resume content..."
                />
              ) : (
                <div className="text-xs text-gray-800 space-y-2 whitespace-pre-wrap font-mono">
                  {tailoredResume.content || "Resume content will appear here..."}
                </div>
              )}
            </div>

            {tailoredResume.tailoringError && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  ⚠️ {tailoredResume.tailoringError}
                </p>
                <p className="text-xs text-yellow-700 mt-1">
                  You can still apply with your original resume or edit manually.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Job Link and Copy Section */}
        <div className="px-6 py-4 bg-blue-50 border-t border-blue-100">
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <ExternalLink className="w-4 h-4 text-blue-600 mt-1 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-900">Apply Directly</p>
                <p className="text-xs text-blue-700 truncate">
                  {job?.applyUrl || job?.externalUrl || job?.company + ' - Apply on company website'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const link = job?.applyUrl || job?.externalUrl || '';
                  if (link) {
                    navigator.clipboard.writeText(link);
                    toast({ title: "Job link copied!" });
                  }
                }}
                className="text-blue-600 border-blue-200 hover:bg-blue-100"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  const resumeContent = isEditing ? editedContent : tailoredResume.content;
                  navigator.clipboard.writeText(resumeContent);
                  toast({ title: "Resume copied to clipboard!" });
                }}
                className="flex-1 text-blue-600 border-blue-200 hover:bg-blue-100"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Resume & Apply
              </Button>
              {(job?.applyUrl || job?.externalUrl) && (
                <Button
                  onClick={() => {
                    const link = job?.applyUrl || job?.externalUrl;
                    if (link) window.open(link, '_blank');
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Job
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3 p-6 border-t border-gray-200">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleUseOriginal}
          >
            <Undo className="w-4 h-4 mr-2" />
            Use Original
          </Button>
          
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleEdit}
          >
            <Edit className="w-4 h-4 mr-2" />
            {isEditing ? "Preview" : "Edit"}
          </Button>
          
          <Button
            className="flex-1 bg-primary hover:bg-primary/90"
            onClick={handleApply}
          >
            <Send className="w-4 h-4 mr-2" />
            Track Application
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

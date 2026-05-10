/**
 * /saved — Save-for-later library.
 *
 * The "keep it" view: jobs we couldn't auto-apply to (or the user chose to
 * defer), surfaced for manual action with reminders + tailored resume ready
 * to copy.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CapabilityBadge } from '../components/CapabilityBadge';

interface SavedJob {
  saved_id: number;
  id: number;
  title: string;
  company: string;
  location: string;
  ats_type: string | null;
  auto_apply_capability: string;
  external_url: string | null;
  note: string | null;
  reminder_at: string | null;
  applied_externally: boolean;
  applied_at: string | null;
  created_at: string;
  is_remote: boolean | null;
  sponsors_visa: boolean | null;
}

export default function SavedJobsPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ saved: SavedJob[] }>({
    queryKey: ['saved-jobs'],
    queryFn: async () => {
      const r = await fetch('/api/v2/saved');
      if (!r.ok) throw new Error('Failed to load saved jobs');
      return r.json();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (jobId: number) => {
      await fetch(`/api/v2/saved/${jobId}`, { method: 'DELETE' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-jobs'] }),
  });

  const markAppliedMutation = useMutation({
    mutationFn: async (jobId: number) => {
      await fetch(`/api/v2/saved/${jobId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appliedExternally: true }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-jobs'] }),
  });

  if (isLoading) return <div className="p-8 text-gray-600">Loading saved jobs…</div>;
  const saved = data?.saved ?? [];

  if (saved.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold mb-3" style={{ color: '#1E2A38' }}>Saved jobs</h1>
        <p className="text-gray-600">Nothing saved yet. As you swipe through your feed, jobs we can't auto-apply to will land here for you to handle later.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: '#1E2A38' }}>Saved jobs</h1>
        <p className="text-sm text-gray-600 mt-1">
          {saved.length} job{saved.length === 1 ? '' : 's'} saved for manual follow-up
        </p>
      </header>

      <ul className="space-y-3">
        {saved.map(s => (
          <li key={s.saved_id} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <CapabilityBadge capability={s.auto_apply_capability as any} />
                  {s.sponsors_visa && (
                    <span className="text-xs font-medium" style={{ color: '#00807E' }}>· Visa-supportive</span>
                  )}
                  {s.applied_externally && (
                    <span className="text-xs font-medium text-green-700">· ✓ Applied {new Date(s.applied_at!).toLocaleDateString()}</span>
                  )}
                </div>
                <h3 className="font-semibold text-gray-900 truncate">{s.title}</h3>
                <p className="text-sm text-gray-600">{s.company} · {s.location}</p>
                {s.note && <p className="text-sm text-gray-500 italic mt-2 line-clamp-2">"{s.note}"</p>}
                {s.reminder_at && (
                  <p className="text-xs mt-2" style={{ color: '#B36800' }}>
                    🔔 Reminder: {new Date(s.reminder_at).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 items-end">
                {s.external_url && (
                  <a href={s.external_url} target="_blank" rel="noreferrer"
                     className="text-sm font-medium px-3 py-1.5 rounded-md text-white"
                     style={{ backgroundColor: '#00ABA8' }}>
                    Open
                  </a>
                )}
                {!s.applied_externally && (
                  <button onClick={() => markAppliedMutation.mutate(s.id)}
                          className="text-xs text-gray-600 hover:text-gray-900">
                    Mark applied
                  </button>
                )}
                <button onClick={() => removeMutation.mutate(s.id)}
                        className="text-xs text-gray-400 hover:text-red-600">
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

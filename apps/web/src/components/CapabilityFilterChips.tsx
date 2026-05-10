/**
 * Filter chips at the top of the swipe feed:
 *   [ All jobs ]  [ ✨ Apply-ready only ]  [ Sort: Apply-ready first ]
 *
 * "Apply-ready" = jobs we have a path for (tier1, tier2, or extension).
 * Excludes manual_only.
 */

interface Props {
  capability: 'all' | 'apply_ready';
  sort: 'best_match' | 'apply_ready_first' | 'newest';
  onCapabilityChange: (c: 'all' | 'apply_ready') => void;
  onSortChange: (s: 'best_match' | 'apply_ready_first' | 'newest') => void;
  applyReadyCount?: number;
  totalCount?: number;
}

export function CapabilityFilterChips(props: Props) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 overflow-x-auto">
      <button
        onClick={() => props.onCapabilityChange('all')}
        className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
          props.capability === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        All jobs {props.totalCount != null && <span className="opacity-60">· {props.totalCount}</span>}
      </button>

      <button
        onClick={() => props.onCapabilityChange('apply_ready')}
        className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
          props.capability === 'apply_ready' ? 'bg-teal-600 text-white' : 'bg-teal-50 text-teal-800 hover:bg-teal-100'
        }`}
        style={props.capability === 'apply_ready' ? { backgroundColor: '#00ABA8' } : undefined}
      >
        ✨ Apply-ready only {props.applyReadyCount != null && <span className="opacity-70">· {props.applyReadyCount}</span>}
      </button>

      <div className="ml-auto flex items-center gap-1 text-sm text-gray-600 whitespace-nowrap">
        <span>Sort:</span>
        <select
          value={props.sort}
          onChange={e => props.onSortChange(e.target.value as any)}
          className="bg-transparent border-none focus:outline-none font-medium text-gray-900 cursor-pointer"
        >
          <option value="best_match">Best match</option>
          <option value="apply_ready_first">Apply-ready first</option>
          <option value="newest">Newest</option>
        </select>
      </div>
    </div>
  );
}

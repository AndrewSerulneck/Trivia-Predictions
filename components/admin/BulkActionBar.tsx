"use client";

interface BulkActionBarProps {
  selectedCount: number;
  onDelete: () => void;
  onToggleEnable: () => void;
}

export function BulkActionBar({ selectedCount, onDelete, onToggleEnable }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="mb-4 p-2 bg-slate-800 rounded-md flex items-center justify-between">
      <p className="text-sm">{selectedCount} item(s) selected</p>
      <div className="space-x-2">
        <button
          onClick={onToggleEnable}
          className="px-3 py-1 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
        >
          Toggle Enable/Disable
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-1 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

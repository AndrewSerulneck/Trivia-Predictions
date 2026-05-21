"use client";

interface PaginationBarProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function PaginationBar({ currentPage, totalPages, onPageChange }: PaginationBarProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-center space-x-2">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-1 text-sm font-medium rounded-md text-white bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
      >
        Previous
      </button>
      <span className="text-sm">
        Page {currentPage} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-1 text-sm font-medium rounded-md text-white bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
      >
        Next
      </button>
    </div>
  );
}

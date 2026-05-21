import React from "react";

const LegacySectionPlaceholder = ({ sectionName }: { sectionName: string }) => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
    <p className="text-sm font-medium text-slate-700">The &quot;{sectionName}&quot; section has not been migrated yet.</p>
    <p className="mt-1 text-xs text-slate-500">This is a placeholder component.</p>
  </div>
);

export default LegacySectionPlaceholder;

import { PageShell } from "@/components/ui/PageShell";

export default function AdminPage() {
  return (
    <PageShell
      title="Admin"
      description="Venue controls, trivia management, and ad slot management."
    >
      <p className="text-sm text-slate-700">
        Stub page: admin tools for questions, users, and advertisements will be
        implemented here.
      </p>
    </PageShell>
  );
}

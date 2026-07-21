import { Helmet } from 'react-helmet-async';
import { useSearchParams } from 'react-router-dom';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { CompanySettings } from '@/components/settings/CompanySettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { DealSummarySettings } from '@/components/settings/DealSummarySettings';
import { TaskDefaultsSettings } from '@/components/settings/TaskDefaultsSettings';
import { useAuth } from '@/contexts/AuthContext';

type SectionId = 'profile' | 'security' | 'emails' | 'tasks';

const SECTIONS: Array<{
  id: SectionId;
  label: string;
  description: string;
  render: () => JSX.Element;
}> = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Your personal profile and company information.',
    render: () => (
      <>
        <ProfileSettings />
        <CompanySettings />
      </>
    ),
  },
  {
    id: 'security',
    label: 'Security',
    description: 'Password, active sessions, and recent login history.',
    render: () => <SecuritySettings />,
  },
  {
    id: 'emails',
    label: 'Email Summaries',
    description: 'Recurring deal-activity digests sent to your inbox.',
    render: () => <DealSummarySettings />,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'Defaults applied when you create tasks from AI suggestions.',
    render: () => <TaskDefaultsSettings />,
  },
];

export default function Account() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const is5thLine = user?.email?.endsWith('@5thline.co') ?? false;
  const visibleSections = SECTIONS.filter((s) => s.id !== 'tasks' || is5thLine);
  const requestedId = (searchParams.get('section') as SectionId) || 'profile';
  const active =
    visibleSections.find((s) => s.id === requestedId) ?? visibleSections[0];

  const setActive = (id: SectionId) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'profile') next.delete('section');
    else next.set('section', id);
    setSearchParams(next, { replace: true });
  };

  return (
    <>
      <Helmet>
        <title>Account - naitive</title>
        <meta name="description" content="Manage your account settings" />
      </Helmet>

      <div className="bg-transparent min-h-full">
        <main className="max-w-5xl mx-auto px-4 sm:px-8 pt-6 sm:pt-8 pb-12">
          {/* Pills */}
          <div className="mb-6 -mx-1 overflow-x-auto">
            <div className="flex items-center gap-1 px-1 pb-1">
              {visibleSections.map((s) => {
                const isActive = s.id === active.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActive(s.id)}
                    className={`whitespace-nowrap text-sm px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 border ${
                      isActive
                        ? 'bg-primary/15 text-foreground border-primary/30 font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border-transparent'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Body */}
          <div className="space-y-4">{active.render()}</div>
        </main>
      </div>
    </>
  );
}

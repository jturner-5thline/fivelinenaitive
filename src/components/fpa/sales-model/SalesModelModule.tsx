import { useSalesModelStore } from './useSalesModelStore';
import { SalesModelSidebar } from './SalesModelSidebar';
import { SalesModelTable } from './SalesModelTable';
import { SalesModelCharts } from './SalesModelCharts';
import { AddMemberModal } from './AddMemberModal';
import { Menu, BarChart3, X, Plus, Monitor, Maximize2, Minimize2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { REPS_DATA } from './salesModelData';

const BUILT_IN_TABS = ['TEAM', 'Teresa', 'Niki', 'Paz', 'Flor', 'EMPLOYEE2'];

export function SalesModelModule() {
  const store = useSalesModelStore();
  const {
    activeTab, viewMode, sidebarOpen, chartsOpen,
    activeYears, activeQuarters, customMembers,
    setActiveTab, setViewMode, toggleSidebar, toggleCharts,
    setAddMemberOpen, toggleYear, toggleQuarter, removeMember,
  } = store;

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Mobile guard
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 900;
  if (isMobile) {
    return (
      <div className="flex items-center justify-center p-12 text-center" style={{ color: '#94a3b8' }}>
        <div>
          <Monitor className="h-12 w-12 mx-auto mb-4" style={{ color: '#5eead4' }} />
          <div className="text-lg font-semibold mb-2" style={{ color: '#e2e8f0' }}>Desktop Recommended</div>
          <div className="text-sm">This financial model requires a wider screen for the best experience.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={isFullscreen ? 'fixed inset-0 z-50' : 'rounded-lg overflow-hidden border'} style={{
      height: isFullscreen ? '100vh' : 'calc(100vh - 180px)',
      background: '#0f1117',
      borderColor: isFullscreen ? 'transparent' : 'rgba(255,255,255,0.06)',
    }}>
      <AddMemberModal />

      {/* Top Bar */}
      <div className="flex items-center gap-2 px-3 h-12 border-b" style={{
        background: '#181b24', borderColor: 'rgba(255,255,255,0.06)',
      }}>
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md border transition-colors"
          style={{
            borderColor: sidebarOpen ? 'rgba(94,234,212,0.3)' : 'rgba(255,255,255,0.15)',
            background: sidebarOpen ? 'rgba(94,234,212,0.1)' : 'rgba(255,255,255,0.05)',
            color: sidebarOpen ? '#5eead4' : '#e2e8f0',
          }}
        >
          <Menu className="h-4.5 w-4.5" />
        </button>
        <span className="text-sm font-semibold" style={{ color: '#e2e8f0' }}>{activeTab}</span>
        <div className="flex-1" />

        {/* Monthly / Quarterly toggle */}
        <div className="flex rounded-md overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          {(['monthly', 'quarterly'] as const).map(m => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className="px-3 py-1 text-[11px] font-medium transition-colors"
              style={{
                background: viewMode === m ? 'rgba(94,234,212,0.15)' : 'transparent',
                color: viewMode === m ? '#5eead4' : '#64748b',
              }}
            >
              {m === 'monthly' ? 'Monthly' : 'Quarterly'}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleCharts}
          className="h-7 gap-1 text-[11px] border-white/10"
          style={{ color: chartsOpen ? '#5eead4' : '#94a3b8' }}
        >
          <BarChart3 className="h-3.5 w-3.5" /> Charts
        </Button>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 px-3 h-9 border-b overflow-x-auto" style={{
        background: '#13151c', borderColor: 'rgba(255,255,255,0.06)',
      }}>
        {allTabs.map(tab => (
          <div key={tab} className="flex items-center">
            <button
              onClick={() => setActiveTab(tab)}
              className="px-3 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap"
              style={{
                background: activeTab === tab ? 'rgba(94,234,212,0.12)' : 'transparent',
                color: activeTab === tab ? '#5eead4' : '#64748b',
                borderBottom: activeTab === tab ? '2px solid #5eead4' : '2px solid transparent',
              }}
            >
              {tab}
            </button>
            {customMembers.some(m => m.name === tab) && (
              <button
                onClick={(e) => { e.stopPropagation(); removeMember(tab); }}
                className="p-0.5 rounded hover:bg-white/10 ml-0.5"
              >
                <X className="h-3 w-3" style={{ color: '#f87171' }} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setAddMemberOpen(true)}
          className="p-1 rounded hover:bg-white/10"
        >
          <Plus className="h-3.5 w-3.5" style={{ color: '#5eead4' }} />
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 px-3 h-8 border-b" style={{
        background: '#13151c', borderColor: 'rgba(255,255,255,0.06)',
      }}>
        <span className="text-[10px] uppercase tracking-wider mr-1" style={{ color: '#64748b' }}>Year</span>
        {[2025, 2026, 2027].map(y => (
          <button
            key={y}
            onClick={() => toggleYear(y)}
            className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
            style={{
              background: activeYears.has(y) ? 'rgba(94,234,212,0.12)' : 'transparent',
              color: activeYears.has(y) ? '#5eead4' : '#64748b',
              border: `1px solid ${activeYears.has(y) ? 'rgba(94,234,212,0.2)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            {y}
          </button>
        ))}
        <div className="w-px h-4 mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
        <span className="text-[10px] uppercase tracking-wider mr-1" style={{ color: '#64748b' }}>Qtr</span>
        {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
          <button
            key={q}
            onClick={() => toggleQuarter(q)}
            className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
            style={{
              background: activeQuarters.has(q) ? 'rgba(94,234,212,0.12)' : 'transparent',
              color: activeQuarters.has(q) ? '#5eead4' : '#64748b',
              border: `1px solid ${activeQuarters.has(q) ? 'rgba(94,234,212,0.2)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex" style={{ height: 'calc(100% - 116px)' }}>
        <SalesModelSidebar />
        <SalesModelTable />
        <SalesModelCharts />
      </div>
    </div>
  );
}

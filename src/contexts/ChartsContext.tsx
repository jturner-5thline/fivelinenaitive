import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export type ChartType = 'bar' | 'line' | 'pie' | 'area';

export interface ChartConfig {
  id: string;
  title: string;
  type: ChartType;
  dataSource: string;
  color: string;
  createdAt: string;
}

interface ChartsContextType {
  charts: ChartConfig[];
  addChart: (chart: Omit<ChartConfig, 'id' | 'createdAt'>) => void;
  updateChart: (id: string, chart: Partial<Omit<ChartConfig, 'id' | 'createdAt'>>) => void;
  deleteChart: (id: string) => void;
  reorderCharts: (charts: ChartConfig[]) => void;
}

const ChartsContext = createContext<ChartsContextType | undefined>(undefined);

const defaultCharts: ChartConfig[] = [
  {
    id: 'chart-1',
    title: 'Deals by Stage',
    type: 'bar',
    dataSource: 'deals-by-stage',
    color: '#9333ea',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'chart-2',
    title: 'Monthly Deal Value',
    type: 'line',
    dataSource: 'monthly-value',
    color: '#3b82f6',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'chart-3',
    title: 'Deals by Status',
    type: 'pie',
    dataSource: 'deals-by-status',
    color: '#10b981',
    createdAt: new Date().toISOString(),
  },
];

export function ChartsProvider({ children }: { children: ReactNode }) {
  const [charts, setCharts] = useState<ChartConfig[]>(() => {
    const saved = localStorage.getItem('analytics-charts');
    return saved ? JSON.parse(saved) : defaultCharts;
  });

  useEffect(() => {
    localStorage.setItem('analytics-charts', JSON.stringify(charts));
  }, [charts]);

  const addChart = (chart: Omit<ChartConfig, 'id' | 'createdAt'>) => {
    const newChart: ChartConfig = {
      ...chart,
      id: `chart-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setCharts(prev => [...prev, newChart]);
  };

  const updateChart = (id: string, updates: Partial<Omit<ChartConfig, 'id' | 'createdAt'>>) => {
    setCharts(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const deleteChart = (id: string) => {
    setCharts(prev => prev.filter(c => c.id !== id));
  };

  const reorderCharts = (newCharts: ChartConfig[]) => {
    setCharts(newCharts);
  };

  return (
    <ChartsContext.Provider value={{ charts, addChart, updateChart, deleteChart, reorderCharts }}>
      {children}
    </ChartsContext.Provider>
  );
}

export function useCharts() {
  const context = useContext(ChartsContext);
  if (!context) {
    throw new Error('useCharts must be used within a ChartsProvider');
  }
  return context;
}

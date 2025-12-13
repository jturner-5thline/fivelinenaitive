import { createContext, useContext, useState, ReactNode } from 'react';
import { LENDERS as DEFAULT_LENDERS } from '@/types/deal';

interface LenderInfo {
  name: string;
  contact: {
    name: string;
    email: string;
    phone: string;
  };
  preferences: string[];
}

interface LendersContextType {
  lenders: LenderInfo[];
  addLender: (lender: LenderInfo) => void;
  updateLender: (name: string, lender: LenderInfo) => void;
  deleteLender: (name: string) => void;
  getLenderNames: () => string[];
  getLenderDetails: (name: string) => LenderInfo | undefined;
}

const LendersContext = createContext<LendersContextType | undefined>(undefined);

const DEFAULT_LENDER_DATA: LenderInfo[] = DEFAULT_LENDERS.map(name => ({
  name,
  contact: {
    name: '',
    email: '',
    phone: '',
  },
  preferences: [],
}));

// Pre-populate with existing data
const INITIAL_LENDERS: LenderInfo[] = [
  {
    name: 'Decathlon',
    contact: { name: 'Michael Thompson', email: 'mthompson@decathlon.com', phone: '(212) 555-0101' },
    preferences: ['$5M-$25M deals', 'SaaS & Technology', 'Revenue-based financing'],
  },
  {
    name: 'Eastward',
    contact: { name: 'Sarah Mitchell', email: 'smitchell@eastward.com', phone: '(617) 555-0102' },
    preferences: ['$3M-$15M deals', 'Technology', 'Venture debt'],
  },
  {
    name: 'TIMIA',
    contact: { name: 'David Chen', email: 'dchen@timia.com', phone: '(604) 555-0103' },
    preferences: ['$1M-$10M deals', 'B2B SaaS', 'Revenue-based financing'],
  },
  {
    name: 'SaaS Capital',
    contact: { name: 'Jennifer Lee', email: 'jlee@saascapital.com', phone: '(206) 555-0104' },
    preferences: ['$2M-$20M deals', 'B2B SaaS', 'MRR-based lending'],
  },
  {
    name: 'Trinity',
    contact: { name: 'Robert Garcia', email: 'rgarcia@trinity.com', phone: '(650) 555-0105' },
    preferences: ['$10M+ deals', 'Technology & Life Sciences', 'Growth capital'],
  },
  {
    name: 'LAGO',
    contact: { name: 'Amanda Wilson', email: 'awilson@lago.com', phone: '(415) 555-0106' },
    preferences: ['$5M-$30M deals', 'Technology', 'Asset-based lending'],
  },
  {
    name: 'Republic Business Credit',
    contact: { name: 'James Miller', email: 'jmiller@republic.com', phone: '(504) 555-0107' },
    preferences: ['$1M-$15M deals', 'Diversified Industries', 'Factoring & ABL'],
  },
  {
    name: 'SLR',
    contact: { name: 'Lisa Wong', email: 'lwong@slr.com', phone: '(212) 555-0108' },
    preferences: ['$10M-$50M deals', 'Healthcare & Technology', 'Senior debt'],
  },
  {
    name: 'Matterhorn',
    contact: { name: 'Chris Johnson', email: 'cjohnson@matterhorn.com', phone: '(303) 555-0109' },
    preferences: ['$5M-$25M deals', 'Technology', 'Venture debt'],
  },
  {
    name: 'Five Crowns',
    contact: { name: 'Emily Davis', email: 'edavis@fivecrowns.com', phone: '(312) 555-0110' },
    preferences: ['$3M-$20M deals', 'SaaS', 'Growth financing'],
  },
  {
    name: 'nFusion',
    contact: { name: 'Mark Taylor', email: 'mtaylor@nfusion.com', phone: '(512) 555-0111' },
    preferences: ['$2M-$15M deals', 'Technology', 'Revenue-based financing'],
  },
  {
    name: 'Advantage',
    contact: { name: 'Rachel Brown', email: 'rbrown@advantage.com', phone: '(404) 555-0112' },
    preferences: ['$5M-$30M deals', 'Diversified', 'Asset-based lending'],
  },
  {
    name: 'SG',
    contact: { name: 'Kevin Park', email: 'kpark@sg.com', phone: '(213) 555-0113' },
    preferences: ['$10M+ deals', 'Technology & Media', 'Senior secured debt'],
  },
];

export function LendersProvider({ children }: { children: ReactNode }) {
  const [lenders, setLenders] = useState<LenderInfo[]>(INITIAL_LENDERS);

  const addLender = (lender: LenderInfo) => {
    setLenders(prev => [...prev, lender]);
  };

  const updateLender = (name: string, updatedLender: LenderInfo) => {
    setLenders(prev => prev.map(l => l.name === name ? updatedLender : l));
  };

  const deleteLender = (name: string) => {
    setLenders(prev => prev.filter(l => l.name !== name));
  };

  const getLenderNames = () => lenders.map(l => l.name);

  const getLenderDetails = (name: string) => lenders.find(l => l.name === name);

  return (
    <LendersContext.Provider value={{ lenders, addLender, updateLender, deleteLender, getLenderNames, getLenderDetails }}>
      {children}
    </LendersContext.Provider>
  );
}

export function useLenders() {
  const context = useContext(LendersContext);
  if (!context) {
    throw new Error('useLenders must be used within a LendersProvider');
  }
  return context;
}

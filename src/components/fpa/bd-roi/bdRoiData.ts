// BD Budget Modelling & Reporting — All initial/hardcoded data

export const QUARTERS_12 = ['Q1-25','Q2-25','Q3-25','Q4-25','Q1-26','Q2-26','Q3-26','Q4-26','Q1-27','Q2-27','Q3-27','Q4-27'];
export const QUARTERS_16 = [...QUARTERS_12, 'Q1-28','Q2-28','Q3-28','Q4-28'];

export const COVER_META = {
  title: 'BD Budget Modelling & Reporting',
  lastUpdate: 'August 8, 2025',
  actualsThrough: 'Q1-2026',
  roiTarget: 5,
  cmBonusComp: 105000,
  quarterlyEligibility: 40000,
  annualEligibility: 65000,
};

export const INITIAL_REVENUE = {
  debt:    [0, 0, 0, 0, 203700, 583940, 680960, 862560, 875040, 900000, 911600, 994800],
  finServ: [85439.25, 88383.15, 102259.2, 101346.07, 104315.5, 131460, 131460, 131460, 387880, 453480, 524880, 616680],
  other:   [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

export const INITIAL_COSTS = {
  events:      [0, 0, 0, 0, 3200, 17175, 2175, 6500, 2840, 2840, 3600, 3600],
  te:          [0, 0, 0, 0, 0, 5700, 0, 3800, 1420, 1420, 1800, 1800],
  flights:     [0, 0, 0, 0, 1500, 8400, 1500, 5300, 0, 0, 0, 0],
  food:        [0, 0, 0, 0, 1150, 3150, 1500, 2500, 1420, 1420, 1800, 1800],
  otherTE:     [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  software:    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  other2:      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  other3:      [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  allOther:    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

export const INITIAL_HEADCOUNT = {
  debt:          [17000, 64456, 75875, 96529.28, 57801.38, 68251.38, 92251.38, 68251.38, 93251.38, 98926.38, 141176.38, 115176.38],
  finServ:       [6364.583333, 19093.75, 12729.167, 0, 0, 0, 0, 0, 0, 38187.5, 57281.25, 63645.833],
  chandlerTyler: [45500, 61500, 61500, 49500, 39375, 43125, 43125, 43125, 49593.75, 49593.75, 49593.75, 49593.75],
};

export const INITIAL_CM_BONUS = [0, 0, 0, 0, 10000, 10000, 10000, 75000, 15000, 15000, 15000, 95000];

export const INITIAL_DEALFLOW = {
  dobTotal:   [9, 12, 19, 15, 16, 22, 28, 32, 17, 20, 23, 26],
  dobPartner: [0, 0, 0, 0, 0, 2, 4, 6, 8, 10, 12, 14],
  dobBank:    [0, 0, 0, 0, 5, 6, 7, 8, 9, 10, 11, 12],
  dsTotal:    [9, 12, 19, 15, 16, 22, 28, 32, 3, 3, 5, 6],
  dsPartner:  [0, 0, 0, 0, 0, 0, 1, 1, 2, 2, 3, 4],
  dsBank:     [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2],
  dcTotal:    [9, 12, 19, 15, 16, 22, 28, 32, 2, 2, 2, 2],
  dcPartner:  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
  dcBank:     [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
};

export const INITIAL_FIN_PERF = {
  revGenerated:  [0, 0, 0, 0, 0, 10000, 10000, 210000, 210000, 210000, 220000, 220000],
  revPartner:    [0, 0, 0, 0, 0, 5000, 5000, 105000, 105000, 105000, 110000, 110000],
  revBank:       [0, 0, 0, 0, 0, 5000, 5000, 105000, 105000, 105000, 110000, 110000],
  profit:        [0, 0, 0, 0, -5500, -2700, 3500, 103500, 208240, 208240, 217390, 222390],
  profitPartner: [0, 0, 0, 0, -2500, -2500, 1500, 1500, 106990, 106990, 111140, 116140],
  profitBank:    [0, 0, 0, 0, -3000, -200, 2000, 102000, 101250, 101250, 106250, 106250],
};

export const INITIAL_PARTNER_ASSUMPTIONS = {
  newPartnersQ: 2, dobsQ: 1, signedConv: 0.3, closedConv: 0.6,
  signedLag: 1, closedLag: 2, revPerSigned: 5000, revPerClosed: 100000,
};

export const INITIAL_PARTNER_DATA = {
  partners: [0,0,0,0, 2,4,6,8, 10,12,14,16, 18,20,22,24],
  dob:      [0,0,0,0, 0,2,4,6, 8,10,12,14, 16,18,20,22],
  signed:   [0,0,0,0, 0,0,1,1, 2,2,3,4, 4,5,5,6],
  closed:   [0,0,0,0, 0,0,0,0, 1,1,1,1, 2,2,2,3],
  revenue:  [0,0,0,0, 0,0,5000,5000, 110000,110000,115000,120000, 220000,225000,225000,330000],
  expenses: [
    [0,0,0,0, 1500,1500,1500,1500, 1650,1650,1650,1650, 1650,1650,1650,1650],
    [0,0,0,0, 150,150,500,500, 170,170,550,550, 170,170,550,550],
    [0,0,0,0, 250,250,250,250, 280,280,280,280, 280,280,280,280],
    [0,0,0,0, 0,0,250,250, 250,250,280,280, 250,250,280,280],
    [0,0,0,0, 300,300,500,500, 330,330,550,550, 330,330,550,550],
    [0,0,0,0, 300,300,500,500, 330,330,550,550, 330,330,550,550],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
  ],
};

export const PARTNER_EXPENSE_LABELS = [
  'EXP 1 - Events', 'EXP 2 - F&E', 'EXP 3 - Software', 'EXP 4 - Marketing',
  'EXP 5 - Meals', 'EXP 6 - Gifts', 'EXP 7', 'EXP 8', 'EXP 9', 'EXP 10',
];

export const INITIAL_BANK_ASSUMPTIONS = {
  newContactsQ: 1, dobsQ: 1, signedConv: 0.15, closedConv: 0.6,
  signedLag: 1, closedLag: 2, revPerSigned: 5000, revPerClosed: 100000,
};

export const INITIAL_BANK_DATA = {
  contacts: [0,0,0,5, 6,7,8,9, 10,11,12,13],
  dob:      [0,0,0,0, 5,6,7,8, 9,10,11,12],
  signed:   [0,0,0,0, 0,1,1,1, 1,1,2,2],
  closed:   [0,0,0,0, 0,0,0,1, 1,1,1,1],
  revenue:  [0,0,0,0, 0,5000,5000,105000, 105000,105000,110000,110000],
  expenses: {
    travel: [0,0,0,0, 1500,2700,1500,1500, 1875,1875,1875,1875],
    events: [0,0,0,0, 500,1500,500,500, 625,625,625,625],
    meals:  [0,0,0,0, 1000,1000,1000,1000, 1250,1250,1250,1250],
  },
};

export interface BDEvent {
  quarter: string; txnDate: string; eventDate: string; category: string;
  name: string; entity: string; person: string; totalCost: number;
  travel: number; dinner: number; amtPaid: number; amtOutstanding: number;
}

export const INITIAL_EVENTS: BDEvent[] = [
  { quarter:'Q1-2026', txnDate:'2026-03-01', eventDate:'2026-03-15', category:'Ticket', name:'ACG GLCC (Indy)', entity:'FS', person:'Scott', totalCost:1200, travel:1200, dinner:750, amtPaid:1200, amtOutstanding:0 },
  { quarter:'Q1-2026', txnDate:'2026-02-01', eventDate:'2026-02-15', category:'Dinner', name:'Q1 Lender/Partner Dinner (BOS)', entity:'Debt/FS', person:'James & John', totalCost:4500, travel:0, dinner:0, amtPaid:4500, amtOutstanding:0 },
  { quarter:'Q2-2026', txnDate:'2026-04-01', eventDate:'2026-04-15', category:'Sponsorship', name:'Venture Debt Conference', entity:'Debt/FS', person:'James Niki', totalCost:5000, travel:5700, dinner:2000, amtPaid:5000, amtOutstanding:0 },
  { quarter:'Q2-2026', txnDate:'2026-05-01', eventDate:'2026-05-15', category:'Ticket', name:'Ohio X 2026', entity:'Debt/FS', person:'Scott', totalCost:0, travel:0, dinner:0, amtPaid:0, amtOutstanding:0 },
  { quarter:'Q2-2026', txnDate:'2026-05-08', eventDate:'2026-05-10', category:'Ticket', name:'Women of ACG SoCal', entity:'Debt/FS', person:'Niki', totalCost:175, travel:0, dinner:0, amtPaid:175, amtOutstanding:0 },
  { quarter:'Q2-2026', txnDate:'2026-06-05', eventDate:'2026-06-10', category:'Ticket', name:'DealMakers NYC', entity:'Debt/FS', person:'Chandler James Niki', totalCost:0, travel:0, dinner:0, amtPaid:0, amtOutstanding:0 },
  { quarter:'Q2-2026', txnDate:'2026-06-05', eventDate:'2026-06-10', category:'Dinner', name:'Q2 Lender/Partner Dinner (NYC)', entity:'Debt/FS', person:'James & Chandler', totalCost:4500, travel:0, dinner:0, amtPaid:4500, amtOutstanding:0 },
  { quarter:'Q3-2026', txnDate:'2026-09-15', eventDate:'2026-09-20', category:'Ticket', name:'ACG SoCal', entity:'Debt', person:'NAME Niki', totalCost:175, travel:0, dinner:0, amtPaid:175, amtOutstanding:0 },
  { quarter:'Q3-2026', txnDate:'2026-07-01', eventDate:'2026-07-10', category:'Dinner', name:'Q3 Lender/Partner Dinner (SF)', entity:'Debt', person:'Chandler & Niki', totalCost:4500, travel:0, dinner:0, amtPaid:4500, amtOutstanding:0 },
  { quarter:'Q4-2026', txnDate:'2026-10-15', eventDate:'2026-10-20', category:'Dinner', name:'Q4 Lender/Partner Dinner (CHI)', entity:'Debt', person:'James & Scott', totalCost:4500, travel:0, dinner:0, amtPaid:4500, amtOutstanding:0 },
  { quarter:'Q4-2026', txnDate:'2026-10-16', eventDate:'2026-10-20', category:'Ticket', name:'DealMakers Chicago', entity:'Debt/FS', person:'James Teresa', totalCost:0, travel:0, dinner:0, amtPaid:0, amtOutstanding:0 },
  { quarter:'Q4-2026', txnDate:'2026-10-25', eventDate:'2026-10-30', category:'', name:'Money 2020 Las Vegas', entity:'Debt', person:'James Niki', totalCost:0, travel:3800, dinner:1000, amtPaid:0, amtOutstanding:0 },
];

export const INITIAL_EVENT_BUDGET = {
  proposed: [12000, 40950, 19500, 22000],
  eventsBudget: [4500, 9675, 9175, 17400],
  eventsTarget: [7500, 7500, 7500, 7500],
  travelBudget: [0, 5700, 0, 3800],
  travelTarget: [0, 22200, 2000, 11500],
};

export interface AmexTransaction {
  date: string; description: string; amount: number; category: string;
}

export const INITIAL_AMEX: AmexTransaction[] = [
  { date:'2026-01-15', description:'Software Subscription', amount:250, category:'Software' },
  { date:'2026-02-01', description:'Travel - Flight BOS', amount:450, category:'Travel' },
  { date:'2026-02-15', description:'Dinner - Client Meeting', amount:180, category:'Meals' },
  { date:'2026-03-01', description:'Conference Registration', amount:1200, category:'Events' },
  { date:'2026-03-10', description:'Hotel - Conference', amount:800, category:'Travel' },
];

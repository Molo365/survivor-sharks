// NFL 2025 Regular Season — hardcoded sandbox schedule
// Format: [week, awayAbbr, homeAbbr, gameTimeUTC]

type RawGame = [number, string, string, string];

const RAW_GAMES: RawGame[] = [
  // ── Week 1 ────────────────────────────────────────────────────────────────
  [1,"LAR","KC","2025-09-05T00:20:00Z"],
  [1,"NYJ","BUF","2025-09-07T17:00:00Z"],
  [1,"CLE","BAL","2025-09-07T17:00:00Z"],
  [1,"IND","HOU","2025-09-07T17:00:00Z"],
  [1,"TEN","CIN","2025-09-07T17:00:00Z"],
  [1,"DEN","JAX","2025-09-07T17:00:00Z"],
  [1,"DAL","PHI","2025-09-07T17:00:00Z"],
  [1,"ATL","WAS","2025-09-07T17:00:00Z"],
  [1,"NO","TB","2025-09-07T17:00:00Z"],
  [1,"CAR","GB","2025-09-07T17:00:00Z"],
  [1,"PIT","MIA","2025-09-07T17:00:00Z"],
  [1,"SEA","DET","2025-09-07T20:25:00Z"],
  [1,"ARI","SF","2025-09-07T20:25:00Z"],
  [1,"NYG","MIN","2025-09-07T20:25:00Z"],
  [1,"LV","LAC","2025-09-08T00:20:00Z"],
  [1,"NE","CHI","2025-09-09T00:15:00Z"],
  // ── Week 2 ────────────────────────────────────────────────────────────────
  [2,"NE","NYJ","2025-09-12T00:20:00Z"],
  [2,"MIA","BUF","2025-09-14T17:00:00Z"],
  [2,"PIT","BAL","2025-09-14T17:00:00Z"],
  [2,"CIN","CLE","2025-09-14T17:00:00Z"],
  [2,"TEN","IND","2025-09-14T17:00:00Z"],
  [2,"DEN","HOU","2025-09-14T17:00:00Z"],
  [2,"JAX","WAS","2025-09-14T17:00:00Z"],
  [2,"ATL","DAL","2025-09-14T17:00:00Z"],
  [2,"CAR","NO","2025-09-14T17:00:00Z"],
  [2,"CHI","TB","2025-09-14T17:00:00Z"],
  [2,"GB","SEA","2025-09-14T17:00:00Z"],
  [2,"ARI","DET","2025-09-14T20:25:00Z"],
  [2,"NYG","SF","2025-09-14T20:25:00Z"],
  [2,"LAR","MIN","2025-09-14T20:25:00Z"],
  [2,"LV","KC","2025-09-15T00:20:00Z"],
  [2,"LAC","PHI","2025-09-16T00:15:00Z"],
  // ── Week 3 ────────────────────────────────────────────────────────────────
  [3,"MIN","LAC","2025-09-19T00:20:00Z"],
  [3,"BUF","MIA","2025-09-21T17:00:00Z"],
  [3,"NYJ","PIT","2025-09-21T17:00:00Z"],
  [3,"CIN","BAL","2025-09-21T17:00:00Z"],
  [3,"HOU","JAX","2025-09-21T17:00:00Z"],
  [3,"IND","DEN","2025-09-21T17:00:00Z"],
  [3,"PHI","SEA","2025-09-21T17:00:00Z"],
  [3,"NO","WAS","2025-09-21T17:00:00Z"],
  [3,"ATL","CAR","2025-09-21T17:00:00Z"],
  [3,"TB","GB","2025-09-21T17:00:00Z"],
  [3,"ARI","CHI","2025-09-21T17:00:00Z"],
  [3,"DET","NYG","2025-09-21T20:25:00Z"],
  [3,"LAR","SF","2025-09-21T20:25:00Z"],
  [3,"TEN","LV","2025-09-21T20:25:00Z"],
  [3,"DAL","NE","2025-09-22T00:20:00Z"],
  [3,"CLE","KC","2025-09-23T00:15:00Z"],
  // ── Week 4 ────────────────────────────────────────────────────────────────
  [4,"MIA","NE","2025-09-26T00:20:00Z"],
  [4,"NYJ","BAL","2025-09-28T17:00:00Z"],
  [4,"BUF","HOU","2025-09-28T17:00:00Z"],
  [4,"IND","JAX","2025-09-28T17:00:00Z"],
  [4,"CIN","TEN","2025-09-28T17:00:00Z"],
  [4,"CLE","PIT","2025-09-28T17:00:00Z"],
  [4,"DAL","CHI","2025-09-28T17:00:00Z"],
  [4,"PHI","WAS","2025-09-28T17:00:00Z"],
  [4,"GB","ATL","2025-09-28T17:00:00Z"],
  [4,"NO","DET","2025-09-28T17:00:00Z"],
  [4,"CAR","TB","2025-09-28T17:00:00Z"],
  [4,"MIN","LAR","2025-09-28T17:00:00Z"],
  [4,"ARI","SEA","2025-09-28T17:00:00Z"],
  [4,"NYG","SF","2025-09-28T20:25:00Z"],
  [4,"LAC","KC","2025-09-29T00:20:00Z"],
  [4,"LV","DEN","2025-09-30T00:15:00Z"],
  // ── Week 5 (BYE: MIA LV CHI DAL) ─────────────────────────────────────────
  [5,"CLE","BAL","2025-10-03T00:20:00Z"],
  [5,"NE","NYJ","2025-10-05T17:00:00Z"],
  [5,"BUF","PIT","2025-10-05T17:00:00Z"],
  [5,"HOU","IND","2025-10-05T17:00:00Z"],
  [5,"JAX","TEN","2025-10-05T17:00:00Z"],
  [5,"PHI","MIN","2025-10-05T17:00:00Z"],
  [5,"ATL","NO","2025-10-05T17:00:00Z"],
  [5,"GB","CAR","2025-10-05T17:00:00Z"],
  [5,"SF","ARI","2025-10-05T17:00:00Z"],
  [5,"NYG","WAS","2025-10-05T17:00:00Z"],
  [5,"DET","TB","2025-10-05T20:25:00Z"],
  [5,"LAR","SEA","2025-10-05T20:25:00Z"],
  [5,"DEN","LAC","2025-10-06T00:20:00Z"],
  [5,"KC","CIN","2025-10-07T00:15:00Z"],
  // ── Week 6 (BYE: NYJ IND GB ATL) ─────────────────────────────────────────
  [6,"KC","NO","2025-10-10T01:20:00Z"],
  [6,"MIA","NE","2025-10-12T18:00:00Z"],
  [6,"BUF","CLE","2025-10-12T18:00:00Z"],
  [6,"BAL","CIN","2025-10-12T18:00:00Z"],
  [6,"TEN","JAX","2025-10-12T18:00:00Z"],
  [6,"HOU","DEN","2025-10-12T18:00:00Z"],
  [6,"DAL","PHI","2025-10-12T18:00:00Z"],
  [6,"WAS","CHI","2025-10-12T18:00:00Z"],
  [6,"CAR","TB","2025-10-12T18:00:00Z"],
  [6,"MIN","LAR","2025-10-12T18:00:00Z"],
  [6,"DET","ARI","2025-10-12T21:25:00Z"],
  [6,"SEA","SF","2025-10-12T21:25:00Z"],
  [6,"PIT","LAC","2025-10-13T01:20:00Z"],
  [6,"NYG","LV","2025-10-14T01:15:00Z"],
  // ── Week 7 (BYE: NE TEN MIN CAR) ─────────────────────────────────────────
  [7,"LAC","DEN","2025-10-17T01:20:00Z"],
  [7,"NYJ","MIA","2025-10-19T18:00:00Z"],
  [7,"BUF","BAL","2025-10-19T18:00:00Z"],
  [7,"PIT","CIN","2025-10-19T18:00:00Z"],
  [7,"CLE","HOU","2025-10-19T18:00:00Z"],
  [7,"IND","JAX","2025-10-19T18:00:00Z"],
  [7,"DAL","WAS","2025-10-19T18:00:00Z"],
  [7,"ATL","PHI","2025-10-19T18:00:00Z"],
  [7,"NO","GB","2025-10-19T18:00:00Z"],
  [7,"TB","CHI","2025-10-19T18:00:00Z"],
  [7,"DET","LAR","2025-10-19T21:25:00Z"],
  [7,"ARI","SEA","2025-10-19T21:25:00Z"],
  [7,"SF","KC","2025-10-20T01:20:00Z"],
  [7,"NYG","LV","2025-10-21T01:15:00Z"],
  // ── Week 8 (BYE: DEN CLE NO NYG) ─────────────────────────────────────────
  [8,"GB","PHI","2025-10-24T01:20:00Z"],
  [8,"MIA","NE","2025-10-26T18:00:00Z"],
  [8,"NYJ","BUF","2025-10-26T18:00:00Z"],
  [8,"CIN","PIT","2025-10-26T18:00:00Z"],
  [8,"BAL","IND","2025-10-26T18:00:00Z"],
  [8,"HOU","JAX","2025-10-26T18:00:00Z"],
  [8,"TEN","KC","2025-10-26T18:00:00Z"],
  [8,"DAL","WAS","2025-10-26T18:00:00Z"],
  [8,"ATL","CHI","2025-10-26T18:00:00Z"],
  [8,"MIN","CAR","2025-10-26T18:00:00Z"],
  [8,"TB","LAR","2025-10-26T18:00:00Z"],
  [8,"ARI","DET","2025-10-26T21:25:00Z"],
  [8,"LV","LAC","2025-10-27T01:20:00Z"],
  [8,"SEA","SF","2025-10-28T01:15:00Z"],
  // ── Week 9 (BYE: LAC HOU TB PHI) ─────────────────────────────────────────
  [9,"DET","GB","2025-10-31T01:20:00Z"],
  [9,"NYJ","BUF","2025-11-02T18:00:00Z"],
  [9,"PIT","MIA","2025-11-02T18:00:00Z"],
  [9,"BAL","CLE","2025-11-02T18:00:00Z"],
  [9,"CIN","IND","2025-11-02T18:00:00Z"],
  [9,"JAX","TEN","2025-11-02T18:00:00Z"],
  [9,"KC","LV","2025-11-02T18:00:00Z"],
  [9,"DAL","WAS","2025-11-02T18:00:00Z"],
  [9,"ATL","NO","2025-11-02T18:00:00Z"],
  [9,"CAR","MIN","2025-11-02T18:00:00Z"],
  [9,"ARI","SEA","2025-11-02T21:25:00Z"],
  [9,"SF","LAR","2025-11-02T21:25:00Z"],
  [9,"DEN","NYG","2025-11-03T01:20:00Z"],
  [9,"NE","CHI","2025-11-04T01:15:00Z"],
  // ── Week 10 (BYE: BAL JAX DET WAS) ───────────────────────────────────────
  [10,"MIN","LAC","2025-11-07T01:20:00Z"],
  [10,"MIA","BUF","2025-11-09T18:00:00Z"],
  [10,"NE","NYJ","2025-11-09T18:00:00Z"],
  [10,"CIN","PIT","2025-11-09T18:00:00Z"],
  [10,"CLE","IND","2025-11-09T18:00:00Z"],
  [10,"HOU","TEN","2025-11-09T18:00:00Z"],
  [10,"KC","DEN","2025-11-09T18:00:00Z"],
  [10,"LV","PHI","2025-11-09T18:00:00Z"],
  [10,"DAL","CHI","2025-11-09T18:00:00Z"],
  [10,"ATL","CAR","2025-11-09T18:00:00Z"],
  [10,"NO","TB","2025-11-09T18:00:00Z"],
  [10,"ARI","LAR","2025-11-09T21:25:00Z"],
  [10,"GB","SEA","2025-11-10T01:20:00Z"],
  [10,"NYG","SF","2025-11-11T01:15:00Z"],
  // ── Week 11 (BYE: PIT CIN SF LAR) ────────────────────────────────────────
  [11,"PHI","DAL","2025-11-14T01:20:00Z"],
  [11,"BUF","MIA","2025-11-16T18:00:00Z"],
  [11,"NE","NYJ","2025-11-16T18:00:00Z"],
  [11,"BAL","CLE","2025-11-16T18:00:00Z"],
  [11,"HOU","IND","2025-11-16T18:00:00Z"],
  [11,"JAX","TEN","2025-11-16T18:00:00Z"],
  [11,"LV","DEN","2025-11-16T18:00:00Z"],
  [11,"NYG","WAS","2025-11-16T18:00:00Z"],
  [11,"MIN","CHI","2025-11-16T18:00:00Z"],
  [11,"ATL","NO","2025-11-16T18:00:00Z"],
  [11,"CAR","TB","2025-11-16T18:00:00Z"],
  [11,"ARI","DET","2025-11-16T21:25:00Z"],
  [11,"KC","LAC","2025-11-17T01:20:00Z"],
  [11,"SEA","GB","2025-11-18T01:15:00Z"],
  // ── Week 12 (BYE: BUF KC SEA ARI) ────────────────────────────────────────
  [12,"MIA","NYJ","2025-11-21T01:20:00Z"],
  [12,"NE","CLE","2025-11-23T18:00:00Z"],
  [12,"PIT","BAL","2025-11-23T18:00:00Z"],
  [12,"CIN","HOU","2025-11-23T18:00:00Z"],
  [12,"IND","TEN","2025-11-23T18:00:00Z"],
  [12,"LV","DEN","2025-11-23T18:00:00Z"],
  [12,"PHI","DAL","2025-11-23T18:00:00Z"],
  [12,"WAS","NYG","2025-11-23T18:00:00Z"],
  [12,"CHI","MIN","2025-11-23T18:00:00Z"],
  [12,"ATL","TB","2025-11-23T18:00:00Z"],
  [12,"NO","CAR","2025-11-23T18:00:00Z"],
  [12,"JAX","LAC","2025-11-23T21:25:00Z"],
  [12,"DET","GB","2025-11-24T01:20:00Z"],
  [12,"LAR","SF","2025-11-25T01:15:00Z"],
  // ── Week 13 (Thanksgiving + all byes done) ────────────────────────────────
  [13,"CHI","DET","2025-11-27T18:30:00Z"],
  [13,"NYG","DAL","2025-11-27T22:30:00Z"],
  [13,"KC","HOU","2025-11-28T01:20:00Z"],
  [13,"MIA","NYJ","2025-11-30T18:00:00Z"],
  [13,"BUF","NE","2025-11-30T18:00:00Z"],
  [13,"PIT","CIN","2025-11-30T18:00:00Z"],
  [13,"BAL","CLE","2025-11-30T18:00:00Z"],
  [13,"IND","JAX","2025-11-30T18:00:00Z"],
  [13,"TEN","DEN","2025-11-30T18:00:00Z"],
  [13,"LV","LAC","2025-11-30T18:00:00Z"],
  [13,"PHI","WAS","2025-11-30T18:00:00Z"],
  [13,"ATL","CAR","2025-11-30T18:00:00Z"],
  [13,"NO","TB","2025-11-30T18:00:00Z"],
  [13,"GB","MIN","2025-11-30T21:25:00Z"],
  [13,"SEA","SF","2025-11-30T21:25:00Z"],
  [13,"ARI","LAR","2025-12-01T01:20:00Z"],
  // ── Week 14 ───────────────────────────────────────────────────────────────
  [14,"MIN","GB","2025-12-05T01:20:00Z"],
  [14,"BUF","MIA","2025-12-07T18:00:00Z"],
  [14,"NYJ","NE","2025-12-07T18:00:00Z"],
  [14,"BAL","PIT","2025-12-07T18:00:00Z"],
  [14,"CLE","CIN","2025-12-07T18:00:00Z"],
  [14,"HOU","IND","2025-12-07T18:00:00Z"],
  [14,"JAX","TEN","2025-12-07T18:00:00Z"],
  [14,"KC","LV","2025-12-07T18:00:00Z"],
  [14,"DEN","LAC","2025-12-07T18:00:00Z"],
  [14,"DAL","NYG","2025-12-07T18:00:00Z"],
  [14,"PHI","ATL","2025-12-07T18:00:00Z"],
  [14,"WAS","NO","2025-12-07T18:00:00Z"],
  [14,"CHI","CAR","2025-12-07T18:00:00Z"],
  [14,"ARI","SF","2025-12-07T21:25:00Z"],
  [14,"TB","SEA","2025-12-08T01:20:00Z"],
  [14,"LAR","DET","2025-12-09T01:15:00Z"],
  // ── Week 15 ───────────────────────────────────────────────────────────────
  [15,"DAL","PHI","2025-12-12T01:20:00Z"],
  [15,"NYJ","BUF","2025-12-14T18:00:00Z"],
  [15,"NE","MIA","2025-12-14T18:00:00Z"],
  [15,"CIN","BAL","2025-12-14T18:00:00Z"],
  [15,"HOU","CLE","2025-12-14T18:00:00Z"],
  [15,"IND","JAX","2025-12-14T18:00:00Z"],
  [15,"TEN","KC","2025-12-14T18:00:00Z"],
  [15,"LAC","LV","2025-12-14T18:00:00Z"],
  [15,"WAS","NYG","2025-12-14T18:00:00Z"],
  [15,"ATL","NO","2025-12-14T18:00:00Z"],
  [15,"CHI","TB","2025-12-14T18:00:00Z"],
  [15,"CAR","MIN","2025-12-14T18:00:00Z"],
  [15,"DEN","PIT","2025-12-14T21:25:00Z"],
  [15,"ARI","LAR","2025-12-14T21:25:00Z"],
  [15,"SEA","DET","2025-12-15T01:20:00Z"],
  [15,"GB","SF","2025-12-16T01:15:00Z"],
  // ── Week 16 ───────────────────────────────────────────────────────────────
  [16,"SF","LAR","2025-12-21T01:00:00Z"],
  [16,"BUF","NYJ","2025-12-21T18:00:00Z"],
  [16,"MIA","NE","2025-12-21T18:00:00Z"],
  [16,"BAL","CIN","2025-12-21T18:00:00Z"],
  [16,"PIT","CLE","2025-12-21T18:00:00Z"],
  [16,"HOU","TEN","2025-12-21T18:00:00Z"],
  [16,"KC","IND","2025-12-21T18:00:00Z"],
  [16,"LV","DEN","2025-12-21T18:00:00Z"],
  [16,"NYG","PHI","2025-12-21T18:00:00Z"],
  [16,"WAS","ATL","2025-12-21T18:00:00Z"],
  [16,"GB","CHI","2025-12-21T18:00:00Z"],
  [16,"MIN","DET","2025-12-21T18:00:00Z"],
  [16,"NO","CAR","2025-12-21T18:00:00Z"],
  [16,"JAX","LAC","2025-12-21T21:25:00Z"],
  [16,"TB","SEA","2025-12-22T01:20:00Z"],
  [16,"ARI","DAL","2025-12-23T01:15:00Z"],
  // ── Week 17 (Christmas) ───────────────────────────────────────────────────
  [17,"PHI","DAL","2025-12-25T18:30:00Z"],
  [17,"MIN","SF","2025-12-25T22:30:00Z"],
  [17,"NYJ","NE","2025-12-28T18:00:00Z"],
  [17,"BUF","MIA","2025-12-28T18:00:00Z"],
  [17,"CIN","BAL","2025-12-28T18:00:00Z"],
  [17,"PIT","HOU","2025-12-28T18:00:00Z"],
  [17,"IND","TEN","2025-12-28T18:00:00Z"],
  [17,"LV","KC","2025-12-28T18:00:00Z"],
  [17,"LAC","DEN","2025-12-28T18:00:00Z"],
  [17,"WAS","NYG","2025-12-28T18:00:00Z"],
  [17,"ATL","CAR","2025-12-28T18:00:00Z"],
  [17,"NO","TB","2025-12-28T18:00:00Z"],
  [17,"CHI","GB","2025-12-28T21:25:00Z"],
  [17,"ARI","SEA","2025-12-28T21:25:00Z"],
  [17,"LAR","DET","2025-12-29T01:20:00Z"],
  [17,"CLE","JAX","2025-12-30T01:15:00Z"],
  // ── Week 18 (Final week — division rivalry games) ─────────────────────────
  [18,"NYJ","BUF","2026-01-04T18:00:00Z"],
  [18,"NE","MIA","2026-01-04T18:00:00Z"],
  [18,"CLE","BAL","2026-01-04T18:00:00Z"],
  [18,"CIN","PIT","2026-01-04T18:00:00Z"],
  [18,"IND","HOU","2026-01-04T18:00:00Z"],
  [18,"TEN","JAX","2026-01-04T18:00:00Z"],
  [18,"DEN","KC","2026-01-04T18:00:00Z"],
  [18,"LV","LAC","2026-01-04T18:00:00Z"],
  [18,"MIN","DET","2026-01-04T18:00:00Z"],
  [18,"GB","CHI","2026-01-04T18:00:00Z"],
  [18,"TB","ATL","2026-01-04T18:00:00Z"],
  [18,"NO","CAR","2026-01-04T18:00:00Z"],
  [18,"PHI","DAL","2026-01-04T21:25:00Z"],
  [18,"NYG","WAS","2026-01-04T21:25:00Z"],
  [18,"SEA","LAR","2026-01-05T01:20:00Z"],
  [18,"ARI","SF","2026-01-06T01:15:00Z"],
];

// ── Team info ──────────────────────────────────────────────────────────────────

interface NflTeamInfo {
  id: string;
  displayName: string;
}

export const NFL_TEAM_INFO: Record<string, NflTeamInfo> = {
  ARI: { id: "22",  displayName: "Arizona Cardinals"    },
  ATL: { id: "1",   displayName: "Atlanta Falcons"       },
  BAL: { id: "33",  displayName: "Baltimore Ravens"      },
  BUF: { id: "2",   displayName: "Buffalo Bills"         },
  CAR: { id: "29",  displayName: "Carolina Panthers"     },
  CHI: { id: "3",   displayName: "Chicago Bears"         },
  CIN: { id: "4",   displayName: "Cincinnati Bengals"    },
  CLE: { id: "5",   displayName: "Cleveland Browns"      },
  DAL: { id: "6",   displayName: "Dallas Cowboys"        },
  DEN: { id: "7",   displayName: "Denver Broncos"        },
  DET: { id: "8",   displayName: "Detroit Lions"         },
  GB:  { id: "9",   displayName: "Green Bay Packers"     },
  HOU: { id: "34",  displayName: "Houston Texans"        },
  IND: { id: "11",  displayName: "Indianapolis Colts"    },
  JAX: { id: "30",  displayName: "Jacksonville Jaguars"  },
  KC:  { id: "12",  displayName: "Kansas City Chiefs"    },
  LAC: { id: "24",  displayName: "Los Angeles Chargers"  },
  LAR: { id: "14",  displayName: "Los Angeles Rams"      },
  LV:  { id: "13",  displayName: "Las Vegas Raiders"     },
  MIA: { id: "15",  displayName: "Miami Dolphins"        },
  MIN: { id: "16",  displayName: "Minnesota Vikings"     },
  NE:  { id: "17",  displayName: "New England Patriots"  },
  NO:  { id: "18",  displayName: "New Orleans Saints"    },
  NYG: { id: "19",  displayName: "New York Giants"       },
  NYJ: { id: "20",  displayName: "New York Jets"         },
  PHI: { id: "21",  displayName: "Philadelphia Eagles"   },
  PIT: { id: "23",  displayName: "Pittsburgh Steelers"   },
  SEA: { id: "26",  displayName: "Seattle Seahawks"      },
  SF:  { id: "25",  displayName: "San Francisco 49ers"   },
  TB:  { id: "27",  displayName: "Tampa Bay Buccaneers"  },
  TEN: { id: "10",  displayName: "Tennessee Titans"      },
  WAS: { id: "28",  displayName: "Washington Commanders" },
};

// ── Public API ─────────────────────────────────────────────────────────────────

export interface SandboxGame {
  id: string;
  week: number;
  awayAbbr: string;
  awayTeamId: string;
  homeAbbr: string;
  homeTeamId: string;
  gameTime: string;
}

export function getSandboxGamesForWeek(week: number): SandboxGame[] {
  return RAW_GAMES
    .filter(g => g[0] === week)
    .map((g, i) => {
      const [w, awayAbbr, homeAbbr, gameTime] = g;
      const gameIndex = String(i + 1).padStart(2, "0");
      return {
        id: `sandbox-2025-w${w}-${gameIndex}`,
        week: w,
        awayAbbr,
        awayTeamId: NFL_TEAM_INFO[awayAbbr]?.id ?? awayAbbr,
        homeAbbr,
        homeTeamId: NFL_TEAM_INFO[homeAbbr]?.id ?? homeAbbr,
        gameTime,
      };
    });
}

const LOGO_BASE = "https://a.espncdn.com/i/teamlogos/nfl/500";

export function sandboxGameToPickEmShape(game: SandboxGame) {
  const away = NFL_TEAM_INFO[game.awayAbbr];
  const home = NFL_TEAM_INFO[game.homeAbbr];
  return {
    id: game.id,
    startTime: game.gameTime,
    status: "scheduled" as const,
    liveDetail: null as null,
    awayTeam: {
      id: game.awayTeamId,
      abbreviation: game.awayAbbr,
      name: away?.displayName ?? game.awayAbbr,
      logoUrl: `${LOGO_BASE}/${game.awayAbbr.toLowerCase()}.png`,
    },
    homeTeam: {
      id: game.homeTeamId,
      abbreviation: game.homeAbbr,
      name: home?.displayName ?? game.homeAbbr,
      logoUrl: `${LOGO_BASE}/${game.homeAbbr.toLowerCase()}.png`,
    },
    awayScore: null as null,
    homeScore: null as null,
  };
}

type ReplayRow = {
  gameId: string;
  homeTeam: string | null;
  awayTeam: string | null;
  homeScore: number | null;
  awayScore: number | null;
  gameStatus: string | null;
  replayKickoff: Date | null;
};

const REPLAY_STATUS_MAP: Record<string, "scheduled" | "in_progress" | "final"> = {
  scheduled: "scheduled",
  q1: "in_progress",
  q2: "in_progress",
  halftime: "in_progress",
  q3: "in_progress",
  q4: "in_progress",
  final: "final",
};

export function replayRowToPickEmShape(row: ReplayRow) {
  const homeAbbr = row.homeTeam ?? "";
  const awayAbbr = row.awayTeam ?? "";
  const home = NFL_TEAM_INFO[homeAbbr];
  const away = NFL_TEAM_INFO[awayAbbr];
  return {
    id: row.gameId,
    startTime: row.replayKickoff?.toISOString() ?? "",
    status: REPLAY_STATUS_MAP[row.gameStatus ?? "scheduled"] ?? ("scheduled" as const),
    liveDetail: (() => {
      const s = row.gameStatus;
      if (s === "q1") return "Q1";
      if (s === "q2") return "Q2";
      if (s === "halftime") return "HALF";
      if (s === "q3") return "Q3";
      if (s === "q4") return "Q4";
      return null;
    })(),
    awayTeam: {
      id: NFL_TEAM_INFO[awayAbbr]?.id ?? awayAbbr,
      abbreviation: awayAbbr,
      name: away?.displayName ?? awayAbbr,
      logoUrl: `${LOGO_BASE}/${awayAbbr.toLowerCase()}.png`,
    },
    homeTeam: {
      id: NFL_TEAM_INFO[homeAbbr]?.id ?? homeAbbr,
      abbreviation: homeAbbr,
      name: home?.displayName ?? homeAbbr,
      logoUrl: `${LOGO_BASE}/${homeAbbr.toLowerCase()}.png`,
    },
    awayScore: row.awayScore,
    homeScore: row.homeScore,
  };
}

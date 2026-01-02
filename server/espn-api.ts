interface EspnTeam {
  id: number;
  abbrev: string;
  name: string;
  totalPoints: number;
  record?: {
    wins: number;
    losses: number;
    ties: number;
  };
}

interface EspnMatchup {
  matchupPeriodId: number;
  home: {
    teamId: number;
    totalPoints: number;
  };
  away?: {
    teamId: number;
    totalPoints: number;
  };
}

interface EspnScoreData {
  teams: EspnTeam[];
  weeklyScores: Map<number, number>;
}

export async function fetchEspnScores(
  leagueId: string,
  seasonId: string,
  week: number,
  cookies?: { espnS2?: string; swid?: string }
): Promise<{ success: boolean; data?: EspnScoreData; error?: string }> {
  try {
    const baseUrl = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${seasonId}/segments/0/leagues/${leagueId}`;
    const url = `${baseUrl}?view=mTeam&view=mMatchupScore&scoringPeriodId=${week}`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    if (cookies?.espnS2 && cookies?.swid) {
      headers['Cookie'] = `espn_s2=${cookies.espnS2}; SWID=${cookies.swid}`;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'ESPN API authentication failed. Check your cookies for private leagues.' };
      }
      if (response.status === 404) {
        return { success: false, error: 'ESPN league not found. Check your League ID and Season.' };
      }
      return { success: false, error: `ESPN API error: ${response.status}` };
    }

    const data = await response.json();
    
    const teams: EspnTeam[] = (data.teams || []).map((team: any) => ({
      id: team.id,
      abbrev: team.abbrev,
      name: team.name || team.location + ' ' + team.nickname,
      totalPoints: team.points || 0,
      record: team.record?.overall ? {
        wins: team.record.overall.wins,
        losses: team.record.overall.losses,
        ties: team.record.overall.ties || 0
      } : undefined
    }));

    const weeklyScores = new Map<number, number>();
    
    const schedule = data.schedule || [];
    for (const matchup of schedule) {
      if (matchup.matchupPeriodId === week) {
        if (matchup.home) {
          weeklyScores.set(matchup.home.teamId, matchup.home.totalPoints || 0);
        }
        if (matchup.away) {
          weeklyScores.set(matchup.away.teamId, matchup.away.totalPoints || 0);
        }
      }
    }

    return {
      success: true,
      data: { teams, weeklyScores }
    };
  } catch (error) {
    console.error('ESPN API fetch error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch ESPN data' 
    };
  }
}

export async function fetchEspnTeams(
  leagueId: string,
  seasonId: string,
  cookies?: { espnS2?: string; swid?: string }
): Promise<{ success: boolean; teams?: EspnTeam[]; error?: string }> {
  try {
    const baseUrl = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${seasonId}/segments/0/leagues/${leagueId}`;
    const url = `${baseUrl}?view=mTeam`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    if (cookies?.espnS2 && cookies?.swid) {
      headers['Cookie'] = `espn_s2=${cookies.espnS2}; SWID=${cookies.swid}`;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'ESPN API authentication failed. Check your cookies for private leagues.' };
      }
      if (response.status === 404) {
        return { success: false, error: 'ESPN league not found. Check your League ID and Season.' };
      }
      return { success: false, error: `ESPN API error: ${response.status}` };
    }

    const data = await response.json();
    
    const teams: EspnTeam[] = (data.teams || []).map((team: any) => ({
      id: team.id,
      abbrev: team.abbrev,
      name: team.name || (team.location + ' ' + team.nickname).trim(),
      totalPoints: team.points || 0,
      record: team.record?.overall ? {
        wins: team.record.overall.wins,
        losses: team.record.overall.losses,
        ties: team.record.overall.ties || 0
      } : undefined
    }));

    return { success: true, teams };
  } catch (error) {
    console.error('ESPN API fetch error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch ESPN teams' 
    };
  }
}

export interface EspnLeagueInfo {
  name: string;
  seasonId: number;
  teams: Array<{
    id: number;
    name: string;
    abbrev: string;
    ownerName?: string;
  }>;
}

export async function fetchEspnLeagueInfo(
  leagueId: string,
  seasonId: string,
  cookies?: { espnS2?: string; swid?: string }
): Promise<{ success: boolean; data?: EspnLeagueInfo; error?: string }> {
  try {
    const baseUrl = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${seasonId}/segments/0/leagues/${leagueId}`;
    const url = `${baseUrl}?view=mSettings&view=mTeam`;
    
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    
    if (cookies?.espnS2 && cookies?.swid) {
      headers['Cookie'] = `espn_s2=${cookies.espnS2}; SWID=${cookies.swid}`;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'ESPN API authentication failed. This may be a private league - you\'ll need to provide cookies.' };
      }
      if (response.status === 404) {
        return { success: false, error: 'ESPN league not found. Check your League ID.' };
      }
      return { success: false, error: `ESPN API error: ${response.status}` };
    }

    const data = await response.json();
    
    const leagueName = data.settings?.name || `ESPN League ${leagueId}`;
    
    const teams = (data.teams || []).map((team: any) => {
      const teamName = team.name || (team.location && team.nickname ? `${team.location} ${team.nickname}`.trim() : `Team ${team.id}`);
      return {
        id: team.id,
        name: teamName,
        abbrev: team.abbrev || '',
        ownerName: team.owners?.[0]?.displayName
      };
    });

    return {
      success: true,
      data: {
        name: leagueName,
        seasonId: data.seasonId || parseInt(seasonId),
        teams
      }
    };
  } catch (error) {
    console.error('ESPN API fetch error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch ESPN league info' 
    };
  }
}

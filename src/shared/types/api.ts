export type InitResponse = {
  type: 'init';
  postId: string;
  count: number;
};

export type IncrementResponse = {
  type: 'increment';
  postId: string;
  count: number;
};

export type DecrementResponse = {
  type: 'decrement';
  postId: string;
  count: number;
};

// Multiplayer Game Types
export interface Player {
  id: string;
  username: string;
  subreddit: string;
  position: { x: number; y: number };
  direction: number;
  color: number;
  isAlive: boolean;
  trailPoints: Array<{x: number, y: number}>;
  occupiedAreas: Array<{points: Array<{x: number, y: number}>, color: number}>;
  isInOwnTerritory: boolean;
  lastUpdate: number;
}

export interface GameState {
  gameId: string;
  players: Map<string, Player>;
  occupiedAreas: Array<{points: Array<{x: number, y: number}>, color: number, playerId: string}>;
  gameRadius: number;
  gameCenter: { x: number; y: number };
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
  lastUpdate: number;
}

export interface GameRoom {
  roomId: string;
  gameId: string;
  maxPlayers: number;
  currentPlayers: number;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
}

export interface PlayerUpdate {
  playerId: string;
  position: { x: number; y: number };
  direction: number;
  isInOwnTerritory: boolean;
  timestamp: number;
}

export interface TrailUpdate {
  playerId: string;
  trailPoints: Array<{x: number, y: number}>;
  timestamp: number;
}

export interface TerritoryClaim {
  playerId: string;
  occupiedArea: {points: Array<{x: number, y: number}>, color: number};
  timestamp: number;
}

export interface PlayerElimination {
  playerId: string;
  eliminatedBy: string;
  timestamp: number;
}

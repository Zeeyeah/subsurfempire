// COMMENTED OUT - COMPLEX MULTIPLAYER SYSTEM
// TODO: Rewrite with simpler approach for two-player connection

/*
import { connectRealtime } from '@devvit/web/client';
import { GameState, Player, PlayerUpdate, TrailUpdate, TerritoryClaim, PlayerElimination } from '../../shared/types/api';

export class MultiplayerManager {
  private realtimeConnection: any = null;
  private gameId: string = '';
  private playerId: string = '';
  private roomId: string = '';
  private gameState: GameState | null = null;
  private otherPlayers: Map<string, Player> = new Map();
  private lastUpdateTime: number = 0;
  private updateRate: number = 1000 / 20; // 20 FPS
  private pollingInterval: number | null = null;

  constructor() {
    this.connectToRealtime();
  }

  private async connectToRealtime() {
    try {
      this.realtimeConnection = await connectRealtime({
        channel: 'game',
        onMessage: (message: any) => {
          this.handleRealtimeMessage(message);
        },
        onConnect: (channel: string) => {
          console.log(`Connected to realtime channel: ${channel}`);
        },
        onDisconnect: (channel: string) => {
          console.log(`Disconnected from realtime channel: ${channel}`);
          // Attempt to reconnect after a delay
          setTimeout(() => {
            this.connectToRealtime();
          }, 5000);
        }
      });
      console.log('Connected to realtime service');
    } catch (error) {
      console.error('Failed to connect to realtime:', error);
      // Retry connection after a delay
      setTimeout(() => {
        this.connectToRealtime();
      }, 10000);
    }
  }

  async createGame(): Promise<{ roomId: string; gameId: string }> {
    try {
      const response = await fetch('/api/game/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to create game');
      }

      const data = await response.json();
      this.gameId = data.gameId;
      
      return { roomId: data.roomId, gameId: data.gameId };
    } catch (error) {
      console.error('Failed to create game:', error);
      throw error;
    }
  }
  private handleRealtimeMessage(message: any) {
    console.log('Received realtime message:', message);
    
    // Handle different message types
    if (message.type === 'gameStateUpdate') {
      this.handleGameStateUpdate(message.gameState);
    } else if (message.type === 'playerUpdate') {
      console.log(`Handling player update for: ${message.playerUpdate.playerId}`);
      this.handlePlayerUpdate(message.playerUpdate);
    } else if (message.type === 'trailUpdate') {
      console.log(`Handling trail update for: ${message.trailUpdate.playerId}`);
      this.handleTrailUpdate(message.trailUpdate);
    } else if (message.type === 'territoryClaim') {
      console.log(`Handling territory claim for: ${message.territoryClaim.playerId}`);
      this.handleTerritoryClaim(message.territoryClaim);
    } else if (message.type === 'playerElimination') {
      this.handlePlayerElimination(message.playerElimination);
    }
  }

  async joinGame(roomId: string, username: string, subreddit: string): Promise<{ playerId: string; gameState: GameState }> {
    try {
      const response = await fetch('/api/game/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, username, subreddit })
      });

      if (!response.ok) {
        throw new Error('Failed to join game');
      }

      const data = await response.json();
      this.playerId = data.playerId;
      this.gameState = data.gameState;
      this.gameId = data.gameState.gameId;
      this.roomId = roomId;
      
      // Start polling fallback if realtime is not working
      this.startPollingFallback();
      
      return { playerId: data.playerId, gameState: data.gameState };
    } catch (error) {
      console.error('Failed to join game:', error);
      throw error;
    }
  }

  async quickJoin(username: string, subreddit: string): Promise<{ playerId: string; gameState: GameState; roomId: string }> {
    try {
      const response = await fetch('/api/game/quick-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, subreddit })
      });

      if (!response.ok) {
        throw new Error('Failed to quick join game');
      }

      const data = await response.json();
      this.playerId = data.playerId;
      this.gameState = data.gameState;
      this.gameId = data.gameState.gameId;
      this.roomId = data.roomId;
      
      // Start polling fallback if realtime is not working
      this.startPollingFallback();
      
      return { playerId: data.playerId, gameState: data.gameState, roomId: data.roomId };
    } catch (error) {
      console.error('Failed to quick join game:', error);
      throw error;
    }
  }

  private handleGameStateUpdate(gameState: GameState) {
    console.log(`Handling game state update. Players: ${gameState.players.size}, My ID: ${this.playerId}`);
    this.gameState = gameState;
    // Convert players Map from object
    if (gameState.players && typeof gameState.players === 'object') {
      gameState.players = new Map(Object.entries(gameState.players));
    }
    
    // Update other players
    this.otherPlayers.clear();
    if (gameState.players) {
      for (const [playerId, player] of gameState.players) {
        if (playerId !== this.playerId) {
          this.otherPlayers.set(playerId, player);
          console.log(`Added player to otherPlayers: ${playerId} (${player.username})`);
        }
      }
    }
    console.log(`Total other players: ${this.otherPlayers.size}`);
  }

  private handlePlayerUpdate(playerUpdate: PlayerUpdate) {
    if (playerUpdate.playerId === this.playerId) return;
    
    let player = this.otherPlayers.get(playerUpdate.playerId);
    if (player) {
      // Update existing player
      player.position = playerUpdate.position;
      player.direction = playerUpdate.direction;
      player.isInOwnTerritory = playerUpdate.isInOwnTerritory;
      player.lastUpdate = playerUpdate.timestamp;
    } else {
      // Create new player if they don't exist
      // We need to get the full player data from the game state
      if (this.gameState && this.gameState.players.has(playerUpdate.playerId)) {
        const fullPlayer = this.gameState.players.get(playerUpdate.playerId)!;
        this.otherPlayers.set(playerUpdate.playerId, fullPlayer);
        console.log(`Added new player to otherPlayers: ${playerUpdate.playerId}`);
      }
    }
  }

  private handleTrailUpdate(trailUpdate: TrailUpdate) {
    if (trailUpdate.playerId === this.playerId) return;
    
    let player = this.otherPlayers.get(trailUpdate.playerId);
    if (player) {
      // Update existing player
      player.trailPoints = trailUpdate.trailPoints;
      player.lastUpdate = trailUpdate.timestamp;
    } else {
      // Create new player if they don't exist
      if (this.gameState && this.gameState.players.has(trailUpdate.playerId)) {
        const fullPlayer = this.gameState.players.get(trailUpdate.playerId)!;
        this.otherPlayers.set(trailUpdate.playerId, fullPlayer);
        console.log(`Added new player to otherPlayers from trail update: ${trailUpdate.playerId}`);
      }
    }
  }

  private handleTerritoryClaim(territoryClaim: TerritoryClaim) {
    if (territoryClaim.playerId === this.playerId) return;
    
    let player = this.otherPlayers.get(territoryClaim.playerId);
    if (player) {
      // Update existing player
      player.occupiedAreas.push(territoryClaim.occupiedArea);
      player.trailPoints = []; // Clear trail after claiming
      player.lastUpdate = territoryClaim.timestamp;
    } else {
      // Create new player if they don't exist
      if (this.gameState && this.gameState.players.has(territoryClaim.playerId)) {
        const fullPlayer = this.gameState.players.get(territoryClaim.playerId)!;
        this.otherPlayers.set(territoryClaim.playerId, fullPlayer);
        console.log(`Added new player to otherPlayers from territory claim: ${territoryClaim.playerId}`);
      }
    }
  }

  private handlePlayerElimination(playerElimination: PlayerElimination) {
    const player = this.otherPlayers.get(playerElimination.playerId);
    if (player) {
      player.isAlive = false;
    }
  }

  async updatePlayerPosition(position: { x: number; y: number }, direction: number, isInOwnTerritory: boolean) {
    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateRate) return;
    
    this.lastUpdateTime = now;

    try {
      await fetch('/api/game/update-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: this.gameId,
          playerId: this.playerId,
          position,
          direction,
          isInOwnTerritory
        })
      });
    } catch (error) {
      console.error('Failed to update player position:', error);
    }
  }

  async updateTrail(trailPoints: Array<{x: number, y: number}>) {
    try {
      await fetch('/api/game/update-trail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: this.gameId,
          playerId: this.playerId,
          trailPoints
        })
      });
    } catch (error) {
      console.error('Failed to update trail:', error);
    }
  }

  async claimTerritory(occupiedArea: {points: Array<{x: number, y: number}>, color: number}) {
    try {
      await fetch('/api/game/claim-territory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: this.gameId,
          playerId: this.playerId,
          occupiedArea
        })
      });
    } catch (error) {
      console.error('Failed to claim territory:', error);
    }
  }

  async leaveGame() {
    try {
      await fetch('/api/game/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: this.gameId,
          playerId: this.playerId,
          roomId: this.roomId
        })
      });

      if (this.realtimeConnection) {
        await this.realtimeConnection.disconnect();
      }
      
      // Stop polling fallback
      this.stopPollingFallback();
    } catch (error) {
      console.error('Failed to leave game:', error);
    }
  }

  private startPollingFallback() {
    // Poll for game state updates every 2 seconds as fallback
    this.pollingInterval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/game/state/${this.gameId}`);
        if (response.ok) {
          const gameState = await response.json();
          this.handleGameStateUpdate(gameState);
        }
      } catch (error) {
        console.warn('Polling fallback failed:', error);
      }
    }, 2000);
  }

  private stopPollingFallback() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  getOtherPlayers(): Map<string, Player> {
    return this.otherPlayers;
  }

  getGameState(): GameState | null {
    return this.gameState;
  }

  getPlayerId(): string {
    return this.playerId;
  }

  getGameId(): string {
    return this.gameId;
  }

  isConnected(): boolean {
    return this.realtimeConnection !== null;
  }
}
*/

// SIMPLE MULTIPLAYER MANAGER FOR TWO-PLAYER CONNECTION
export class MultiplayerManager {
  private gameId: string = '';
  private playerId: string = '';
  private gameState: any = null;
  private otherPlayers: Map<string, any> = new Map();
  private pollingInterval: number | null = null;
  private lastPositionUpdate: number = 0;
  private positionUpdateRate: number = 100; // Update position every 100ms (10 times per second)

  constructor() {
    console.log('Simple MultiplayerManager initialized');
  }

  async createGame(): Promise<{ gameId: string }> {
    try {
      const response = await fetch('/api/game/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to create game');
      }

      const data = await response.json();
      this.gameId = data.gameId;
      this.gameState = data.gameState;
      
      // Start polling for game state updates
      this.startPolling();
      
      return { gameId: data.gameId };
    } catch (error) {
      console.error('Failed to create game:', error);
      throw error;
    }
  }

  async joinGame(username: string, subreddit: string): Promise<{ playerId: string; gameState: any; gameId: string }> {
    try {
      // Ensure username is valid
      if (!username || typeof username !== 'string' || username.trim() === '') {
        username = 'u/player';
        console.warn('Invalid username, using default:', username);
      }

      const requestBody = { username, subreddit: subreddit || 'r/gaming' };
      console.log('Joining game with:', requestBody);

      const response = await fetch('/api/game/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Join game failed:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to join game');
      }

      const data = await response.json();
      this.playerId = data.playerId;
      this.gameState = data.gameState;
      this.gameId = data.gameId;
      
      // Start polling for game state updates
      this.startPolling();
      
      return { playerId: data.playerId, gameState: data.gameState, gameId: data.gameId };
    } catch (error) {
      console.error('Failed to join game:', error);
      throw error;
    }
  }

  async quickJoin(username: string, subreddit: string): Promise<{ playerId: string; gameState: any; gameId: string }> {
    // Quick join is the same as regular join (join endpoint handles creating games if none exist)
    return await this.joinGame(username, subreddit);
  }

  private startPolling() {
    // Poll for game state updates every 100ms (10 times per second) for smooth multiplayer
    // This matches the position update rate to minimize choppiness
    this.pollingInterval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/game/state/${this.gameId}`);
        if (response.ok) {
          const gameState = await response.json();
          this.handleGameStateUpdate(gameState);
        }
      } catch (error) {
        console.warn('Polling failed:', error);
      }
    }, 100);
  }

  private stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private handleGameStateUpdate(gameState: any) {
    this.gameState = gameState;
    
    // Only process if game state is valid and game is active
    if (!gameState || (gameState.status !== 'waiting' && gameState.status !== 'playing')) {
      console.log('⚠️ Invalid or inactive game state, clearing other players');
      this.otherPlayers.clear();
      return;
    }
    
    // Update other players - only include alive players who are actually in the game
    this.otherPlayers.clear();
    if (gameState.players) {
      const allPlayerIds = Object.keys(gameState.players);
      console.log('📊 Game state update - all players:', allPlayerIds);
      console.log('🎯 My player ID:', this.playerId);
      console.log('🎮 Game status:', gameState.status);
      
      for (const [playerId, player] of Object.entries(gameState.players)) {
        const playerData = player as any;
        
        // Skip self
        if (playerId === this.playerId) {
          console.log(`➖ Skipping self: ${playerId}`);
          continue;
        }
        
        // Only add alive players with valid position data
        if (playerData.isAlive !== false && playerData.position) {
          // Check if player data is recent (not stale)
          const playerAge = Date.now() - (playerData.lastUpdate || 0);
          const maxPlayerAge = 10000; // 10 seconds - if no update, consider player disconnected
          
          if (playerAge < maxPlayerAge) {
            console.log(`➕ Adding other player: ${playerId} (age: ${Math.round(playerAge)}ms)`, playerData);
            this.otherPlayers.set(playerId, playerData);
          } else {
            console.log(`⏸️ Skipping stale player: ${playerId} (age: ${Math.round(playerAge)}ms)`);
          }
        } else {
          console.log(`⏭️ Skipping dead/invalid player: ${playerId}`, playerData);
        }
      }
      
      console.log(`👥 Other players count: ${this.otherPlayers.size}`);
    } else {
      console.warn('⚠️ No players in game state');
    }
  }

  async updatePlayerPosition(position: { x: number; y: number }, direction: number, isInOwnTerritory: boolean) {
    // Throttle position updates to prevent ERR_INSUFFICIENT_RESOURCES
    const now = Date.now();
    if (now - this.lastPositionUpdate < this.positionUpdateRate) {
      return; // Skip this update, too soon since last one
    }
    
    this.lastPositionUpdate = now;
    
    try {
      await fetch('/api/game/update-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: this.gameId,
          playerId: this.playerId,
          position,
          direction,
          isInOwnTerritory
        })
      });
    } catch (error) {
      console.error('Failed to update player position:', error);
    }
  }

  async updateTrail(trailPoints: Array<{x: number, y: number}>) {
    try {
      await fetch('/api/game/update-trail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: this.gameId,
          playerId: this.playerId,
          trailPoints
        })
      });
    } catch (error) {
      console.error('Failed to update trail:', error);
    }
  }

  async claimTerritory(occupiedArea: {points: Array<{x: number, y: number}>, color: number}) {
    try {
      await fetch('/api/game/claim-territory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: this.gameId,
          playerId: this.playerId,
          occupiedArea
        })
      });
    } catch (error) {
      console.error('Failed to claim territory:', error);
    }
  }

  async leaveGame() {
    try {
      if (!this.gameId || !this.playerId) {
        console.warn('Cannot leave game: missing gameId or playerId');
        return;
      }

      console.log('Leaving game:', { gameId: this.gameId, playerId: this.playerId });

      const response = await fetch('/api/game/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: this.gameId,
          playerId: this.playerId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to leave game:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to leave game');
      }

      const result = await response.json();
      console.log('Successfully left game:', result);

      this.stopPolling();
      
      // Clear local state
      this.gameId = '';
      this.playerId = '';
      this.gameState = null;
      this.otherPlayers.clear();
    } catch (error) {
      console.error('Failed to leave game:', error);
      // Still stop polling even if leave request failed
      this.stopPolling();
    }
  }

  getOtherPlayers(): Map<string, any> {
    return this.otherPlayers;
  }

  getGameState(): any {
    return this.gameState;
  }

  getPlayerId(): string {
    return this.playerId;
  }

  getGameId(): string {
    return this.gameId;
  }

  isConnected(): boolean {
    return this.gameId !== '' && this.playerId !== '';
  }
}

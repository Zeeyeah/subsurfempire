
import { connectRealtime } from '@devvit/web/client';

// REALTIME MULTIPLAYER MANAGER FOR TWO-PLAYER CONNECTION
export class MultiplayerManager {
  private realtimeConnection: any = null;
  private gameId: string = '';
  private playerId: string = '';
  private gameState: any = null;
  private otherPlayers: Map<string, any> = new Map();
  private lastPositionUpdate: number = 0;
  private positionUpdateRate: number = 100; // Update position every 100ms (for Redis storage)
  private territoryClaimListeners: Array<(payload: any) => void> = [];

  constructor() {
    console.log('Realtime MultiplayerManager initialized');
    // Connect to realtime on initialization
    this.connectToRealtime();
  }

  private async connectToRealtime() {
    // Don't connect multiple times
    if (this.realtimeConnection) {
      console.log('⚠️ Realtime connection already exists, skipping...');
      return;
    }
    
    try {
      console.log('🔌 Connecting to realtime channel: game');
      this.realtimeConnection = await connectRealtime({
        channel: 'game',
        onMessage: (message: any) => {
          this.handleRealtimeMessage(message);
        },
        onConnect: (channel: string) => {
          console.log(`✅ Connected to realtime channel: ${channel}`);
        },
        onDisconnect: (channel: string) => {
          console.log(`❌ Disconnected from realtime channel: ${channel}`);
          // Clear the connection reference
          this.realtimeConnection = null;
          // Attempt to reconnect after a delay
          setTimeout(() => {
            if (this.gameId && this.playerId) {
              console.log('🔄 Reconnecting after disconnect...');
              this.connectToRealtime();
            }
          }, 2000);
        }
      });
      console.log('✅ Realtime connection established');
    } catch (error) {
      console.error('❌ Failed to connect to realtime:', error);
      this.realtimeConnection = null;
      // Retry connection after a delay if we're in a game
      if (this.gameId && this.playerId) {
        setTimeout(() => {
          this.connectToRealtime();
        }, 5000);
      }
    }
  }


  private handleRealtimeMessage(message: any) {
    // Handle different message types
    if (message.type === 'gameStateUpdate') {
      console.log('🔄 Handling gameStateUpdate, current playerId:', this.playerId);
      this.handleGameStateUpdate(message.gameState);
    } else if (message.type === 'playerUpdate') {
      this.handlePlayerUpdate(message.playerUpdate);
    } else if (message.type === 'trailUpdate') {
      this.handleTrailUpdate(message.trailUpdate);
    } else if (message.type === 'territoryClaim') {
      this.handleTerritoryClaim(message.territoryClaim);
    } else if (message.type === 'playerRemoved') {
      this.handlePlayerRemoved(message.playerId);
    }
  }

  private handlePlayerRemoved(playerId: string) {
    console.log(`🗑️ Player ${playerId} was removed from game`);
    // Remove player from other players map
    this.otherPlayers.delete(playerId);
    // Update game state to reflect removal
    if (this.gameState && this.gameState.players) {
      delete this.gameState.players[playerId];
    }
  }

  private handleGameStateUpdate(gameState: any) {
    // Verify this is for our game
    if (!gameState || (this.gameId && gameState.gameId !== this.gameId)) {
      console.log('⚠️ Ignoring gameStateUpdate - wrong game:', {
        receivedGameId: gameState?.gameId,
        myGameId: this.gameId
      });
      return;
    }
    
    console.log('🔄 Handling gameStateUpdate:', {
      gameId: gameState?.gameId,
      playerCount: gameState?.players ? Object.keys(gameState.players).length : 0,
      myPlayerId: this.playerId,
      playerIds: gameState?.players ? Object.keys(gameState.players) : []
    });
    
    // Update game ID if not set yet (shouldn't happen, but just in case)
    if (!this.gameId && gameState.gameId) {
      this.gameId = gameState.gameId;
    }
    
    // Update full game state and initialize other players
    this.gameState = gameState;
    this.initializeOtherPlayers(gameState);
  }

  private handlePlayerUpdate(playerUpdate: any) {
    if (playerUpdate.playerId === this.playerId) return;
    
    // This is a direction change update from realtime - use it as the base for prediction
    let player = this.otherPlayers.get(playerUpdate.playerId);
    if (player) {
      // Update with new direction and position (this is the authoritative source for prediction)
      player.position = playerUpdate.position;
      player.direction = playerUpdate.direction;
      player.isInOwnTerritory = playerUpdate.isInOwnTerritory;
      player.lastUpdate = playerUpdate.timestamp;
    } else {
      // Create new player entry if they don't exist
      if (this.gameState && this.gameState.players && this.gameState.players[playerUpdate.playerId]) {
        player = this.gameState.players[playerUpdate.playerId];
        // Update with latest position and direction
        player.position = playerUpdate.position;
        player.direction = playerUpdate.direction;
        player.isInOwnTerritory = playerUpdate.isInOwnTerritory;
        player.lastUpdate = playerUpdate.timestamp;
        this.otherPlayers.set(playerUpdate.playerId, player);
      }
      // If player doesn't exist in gameState, they'll be added on gameStateUpdate
    }
  }

  private handleTrailUpdate(trailUpdate: any) {
    if (trailUpdate.playerId === this.playerId) return;
    
    let player = this.otherPlayers.get(trailUpdate.playerId);
    if (player) {
      player.trailPoints = trailUpdate.trailPoints;
      player.lastUpdate = trailUpdate.timestamp;
    } else {
      // Create player entry if they don't exist (get from game state)
      if (this.gameState && this.gameState.players && this.gameState.players[trailUpdate.playerId]) {
        player = this.gameState.players[trailUpdate.playerId];
        player.trailPoints = trailUpdate.trailPoints;
        player.lastUpdate = trailUpdate.timestamp;
        this.otherPlayers.set(trailUpdate.playerId, player);
      }
    }
  }

  private handleTerritoryClaim(territoryClaim: any) {
    if (territoryClaim.playerId === this.playerId) return;
    
    let player = this.otherPlayers.get(territoryClaim.playerId);
    if (player) {
      player.occupiedAreas.push(territoryClaim.occupiedArea);
      player.trailPoints = []; // Clear trail after claiming
      player.lastUpdate = territoryClaim.timestamp;
    } else {
      // Create player entry if they don't exist (get from game state)
      if (this.gameState && this.gameState.players && this.gameState.players[territoryClaim.playerId]) {
        player = this.gameState.players[territoryClaim.playerId];
        player.occupiedAreas.push(territoryClaim.occupiedArea);
        player.trailPoints = [];
        player.lastUpdate = territoryClaim.timestamp;
        this.otherPlayers.set(territoryClaim.playerId, player);
      }
    }

    // Notify listeners so UI can update leaderboard
    this.territoryClaimListeners.forEach((cb) => {
      try { cb(territoryClaim); } catch {}
    });
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
      
      // Initialize other players from game state
      this.initializeOtherPlayers(data.gameState);
      
      return { gameId: data.gameId };
    } catch (error) {
      console.error('Failed to create game:', error);
      throw error;
    }
  }

  async joinGame(username: string, subreddit: string, initialPosition?: { x: number; y: number }, initialDirection?: number): Promise<{ playerId: string; gameState: any; gameId: string }> {
    try {
      // Ensure username is valid
      if (!username || typeof username !== 'string' || username.trim() === '') {
        username = 'u/player';
        console.warn('Invalid username, using default:', username);
      }

      const requestBody: any = { username, subreddit: subreddit || 'r/gaming' };
      
      // Send initial position and direction if provided (from client player state)
      if (initialPosition && initialDirection !== undefined) {
        requestBody.position = initialPosition;
        requestBody.direction = initialDirection;
        console.log('Joining game with initial position/direction:', { position: initialPosition, direction: initialDirection });
      }
      
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
      
      console.log('✅ Joined game:', {
        playerId: this.playerId,
        gameId: this.gameId,
        gameStatePlayers: data.gameState?.players ? Object.keys(data.gameState.players) : [],
        otherPlayersCount: data.gameState?.players ? Object.keys(data.gameState.players).length - 1 : 0
      });
      
      // Initialize other players from game state
      this.initializeOtherPlayers(data.gameState);
      
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

  private initializeOtherPlayers(gameState: any) {
    // Initialize other players from game state when joining
    const beforeCount = this.otherPlayers.size;
    this.otherPlayers.clear();
    
    if (!gameState || !gameState.players) {
      console.log('⚠️ No game state or players in gameState');
      return;
    }
    
    console.log('👥 Initializing other players from gameState:', {
      totalPlayers: Object.keys(gameState.players).length,
      myPlayerId: this.playerId || '(not set)',
      allPlayerIds: Object.keys(gameState.players)
    });
    
    // If playerId is not set yet, we can't filter self, so add all players
    // (This shouldn't happen normally, but handles edge cases)
    const shouldFilterSelf = !!this.playerId;
    
    for (const [playerId, player] of Object.entries(gameState.players)) {
      const playerData = player as any;
      
      // Skip self if playerId is set
      if (shouldFilterSelf && playerId === this.playerId) {
        console.log(`⏭️ Skipping self: ${playerId}`);
        continue;
      }
      
      // Only add alive players with valid position data
      if (playerData.isAlive !== false && playerData.position) {
        console.log(`➕ Adding other player: ${playerId} (${playerData.username || 'unknown'})`);
        this.otherPlayers.set(playerId, playerData);
      } else {
        console.log(`⚠️ Skipping player ${playerId}:`, {
          isAlive: playerData.isAlive,
          hasPosition: !!playerData.position,
          username: playerData.username
        });
      }
    }
    
    console.log(`📊 Other players: ${beforeCount} → ${this.otherPlayers.size}`);
  }

  async updatePlayerPosition(position: { x: number; y: number }, direction: number, isInOwnTerritory: boolean) {
    // Always update Redis (for polling) - throttle to prevent too many requests
    const now = Date.now();
    if (now - this.lastPositionUpdate < this.positionUpdateRate) {
      return; // Skip this update, too soon since last one
    }
    
    this.lastPositionUpdate = now;
    
    // Don't send updates if we don't have a game/player ID
    if (!this.gameId || !this.playerId) {
      return;
    }
    
    try {
      const response = await fetch('/api/game/update-player', {
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
      
      if (!response.ok) {
        console.warn(`⚠️ Position update failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to update player position:', error);
    }
  }

  async updatePlayerDirection(position: { x: number; y: number }, direction: number, isInOwnTerritory: boolean) {
    // Send direction change via realtime for instant updates (only on input events)
    if (!this.gameId || !this.playerId) {
      return;
    }
    
    try {
      // First update Redis with latest position/direction
      await this.updatePlayerPosition(position, direction, isInOwnTerritory);
      
      // Then send realtime broadcast for instant direction update
      const response = await fetch('/api/game/update-direction', {
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
      
      if (!response.ok) {
        console.warn(`⚠️ Direction update failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to update player direction:', error);
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

      
      // Disconnect from realtime
      if (this.realtimeConnection) {
        try {
          await this.realtimeConnection.disconnect();
        } catch (error) {
          console.error('Error disconnecting realtime:', error);
        }
        this.realtimeConnection = null;
      }
      
      // Clear local state
      this.gameId = '';
      this.playerId = '';
      this.gameState = null;
      this.otherPlayers.clear();
    } catch (error) {
      console.error('Failed to leave game:', error);
      if (this.realtimeConnection) {
        try {
          await this.realtimeConnection.disconnect();
        } catch (error) {
          console.error('Error disconnecting realtime:', error);
        }
        this.realtimeConnection = null;
      }
    }
  }

  getOtherPlayers(): Map<string, any> {
    return this.otherPlayers;
  }

  onTerritoryClaim(listener: (payload: any) => void) {
    this.territoryClaimListeners.push(listener);
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
    return this.realtimeConnection !== null && this.gameId !== '' && this.playerId !== '';
  }

}

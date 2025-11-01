import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { MultiplayerManager } from '../MultiplayerManager';
import { Player } from '../../../shared/types/api';

// Glow post-processing pipeline for neon effects with bloom
class GlowPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: 'GlowPipeline',
        fragShader: `
        precision mediump float;
        uniform sampler2D uMainSampler;
        uniform vec2 uResolution;
        varying vec2 outTexCoord;
        
        void main() {
          vec4 color = texture2D(uMainSampler, outTexCoord);
          
          // Calculate brightness/luminance
          float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
          
          // Bloom effect with simpler sampling (more compatible)
          vec2 texelSize = 1.0 / uResolution;
          vec3 glow = vec3(0.0);
          float totalWeight = 0.0;
          
          // Sample 9 key points around current pixel for bloom (unrolled loop for compatibility)
          vec2 offsets[9];
          offsets[0] = vec2(-1.0, -1.0) * texelSize * 4.0;
          offsets[1] = vec2( 0.0, -1.0) * texelSize * 4.0;
          offsets[2] = vec2( 1.0, -1.0) * texelSize * 4.0;
          offsets[3] = vec2(-1.0,  0.0) * texelSize * 4.0;
          offsets[4] = vec2( 0.0,  0.0) * texelSize * 4.0;
          offsets[5] = vec2( 1.0,  0.0) * texelSize * 4.0;
          offsets[6] = vec2(-1.0,  1.0) * texelSize * 4.0;
          offsets[7] = vec2( 0.0,  1.0) * texelSize * 4.0;
          offsets[8] = vec2( 1.0,  1.0) * texelSize * 4.0;
          
          for (int i = 0; i < 9; i++) {
            vec4 sample = texture2D(uMainSampler, outTexCoord + offsets[i]);
            float sampleBrightness = dot(sample.rgb, vec3(0.2126, 0.7152, 0.0722));
            
            // Weight by distance and brightness
            float dist = length(offsets[i]);
            float weight = (1.0 / (1.0 + dist)) * (sampleBrightness * 3.0);
            glow += sample.rgb * weight;
            totalWeight += weight;
          }
          
          if (totalWeight > 0.0) {
            glow /= totalWeight;
          }
          
          // Combine original with bloom - subtle bloom
          vec3 final = color.rgb + glow * 0.2;
          
          // Moderate brightness boost for neon effect
          final = final * (1.0 + brightness * 0.3);
          
          gl_FragColor = vec4(final, color.a);
        }`
    });
  }
}

export class Game extends Scene {
  camera: Phaser.Cameras.Scene2D.Camera;
  background: Phaser.GameObjects.Image;
  msg_text: Phaser.GameObjects.Text;
  player: Phaser.GameObjects.Arc;
  playerLabel: Phaser.GameObjects.Text;
  directionIndicator: Phaser.GameObjects.Graphics;
  playerGlow: Phaser.GameObjects.Graphics;
  inputKeys: Phaser.Types.Input.Keyboard.CursorKeys;
  wasdKeys: {[key: string]: Phaser.Input.Keyboard.Key};
  trails: Phaser.GameObjects.Graphics;
  territoryGraphics: Phaser.GameObjects.Graphics;
  headerPlayerText: Phaser.GameObjects.Text;
  leaderboardText: Phaser.GameObjects.Text;
  trailPoints: Array<{x: number, y: number}>;
  occupiedAreas: Array<{points: Array<{x: number, y: number}>, color: number}>;
  lastTrailUpdate: number = 0;
  trailUpdateInterval: number = 30; // Update trail every 30ms for smoother movement
  username: string = 'u/reddituser';
  subreddit: string = 'r/gaming';
  playerDirection: number = 0; // Direction in radians
  playerSpeed: number = 50;
  gameRadius: number = 1000; // Circular game area radius
  gameCenterX: number = 400;
  gameCenterY: number = 300;
  isDrawingTrail: boolean = true;
  isInOwnTerritory: boolean = true;
  gameOver: boolean = false;
  statusText: Phaser.GameObjects.Text;
  playerColor: number = 0xff4500; // Default to Reddit orange
  
  // Multiplayer properties
  isMultiplayer: boolean = false;
  multiplayerManager: MultiplayerManager | null = null;
  playerId: string = '';
  gameId: string = '';
  otherPlayers: Map<string, Player> = new Map();
  otherPlayerGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  // Smooth interpolation for other players
  // Other player objects that move continuously like local player
  otherPlayerObjects: Map<string, {
    x: number;
    y: number;
    direction: number;
    speed: number;
    trailPoints: Array<{x: number, y: number}>;
    lastTrailUpdate: number;
    trailUpdateInterval: number;
    isDrawingTrail: boolean;
    isInOwnTerritory: boolean;
    lastDirectionUpdate: number; // When direction was last updated from server
  }> = new Map();
  lastSentDirection: number = 0; // Track last direction sent to server
  lastInputChangeTime: number = 0; // Track when input/direction last changed
  gameStartTime: number = 0;
  spawnProtectionDuration: number = 2000; // 2 seconds of spawn protection
  constructor() {
    super('Game');
  }

  init(data?: any) {
    // Get username from registry instantly (no fetch needed)
    const storedUsername = this.registry.get('playerUsername');
    if (storedUsername) {
      this.username = storedUsername;
    }
    
    // Get player color from data or registry
    if (data && data.playerColor) {
      this.playerColor = data.playerColor;
    } else {
      const storedColor = this.registry.get('playerColor');
      if (storedColor) {
        this.playerColor = storedColor;
      }
    }
    
    // Get player name from data if provided (for subreddit representation)
    if (data && data.playerName) {
      this.username = data.playerName;
    }
    
    // Handle multiplayer data
    if (data) {
      this.isMultiplayer = data.isMultiplayer || false;
      if (this.isMultiplayer && data.multiplayerManager) {
        this.multiplayerManager = data.multiplayerManager;
        this.playerId = data.playerId || '';
        this.gameId = data.gameId || '';
        
        // Get initial game state
        const gameState = data.gameState;
        if (gameState) {
          // Ensure otherPlayers is always a Map
          if (gameState.players instanceof Map) {
            this.otherPlayers = gameState.players;
          } else if (gameState.players && typeof gameState.players === 'object') {
            // Convert object to Map and remove self
            const playersMap = new Map(Object.entries(gameState.players)) as Map<string, Player>;
            playersMap.delete(this.playerId); // Remove self from other players
            this.otherPlayers = playersMap;
            console.log(`🎮 Initial game state: ${playersMap.size} other players after removing self`);
          } else {
            this.otherPlayers = new Map();
          }
        } else {
          this.otherPlayers = new Map();
        }
        
        // Store flag to send initial position after player creation
        if (data.justJoined) {
          (this as any).shouldSendInitialPosition = true;
        }
      } else {
        this.otherPlayers = new Map();
      }
    }
  }

  createPlayer() {
  // Random subreddit selection
  const subreddits = ['r/gaming', 'r/funny', 'r/aww', 'r/AskReddit', 'r/worldnews', 'r/technology', 'r/science', 'r/art', 'r/music', 'r/sports'];
  this.subreddit = subreddits[Math.floor(Math.random() * subreddits.length)] || 'r/gaming';
  
  // Create player glow graphics (draws behind player)
  this.playerGlow = this.add.graphics();
  
  // Create player circle at center
  this.player = this.add.circle(this.gameCenterX, this.gameCenterY, 8, this.playerColor);
  this.player.setData('speed', this.playerSpeed);
  this.trailPoints = [];
  this.occupiedAreas = [];
  this.playerDirection = Math.random() * Math.PI * 2; // Random starting direction
  
  // Create initial occupied area (starting blob)
  this.createInitialTerritory();
  
  // Add player name label
  this.playerLabel = this.add.text(0, 0, this.username, {
    fontSize: '12px',
    color: '#ffffff',
    backgroundColor: '#000000',
    padding: { x: 4, y: 2 }
  });
  this.playerLabel.setOrigin(0.5, 0.5);
  
  return this.player;
}

async fetchStoredUsername() {
  try {
    const res = await fetch('/api/get-username');
    if (!res.ok) return;
    const data = await res.json();
    const storedUsername = data?.username;
    if (storedUsername && typeof storedUsername === 'string') {
      this.username = storedUsername;
      // Update header and player label if they exist
      if (this.headerPlayerText) this.headerPlayerText.setText(`Player: ${this.username}`);
      if (this.playerLabel) this.playerLabel.setText(this.username);
      console.log('Username loaded from Redis:', this.username);
    }
  } catch (error) {
    console.error('Failed to fetch stored username:', error);
  }
}

// Multiplayer methods
async syncPlayerPosition() {
  if (!this.isMultiplayer || !this.multiplayerManager) return;
  
  // Only update position in Redis (for polling) - always keep it fresh
  await this.multiplayerManager.updatePlayerPosition(
    { x: this.player.x, y: this.player.y },
    this.playerDirection,
    this.isInOwnTerritory
  );
}

async sendInitialPlayerData() {
  // Send initial position and direction when joining
  if (!this.isMultiplayer || !this.multiplayerManager) return;
  
  console.log('📤 Sending initial player data:', {
    position: { x: this.player.x, y: this.player.y },
    direction: this.playerDirection
  });
  
  // Update Redis with initial position
  await this.multiplayerManager.updatePlayerPosition(
    { x: this.player.x, y: this.player.y },
    this.playerDirection,
    this.isInOwnTerritory
  );
  
  // Send initial direction via realtime so other players know where we're facing
  await this.multiplayerManager.updatePlayerDirection(
    { x: this.player.x, y: this.player.y },
    this.playerDirection,
    this.isInOwnTerritory
  );
}

async syncPlayerDirection() {
  // Only send realtime when direction/input actually changes
  if (!this.isMultiplayer || !this.multiplayerManager) return;
  
  const directionChanged = Math.abs(this.playerDirection - this.lastSentDirection) > 0.05; // ~3 degrees
  const timeSinceLastChange = Date.now() - this.lastInputChangeTime;
  
  if (directionChanged && timeSinceLastChange > 50) { // Throttle to max 20 direction changes/sec
    this.lastSentDirection = this.playerDirection;
    this.lastInputChangeTime = Date.now();
    
    // Send direction change via realtime for instant updates
    await this.multiplayerManager.updatePlayerDirection(
      { x: this.player.x, y: this.player.y },
      this.playerDirection,
      this.isInOwnTerritory
    );
  }
}

async syncTrail() {
  if (!this.isMultiplayer || !this.multiplayerManager) return;
  
  await this.multiplayerManager.updateTrail(this.trailPoints);
}

async syncTerritoryClaim(occupiedArea: {points: Array<{x: number, y: number}>, color: number}) {
  if (!this.isMultiplayer || !this.multiplayerManager) return;
  
  // Territory claims trigger realtime broadcast (infrequent, important event)
  await this.multiplayerManager.claimTerritory(occupiedArea);
}

updateOtherPlayers() {
  if (!this.isMultiplayer) return;
  
  const deltaTime = this.game.loop.delta / 1000; // Convert to seconds
  const playerSpeed = 50; // Match server player speed (pixels per second)
  
  // Update other players from multiplayer manager
  const otherPlayers = this.multiplayerManager?.getOtherPlayers();
  if (otherPlayers && otherPlayers instanceof Map) {
    for (const [playerId, serverPlayer] of otherPlayers) {
      // Validate player data
      if (!serverPlayer.isAlive || !serverPlayer.position || typeof serverPlayer.position.x !== 'number') {
        // Clean up dead/invalid players
        this.otherPlayerObjects.delete(playerId);
        continue;
      }
      
      // Get or create player object (mirrors local player logic)
      let playerObj = this.otherPlayerObjects.get(playerId);
      const now = this.time.now;
      
      if (!playerObj) {
        // Initialize player object like local player
        playerObj = {
          x: serverPlayer.position.x,
          y: serverPlayer.position.y,
          direction: serverPlayer.direction ?? 0,
          speed: playerSpeed,
          trailPoints: serverPlayer.trailPoints ? [...serverPlayer.trailPoints] : [],
          lastTrailUpdate: now,
          trailUpdateInterval: 30, // Same as local player
          isDrawingTrail: true,
          isInOwnTerritory: serverPlayer.isInOwnTerritory || false,
          lastDirectionUpdate: Date.now()
        };
        this.otherPlayerObjects.set(playerId, playerObj);
      } else {
        // Check if we received a new direction update from server
        const directionFromServer = serverPlayer.direction ?? playerObj.direction;
        const directionChanged = Math.abs(directionFromServer - playerObj.direction) > 0.01;
        
        // If direction changed, update it (this is the "input" from server)
        if (directionChanged) {
          playerObj.direction = directionFromServer;
          playerObj.lastDirectionUpdate = Date.now();
          
          // Also snap position to server position if it's far off (correction)
          const dx = serverPlayer.position.x - playerObj.x;
          const dy = serverPlayer.position.y - playerObj.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 30) {
            // Snap to server position if too far off (lag correction)
            playerObj.x = serverPlayer.position.x;
            playerObj.y = serverPlayer.position.y;
          }
        }
        
        // Update trail from server
        if (serverPlayer.trailPoints && serverPlayer.trailPoints.length > 0) {
          playerObj.trailPoints = [...serverPlayer.trailPoints];
        }
        
        // Update territory status
        playerObj.isInOwnTerritory = serverPlayer.isInOwnTerritory || false;
      }
      
      // Move player continuously in facing direction (same as local player logic)
      const speed = playerObj.speed * deltaTime; // Convert to per-frame movement
      playerObj.x += Math.cos(playerObj.direction) * speed;
      playerObj.y += Math.sin(playerObj.direction) * speed;
      
      // Handle boundary collision (same as local player)
      const distanceFromCenter = Math.sqrt(
        Math.pow(playerObj.x - this.gameCenterX, 2) + 
        Math.pow(playerObj.y - this.gameCenterY, 2)
      );
      
      if (distanceFromCenter > this.gameRadius - 10) {
        // Bounce off boundary
        const angleToCenter = Math.atan2(this.gameCenterY - playerObj.y, this.gameCenterX - playerObj.x);
        playerObj.direction = angleToCenter;
        
        // Keep player within bounds
        const angle = Math.atan2(playerObj.y - this.gameCenterY, playerObj.x - this.gameCenterX);
        playerObj.x = this.gameCenterX + Math.cos(angle) * (this.gameRadius - 10);
        playerObj.y = this.gameCenterY + Math.sin(angle) * (this.gameRadius - 10);
      }
      
      // Update trail points periodically (same as local player logic)
      if (now - playerObj.lastTrailUpdate > playerObj.trailUpdateInterval && playerObj.isDrawingTrail) {
        // Only add trail points when outside own territory
        if (!playerObj.isInOwnTerritory) {
          playerObj.trailPoints.push({ x: playerObj.x, y: playerObj.y });
        }
        playerObj.lastTrailUpdate = now;
        
        // Limit trail length
        if (playerObj.trailPoints.length > 2000) {
          playerObj.trailPoints.shift();
        }
      }
      
      // Update the otherPlayers map for rendering
      this.otherPlayers.set(playerId, {
        ...serverPlayer,
        position: { x: playerObj.x, y: playerObj.y },
        direction: playerObj.direction,
        trailPoints: playerObj.trailPoints
      });
    }
    
    // Clean up objects for players who are no longer in the game
    for (const [playerId] of this.otherPlayerObjects) {
      if (!otherPlayers.has(playerId)) {
        this.otherPlayerObjects.delete(playerId);
      }
    }
  }
  
  // Create/update graphics for other players using interpolated positions
  // NOTE: Position updates continue above regardless of viewport - only rendering is conditional
  if (this.otherPlayers && this.otherPlayers instanceof Map && this.otherPlayers.size > 0) {
    for (const [playerId, player] of this.otherPlayers) {
      if (!this.otherPlayerGraphics.has(playerId)) {
        // Create new player graphics
        const playerGraphics = this.add.graphics();
        this.otherPlayerGraphics.set(playerId, playerGraphics);
        console.log(`✨ Game scene: Created graphics for player ${playerId} at (${player.position.x}, ${player.position.y})`);
      }
      
      const playerGraphics = this.otherPlayerGraphics.get(playerId)!;
      playerGraphics.clear();
      
      // Use predicted position for rendering
      const playerObj = this.otherPlayerObjects.get(playerId);
      const renderX = playerObj ? playerObj.x : player.position.x;
      const renderY = playerObj ? playerObj.y : player.position.y;
      const renderDirection = playerObj ? playerObj.direction : player.direction;
      
      // Draw other player with neon bloom effect
      // Draw multiple layers for bloom effect (toned down)
      const glowLayers = [
        { radius: 20, alpha: 0.15 },
        { radius: 16, alpha: 0.20 },
        { radius: 12, alpha: 0.25 },
        { radius: 10, alpha: 0.30 }
      ];
      
      // Outer glow layers
      for (const layer of glowLayers) {
        playerGraphics.fillStyle(player.color, layer.alpha);
        playerGraphics.fillCircle(renderX, renderY, layer.radius);
      }
      
      // Main player circle
      playerGraphics.fillStyle(player.color, 1.0);
      playerGraphics.fillCircle(renderX, renderY, 8);
      
      // Draw direction indicator (small line showing direction)
      if (renderDirection !== undefined) {
        const indicatorLength = 12;
        const endX = renderX + Math.cos(renderDirection) * indicatorLength;
        const endY = renderY + Math.sin(renderDirection) * indicatorLength;
        
        // Glow effect for direction indicator (toned down)
        playerGraphics.lineStyle(3, player.color, 0.15);
        playerGraphics.lineBetween(renderX, renderY, endX, endY);
        
        // Main indicator line
        playerGraphics.lineStyle(2, player.color, 0.8);
        playerGraphics.lineBetween(renderX, renderY, endX, endY);
      }
      
      // Draw other player's trail with neon bloom effect
      if (playerObj && playerObj.trailPoints && playerObj.trailPoints.length > 1 && playerObj.isDrawingTrail) {
        // Use same trail color logic as local player
        const trailColor = playerObj.isInOwnTerritory ? 0x00ff00 : player.color;
        
        // Draw multiple glow layers for bloom effect (toned down)
        const glowLayers = [
          { width: 16, alpha: 0.15 },
          { width: 12, alpha: 0.20 },
          { width: 8, alpha: 0.25 },
          { width: 6, alpha: 0.30 }
        ];
        
        // Outer glow layers
        for (const layer of glowLayers) {
          playerGraphics.lineStyle(layer.width, trailColor, layer.alpha);
          playerGraphics.beginPath();
          playerGraphics.moveTo(playerObj.trailPoints[0]!.x, playerObj.trailPoints[0]!.y);
          for (let i = 1; i < playerObj.trailPoints.length; i++) {
            playerGraphics.lineTo(playerObj.trailPoints[i]!.x, playerObj.trailPoints[i]!.y);
          }
          playerGraphics.strokePath();
        }
        
        // Main trail line
        playerGraphics.lineStyle(4, trailColor, 0.9);
        playerGraphics.beginPath();
        playerGraphics.moveTo(playerObj.trailPoints[0]!.x, playerObj.trailPoints[0]!.y);
        for (let i = 1; i < playerObj.trailPoints.length; i++) {
          playerGraphics.lineTo(playerObj.trailPoints[i]!.x, playerObj.trailPoints[i]!.y);
        }
        playerGraphics.strokePath();
      }
      
      // Draw other player's occupied areas with neon bloom effect
      if (player.occupiedAreas) {
        player.occupiedAreas.forEach(area => {
          if (area.points && area.points.length >= 3) {
            const points = [...area.points];
            const firstPoint = points[0]!;
            const lastPoint = points[points.length - 1]!;
            
            if (firstPoint.x !== lastPoint.x || firstPoint.y !== lastPoint.y) {
              points.push({ x: firstPoint.x, y: firstPoint.y });
            }
            
            // Draw multiple glow layers for bloom effect (reduced)
            const glowLayers = [
              { lineWidth: 6, fillAlpha: 0.10, strokeAlpha: 0.08 },
              { lineWidth: 4, fillAlpha: 0.15, strokeAlpha: 0.12 }
            ];
            
            // Outer glow layers
            for (const layer of glowLayers) {
              playerGraphics.fillStyle(area.color, layer.fillAlpha);
              playerGraphics.beginPath();
              playerGraphics.moveTo(points[0]!.x, points[0]!.y);
              for (let i = 1; i < points.length; i++) {
                playerGraphics.lineTo(points[i]!.x, points[i]!.y);
              }
              playerGraphics.closePath();
              playerGraphics.fillPath();
              
              playerGraphics.lineStyle(layer.lineWidth, area.color, layer.strokeAlpha);
              playerGraphics.beginPath();
              playerGraphics.moveTo(points[0]!.x, points[0]!.y);
              for (let i = 1; i < points.length; i++) {
                playerGraphics.lineTo(points[i]!.x, points[i]!.y);
              }
              playerGraphics.closePath();
              playerGraphics.strokePath();
            }
            
            // Main filled area - full opacity
            playerGraphics.fillStyle(area.color, 1.0);
            playerGraphics.beginPath();
            playerGraphics.moveTo(points[0]!.x, points[0]!.y);
            for (let i = 1; i < points.length; i++) {
              playerGraphics.lineTo(points[i]!.x, points[i]!.y);
            }
            playerGraphics.closePath();
            playerGraphics.fillPath();
            
            // Main border
            playerGraphics.lineStyle(3, area.color, 1.0);
            playerGraphics.beginPath();
            playerGraphics.moveTo(points[0]!.x, points[0]!.y);
            for (let i = 1; i < points.length; i++) {
              playerGraphics.lineTo(points[i]!.x, points[i]!.y);
            }
            playerGraphics.closePath();
            playerGraphics.strokePath();
          }
        });
      }
    }
  }
  
      // Remove graphics for players who left or were removed
      for (const [playerId] of this.otherPlayerGraphics) {
        if (!this.otherPlayers || !this.otherPlayers.has(playerId)) {
          console.log(`🗑️ Cleaning up graphics for removed player: ${playerId}`);
          const graphics = this.otherPlayerGraphics.get(playerId);
          if (graphics) {
            graphics.clear();
            graphics.destroy();
          }
          this.otherPlayerGraphics.delete(playerId);
          this.otherPlayerObjects.delete(playerId);
        }
      }
}

handleGameOver() {
  this.gameOver = true;
  
  // Clean up multiplayer state before transitioning
  if (this.isMultiplayer && this.multiplayerManager) {
    console.log('Cleaning up multiplayer game state...');
    // Fire and forget - cleanup will happen even if scene transitions
    this.multiplayerManager.leaveGame().then(() => {
      console.log('Multiplayer cleanup complete');
    }).catch((error) => {
      console.error('Failed to cleanup multiplayer state:', error);
    });
  }
  
  // Transition to game over scene
  this.scene.start('GameOver');
}

checkPlayerCollisions() {
  if (!this.isMultiplayer) return;
  
  // Spawn protection - don't check collisions for first 2 seconds
  const timeSinceStart = Date.now() - this.gameStartTime;
  if (timeSinceStart < this.spawnProtectionDuration) {
    return; // Skip collision checks during spawn protection
  }
  
  const currentPos = { x: this.player.x, y: this.player.y };
  const collisionThreshold = 20;
  
  // Check collision with other players using predicted positions
  for (const [playerId, otherPlayer] of this.otherPlayers) {
    if (!otherPlayer.isAlive) continue;
    
    // Use predicted position from player object
    const playerObj = this.otherPlayerObjects.get(playerId);
    const otherPlayerX = playerObj ? playerObj.x : otherPlayer.position.x;
    const otherPlayerY = playerObj ? playerObj.y : otherPlayer.position.y;
    
    // Skip if players are in their own territory (spawn protection)
    if (this.isInOwnTerritory && otherPlayer.isInOwnTerritory) {
      continue; // Both players are safe in their territories
    }
    
    const distance = Math.sqrt(
      Math.pow(currentPos.x - otherPlayerX, 2) + 
      Math.pow(currentPos.y - otherPlayerY, 2)
    );
    
    if (distance < collisionThreshold) {
      // Player collision - both players eliminated
      this.handleGameOver();
      return;
    }
  }
  
  // Check collision with other players' trails
  for (const [, otherPlayer] of this.otherPlayers) {
    if (!otherPlayer.isAlive) continue;
    
    // Skip trail collision if player is in their own territory
    if (this.isInOwnTerritory) {
      continue; // Safe in own territory
    }
    
    if (!otherPlayer.trailPoints || otherPlayer.trailPoints.length < 10) {
      continue; // Not enough trail points yet
    }
    
    for (let i = 0; i < otherPlayer.trailPoints.length - 10; i++) {
      const trailPoint = otherPlayer.trailPoints[i]!;
      const distance = Math.sqrt(
        Math.pow(currentPos.x - trailPoint.x, 2) + 
        Math.pow(currentPos.y - trailPoint.y, 2)
      );
      
      if (distance < collisionThreshold) {
        // Hit other player's trail - game over
        this.handleGameOver();
        return;
      }
    }
  }
}

createInitialTerritory() {
  // Create a small circular starting territory around the player
  const radius = 30;
  const points = [];
  const segments = 16;
  
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = this.player.x + Math.cos(angle) * radius;
    const y = this.player.y + Math.sin(angle) * radius;
    points.push({ x, y });
  }
  
  this.occupiedAreas.push({
    points: points,
    color: this.playerColor // Player color
  });
}

drawDirectionIndicator() {
  if (!this.directionIndicator) {
    this.directionIndicator = this.add.graphics();
  }
  
  this.directionIndicator.clear();
  
  // Draw arrow pointing in facing direction
  const indicatorLength = 20;
  const arrowStartX = this.player.x;
  const arrowStartY = this.player.y;
  const arrowEndX = arrowStartX + Math.cos(this.playerDirection) * indicatorLength;
  const arrowEndY = arrowStartY + Math.sin(this.playerDirection) * indicatorLength;
  
  // Draw line
  this.directionIndicator.lineStyle(3, this.playerColor, 0.8);
  this.directionIndicator.beginPath();
  this.directionIndicator.moveTo(arrowStartX, arrowStartY);
  this.directionIndicator.lineTo(arrowEndX, arrowEndY);
  this.directionIndicator.strokePath();
  
  // Draw arrowhead
  const arrowSize = 8;
  const arrowAngle = Math.PI / 6;
  const arrowLeft = {
    x: arrowEndX - arrowSize * Math.cos(this.playerDirection - arrowAngle),
    y: arrowEndY - arrowSize * Math.sin(this.playerDirection - arrowAngle)
  };
  const arrowRight = {
    x: arrowEndX - arrowSize * Math.cos(this.playerDirection + arrowAngle),
    y: arrowEndY - arrowSize * Math.sin(this.playerDirection + arrowAngle)
  };
  
  this.directionIndicator.beginPath();
  this.directionIndicator.moveTo(arrowEndX, arrowEndY);
  this.directionIndicator.lineTo(arrowLeft.x, arrowLeft.y);
  this.directionIndicator.lineTo(arrowRight.x, arrowRight.y);
  this.directionIndicator.closePath();
  this.directionIndicator.fillStyle(this.playerColor, 0.8);
  this.directionIndicator.fillPath();
}

handlePlayerMovement() {
  const speed = this.playerSpeed * this.game.loop.delta / 1000;
  const keys = this.inputKeys;
  const wasd = this.wasdKeys;

  // Continuous movement in facing direction
  const turnSpeed = 3; // Radians per second
  let directionChange = 0;
  
  // Define target directions for each key
  const targetDirections = {
    up: -Math.PI / 2,    // 270 degrees (up)
    down: Math.PI / 2,   // 90 degrees (down)
    left: Math.PI,       // 180 degrees (left)
    right: 0             // 0 degrees (right)
  };

  let targetAngle = null;

  // W/Up = rotate towards up
  if (keys.up.isDown || wasd.W?.isDown) {
    targetAngle = targetDirections.up;
  }
  // S/Down = rotate towards down
  else if (keys.down.isDown || wasd.S?.isDown) {
    targetAngle = targetDirections.down;
  }
  // A/Left = rotate towards left
  else if (keys.left.isDown || wasd.A?.isDown) {
    targetAngle = targetDirections.left;
  }
  // D/Right = rotate towards right
  else if (keys.right.isDown || wasd.D?.isDown) {
    targetAngle = targetDirections.right;
  }

  // If a target direction is set, rotate towards it
  if (targetAngle !== null) {
    let angleDiff = targetAngle - this.playerDirection;
    
    // Normalize angle difference to [-π, π]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    // Only rotate if not already aligned (within 0.1 radians)
    if (Math.abs(angleDiff) > 0.1) {
      const maxTurnSpeed = turnSpeed * this.game.loop.delta / 1000;
      directionChange = Math.max(-maxTurnSpeed, Math.min(maxTurnSpeed, angleDiff));
    }
  }

  // Handle touch controls - rotate to face touch point
  if (this.input.activePointer.isDown) {
    const pointer = this.input.activePointer;
    // Convert screen coordinates to world coordinates
    const worldX = this.camera.scrollX + pointer.x;
    const worldY = this.camera.scrollY + pointer.y;
    
    const playerPos = { x: this.player.x, y: this.player.y };
    const targetAngle = Math.atan2(worldY - playerPos.y, worldX - playerPos.x);
    
    // Calculate angle difference
    let angleDiff = targetAngle - this.playerDirection;
    // Normalize angle difference
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    // Apply rotation towards touch point
    const maxTurnSpeed = turnSpeed * this.game.loop.delta / 1000;
    directionChange = Math.max(-maxTurnSpeed, Math.min(maxTurnSpeed, angleDiff));
  }

  // Update facing direction
  const previousDirection = this.playerDirection;
  this.playerDirection += directionChange;
  
  // Track if direction changed significantly (for realtime updates)
  if (Math.abs(this.playerDirection - previousDirection) > 0.05) {
    this.lastInputChangeTime = Date.now();
  }

  // Move player continuously in facing direction
  this.player.x += Math.cos(this.playerDirection) * speed;
  this.player.y += Math.sin(this.playerDirection) * speed;

  // Check circular boundary collision
  const distanceFromCenter = Math.sqrt(
    Math.pow(this.player.x - this.gameCenterX, 2) + 
    Math.pow(this.player.y - this.gameCenterY, 2)
  );
  
  if (distanceFromCenter > this.gameRadius - 10) {
    // Bounce off boundary - reverse direction
    const angleToCenter = Math.atan2(this.gameCenterY - this.player.y, this.gameCenterX - this.player.x);
    this.playerDirection = angleToCenter;
    
    // Keep player within bounds
    const angle = Math.atan2(this.player.y - this.gameCenterY, this.player.x - this.gameCenterX);
    this.player.x = this.gameCenterX + Math.cos(angle) * (this.gameRadius - 10);
    this.player.y = this.gameCenterY + Math.sin(angle) * (this.gameRadius - 10);
  }

  // Update trail points periodically (only when outside own territory)
  const currentTime = this.time.now;
  if (currentTime - this.lastTrailUpdate > this.trailUpdateInterval && this.isDrawingTrail) {
    // Only add trail points when outside own territory
    if (!this.isInOwnTerritory) {
      this.trailPoints.push({ x: this.player.x, y: this.player.y });
      
      // Sync trail in multiplayer
      if (this.isMultiplayer) {
        this.syncTrail();
      }
    }
    this.lastTrailUpdate = currentTime;
    
    // Check for trail collision
    this.checkTrailCollision();
    
    // Limit trail length to prevent memory issues
    if (this.trailPoints.length > 2000) {
      this.trailPoints.shift();
    }
  }
}

checkTrailCollision() {
  if (this.trailPoints.length < 10) return;
  
  const currentPos = { x: this.player.x, y: this.player.y };
  const collisionThreshold = 15;
  
  // Check if player is in their own territory
  this.isInOwnTerritory = this.isPointInOwnTerritory(currentPos);
  
  // If player is in their own territory, check for trail completion
  if (this.isInOwnTerritory && this.trailPoints.length > 50) {
    // Trail completed! Create new occupied area
    this.createOccupiedArea();
    this.trailPoints = [];
    // Immediately resume drawing trails
    this.isDrawingTrail = true;
    return;
  }
  
  // If player is NOT in their own territory, check for trail collision (game over)
  if (!this.isInOwnTerritory) {
    // Check collision with existing trail (excluding recent points)
    for (let i = 0; i < this.trailPoints.length - 20; i++) {
      const trailPoint = this.trailPoints[i]!;
      const distance = Math.sqrt(
        Math.pow(currentPos.x - trailPoint.x, 2) + 
        Math.pow(currentPos.y - trailPoint.y, 2)
      );
      
      if (distance < collisionThreshold) {
        // Game over! Player hit their own trail
        this.handleGameOver();
        return;
      }
    }
  }
}

isPointInOwnTerritory(point: {x: number, y: number}): boolean {
  // Check if point is inside any occupied area
  for (const area of this.occupiedAreas) {
    if (this.isPointInPolygon(point, area.points)) {
      return true;
    }
  }
  return false;
}

isPointInPolygon(point: {x: number, y: number}, polygon: Array<{x: number, y: number}>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (((polygon[i]!.y > point.y) !== (polygon[j]!.y > point.y)) &&
        (point.x < (polygon[j]!.x - polygon[i]!.x) * (point.y - polygon[i]!.y) / (polygon[j]!.y - polygon[i]!.y) + polygon[i]!.x)) {
      inside = !inside;
    }
  }
  return inside;
}

createOccupiedArea() {
  if (this.trailPoints.length < 3) return;
  
  // Create a closed polygon from the trail points
  const areaPoints = [...this.trailPoints];
  
  // Add the occupied area
  const occupiedArea = {
    points: areaPoints,
    color: this.playerColor // Player color
  };
  
  this.occupiedAreas.push(occupiedArea);
  
  // Sync territory claim in multiplayer
  if (this.isMultiplayer) {
    this.syncTerritoryClaim(occupiedArea);
  }
  
}

drawTrail() {
  if (!this.trails) {
    this.trails = this.add.graphics();
  }

  this.trails.clear();
  
  // Draw circular boundary
  this.trails.lineStyle(3, 0xffffff, 0.8);
  this.trails.strokeCircle(this.gameCenterX, this.gameCenterY, this.gameRadius);
  
  // Draw occupied areas
  this.drawOccupiedAreas();
  
  // Draw current trail with neon bloom effect
  if (this.trailPoints.length > 1 && this.isDrawingTrail) {
    // Draw trail with different colors based on territory status
    const trailColor = this.isInOwnTerritory ? 0x00ff00 : this.playerColor; // Green in territory, Player color outside
    
    // Draw multiple glow layers for bloom effect (toned down)
    const glowLayers = [
      { width: 16, alpha: 0.15 },
      { width: 12, alpha: 0.20 },
      { width: 8, alpha: 0.25 },
      { width: 6, alpha: 0.30 }
    ];
    
    // Outer glow layers
    for (const layer of glowLayers) {
      this.trails.lineStyle(layer.width, trailColor, layer.alpha);
      this.trails.beginPath();
      this.trails.moveTo(this.trailPoints[0]!.x, this.trailPoints[0]!.y);
      for (let i = 1; i < this.trailPoints.length; i++) {
        this.trails.lineTo(this.trailPoints[i]!.x, this.trailPoints[i]!.y);
      }
      this.trails.strokePath();
    }
    
    // Main trail line
    this.trails.lineStyle(4, trailColor, 0.9);
    this.trails.beginPath();
    this.trails.moveTo(this.trailPoints[0]!.x, this.trailPoints[0]!.y);
    for (let i = 1; i < this.trailPoints.length; i++) {
      this.trails.lineTo(this.trailPoints[i]!.x, this.trailPoints[i]!.y);
    }
    this.trails.strokePath();
  }
}

drawOccupiedAreas() {
  if (!this.territoryGraphics) {
    this.territoryGraphics = this.add.graphics();
  }
  
  this.territoryGraphics.clear();
  
  // Draw all occupied areas
  this.occupiedAreas.forEach(area => {
    if (area.points.length >= 3) {
      // Ensure the polygon is properly closed
      const points = [...area.points];
      const firstPoint = points[0]!;
      const lastPoint = points[points.length - 1]!;
      
      // Add the first point at the end if not already there
      if (firstPoint.x !== lastPoint.x || firstPoint.y !== lastPoint.y) {
        points.push({ x: firstPoint.x, y: firstPoint.y });
      }
      
      // Draw occupied area with neon bloom effect (reduced)
      // Draw fewer glow layers for less intense effect
      const glowLayers = [
        { lineWidth: 6, fillAlpha: 0.10, strokeAlpha: 0.08 },
        { lineWidth: 4, fillAlpha: 0.15, strokeAlpha: 0.12 }
      ];
      
      // Outer glow layers
      for (const layer of glowLayers) {
        this.territoryGraphics.fillStyle(area.color, layer.fillAlpha);
        this.territoryGraphics.beginPath();
        this.territoryGraphics.moveTo(points[0]!.x, points[0]!.y);
        for (let i = 1; i < points.length; i++) {
          this.territoryGraphics.lineTo(points[i]!.x, points[i]!.y);
        }
        this.territoryGraphics.closePath();
        this.territoryGraphics.fillPath();
        
        this.territoryGraphics.lineStyle(layer.lineWidth, area.color, layer.strokeAlpha);
        this.territoryGraphics.beginPath();
        this.territoryGraphics.moveTo(points[0]!.x, points[0]!.y);
        for (let i = 1; i < points.length; i++) {
          this.territoryGraphics.lineTo(points[i]!.x, points[i]!.y);
        }
        this.territoryGraphics.closePath();
        this.territoryGraphics.strokePath();
      }
      
      // Main filled area - full opacity
      this.territoryGraphics.fillStyle(area.color, 1.0);
      this.territoryGraphics.beginPath();
      this.territoryGraphics.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length; i++) {
        this.territoryGraphics.lineTo(points[i]!.x, points[i]!.y);
      }
      this.territoryGraphics.closePath();
      this.territoryGraphics.fillPath();
      
      // Main border
      this.territoryGraphics.lineStyle(3, area.color, 1.0);
      this.territoryGraphics.beginPath();
      this.territoryGraphics.moveTo(points[0]!.x, points[0]!.y);
      for (let i = 1; i < points.length; i++) {
        this.territoryGraphics.lineTo(points[i]!.x, points[i]!.y);
      }
      this.territoryGraphics.closePath();
      this.territoryGraphics.strokePath();
    }
  });
}





  create() {

    // Create player
    this.init()
    this.createPlayer();
    console.log('Player created:', this.player);
    
    // Set game start time for spawn protection
    this.gameStartTime = Date.now();
    
    // Initialize direction tracking for realtime updates
    if (this.isMultiplayer) {
      this.lastSentDirection = this.playerDirection;
      this.lastInputChangeTime = Date.now();
      
      // Send initial position and direction if we just joined
      if ((this as any).shouldSendInitialPosition) {
        this.sendInitialPlayerData();
        (this as any).shouldSendInitialPosition = false;
      }
    }
    
    // Fetch username from Redis and update labels when ready
    // Configure camera & background
    this.camera = this.cameras.main;
    this.camera.setBackgroundColor(0x0a0a0a);
    
    // Apply glow pipeline for neon effects (WebGL only)
    try {
      const renderer = this.game.renderer;
      if (renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
        // Register the post pipeline class
        renderer.pipelines.addPostPipeline('GlowPipeline', GlowPipeline);
        // Apply to camera
        this.camera.setPostPipeline('GlowPipeline');
        console.log('✅ Glow pipeline applied to camera');
      } else {
        console.warn('⚠️ Glow pipeline requires WebGL renderer, using manual glow instead');
      }
    } catch (error) {
      console.warn('⚠️ Could not apply glow pipeline (falling back to manual glow):', error);
      console.error('Pipeline error details:', error);
    }

    // Set up world bounds based on game radius
    const worldSize = this.gameRadius * 2;
    // this.physics.world.setBounds(
    //   this.gameCenterX - this.gameRadius, 
    //   this.gameCenterY - this.gameRadius, 
    //   worldSize, 
    //   worldSize
    // );

    // Set camera bounds to match world
    this.camera.setBounds(
      this.gameCenterX - this.gameRadius, 
      this.gameCenterY - this.gameRadius, 
      worldSize, 
      worldSize
    );

    // Start camera following player
    this.camera.startFollow(this.player, true, 0.1, 0.1);

    // Initialize input handling
    this.inputKeys = this.input.keyboard!.createCursorKeys();
    this.wasdKeys = this.input.keyboard!.addKeys('W,S,A,D') as {[key: string]: Phaser.Input.Keyboard.Key};

    // Initialize graphics
    this.trails = this.add.graphics();
    this.territoryGraphics = this.add.graphics();
    // this.trailPoints = [];
    // this.occupiedAreas = [];

    // Initialize leaderboard placeholder (top-left)
    this.headerPlayerText = undefined as any;
    this.statusText = undefined as any;
    ;

    // Setup responsive layout
    this.updateLayout(this.scale.width, this.scale.height);
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      const { width, height } = gameSize;
      this.updateLayout(width, height);
    });

    // Create leaderboard text
    this.leaderboardText = this.add.text(20, 20, '', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 }
    }).setScrollFactor(0);

    // Subscribe to realtime territory claims
    if (this.isMultiplayer && this.multiplayerManager && (this.multiplayerManager as any).onTerritoryClaim) {
      (this.multiplayerManager as any).onTerritoryClaim(() => {
        this.updateLeaderboard();
      });
    }

    this.updateLeaderboard();
  }

  drawPlayerGlow() {
    if (!this.playerGlow || !this.player) return;
    
    this.playerGlow.clear();
    
    const playerColor = this.playerColor;
    const glowLayers = [
      { radius: 20, alpha: 0.15 },
      { radius: 16, alpha: 0.20 },
      { radius: 12, alpha: 0.25 },
      { radius: 10, alpha: 0.30 }
    ];
    
    // Draw glow layers (behind player) - toned down
    for (const layer of glowLayers) {
      this.playerGlow.fillStyle(playerColor, layer.alpha);
      this.playerGlow.fillCircle(this.player.x, this.player.y, layer.radius);
    }
  }

  override update() {
    // Draw player glow effect
    this.drawPlayerGlow();
    
    // Handle player movement
    this.handlePlayerMovement();

    // Recompute territory state after moving
    const currentPos = { x: this.player.x, y: this.player.y };
    this.isInOwnTerritory = this.isPointInOwnTerritory(currentPos);

    // (status text removed)

    // Update player label position (follows player)
    this.playerLabel.setPosition(this.player.x, this.player.y - 20);

    // Multiplayer updates
    if (this.isMultiplayer) {
      // Sync player position to Redis (for polling)
      this.syncPlayerPosition();
      
      // Sync direction change via realtime (only on input events)
      this.syncPlayerDirection();
      
      // Update other players (with client-side prediction)
      this.updateOtherPlayers();
      
      // Check collisions with other players
      this.checkPlayerCollisions();
    }

    // Draw direction indicator
    // this.drawDirectionIndicator();

    // Draw trail and territories
    this.drawTrail();
  }

  updateLayout(width: number, height: number) {
    // Resize camera viewport to avoid black bars
    this.cameras.resize(width, height);


    // Center and scale background image to cover screen
    if (this.background) {
      this.background.setPosition(width / 2, height / 2);
      if (this.background.width && this.background.height) {
        const scale = Math.max(width / this.background.width, height / this.background.height);
        this.background.setScale(scale);
      }
    }


  }

  private computePolygonArea(points: Array<{x: number, y: number}>): number {
    if (!points || points.length < 3) return 0;
    let area = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const p1 = points[j]!;
      const p2 = points[i]!;
      area += (p1.x * p2.y) - (p2.x * p1.y);
    }
    return Math.abs(area) / 2;
  }

  private computePlayerCoverage(): Array<{ name: string; percent: number; color: number }>{
    const totalArea = Math.PI * this.gameRadius * this.gameRadius;
    const results: Array<{ name: string; percent: number; color: number }> = [];

    const selfArea = this.occupiedAreas.reduce((sum, area) => sum + this.computePolygonArea(area.points), 0);
    results.push({ name: this.username, percent: Math.min(100, (selfArea / totalArea) * 100), color: this.playerColor });

    if (this.otherPlayers && this.otherPlayers.size > 0) {
      for (const [, player] of this.otherPlayers) {
        const areas = player.occupiedAreas || [];
        const areaSum = areas.reduce((sum: number, a: any) => sum + this.computePolygonArea(a.points || []), 0);
        const color = player.color || 0xffffff;
        const name = player.username || 'Player';
        results.push({ name, percent: Math.min(100, (areaSum / totalArea) * 100), color });
      }
    }

    results.sort((a, b) => b.percent - a.percent);
    return results;
  }

  private updateLeaderboard() {
    if (!this.leaderboardText) return;
    const rows = this.computePlayerCoverage().slice(0, 6);
    const lines = ['Leaderboard'];
    rows.forEach((r, idx) => {
      lines.push(`${idx + 1}. ${r.name} - ${r.percent.toFixed(1)}%`);
    });
    this.leaderboardText.setText(lines.join('\n'));
  }

  shutdown() {
    // Clean up multiplayer state when scene is stopped
    if (this.isMultiplayer && this.multiplayerManager && !this.gameOver) {
      console.log('Game scene shutting down - cleaning up multiplayer state...');
      this.multiplayerManager.leaveGame().catch((error) => {
        console.error('Failed to cleanup multiplayer state on shutdown:', error);
      });
    }
  }

}


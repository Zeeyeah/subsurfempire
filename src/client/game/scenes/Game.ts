import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { MultiplayerManager } from '../MultiplayerManager';
import { Player } from '../../../shared/types/api';

export class Game extends Scene {
  camera: Phaser.Cameras.Scene2D.Camera;
  background: Phaser.GameObjects.Image;
  msg_text: Phaser.GameObjects.Text;
  player: Phaser.GameObjects.Arc;
  playerLabel: Phaser.GameObjects.Text;
  directionIndicator: Phaser.GameObjects.Graphics;
  inputKeys: Phaser.Types.Input.Keyboard.CursorKeys;
  wasdKeys: {[key: string]: Phaser.Input.Keyboard.Key};
  trails: Phaser.GameObjects.Graphics;
  territoryGraphics: Phaser.GameObjects.Graphics;
  headerPlayerText: Phaser.GameObjects.Text;
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
  
  // Multiplayer properties
  isMultiplayer: boolean = false;
  multiplayerManager: MultiplayerManager | null = null;
  playerId: string = '';
  gameId: string = '';
  otherPlayers: Map<string, Player> = new Map();
  otherPlayerGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  // Smooth interpolation for other players
  otherPlayerTargetPositions: Map<string, { x: number; y: number; direction: number; timestamp: number }> = new Map();
  otherPlayerCurrentPositions: Map<string, { x: number; y: number; direction: number }> = new Map();
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
      } else {
        this.otherPlayers = new Map();
      }
    }
  }

  createPlayer() {
  // Random subreddit selection
  const subreddits = ['r/gaming', 'r/funny', 'r/aww', 'r/AskReddit', 'r/worldnews', 'r/technology', 'r/science', 'r/art', 'r/music', 'r/sports'];
  this.subreddit = subreddits[Math.floor(Math.random() * subreddits.length)] || 'r/gaming';
  
  // Create player circle at center
  this.player = this.add.circle(this.gameCenterX, this.gameCenterY, 8, 0xff4500); // Reddit orange
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
  
  await this.multiplayerManager.updatePlayerPosition(
    { x: this.player.x, y: this.player.y },
    this.playerDirection,
    this.isInOwnTerritory
  );
}

async syncTrail() {
  if (!this.isMultiplayer || !this.multiplayerManager) return;
  
  await this.multiplayerManager.updateTrail(this.trailPoints);
}

async syncTerritoryClaim(occupiedArea: {points: Array<{x: number, y: number}>, color: number}) {
  if (!this.isMultiplayer || !this.multiplayerManager) return;
  
  await this.multiplayerManager.claimTerritory(occupiedArea);
}

updateOtherPlayers() {
  if (!this.isMultiplayer) return;
  
  // Update other players from multiplayer manager
  const otherPlayers = this.multiplayerManager?.getOtherPlayers();
  if (otherPlayers && otherPlayers instanceof Map) {
    // Update target positions for interpolation
    const now = Date.now();
    for (const [playerId, player] of otherPlayers) {
      // Validate player data - only process if player is alive and has valid position
      if (!player.isAlive || !player.position || typeof player.position.x !== 'number') {
        console.warn(`⚠️ Invalid player data for ${playerId}, skipping`);
        continue;
      }
      
      // Store the target position we're interpolating towards
      this.otherPlayerTargetPositions.set(playerId, {
        x: player.position.x,
        y: player.position.y,
        direction: player.direction,
        timestamp: now
      });
      
      // Initialize current position if not set
      if (!this.otherPlayerCurrentPositions.has(playerId)) {
        this.otherPlayerCurrentPositions.set(playerId, {
          x: player.position.x,
          y: player.position.y,
          direction: player.direction
        });
      }
      
      // Update the player data
      this.otherPlayers.set(playerId, player);
    }
    
    // Interpolate positions smoothly (60fps interpolation for smooth movement)
    const interpolationSpeed = 0.15; // Adjust this (0.1 = slower, 0.3 = faster)
    for (const [playerId, target] of this.otherPlayerTargetPositions) {
      const current = this.otherPlayerCurrentPositions.get(playerId);
      if (current) {
        // Smoothly interpolate position
        current.x += (target.x - current.x) * interpolationSpeed;
        current.y += (target.y - current.y) * interpolationSpeed;
        
        // Smoothly interpolate direction (angle)
        let angleDiff = target.direction - current.direction;
        // Normalize angle difference to [-π, π]
        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        current.direction += angleDiff * interpolationSpeed;
        
        this.otherPlayerCurrentPositions.set(playerId, current);
      }
    }
  }
  
  // Create/update graphics for other players using interpolated positions
  if (this.otherPlayers && this.otherPlayers instanceof Map && this.otherPlayers.size > 0) {
    console.log(`🎨 Rendering ${this.otherPlayers.size} other players`);
    for (const [playerId, player] of this.otherPlayers) {
      if (!this.otherPlayerGraphics.has(playerId)) {
        // Create new player graphics
        const playerGraphics = this.add.graphics();
        this.otherPlayerGraphics.set(playerId, playerGraphics);
        console.log(`✨ Game scene: Created graphics for player ${playerId} at (${player.position.x}, ${player.position.y})`);
      }
      
      const playerGraphics = this.otherPlayerGraphics.get(playerId)!;
      playerGraphics.clear();
      
      // Use interpolated position for smooth rendering
      const interpolatedPos = this.otherPlayerCurrentPositions.get(playerId);
      const renderX = interpolatedPos ? interpolatedPos.x : player.position.x;
      const renderY = interpolatedPos ? interpolatedPos.y : player.position.y;
      
      // Draw other player
      playerGraphics.fillStyle(player.color);
      playerGraphics.fillCircle(renderX, renderY, 8);
      
      // Draw other player's trail
      if (player.trailPoints && player.trailPoints.length > 1) {
        playerGraphics.lineStyle(3, player.color, 0.8);
        playerGraphics.beginPath();
        playerGraphics.moveTo(player.trailPoints[0]!.x, player.trailPoints[0]!.y);
        
        for (let i = 1; i < player.trailPoints.length; i++) {
          playerGraphics.lineTo(player.trailPoints[i]!.x, player.trailPoints[i]!.y);
        }
        
        playerGraphics.strokePath();
      }
      
      // Draw other player's occupied areas
      if (player.occupiedAreas) {
        player.occupiedAreas.forEach(area => {
          if (area.points && area.points.length >= 3) {
            const points = [...area.points];
            const firstPoint = points[0]!;
            const lastPoint = points[points.length - 1]!;
            
            if (firstPoint.x !== lastPoint.x || firstPoint.y !== lastPoint.y) {
              points.push({ x: firstPoint.x, y: firstPoint.y });
            }
            
            playerGraphics.fillStyle(area.color, 0.6);
            playerGraphics.beginPath();
            playerGraphics.moveTo(points[0]!.x, points[0]!.y);
            
            for (let i = 1; i < points.length; i++) {
              playerGraphics.lineTo(points[i]!.x, points[i]!.y);
            }
            
            playerGraphics.closePath();
            playerGraphics.fillPath();
            
            playerGraphics.lineStyle(2, area.color, 0.8);
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
  
  // Remove graphics for players who left
  for (const [playerId] of this.otherPlayerGraphics) {
    if (!this.otherPlayers || !this.otherPlayers.has(playerId)) {
      const graphics = this.otherPlayerGraphics.get(playerId);
      if (graphics) {
        graphics.destroy();
      }
      this.otherPlayerGraphics.delete(playerId);
      this.otherPlayerTargetPositions.delete(playerId);
      this.otherPlayerCurrentPositions.delete(playerId);
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
  
  // Check collision with other players using interpolated positions
  for (const [playerId, otherPlayer] of this.otherPlayers) {
    if (!otherPlayer.isAlive) continue;
    
    // Use interpolated position if available, otherwise use server position
    const interpolatedPos = this.otherPlayerCurrentPositions.get(playerId);
    const otherPlayerX = interpolatedPos ? interpolatedPos.x : otherPlayer.position.x;
    const otherPlayerY = interpolatedPos ? interpolatedPos.y : otherPlayer.position.y;
    
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
    color: 0xff4500 // Player color
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
  this.directionIndicator.lineStyle(3, 0xff4500, 0.8);
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
  this.directionIndicator.fillStyle(0xff4500, 0.8);
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
  this.playerDirection += directionChange;

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
    color: 0xff4500 // Player color
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
  
  // Draw current trail
  if (this.trailPoints.length > 1 && this.isDrawingTrail) {
    // Draw trail with different colors based on territory status
    const trailColor = this.isInOwnTerritory ? 0x00ff00 : 0xff4500; // Green in territory, Orange outside
    
    this.trails.lineStyle(4, trailColor, 0.8);
    this.trails.beginPath();
    this.trails.moveTo(this.trailPoints[0]!.x, this.trailPoints[0]!.y);
    
    for (let i = 1; i < this.trailPoints.length; i++) {
      this.trails.lineTo(this.trailPoints[i]!.x, this.trailPoints[i]!.y);
    }
    this.trails.strokePath();
    
    // Add a subtle glow effect
    this.trails.lineStyle(6, trailColor, 0.3);
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
      
      // Fill the area with better polygon handling
      this.territoryGraphics.fillStyle(area.color, 0.8);
      this.territoryGraphics.beginPath();
      this.territoryGraphics.moveTo(points[0]!.x, points[0]!.y);
      
      for (let i = 1; i < points.length; i++) {
        this.territoryGraphics.lineTo(points[i]!.x, points[i]!.y);
      }
      
      this.territoryGraphics.closePath();
      this.territoryGraphics.fillPath();
      
      // Draw border with slightly thicker line
      this.territoryGraphics.lineStyle(3, area.color, 1);
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
    
    // Fetch username from Redis and update labels when ready
    // Configure camera & background
    this.camera = this.cameras.main;
    this.camera.setBackgroundColor(0x0a0a0a);

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

    // Add UI elements (fixed position relative to camera)
    this.headerPlayerText = this.add.text(20, 20, `Player: ${this.username}`, {
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 }
    }).setScrollFactor(0);

    this.add.text(20, 50, `Subreddit: ${this.subreddit}`, {
      fontSize: '14px',
      color: '#ff4500',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 }
    }).setScrollFactor(0);

    // Show game ID in multiplayer mode
    if (this.isMultiplayer && this.gameId) {
      this.add.text(20, 80, `Game: ${this.gameId}`, {
        fontSize: '14px',
        color: '#00ff00',
        backgroundColor: '#000000',
        padding: { x: 8, y: 4 }
      }).setScrollFactor(0);
    }

    this.add.text(20, this.isMultiplayer && this.gameId ? 110 : 80, 'WASD/Arrow Keys to steer direction', {
      fontSize: '12px',
      color: '#cccccc',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 }
    }).setScrollFactor(0);

    this.add.text(20, this.isMultiplayer && this.gameId ? 140 : 110, 'Touch/Click to point player direction', {
      fontSize: '12px',
      color: '#00ffff',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 }
    }).setScrollFactor(0);

    this.add.text(20, this.isMultiplayer && this.gameId ? 170 : 140, 'Create closed areas to claim territory!', {
      fontSize: '12px',
      color: '#00ff00',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 }
    }).setScrollFactor(0);

    // Territory status indicator (dynamic)
    this.statusText = this.add.text(20, this.isMultiplayer && this.gameId ? 200 : 170, 'Status: Safe in territory', {
      fontSize: '12px',
      color: '#00ff00',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 }
    }).setScrollFactor(0);

    // Setup responsive layout
    this.updateLayout(this.scale.width, this.scale.height);
    this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      const { width, height } = gameSize;
      this.updateLayout(width, height);
    });
  }

  override update() {
    // Handle player movement
    this.handlePlayerMovement();

    // Recompute territory state after moving
    const currentPos = { x: this.player.x, y: this.player.y };
    this.isInOwnTerritory = this.isPointInOwnTerritory(currentPos);

    // Update status text
    if (this.isInOwnTerritory) {
      this.statusText.setText('Status: Safe in territory');
      this.statusText.setColor('#00ff00');
    } else {
      this.statusText.setText('Status: Outside (danger)');
      this.statusText.setColor('#ff4500');
    }

    // Update player label position (follows player)
    this.playerLabel.setPosition(this.player.x, this.player.y - 20);

    // Multiplayer updates
    if (this.isMultiplayer) {
      // Sync player position
      this.syncPlayerPosition();
      
      // Update other players
      this.updateOtherPlayers();
      
      // Check collisions with other players
      this.checkPlayerCollisions();
    }

    // Draw direction indicator
    this.drawDirectionIndicator();

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


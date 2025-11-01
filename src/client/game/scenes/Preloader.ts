import { Scene } from 'phaser';
import * as Phaser from 'phaser';

export class Preloader extends Scene {
  trailGraphics: Phaser.GameObjects.Graphics;
  trailHead: Phaser.GameObjects.Graphics;
  trailPoints: Array<{x: number, y: number}>;
  animationStartTime: number;
  animationDuration: number = 3000; // Minimum 1.5 seconds
  
  constructor() {
    super('Preloader');
  }

  init() {
    // Set black background
    this.cameras.main.setBackgroundColor(0x000000);
    
    // Initialize graphics for trail animation
    this.trailGraphics = this.add.graphics();
    this.trailHead = this.add.graphics();
    this.trailPoints = [];
    this.animationStartTime = this.time.now;
    
    // Start the trail animation
    this.animateTrail();
  }
  
  animateTrail() {
    const redditOrange = 0xff4500;
    const width = this.scale.width;
    const height = this.scale.height;
    
    // Zig-zag path configuration
    const startX = -150;
    const endX = width + 20;
    const centerY = height / 2;
    const zigZagHeight = 80;
    const zigZags = 2;
    
    // Event listener for smooth animation
    const timer = this.time.addEvent({
      delay: 16, // ~60fps
      callback: () => {
        const elapsed = this.time.now - this.animationStartTime;
        const progress = Math.min(elapsed / this.animationDuration, 1);
        
        // Clear previous frame
        this.trailGraphics.clear();
        this.trailHead.clear();
        
        // Calculate current position along zig-zag path
        const currentX = startX + (endX - startX) * progress;
        
        // Create zig-zag pattern
        let zigZagProgress = progress * zigZags;
        const zigZagCycle = zigZagProgress - Math.floor(zigZagProgress);
        const zigZagIndex = Math.floor(zigZagProgress);
        
        // Apply vertical offset based on zig-zag pattern
        let verticalOffset = 0;
        if (zigZagIndex % 2 === 0) {
          // Going up
          verticalOffset = Math.sin(zigZagCycle * Math.PI) * zigZagHeight;
        } else {
          // Going down
          verticalOffset = Math.sin(zigZagCycle * Math.PI) * -zigZagHeight;
        }
        
        const currentY = centerY + verticalOffset;
        
        // Add point to trail
        this.trailPoints.push({ x: currentX, y: currentY });
        
        // Limit trail length to keep it smooth - increased for longer trail
        const maxTrailLength = 150;
        if (this.trailPoints.length > maxTrailLength) {
          this.trailPoints.shift();
        }
        
        // Draw trail with neon glow effect (similar to game)
        if (this.trailPoints.length > 1 && this.trailPoints[0]) {
          // Draw multiple glow layers for bloom effect
          const glowLayers = [
            { width: 16, alpha: 0.15 },
            { width: 12, alpha: 0.20 },
            { width: 8, alpha: 0.25 },
            { width: 6, alpha: 0.30 }
          ];
          
          // Outer glow layers
          for (const layer of glowLayers) {
            this.trailGraphics.lineStyle(layer.width, redditOrange, layer.alpha);
            this.trailGraphics.beginPath();
            this.trailGraphics.moveTo(this.trailPoints[0]!.x, this.trailPoints[0]!.y);
            for (let i = 1; i < this.trailPoints.length; i++) {
              const point = this.trailPoints[i];
              if (point) {
                this.trailGraphics.lineTo(point.x, point.y);
              }
            }
            this.trailGraphics.strokePath();
          }
          
          // Main trail line
          this.trailGraphics.lineStyle(4, redditOrange, 0.9);
          this.trailGraphics.beginPath();
          this.trailGraphics.moveTo(this.trailPoints[0]!.x, this.trailPoints[0]!.y);
          for (let i = 1; i < this.trailPoints.length; i++) {
            const point = this.trailPoints[i];
            if (point) {
              this.trailGraphics.lineTo(point.x, point.y);
            }
          }
          this.trailGraphics.strokePath();
        }
        
        // Draw trail head (circle like player in game)
        // Draw glow layers for the head
        const headGlowLayers = [
          { radius: 20, alpha: 0.15 },
          { radius: 16, alpha: 0.20 },
          { radius: 12, alpha: 0.25 },
          { radius: 10, alpha: 0.30 }
        ];
        
        // Outer glow layers
        for (const layer of headGlowLayers) {
          this.trailHead.fillStyle(redditOrange, layer.alpha);
          this.trailHead.fillCircle(currentX, currentY, layer.radius);
        }
        
        // Main circle
        this.trailHead.fillStyle(redditOrange, 1.0);
        this.trailHead.fillCircle(currentX, currentY, 8);
        
        // Stop animation when complete
        if (progress >= 1) {
          timer.remove(false);
        }
      },
      repeat: -1 // Repeat until manually stopped
    });
  }

  preload() {
    //  Load the assets for the game - Replace with your own assets
    this.load.setPath('assets');

    this.load.image('logo', 'logo.png');
  }

  async create() {
    //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
    //  For example, you can define global animations here, so we can use them in other scenes.

    // Fetch and store username before moving to MainMenu
    const username = await this.fetchAndStoreUsername();

    await this.deleteAllRedisData();
    
    // Log all Redis data for debugging
    await this.logAllRedisData();
  
    // Store in Phaser registry
    this.scene.start('MainMenu', { username });

  }

  private async fetchAndStoreUsername(): Promise<void> {
    try {
      const response = await fetch('/api/me');
      if (!response.ok) return;
      
      const data = await response.json();
      const username = data?.username;
      
      if (username && typeof username === 'string') {
        const formattedUsername = `u/${username.replace(/^u\//, '')}`;
        
        // Store in Redis for persistence
        await fetch('/api/store-username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: formattedUsername })
        });
        
        // Store in Phaser registry for immediate access
        this.registry.set('playerUsername', formattedUsername);
        
        console.log('Username stored:', formattedUsername);
      }
    } catch (error) {
      console.error('Failed to fetch username:', error);
    }
  }

  private async logAllRedisData(): Promise<void> {
    try {
      console.log('🔍 Fetching all Redis data...');
      
      const response = await fetch('/api/debug/redis');
      if (!response.ok) {
        console.error('Failed to fetch Redis data:', response.status, response.statusText);
        return;
      }
      
      const redisData = await response.json();
      
      console.log('📊 Redis Data:', redisData);
      console.log('📊 Redis Data (formatted):', JSON.stringify(redisData, null, 2));
      
      // Redis Insight-like information
      console.log(`🗝️ Total Redis Keys: ${redisData.totalKeys}`);
      console.log('🗝️ All Redis Keys:', redisData.allKeys);
      
      if (redisData.keyDetails) {
        console.log('🔍 Key Details (Redis Insight-like):');
        for (const [key, details] of Object.entries(redisData.keyDetails)) {
          console.log(`  ${key}:`, details);
        }
      }
      
      // Log specific game data if it exists
      if (redisData.currentGame) {
        console.log('🎮 Current Game:', redisData.currentGame);
      }
      
      // Log stored username
      if (redisData.storedUsername) {
        console.log('👤 Stored Username:', redisData.storedUsername);
      }
      
      // Log count data
      if (redisData.count !== undefined) {
        console.log('🔢 Count:', redisData.count);
      }
      
    } catch (error) {
      console.error('❌ Failed to log Redis data:', error);
    }
  }
  private async deleteAllRedisData(): Promise<void> {
    try {
      console.log('🧹 Cleaning up old Redis data...');
      
      const response = await fetch('/api/debug/cleanup-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        console.error('Failed to delete Redis data:', response.status, response.statusText);
        return;
      }
      
      const result = await response.json();
      console.log('✅ Redis cleanup result:', result);
      console.log(`🧹 Cleaned ${result.totalCleaned} keys:`, result.cleanedItems);
      
    } catch (error) {
      console.error('❌ Failed to delete Redis data:', error);
    }
  }

}




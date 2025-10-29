import { Scene } from 'phaser';

export class Preloader extends Scene {
  constructor() {
    super('Preloader');
  }

  init() {
    //  We loaded this image in our Boot Scene, so we can display it here
    this.add.image(512, 384, 'background');

    //  A simple progress bar. This is the outline of the bar.
    this.add.rectangle(512, 384, 468, 32).setStrokeStyle(1, 0xffffff);

    //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
    const bar = this.add.rectangle(512 - 230, 384, 4, 28, 0xffffff);

    //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
    this.load.on('progress', (progress: number) => {
      //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
      bar.width = 4 + 460 * progress;
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




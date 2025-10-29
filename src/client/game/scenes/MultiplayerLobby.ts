import { Scene, GameObjects } from 'phaser';
import { MultiplayerManager } from '../MultiplayerManager';

export class MultiplayerLobby extends Scene {
  background: GameObjects.Image | null = null;
  title: GameObjects.Text | null = null;
  quickJoinButton: GameObjects.Text | null = null;
  usernameText: GameObjects.Text | null = null;
  multiplayerManager: MultiplayerManager;
  username: string = 'u/reddituser';

  constructor() {
    super('MultiplayerLobby');
    this.multiplayerManager = new MultiplayerManager();
  }

    init(): void {
    this.background = null;
    this.title = null;
    this.quickJoinButton = null;
    this.usernameText = null;
  }

  async create() {
    this.refreshLayout();

    // Get username from registry
    const storedUsername = this.registry.get('playerUsername');
    if (storedUsername && typeof storedUsername === 'string') {
      this.username = storedUsername;
    }
    
    // Ensure username is set, fallback to default
    if (!this.username || this.username === 'u/reddituser') {
      // Try fetching from Redis
      try {
        const response = await fetch('/api/get-username');
        if (response.ok) {
          const data = await response.json();
          if (data?.username && typeof data.username === 'string') {
            this.username = data.username;
          }
        }
      } catch (error) {
        console.warn('Failed to fetch username from server:', error);
      }
    }
    
    // Final fallback
    if (!this.username || this.username.trim() === '') {
      this.username = 'u/player';
    }

    console.log('MultiplayerLobby: Using username:', this.username);
    
    // Update username display
    if (this.usernameText) {
      this.usernameText.setText(`Playing as: ${this.username}`);
    }

    // Re-calculate positions whenever the game canvas is resized
    this.scale.on('resize', () => this.refreshLayout());

    // Handle button clicks
    this.quickJoinButton!.setInteractive();
    this.quickJoinButton!.on('pointerdown', () => this.quickJoinGame());

    // Add back button
    const backButton = this.add.text(50, 50, '← Back', {
      fontSize: '20px',
      color: '#ffffff',
      backgroundColor: '#000000',
      padding: { x: 8, y: 4 }
    }).setScrollFactor(0);

    backButton.setInteractive();
    backButton.on('pointerdown', () => {
      this.scene.start('MainMenu');
    });
  }

  private refreshLayout(): void {
    const { width, height } = this.scale;

    // Resize camera to new viewport
    this.cameras.resize(width, height);

    // Background
    if (!this.background) {
      this.background = this.add.image(0, 0, 'background').setOrigin(0);
    }
    this.background!.setDisplaySize(width, height);

    const scaleFactor = Math.min(width / 1024, height / 768);

    // Title
    if (!this.title) {
      this.title = this.add
        .text(0, 0, 'Multiplayer Lobby', {
          fontFamily: 'Arial Black',
          fontSize: '32px',
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 6,
          align: 'center',
        })
        .setOrigin(0.5);
    }
    this.title!.setPosition(width / 2, height * 0.3);
    this.title!.setScale(scaleFactor);

    // Username display
    if (!this.usernameText) {
      this.usernameText = this.add.text(width / 2, height * 0.4, `Playing as: ${this.username}`, {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 8, y: 4 }
      }).setOrigin(0.5).setScrollFactor(0);
    } else {
      this.usernameText.setPosition(width / 2, height * 0.4);
      this.usernameText.setText(`Playing as: ${this.username}`);
    }

    // Quick Join Button
    if (!this.quickJoinButton) {
      this.quickJoinButton = this.add
        .text(0, 0, 'Quick Join', {
          fontSize: '24px',
          color: '#ffffff',
          backgroundColor: '#0066ff',
          padding: { x: 16, y: 8 }
        })
        .setOrigin(0.5);
    }
    this.quickJoinButton!.setPosition(width / 2, height * 0.6);
    this.quickJoinButton!.setScale(scaleFactor);
  }

  private async quickJoinGame() {
    try {
      this.quickJoinButton!.setText('Finding Game...');
      this.quickJoinButton!.setStyle({ backgroundColor: '#666666' });

      const { playerId, gameState } = await this.multiplayerManager.quickJoin(
        this.username,
        'r/gaming'
      );

      // Pass multiplayer data to Game scene
      this.scene.start('Game', {
        multiplayerManager: this.multiplayerManager,
        playerId,
        gameState,
        isMultiplayer: true
      });
    } catch (error) {
      console.error('Failed to quick join game:', error);
      this.quickJoinButton!.setText('Quick Join');
      this.quickJoinButton!.setStyle({ backgroundColor: '#0066ff' });
      
      // Show error message
      this.add.text(this.scale.width / 2, this.scale.height * 0.9, 'Failed to quick join game', {
        fontSize: '16px',
        color: '#ff0000',
        backgroundColor: '#000000',
        padding: { x: 8, y: 4 }
      }).setOrigin(0.5).setScrollFactor(0);
    }
  }
}

import { Scene, GameObjects } from 'phaser';
import { MultiplayerManager } from '../MultiplayerManager';

// Neon-inspired colors palette
const NEON_COLORS = [
  0xff4500, // Reddit Orange
  0x00ff00, // Neon Green
  0x00ffff, // Cyan
  0xff00ff, // Magenta
  0xffff00, // Yellow
  0xff1493, // Deep Pink
  0x00ced1, // Dark Turquoise
  0x7fff00, // Chartreuse
  0xff69b4, // Hot Pink
  0x1e90ff, // Dodger Blue
  0xffd700, // Gold
  0xadff2f, // Green Yellow
  0xff6347, // Tomato
  0x40e0d0, // Turquoise
  0xba55d3, // Medium Orchid
  0xffa500, // Orange
];

export class MainMenu extends Scene {
  background: GameObjects.Image | null = null;
  joinAsUsernameButton: GameObjects.Text | null = null;
  subredditDropdown: GameObjects.Text | null = null;
  dropdownOptions: Array<{text: string, display: string}> | null = null;
  dropdownElements: Phaser.GameObjects.Text[] = [];
  selectedSubreddit: string | null = null;
  usernameText: GameObjects.Text | null = null;
  multiplayerManager: MultiplayerManager;
  username: string = 'u/reddituser';
  playerColor: number = 0xff4500; // Default to Reddit orange
  subreddits: string[] = ['r/gaming', 'r/funny', 'r/aww', 'r/AskReddit', 'r/worldnews', 'r/technology', 'r/science', 'r/art'];
  isDropdownOpen: boolean = false;

  constructor() {
    super('MainMenu');
    this.multiplayerManager = new MultiplayerManager();
  }

  /**
   * Reset cached GameObject references every time the scene starts.
   * The same Scene instance is reused by Phaser, so we must ensure
   * stale (destroyed) objects are cleared out when the scene restarts.
   */
  init(): void {
    this.background = null;
    this.joinAsUsernameButton = null;
    this.subredditDropdown = null;
    this.dropdownOptions = null;
    this.dropdownElements = [];
    this.usernameText = null;
    this.selectedSubreddit = null;
    this.isDropdownOpen = false;
    
    // Assign random color to player
    const randomIndex = Math.floor(Math.random() * NEON_COLORS.length);
    this.playerColor = NEON_COLORS[randomIndex] ?? 0xff4500;
  }

  async create() {
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

    console.log('MainMenu: Using username:', this.username);
    console.log('MainMenu: Player color:', this.playerColor.toString(16));

    this.refreshLayout();

    // Re-calculate positions whenever the game canvas is resized (e.g. orientation change).
    this.scale.on('resize', () => this.refreshLayout());

    // Handle button clicks
    this.joinAsUsernameButton!.on('pointerdown', () => {
      this.joinGame(this.username);
    });

    this.subredditDropdown!.on('pointerdown', () => {
      this.toggleDropdown();
    });
  }

  private toggleDropdown() {
    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown() {
    if (this.isDropdownOpen || !this.dropdownOptions) return;
    
    this.isDropdownOpen = true;
    const dropdownY = this.subredditDropdown!.y;
    const spacing = 50;
    const base = Math.min(this.scale.width, this.scale.height);
    const optionFontPx = Math.max(20, Math.round(base * 0.035));
    
    // Show all dropdown options
    this.dropdownOptions.forEach((option, index) => {
      const optionText = this.add.text(
        this.subredditDropdown!.x,
        dropdownY + (index + 1) * spacing,
        option.display,
        {
          fontSize: `${optionFontPx}px`,
          color: '#ffffff',
          backgroundColor: '#222222',
          padding: { x: 14, y: 8 }
        }
      ).setOrigin(0.5).setScrollFactor(0).setInteractive({ useHandCursor: true }).setDepth(1000);
      optionText.setShadow(2, 2, '#000000', 4, true, true);
      optionText.setResolution((window as any)?.devicePixelRatio || 2);

      optionText.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation();
        this.selectSubreddit(option.text);
        this.closeDropdown();
      });

      this.dropdownElements.push(optionText);
    });
  }

  private closeDropdown() {
    if (!this.isDropdownOpen) return;
    
    this.isDropdownOpen = false;
    
    // Remove all dropdown option texts
    this.dropdownElements.forEach(element => {
      element.destroy();
    });
    this.dropdownElements = [];
  }

  private selectSubreddit(subreddit: string) {
    this.selectedSubreddit = subreddit;
    this.subredditDropdown!.setText(`Represent: ${subreddit} ▼`);
    console.log('Selected subreddit:', subreddit);
    // Immediately join using the selected subreddit name for visibility of action
    this.joinGame(subreddit);
  }

  private joinGame(displayName: string) {
    const finalName = this.selectedSubreddit || displayName;
    this.quickJoinGame(finalName);
  }

  /**
   * Positions and (lightly) scales all UI elements based on the current game size.
   * Call this from create() and from any resize events.
   */
  private refreshLayout(): void {
    const { width, height } = this.scale;

    // Resize camera to new viewport to prevent black bars
    this.cameras.resize(width, height);

    // Background – stretch to fill the whole canvas
    if (!this.background) {
      this.background = this.add.image(0, 0, 'background').setOrigin(0);
    }
    this.background!.setDisplaySize(width, height);

    const scaleFactor = Math.min(width / 1024, height / 768);
    // Responsive font sizes (larger on mobile / small screens)
    const base = Math.min(width, height);
    const usernameFontPx = Math.max(18, Math.round(base * 0.03));
    const buttonFontPx = Math.max(22, Math.round(base * 0.04));
    const dropdownFontPx = Math.max(22, Math.round(base * 0.04));

    // Username display
    if (!this.usernameText) {
      this.usernameText = this.add.text(width / 2, height * 0.4, `Reddit: ${this.username}`, {
        fontSize: `${usernameFontPx}px`,
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 10, y: 6 }
      }).setOrigin(0.5).setScrollFactor(0);
      this.usernameText.setShadow(2, 2, '#000000', 4, true, true);
      this.usernameText.setResolution((window as any)?.devicePixelRatio || 2);
    } else {
      this.usernameText.setPosition(width / 2, height * 0.4);
      this.usernameText.setText(`Reddit: ${this.username}`);
      this.usernameText.setStyle({ fontSize: `${usernameFontPx}px`, padding: { x: 10, y: 6 } as any });
      this.usernameText.setShadow(2, 2, '#000000', 4, true, true);
      this.usernameText.setResolution((window as any)?.devicePixelRatio || 2);
    }

    // Join as Username Button
    if (!this.joinAsUsernameButton) {
      this.joinAsUsernameButton = this.add
        .text(0, 0, `Join as ${this.username}`, {
          fontSize: `${buttonFontPx}px`,
          color: '#000000',
          backgroundColor: '#00ff88',
          padding: { x: 18, y: 10 }
        })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      this.joinAsUsernameButton.setShadow(2, 2, '#003322', 4, true, true);
      this.joinAsUsernameButton.setResolution((window as any)?.devicePixelRatio || 2);
    } else {
      this.joinAsUsernameButton.setStyle({ fontSize: `${buttonFontPx}px`, color: '#000000', backgroundColor: '#00ff88', padding: { x: 18, y: 10 } as any });
      this.joinAsUsernameButton.setResolution((window as any)?.devicePixelRatio || 2);
    }
    this.joinAsUsernameButton!.setPosition(width / 2, height * 0.55);
    this.joinAsUsernameButton!.setScale(scaleFactor);

    // Subreddit Dropdown
    if (!this.subredditDropdown) {
      this.subredditDropdown = this.add
        .text(0, 0, 'Represent a subreddit ▼', {
          fontSize: `${dropdownFontPx}px`,
          color: '#000000',
          backgroundColor: '#66a3ff',
          padding: { x: 18, y: 10 }
        })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      this.subredditDropdown.setShadow(2, 2, '#002244', 4, true, true);
      this.subredditDropdown.setResolution((window as any)?.devicePixelRatio || 2);
    } else {
      this.subredditDropdown.setStyle({ fontSize: `${dropdownFontPx}px`, color: '#000000', backgroundColor: '#66a3ff', padding: { x: 18, y: 10 } as any });
      this.subredditDropdown.setResolution((window as any)?.devicePixelRatio || 2);
    }
    this.subredditDropdown!.setPosition(width / 2, height * 0.65);
    this.subredditDropdown!.setScale(scaleFactor);

    // Initialize dropdown options
    if (!this.dropdownOptions) {
      this.dropdownOptions = this.subreddits.map(sub => ({
        text: sub,
        display: sub
      }));
    }
  }

  private async quickJoinGame(playerName: string) {
    try {
      if (this.selectedSubreddit) {
        this.subredditDropdown!.setText('Finding Game...');
        this.subredditDropdown!.setStyle({ backgroundColor: '#666666' });
      } else {
        this.joinAsUsernameButton!.setText('Finding Game...');
        this.joinAsUsernameButton!.setStyle({ backgroundColor: '#666666' });
      }

      // Join game - we'll send initial position/direction after player is created in Game scene
      const { playerId, gameState } = await this.multiplayerManager.quickJoin(
        playerName,
        'r/gaming'
      );

      // Store player color in registry to pass to Game scene
      this.registry.set('playerColor', this.playerColor);

      // Pass multiplayer data to Game scene
      this.scene.start('Game', {
        multiplayerManager: this.multiplayerManager,
        playerId,
        gameState,
        isMultiplayer: true,
        justJoined: true, // Flag to indicate we just joined and should send initial position
        playerColor: this.playerColor,
        playerName: playerName
      });
    } catch (error) {
      console.error('Failed to quick join game:', error);
      
      if (this.selectedSubreddit) {
        this.subredditDropdown!.setText(`Represent: ${this.selectedSubreddit} ▼`);
        this.subredditDropdown!.setStyle({ backgroundColor: '#0066ff' });
      } else {
        this.joinAsUsernameButton!.setText(`Join as ${this.username}`);
        this.joinAsUsernameButton!.setStyle({ backgroundColor: '#00ff00' });
      }
      
      // Show error message
      this.add.text(this.scale.width / 2, this.scale.height * 0.9, 'Failed to join game', {
        fontSize: '16px',
        color: '#ff0000',
        backgroundColor: '#000000',
        padding: { x: 8, y: 4 }
      }).setOrigin(0.5).setScrollFactor(0);
    }
  }
}

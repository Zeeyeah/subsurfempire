import express from 'express';
import { InitResponse, IncrementResponse, DecrementResponse } from '../shared/types/api';
import { redis, createServer, context, reddit } from '@devvit/web/server';
import { createPost } from './core/post';

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

// COMMENTED OUT - COMPLEX MULTIPLAYER SYSTEM FUNCTIONS
/*
// Game Management Functions
function generateGameId(): string {
  return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generatePlayerId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateRoomId(): string {
  return `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function createGameState(gameId: string): Promise<GameState> {
  const gameState: GameState = {
    gameId,
    players: new Map(),
    occupiedAreas: [],
    gameRadius: 4000,
    gameCenter: { x: 400, y: 300 },
    status: 'waiting',
    createdAt: Date.now(),
    lastUpdate: Date.now()
  };
  
  await redis.set(`game:${gameId}`, JSON.stringify(gameState));
  return gameState;
}

async function getGameState(gameId: string): Promise<GameState | null> {
  const gameData = await redis.get(`game:${gameId}`);
  if (!gameData) return null;
  
  const parsed = JSON.parse(gameData);
  // Convert players Map back from object
  parsed.players = new Map(Object.entries(parsed.players));
  return parsed;
}

async function updateGameState(gameId: string, gameState: GameState): Promise<void> {
  gameState.lastUpdate = Date.now();
  // Convert players Map to object for JSON serialization
  const serializable = {
    ...gameState,
    players: Object.fromEntries(gameState.players)
  };
  await redis.set(`game:${gameId}`, JSON.stringify(serializable));
}

// Room Management Functions
async function addActiveRoom(roomId: string): Promise<void> {
  const activeRooms = await getActiveRooms();
  if (!activeRooms.includes(roomId)) {
    activeRooms.push(roomId);
    await redis.set('active_rooms', JSON.stringify(activeRooms));
  }
}

async function removeActiveRoom(roomId: string): Promise<void> {
  const activeRooms = await getActiveRooms();
  const filteredRooms = activeRooms.filter(id => id !== roomId);
  await redis.set('active_rooms', JSON.stringify(filteredRooms));
}

async function getActiveRooms(): Promise<string[]> {
  const roomsData = await redis.get('active_rooms');
  if (!roomsData) return [];
  try {
    return JSON.parse(roomsData);
  } catch {
    return [];
  }
}

async function cleanupEmptyRooms(): Promise<void> {
  const activeRooms = await getActiveRooms();
  console.log(`Cleaning up empty rooms. Active rooms: ${activeRooms.length}`);
  
  for (const roomId of activeRooms) {
    const roomData = await redis.get(`room:${roomId}`);
    if (!roomData) {
      // Room data doesn't exist, remove from active list
      console.log(`Room ${roomId} data missing, removing from active list`);
      await removeActiveRoom(roomId);
      continue;
    }
    
    const room: GameRoom = JSON.parse(roomData);
    const gameState = await getGameState(room.gameId);
    
    console.log(`Room ${roomId}: players=${gameState?.players.size || 0}, status=${room.status}`);
    
    // Clean up if no players OR if room is very old (older than 1 hour)
    const isOld = Date.now() - room.createdAt > 3600000; // 1 hour
    const isEmpty = !gameState || gameState.players.size === 0;
    
    if (isEmpty || isOld) {
      // Clean up empty or old room
      await redis.del(`room:${roomId}`);
      await redis.del(`room:${roomId}:game`);
      await redis.del(`game:${room.gameId}`);
      await removeActiveRoom(roomId);
      console.log(`Cleaned up ${isEmpty ? 'empty' : 'old'} room: ${roomId}`);
    }
  }
}

async function findAvailableRoom(): Promise<{ room: GameRoom; gameState: GameState } | null> {
  const activeRooms = await getActiveRooms();
  console.log(`Searching for available rooms. Active rooms: ${activeRooms.length}`);
  
  for (const roomId of activeRooms) {
    const roomData = await redis.get(`room:${roomId}`);
    if (!roomData) {
      console.log(`Room ${roomId} data not found, skipping`);
      continue;
    }
    
    const room: GameRoom = JSON.parse(roomData);
    const gameState = await getGameState(room.gameId);
    
    console.log(`Room ${roomId}: players=${gameState?.players.size || 0}, maxPlayers=${room.maxPlayers}, status=${room.status}`);
    
    if (gameState && gameState.players.size < room.maxPlayers && room.status === 'waiting') {
      console.log(`Found available room: ${roomId}`);
      return { room, gameState };
    }
  }
  
  console.log('No available rooms found');
  return null;
}
*/

router.get<{ postId: string }, InitResponse | { status: string; message: string }>(
  '/api/init',
  async (_req, res): Promise<void> => {
    const { postId } = context;

    if (!postId) {
      console.error('API Init Error: postId not found in devvit context');
      res.status(400).json({
        status: 'error',
        message: 'postId is required but missing from context',
      });
      return;
    }

    try {
      const count = await redis.get('count');
      res.json({
        type: 'init',
        postId: postId,
        count: count ? parseInt(count) : 0,
      });
    } catch (error) {
      console.error(`API Init Error for post ${postId}:`, error);
      let errorMessage = 'Unknown error during initialization';
      if (error instanceof Error) {
        errorMessage = `Initialization failed: ${error.message}`;
      }
      res.status(400).json({ status: 'error', message: errorMessage });
    }
  }
);

router.post<{ postId: string }, IncrementResponse | { status: string; message: string }, unknown>(
  '/api/increment',
  async (_req, res): Promise<void> => {
    const { postId } = context;
    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    res.json({
      count: await redis.incrBy('count', 1),
      postId,
      type: 'increment',
    });
  }
);

router.post<{ postId: string }, DecrementResponse | { status: string; message: string }, unknown>(
  '/api/decrement',
  async (_req, res): Promise<void> => {
    const { postId } = context;
    if (!postId) {
      res.status(400).json({
        status: 'error',
        message: 'postId is required',
      });
      return;
    }

    res.json({
      count: await redis.incrBy('count', -1),
      postId,
      type: 'decrement',
    });
  }
);

router.post('/internal/on-app-install', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      status: 'success',
      message: `Post created in subreddit ${context.subredditName} with id ${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});
// Inspect Redis

// Return the Reddit username for the current request context
router.get('/api/me', async (_req, res): Promise<void> => {
  try {
    // Context may have different shapes depending on entrypoint; try several common fields
    const username = await reddit.getCurrentUsername()
    res.json({ username });
    console.log(username)
  } catch (error) {
    console.error('Failed to fetch user info from context', error);
    res.status(200).json({ username: null });
  }
});

// Store username in Redis for persistence
router.post('/api/store-username', async (req, res): Promise<void> => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    await redis.set('player:username', username);
    res.json({ success: true, username });
    console.log('Username stored in Redis:', username);
  } catch (error) {
    console.error('Failed to store username:', error);
    res.status(500).json({ error: 'Failed to store username' });
  }
});

// Get stored username from Redis
router.get('/api/get-username', async (_req, res): Promise<void> => {
  try {
    const username = await redis.get('player:username');
    res.json({ username });
  } catch (error) {
    console.error('Failed to get username:', error);
    res.status(500).json({ error: 'Failed to get username' });
  }
});

// COMMENTED OUT - COMPLEX MULTIPLAYER SYSTEM
// Multiplayer Game API Endpoints

// Create a new game room
/*
router.post('/api/game/create', async (_req, res): Promise<void> => {
  try {
    const gameId = generateGameId();
    const roomId = generateRoomId();
    
    const gameState = await createGameState(gameId);
    
    const gameRoom: GameRoom = {
      roomId,
      gameId,
      maxPlayers: 8,
      currentPlayers: 0,
      status: 'waiting',
      createdAt: Date.now()
    };
    
    await redis.set(`room:${roomId}`, JSON.stringify(gameRoom));
    await redis.set(`room:${roomId}:game`, gameId);
    
    // Add to active rooms list
    await addActiveRoom(roomId);
    
    res.json({ roomId, gameId, gameState });
  } catch (error) {
    console.error('Failed to create game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});
*/

// SIMPLE TWO-PLAYER MULTIPLAYER SYSTEM USING REDIS
// Store game state in Redis since serverless functions don't maintain state

async function getCurrentGame(): Promise<{
  gameId: string;
  players: Map<string, any>;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
} | null> {
  try {
    const gameData = await redis.get('current_game');
    if (!gameData) return null;
    
    const parsed = JSON.parse(gameData);
    // Convert players back to Map
    parsed.players = new Map(Object.entries(parsed.players));
    return parsed;
  } catch (error) {
    console.error('Failed to get current game:', error);
    return null;
  }
}

async function setCurrentGame(game: {
  gameId: string;
  players: Map<string, any>;
  status: 'waiting' | 'playing' | 'finished';
  createdAt: number;
} | null): Promise<void> {
  try {
    if (!game) {
      await redis.del('current_game');
      return;
    }
    
    // Convert players Map to object for JSON serialization
    const serializable = {
      ...game,
      players: Object.fromEntries(game.players)
    };
    
    await redis.set('current_game', JSON.stringify(serializable));
  } catch (error) {
    console.error('Failed to set current game:', error);
  }
}

// Automatic cleanup function - checks for stale games
async function checkAndCleanupStaleGames(): Promise<void> {
  try {
    const currentGame = await getCurrentGame();
    
    if (!currentGame) {
      return; // No game to clean up
    }
    
    const now = Date.now();
    const gameAge = now - currentGame.createdAt;
    const maxGameAge = 30 * 60 * 1000; // 30 minutes
    
    // Check if game is stale (very old or no players)
    const isStale = gameAge > maxGameAge || currentGame.players.size === 0;
    
    if (isStale) {
      console.log(`🧹 Cleaning up stale game: age=${Math.round(gameAge / 1000)}s, players=${currentGame.players.size}`);
      await setCurrentGame(null);
      console.log('✅ Stale game cleaned up automatically');
    }
  } catch (error) {
    console.error('Failed to cleanup stale games:', error);
  }
}

// Simple game creation - only allows one game at a time
router.post('/api/game/create', async (_req, res): Promise<void> => {
  try {
    // Check for stale games first
    await checkAndCleanupStaleGames();
    
    const currentGame = await getCurrentGame();
    
    if (currentGame && currentGame.status === 'waiting') {
      // Return existing waiting game
      res.json({ 
        gameId: currentGame.gameId, 
        gameState: {
          gameId: currentGame.gameId,
          players: Object.fromEntries(currentGame.players),
          status: currentGame.status,
          maxPlayers: 2
        }
      });
    } else {
      // Create new game
      const gameId = `simple_game_${Date.now()}`;
      const newGame = {
        gameId,
        players: new Map(),
        status: 'waiting' as const,
        createdAt: Date.now()
      };
      
      await setCurrentGame(newGame);
      
      res.json({ 
        gameId, 
        gameState: {
          gameId,
          players: {},
          status: 'waiting',
          maxPlayers: 2
        }
      });
    }
  } catch (error) {
    console.error('Failed to create game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// Simple join - join the current game if available
router.post('/api/game/join', async (req, res): Promise<void> => {
  try {
    const { username, subreddit } = req.body;
    
    console.log('Join request received:', { username, subreddit, body: req.body });
    
    if (!username || typeof username !== 'string' || username.trim() === '') {
      console.error('Invalid username provided:', username);
      res.status(400).json({ error: 'Username is required and must be a non-empty string' });
      return;
    }
    
    // Check for stale games first
    await checkAndCleanupStaleGames();
    
    let currentGame = await getCurrentGame();
    
    if (!currentGame) {
      // Create new game if none exists
      const gameId = `simple_game_${Date.now()}`;
      currentGame = {
        gameId,
        players: new Map(),
        status: 'waiting',
        createdAt: Date.now()
      };
    }
    
    if (currentGame.players.size >= 2) {
      res.status(400).json({ error: 'Game is full (max 2 players)' });
      return;
    }
    
    const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    // Randomize spawn positions but keep players close to each other
    const gameCenterX = 400;
    const gameCenterY = 300;
    const spawnRadius = 80; // Distance from center for random spawn
    
    let spawnX: number;
    let spawnY: number;
    
    if (currentGame.players.size === 0) {
      // First player - spawn at center or slightly offset
      const angle = Math.random() * Math.PI * 2;
      const offset = 20 + Math.random() * 30; // 20-50 pixels from center
      spawnX = gameCenterX + Math.cos(angle) * offset;
      spawnY = gameCenterY + Math.sin(angle) * offset;
    } else {
      // Second player - spawn near first player but not too close
      const firstPlayer = Array.from(currentGame.players.values())[0];
      const firstPlayerPos = firstPlayer.position;
      
      // Spawn 60-120 pixels away from first player
      const distance = 60 + Math.random() * 60;
      const angle = Math.random() * Math.PI * 2;
      spawnX = firstPlayerPos.x + Math.cos(angle) * distance;
      spawnY = firstPlayerPos.y + Math.sin(angle) * distance;
      
      // Ensure second player stays within spawn radius from center
      const distanceFromCenter = Math.sqrt(
        Math.pow(spawnX - gameCenterX, 2) + Math.pow(spawnY - gameCenterY, 2)
      );
      if (distanceFromCenter > spawnRadius) {
        // Clamp to spawn radius
        const angleToCenter = Math.atan2(gameCenterY - spawnY, gameCenterX - spawnX);
        spawnX = gameCenterX + Math.cos(angleToCenter) * spawnRadius;
        spawnY = gameCenterY + Math.sin(angleToCenter) * spawnRadius;
      }
    }
    
    const player = {
      id: playerId,
      username,
      subreddit: subreddit || 'r/gaming',
      position: { x: spawnX, y: spawnY },
      direction: Math.random() * Math.PI * 2,
      color: currentGame.players.size === 0 ? 0xff4500 : 0x00ff00, // Red for first player, green for second
      isAlive: true,
      trailPoints: [],
      occupiedAreas: [],
      isInOwnTerritory: true,
      lastUpdate: Date.now()
    };
    
    currentGame.players.set(playerId, player);
    
    // Start game if we have 2 players
    if (currentGame.players.size === 2) {
      currentGame.status = 'playing';
    }
    
    await setCurrentGame(currentGame);
    
    res.json({ 
      playerId, 
      gameId: currentGame.gameId,
      gameState: {
        gameId: currentGame.gameId,
        players: Object.fromEntries(currentGame.players),
        status: currentGame.status,
        maxPlayers: 2
      }
    });
  } catch (error) {
    console.error('Failed to join game:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

// Simple position update
router.post('/api/game/update-player', async (req, res): Promise<void> => {
  try {
    const { gameId, playerId, position, direction, isInOwnTerritory } = req.body;
    
    const currentGame = await getCurrentGame();
    
    if (!currentGame || currentGame.gameId !== gameId) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    const player = currentGame.players.get(playerId);
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    
    player.position = position;
    player.direction = direction;
    player.isInOwnTerritory = isInOwnTerritory;
    player.lastUpdate = Date.now();
    
    await setCurrentGame(currentGame);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update player:', error);
    res.status(500).json({ error: 'Failed to update player' });
  }
});

// Simple trail update
router.post('/api/game/update-trail', async (req, res): Promise<void> => {
  try {
    const { gameId, playerId, trailPoints } = req.body;
    
    const currentGame = await getCurrentGame();
    
    if (!currentGame || currentGame.gameId !== gameId) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    const player = currentGame.players.get(playerId);
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    
    player.trailPoints = trailPoints;
    player.lastUpdate = Date.now();
    
    await setCurrentGame(currentGame);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update trail:', error);
    res.status(500).json({ error: 'Failed to update trail' });
  }
});

// Simple territory claim
router.post('/api/game/claim-territory', async (req, res): Promise<void> => {
  try {
    const { gameId, playerId, occupiedArea } = req.body;
    
    const currentGame = await getCurrentGame();
    
    if (!currentGame || currentGame.gameId !== gameId) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    const player = currentGame.players.get(playerId);
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    
    player.occupiedAreas.push(occupiedArea);
    player.trailPoints = []; // Clear trail after claiming
    player.lastUpdate = Date.now();
    
    await setCurrentGame(currentGame);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to claim territory:', error);
    res.status(500).json({ error: 'Failed to claim territory' });
  }
});

// Simple game state retrieval
router.get('/api/game/state/:gameId', async (req, res): Promise<void> => {
  try {
    const { gameId } = req.params;
    
    const currentGame = await getCurrentGame();
    
    if (!currentGame || currentGame.gameId !== gameId) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    res.json({
      gameId: currentGame.gameId,
      players: Object.fromEntries(currentGame.players),
      status: currentGame.status,
      maxPlayers: 2,
      createdAt: currentGame.createdAt
    });
  } catch (error) {
    console.error('Failed to get game state:', error);
    res.status(500).json({ error: 'Failed to get game state' });
  }
});

// Simple leave game
router.post('/api/game/leave', async (req, res): Promise<void> => {
  try {
    const { gameId, playerId } = req.body;
    
    const currentGame = await getCurrentGame();
    
    if (!currentGame || currentGame.gameId !== gameId) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    currentGame.players.delete(playerId);

    console.log('Player left game:', { gameId, playerId, playersLeft: currentGame.players.size });
    // Reset game if no players left
    if (currentGame.players.size === 0) {
      console.log('🧹 Game is empty, cleaning up automatically...');
      await setCurrentGame(null);
      await redis.del('*')

      console.log('✅ Empty game cleaned up automatically');
    } else {
      // Reset to waiting if only one player left
      currentGame.status = 'waiting';
      await setCurrentGame(currentGame);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to leave game:', error);
    res.status(500).json({ error: 'Failed to leave game' });
  }
});

// Simple cleanup
router.get('/api/debug/delete-all-redis-data', async (_req, res): Promise<void> => {
  try {
    await redis.del('*')
    res.json({ success: true, message: 'Game cleanup completed' });
  } catch (error) {
    console.error('Failed to cleanup game:', error);
    res.status(500).json({ error: 'Failed to cleanup game' });
  }
});

router.get('/api/debug/redis', async (_req, res): Promise<void> => {
  try {
    // Get our simple current game
    const currentGame = await getCurrentGame();
    
    // Get any stored username
    const storedUsername = await redis.get('player:username');
    
    // Get any count data
    const count = await redis.get('count');
    
    const redisContents: any = {
      currentGame: currentGame ? {
        gameId: currentGame.gameId,
        status: currentGame.status,
        playerCount: currentGame.players.size,
        players: Object.fromEntries(currentGame.players),
        createdAt: currentGame.createdAt
      } : null,
      storedUsername: storedUsername,
      count: count ? parseInt(count) : 0,
      // Legacy data (from old complex system)
      activeRooms: [],
      roomDetails: [],
      gameStates: []
    };
    
    res.json(redisContents);
  } catch (error) {
    console.error('Failed to inspect Redis:', error);
    res.status(500).json({ error: 'Failed to inspect Redis' });
  }
});


router.post('/api/debug/cleanup-all', async (_req, res): Promise<void> => {
  try {
    console.log('🧹 Starting complete Redis cleanup...');
    
    // Get all keys first to see what we're cleaning
    const allKeys = await redis.hKeys('*');
    console.log('🗝️ Found keys to clean:', allKeys);
    
    let cleanedCount = 0;
    const cleanedItems: string[] = [];
    
    // Clear all keys (more thorough than selective deletion)
    for (const key of allKeys) {
      await redis.del(key);
      cleanedItems.push(key);
      cleanedCount++;
      console.log(`✅ Cleaned key: ${key}`);
    }
    
    // Also clear our simple current game explicitly
    await setCurrentGame(null);
    
    console.log(`🧹 Cleanup complete! Cleaned ${cleanedCount} keys.`);
    
    res.json({ 
      success: true, 
      message: `All Redis data cleaned up - removed ${cleanedCount} keys`,
      cleanedItems: cleanedItems,
      totalCleaned: cleanedCount
    });
  } catch (error) {
    console.error('Failed to cleanup all Redis data:', error);
    res.status(500).json({ error: 'Failed to cleanup all Redis data' });
  }
});

/*
// COMMENTED OUT - COMPLEX MULTIPLAYER SYSTEM CONTINUES...
// Quick join - find and join any available game
router.post('/api/game/quick-join', async (req, res): Promise<void> => {
  try {
    const { username, subreddit } = req.body;
    
    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }
    
    // Try to find an available room first
    let availableRoom = await findAvailableRoom();
    
    // Only clean up empty rooms if no available room was found
    if (!availableRoom) {
      console.log('No available room found, cleaning up empty rooms and searching again');
      await cleanupEmptyRooms();
      availableRoom = await findAvailableRoom();
    }
    
    // If no available room found, create a new one
    if (!availableRoom) {
      console.log('Creating new room for quick join');
      const gameId = generateGameId();
      const roomId = generateRoomId();
      
      const gameState = await createGameState(gameId);
      
      const gameRoom: GameRoom = {
        roomId,
        gameId,
        maxPlayers: 8,
        currentPlayers: 0,
        status: 'waiting',
        createdAt: Date.now()
      };
      
      await redis.set(`room:${roomId}`, JSON.stringify(gameRoom));
      await redis.set(`room:${roomId}:game`, gameId);
      await addActiveRoom(roomId);
      
      availableRoom = { room: gameRoom, gameState };
      console.log(`Created new room: ${roomId}`);
    } else {
      console.log(`Joining existing room: ${availableRoom.room.roomId}`);
    }
    
    const { room, gameState: currentGameState } = availableRoom;
    
    // Add player to the game
    const playerId = generatePlayerId();
    const playerColors = [0xff4500, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffa500, 0x800080];
    const playerColor = playerColors[currentGameState.players.size % playerColors.length] || 0xff4500;
    
    const player: Player = {
      id: playerId,
      username,
      subreddit: subreddit || 'r/gaming',
      position: { x: currentGameState.gameCenter.x, y: currentGameState.gameCenter.y },
      direction: Math.random() * Math.PI * 2,
      color: playerColor,
      isAlive: true,
      trailPoints: [],
      occupiedAreas: [],
      isInOwnTerritory: true,
      lastUpdate: Date.now()
    };
    
    currentGameState.players.set(playerId, player);
    await updateGameState(room.gameId, currentGameState);
    
    // Update room player count
    room.currentPlayers = currentGameState.players.size;
    await redis.set(`room:${room.roomId}`, JSON.stringify(room));
    
    res.json({ playerId, gameState: currentGameState, roomId: room.roomId });
  } catch (error) {
    console.error('Failed to quick join game:', error);
    res.status(500).json({ error: 'Failed to quick join game' });
  }
});

// Join a game room
router.post('/api/game/join', async (req, res): Promise<void> => {
  try {
    const { roomId, username, subreddit } = req.body;
    
    if (!roomId || !username) {
      res.status(400).json({ error: 'Room ID and username are required' });
      return;
    }
    
    const roomData = await redis.get(`room:${roomId}`);
    if (!roomData) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    
    const room: GameRoom = JSON.parse(roomData);
    const gameState = await getGameState(room.gameId);
    
    if (!gameState) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    if (gameState.players.size >= room.maxPlayers) {
      res.status(400).json({ error: 'Room is full' });
      return;
    }
    
    const playerId = generatePlayerId();
    const playerColors = [0xff4500, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff, 0xffa500, 0x800080];
    const playerColor = playerColors[gameState.players.size % playerColors.length] || 0xff4500;
    
    const player: Player = {
      id: playerId,
      username,
      subreddit: subreddit || 'r/gaming',
      position: { x: gameState.gameCenter.x, y: gameState.gameCenter.y },
      direction: Math.random() * Math.PI * 2,
      color: playerColor,
      isAlive: true,
      trailPoints: [],
      occupiedAreas: [],
      isInOwnTerritory: true,
      lastUpdate: Date.now()
    };
    
    gameState.players.set(playerId, player);
    await updateGameState(room.gameId, gameState);
    
    // Update room player count
    room.currentPlayers = gameState.players.size;
    await redis.set(`room:${roomId}`, JSON.stringify(room));
    
    // Add room to active rooms if not already there
    await addActiveRoom(roomId);
    
    res.json({ playerId, gameState });
  } catch (error) {
    console.error('Failed to join game:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

// Update player position
router.post('/api/game/update-player', async (req, res): Promise<void> => {
  try {
    const { gameId, playerId, position, direction, isInOwnTerritory } = req.body;
    
    const gameState = await getGameState(gameId);
    if (!gameState) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    const player = gameState.players.get(playerId);
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    
    player.position = position;
    player.direction = direction;
    player.isInOwnTerritory = isInOwnTerritory;
    player.lastUpdate = Date.now();
    
    await updateGameState(gameId, gameState);
    
    // Broadcast player update to all clients via realtime (with error handling)
    try {
      await realtime.send('game', {
        type: 'playerUpdate',
        playerUpdate: {
          playerId,
          position,
          direction,
          isInOwnTerritory,
          timestamp: Date.now()
        }
      });
    } catch (realtimeError) {
      console.warn('Realtime send failed for player update:', realtimeError);
      // Continue without failing the request - the game can still work without realtime
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update player:', error);
    res.status(500).json({ error: 'Failed to update player' });
  }
});

// Update player trail
router.post('/api/game/update-trail', async (req, res): Promise<void> => {
  try {
    const { gameId, playerId, trailPoints } = req.body;
    
    const gameState = await getGameState(gameId);
    if (!gameState) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    const player = gameState.players.get(playerId);
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    
    player.trailPoints = trailPoints;
    player.lastUpdate = Date.now();
    
    await updateGameState(gameId, gameState);
    
    // Broadcast trail update to all clients via realtime (with error handling)
    try {
      await realtime.send('game', {
        type: 'trailUpdate',
        trailUpdate: {
          playerId,
          trailPoints,
          timestamp: Date.now()
        }
      });
    } catch (realtimeError) {
      console.warn('Realtime send failed for trail update:', realtimeError);
      // Continue without failing the request
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update trail:', error);
    res.status(500).json({ error: 'Failed to update trail' });
  }
});

// Claim territory
router.post('/api/game/claim-territory', async (req, res): Promise<void> => {
  try {
    const { gameId, playerId, occupiedArea } = req.body;
    
    const gameState = await getGameState(gameId);
    if (!gameState) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    const player = gameState.players.get(playerId);
    if (!player) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }
    
    // Add to global occupied areas
    gameState.occupiedAreas.push({
      ...occupiedArea,
      playerId
    });
    
    // Add to player's occupied areas
    player.occupiedAreas.push(occupiedArea);
    player.trailPoints = []; // Clear trail after claiming
    player.lastUpdate = Date.now();
    
    await updateGameState(gameId, gameState);
    
    // Broadcast territory claim to all clients via realtime (with error handling)
    try {
      await realtime.send('game', {
        type: 'territoryClaim',
        territoryClaim: {
          playerId,
          occupiedArea,
          timestamp: Date.now()
        }
      });
    } catch (realtimeError) {
      console.warn('Realtime send failed for territory claim:', realtimeError);
      // Continue without failing the request
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to claim territory:', error);
    res.status(500).json({ error: 'Failed to claim territory' });
  }
});

// Get current game state
router.get('/api/game/state/:gameId', async (req, res): Promise<void> => {
  try {
    const { gameId } = req.params;
    const gameState = await getGameState(gameId);
    
    if (!gameState) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    res.json(gameState);
  } catch (error) {
    console.error('Failed to get game state:', error);
    res.status(500).json({ error: 'Failed to get game state' });
  }
});

// Leave game
router.post('/api/game/leave', async (req, res): Promise<void> => {
  try {
    const { gameId, playerId, roomId } = req.body;
    
    const gameState = await getGameState(gameId);
    if (!gameState) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    gameState.players.delete(playerId);
    await updateGameState(gameId, gameState);
    
    // Update room player count if roomId is provided
    if (roomId) {
      const roomData = await redis.get(`room:${roomId}`);
      if (roomData) {
        const room: GameRoom = JSON.parse(roomData);
        room.currentPlayers = gameState.players.size;
        await redis.set(`room:${roomId}`, JSON.stringify(room));
      }
    }
    
    // Game cleanup is handled by setCurrentGame above
    
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to leave game:', error);
    res.status(500).json({ error: 'Failed to leave game' });
  }
});

// Simple cleanup
router.post('/api/game/cleanup', async (_req, res): Promise<void> => {
  try {
    await setCurrentGame(null);
    res.json({ success: true, message: 'Game cleanup completed' });
  } catch (error) {
    console.error('Failed to cleanup game:', error);
    res.status(500).json({ error: 'Failed to cleanup game' });
  }
});

// Inspect Redis database contents
router.get('/api/debug/redis', async (_req, res): Promise<void> => {
  try {
    // Get our simple current game
    const currentGame = await getCurrentGame();
    
    // Get any stored username
    const storedUsername = await redis.get('player:username');
    
    // Get any count data
    const count = await redis.get('count');
    
    // Get all Redis keys for debugging (Redis Insight-like functionality)
    const allKeys = await redis.keys('*');
    const keyDetails: any = {};
    
    // Get details for each key
    for (const key of allKeys) {
      const value = await redis.get(key);
      const ttl = await redis.ttl(key);
      keyDetails[key] = {
        value: value,
        ttl: ttl,
        type: typeof value,
        size: value ? value.length : 0
      };
    }
    
    const redisContents: any = {
      currentGame: currentGame ? {
        gameId: currentGame.gameId,
        status: currentGame.status,
        playerCount: currentGame.players.size,
        players: Object.fromEntries(currentGame.players),
        createdAt: currentGame.createdAt
      } : null,
      storedUsername: storedUsername,
      count: count ? parseInt(count) : 0,
      // Redis Insight-like data
      allKeys: allKeys,
      keyDetails: keyDetails,
      totalKeys: allKeys.length,
      // Legacy data (from old complex system)
      activeRooms: [],
      roomDetails: [],
      gameStates: []
    };
    
    res.json(redisContents);
  } catch (error) {
    console.error('Failed to inspect Redis:', error);
    res.status(500).json({ error: 'Failed to inspect Redis' });
  }
});


// Complete Redis cleanup - removes ALL game data

*/

router.post('/internal/menu/post-create', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

// Use router middleware
app.use(router);

// Get port from environment variable with fallback
const port = process.env.WEBBIT_PORT || 3000;

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port, () => console.log(`http://localhost:${port}`));

import { context, reddit } from '@devvit/web/server';

export const createPost = async () => {
  const { subredditName } = context;
  if (!subredditName) {
    throw new Error('subredditName is required');
  }

  return await reddit.submitCustomPost({
    splash: {
      // Splash screen customization
      appDisplayName: 'subsurfempire',
      backgroundUri: 'default-splash.png',
      buttonLabel: 'Start Playing',
      description: 'An asynchronous multiplayer game where you can claim territory and earn points by drawing closed areas.',
      heading: 'Welcome to the Subsurf Empire!',
      appIconUri: 'default-icon.png',
    },
    postData: {
      gameState: 'initial',
      score: 0,
    },
    subredditName: subredditName,
    title: 'subsurfempire',
  });
};

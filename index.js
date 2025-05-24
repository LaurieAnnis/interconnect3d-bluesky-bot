import { BskyAgent } from '@atproto/api';
import dotenv from 'dotenv';

dotenv.config();

const agent = new BskyAgent({
  service: 'https://bsky.social',
});

const HASHTAGS_TO_MONITOR = [
  '#3DAssets',
  '#3DMarketplace', 
  '#3DModels',
  '#GameAssets',
  '#UnityAssets',
  '#UnityStore',
  '#UnrealAssets',
  '#UnrealMarketplace',
  '#FABAssets',
  '#3DContentCreators',
  '#BlenderAssets'
];

const REPOSTED_POSTS_KEY = 'reposted_posts';
let repostedPosts = new Set();

async function searchForHashtagPosts() {
  const results = [];
  
  for (const hashtag of HASHTAGS_TO_MONITOR) {
    try {
      console.log(`Searching for posts with ${hashtag}...`);
      
      const searchResponse = await agent.api.app.bsky.feed.searchPosts({
        q: hashtag,
        limit: 20,
        sort: 'latest'
      });
      
      if (searchResponse.data.posts) {
        results.push(...searchResponse.data.posts);
      }
      
      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Error searching for ${hashtag}:`, error);
    }
  }
  
  return results;
}

async function repostIfNotAlreadyReposted(post) {
  const postUri = post.uri;
  
  if (repostedPosts.has(postUri)) {
    console.log(`Already reposted: ${postUri}`);
    return false;
  }
  
  try {
    await agent.repost(postUri, post.cid);
    repostedPosts.add(postUri);
    
    console.log(`Successfully reposted: ${post.record.text.substring(0, 50)}...`);
    
    // Optional: Like the post as well
    await agent.like(postUri, post.cid);
    console.log(`Liked post: ${postUri}`);
    
    return true;
    
  } catch (error) {
    console.error(`Error reposting ${postUri}:`, error);
    return false;
  }
}

function shouldRepost(post) {
  const text = post.record.text.toLowerCase();
  
  // Check if post contains our monitored hashtags
  const hasTargetHashtag = HASHTAGS_TO_MONITOR.some(hashtag => 
    text.includes(hashtag.toLowerCase())
  );
  
  if (!hasTargetHashtag) {
    return false;
  }
  
  // Don't repost our own posts
  if (post.author.handle === process.env.BSKY_HANDLE) {
    return false;
  }
  
  // Don't repost replies (optional filter)
  if (post.record.reply) {
    return false;
  }
  
  // Only repost recent posts (within last 24 hours)
  const postTime = new Date(post.record.createdAt);
  const now = new Date();
  const hoursDiff = (now - postTime) / (1000 * 60 * 60);
  
  if (hoursDiff > 24) {
    return false;
  }
  
  return true;
}

async function main() {
  try {
    console.log('Starting Interconnect3D Bluesky repost bot...');
    
    await agent.login({
      identifier: process.env.BSKY_HANDLE,
      password: process.env.BSKY_PASSWORD,
    });
    
    console.log(`Logged in as ${process.env.BSKY_HANDLE}`);
    
    const posts = await searchForHashtagPosts();
    console.log(`Found ${posts.length} total posts`);
    
    let repostedCount = 0;
    
    for (const post of posts) {
      if (shouldRepost(post)) {
        const success = await repostIfNotAlreadyReposted(post);
        if (success) {
          repostedCount++;
          
          // Rate limiting - wait between reposts
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Limit reposts per run to avoid rate limits
        if (repostedCount >= 5) {
          console.log('Reached repost limit for this run');
          break;
        }
      }
    }
    
    console.log(`Bot run completed. Reposted ${repostedCount} posts.`);
    
  } catch (error) {
    console.error('Bot error:', error);
    process.exit(1);
  }
}

main();

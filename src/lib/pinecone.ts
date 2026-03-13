import { Pinecone } from '@pinecone-database/pinecone';

const apiKey = import.meta.env.PINECONE_API_KEY;

export const pinecone = apiKey ? new Pinecone({
  apiKey: apiKey,
}) : null;

// Replace with your actual index name later
export const PINECONE_INDEX_NAME = 'make-my-reels-idx'; 

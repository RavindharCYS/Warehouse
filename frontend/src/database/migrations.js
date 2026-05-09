import { getDB } from './db';
import { schemaStatements } from './schema';

export const runMigrations = async () => {
  try {
    const db = getDB();

    for (const statement of schemaStatements) {
      await db.execute(statement);
    }

    console.log('Database migrations completed');
  } catch (error) {
    console.error('Migration Error:', error);
    throw error;
  }
};
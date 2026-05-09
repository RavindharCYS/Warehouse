import { getDB } from '../db';

export const brandRepository = {

  async getAll() {
    const db = getDB();
    const result = await db.query(`SELECT * FROM brands ORDER BY id DESC`);
    return result.values || [];
  }

};
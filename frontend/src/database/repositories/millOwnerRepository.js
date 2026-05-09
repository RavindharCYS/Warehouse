import { getDB } from '../db';

export const millOwnerRepository = {

  async getAll() {
    const db = getDB();
    const result = await db.query(`SELECT * FROM mill_owners ORDER BY id DESC`);
    return result.values || [];
  }

};
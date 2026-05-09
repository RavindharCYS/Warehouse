import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const sqlite = new SQLiteConnection(CapacitorSQLite);

let db = null;

export const initDB = async () => {
  try {
    const consistency = await sqlite.checkConnectionsConsistency();

    const isConnection = (
      await sqlite.isConnection('warehouse_mobile_db', false)
    ).result;

    if (consistency.result && isConnection) {
      db = await sqlite.retrieveConnection('warehouse_mobile_db', false);
    } else {
      db = await sqlite.createConnection(
        'warehouse_mobile_db',
        false,
        'no-encryption',
        1,
        false
      );
    }

    await db.open();

    console.log('SQLite initialized');

    return db;
  } catch (error) {
    console.error('DB Initialization Error:', error);
    throw error;
  }
};

export const getDB = () => db;
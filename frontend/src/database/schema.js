export const schemaStatements = [

`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    full_name TEXT,
    password_hash TEXT,
    role TEXT,
    email TEXT,
    phone_1 TEXT,
    phone_2 TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`,

`CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_name TEXT UNIQUE,
    location_name_ta TEXT,
    address TEXT,
    capacity REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`,

`CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`,

`CREATE TABLE IF NOT EXISTS rice_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`,

`CREATE TABLE IF NOT EXISTS mill_owners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_name TEXT,
    phone TEXT,
    address TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`,

`CREATE TABLE IF NOT EXISTS stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    brand_id INTEGER,
    rice_type_id INTEGER,
    warehouse_id INTEGER,
    total_bags INTEGER DEFAULT 0,
    total_weight REAL DEFAULT 0,
    buying_price REAL DEFAULT 0,
    selling_price REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`,

`CREATE TABLE IF NOT EXISTS stock_weight_breakdowns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stock_id INTEGER,
    weight REAL,
    bag_count INTEGER DEFAULT 0
);`,

`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_type TEXT,
    customer_name TEXT,
    vehicle_number TEXT,
    remarks TEXT,
    total_bags INTEGER DEFAULT 0,
    total_weight REAL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`,

`CREATE TABLE IF NOT EXISTS transaction_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER,
    stock_id INTEGER,
    quantity INTEGER,
    total_weight REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`,

`CREATE TABLE IF NOT EXISTS transaction_item_weights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_item_id INTEGER,
    weight REAL,
    bag_count INTEGER
);`,

`CREATE TABLE IF NOT EXISTS transaction_item_splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_item_id INTEGER,
    warehouse_id INTEGER,
    split_bags INTEGER,
    split_weight REAL
);`,

`CREATE TABLE IF NOT EXISTS otp_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    otp_code TEXT,
    is_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);`
];
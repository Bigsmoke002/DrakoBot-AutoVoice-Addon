// SQLite Database Manager for Drako Bot
const fs = require('fs');
const path = require('path');

// Stellen sicher, dass alle benötigten Module verfügbar sind
let sqlite3;
try {
    sqlite3 = require('sqlite3').verbose();
} catch (error) {
    console.log("[Database] SQLite3 Modul wird installiert...");
    // Wenn SQLite nicht installiert ist, installieren wir es automatisch
    require('child_process').execSync('npm install sqlite3 --save', { stdio: 'inherit' });
    sqlite3 = require('sqlite3').verbose();
    console.log("[Database] SQLite3 Modul erfolgreich installiert");
}

// Create the database directory if it doesn't exist
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Set up the database connection
const db = new sqlite3.Database(path.join(dbDir, 'drako.db'));

// Initialize the database with required tables
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Enable foreign keys
            db.run("PRAGMA foreign_keys = ON");
            
            // Channel Configuration Table
            db.run(`
                CREATE TABLE IF NOT EXISTS join_channels (
                    id TEXT PRIMARY KEY,
                    category_id TEXT NOT NULL,
                    channel_format TEXT DEFAULT '{username}''s Channel',
                    use_sequential BOOLEAN DEFAULT 0
                )
            `);
            
            // Created Channels Tracking
            db.run(`
                CREATE TABLE IF NOT EXISTS created_channels (
                    channel_id TEXT PRIMARY KEY,
                    creator_id TEXT NOT NULL,
                    creation_time INTEGER NOT NULL
                )
            `);
            
            // Message Auto-Delete Configuration
            db.run(`
                CREATE TABLE IF NOT EXISTS message_delete_channels (
                    channel_id TEXT PRIMARY KEY,
                    minutes INTEGER NOT NULL,
                    slot TEXT NOT NULL
                )
            `);
            
            // Message Tracking for Deletion
            db.run(`
                CREATE TABLE IF NOT EXISTS scheduled_deletions (
                    message_id TEXT PRIMARY KEY,
                    channel_id TEXT NOT NULL,
                    deletion_time INTEGER NOT NULL,
                    FOREIGN KEY (channel_id) REFERENCES message_delete_channels(channel_id) ON DELETE CASCADE
                )
            `);
            
            // Warning History (to avoid spamming)
            db.run(`
                CREATE TABLE IF NOT EXISTS warning_history (
                    channel_id TEXT PRIMARY KEY,
                    last_warning_time INTEGER NOT NULL
                )
            `);
            
            // Channel Settings Table (NEW)
            db.run(`
                CREATE TABLE IF NOT EXISTS channel_settings (
                    channel_id TEXT PRIMARY KEY,
                    has_password BOOLEAN DEFAULT 0,
                    password TEXT,
                    move_channel_id TEXT,
                    FOREIGN KEY (channel_id) REFERENCES created_channels(channel_id) ON DELETE CASCADE
                )
            `, (err) => {
                if (err) {
                    console.error("[Database] Error creating tables:", err);
                    reject(err);
                } else {
                    console.log("[Database] All tables initialized");
                    resolve();
                }
            });
        });
    });
}

// Sync join channels from config to database
function syncJoinChannelsFromConfig(joinChannels) {
    return new Promise((resolve, reject) => {
        // First clear existing join channels
        db.run("DELETE FROM join_channels", (err) => {
            if (err) {
                console.error("[Database] Error clearing join channels:", err);
                return reject(err);
            }
            
            // If there are no join channels in config, we're done
            if (!joinChannels || joinChannels.length === 0) {
                return resolve();
            }
            
            // Prepare statement for insertion
            const stmt = db.prepare(`
                INSERT INTO join_channels (id, category_id, channel_format, use_sequential)
                VALUES (?, ?, ?, ?)
            `);
            
            // Insert each join channel
            joinChannels.forEach(channel => {
                stmt.run(
                    channel.id,
                    channel.categoryId,
                    channel.channelFormat || "{username}'s Channel",
                    channel.useSequential ? 1 : 0
                );
            });
            
            // Finalize and resolve
            stmt.finalize((err) => {
                if (err) {
                    console.error("[Database] Error inserting join channels:", err);
                    reject(err);
                } else {
                    console.log(`[Database] Synced ${joinChannels.length} join channels`);
                    resolve();
                }
            });
        });
    });
}

// Sync message delete channels from config to database
function syncMessageDeleteFromConfig(messageDeleteTimes) {
    return new Promise((resolve, reject) => {
        // First clear existing message delete channels
        db.run("DELETE FROM message_delete_channels", (err) => {
            if (err) {
                console.error("[Database] Error clearing message delete channels:", err);
                return reject(err);
            }
            
            // If there are no message delete times in config, we're done
            if (!messageDeleteTimes) {
                return resolve();
            }
            
            // Prepare statement for insertion
            const stmt = db.prepare(`
                INSERT INTO message_delete_channels (channel_id, minutes, slot)
                VALUES (?, ?, ?)
            `);
            
            // Insert each message delete channel
            for (const key in messageDeleteTimes) {
                const channelConfig = messageDeleteTimes[key];
                if (channelConfig.id && channelConfig.minutes > 0) {
                    stmt.run(
                        channelConfig.id,
                        channelConfig.minutes,
                        key
                    );
                }
            }
            
            // Finalize and resolve
            stmt.finalize((err) => {
                if (err) {
                    console.error("[Database] Error inserting message delete channels:", err);
                    reject(err);
                } else {
                    console.log(`[Database] Synced message delete channels`);
                    resolve();
                }
            });
        });
    });
}

// Get all join channels from database
function getJoinChannels() {
    return new Promise((resolve, reject) => {
        db.all("SELECT id, category_id as categoryId, channel_format as channelFormat, use_sequential as useSequential FROM join_channels", (err, rows) => {
            if (err) {
                console.error("[Database] Error getting join channels:", err);
                reject(err);
            } else {
                // Convert useSequential from 0/1 to boolean
                const channels = rows.map(row => ({
                    ...row,
                    useSequential: !!row.useSequential
                }));
                resolve(channels);
            }
        });
    });
}

// Add a join channel
function addJoinChannel(channelId, categoryId, channelFormat, useSequential) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO join_channels (id, category_id, channel_format, use_sequential)
            VALUES (?, ?, ?, ?)
        `);
        
        stmt.run(
            channelId,
            categoryId,
            channelFormat || "{username}'s Channel",
            useSequential ? 1 : 0,
            function(err) {
                stmt.finalize();
                if (err) {
                    console.error("[Database] Error adding join channel:", err);
                    reject(err);
                } else {
                    console.log(`[Database] Added join channel: ${channelId}`);
                    resolve(true);
                }
            }
        );
    });
}

// Remove a join channel
function removeJoinChannel(channelId) {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM join_channels WHERE id = ?", [channelId], function(err) {
            if (err) {
                console.error("[Database] Error removing join channel:", err);
                reject(err);
            } else {
                console.log(`[Database] Removed join channel: ${channelId}`);
                resolve(this.changes > 0);
            }
        });
    });
}

// Update a join channel
function updateJoinChannel(channelId, updates) {
    return new Promise((resolve, reject) => {
        // Build the SET part of the SQL statement based on provided updates
        const setValues = [];
        const params = [];
        
        if (updates.categoryId !== undefined) {
            setValues.push("category_id = ?");
            params.push(updates.categoryId);
        }
        
        if (updates.channelFormat !== undefined) {
            setValues.push("channel_format = ?");
            params.push(updates.channelFormat);
        }
        
        if (updates.useSequential !== undefined) {
            setValues.push("use_sequential = ?");
            params.push(updates.useSequential ? 1 : 0);
        }
        
        if (setValues.length === 0) {
            return resolve(false);
        }
        
        // Add channelId to params
        params.push(channelId);
        
        // Execute the update
        const sql = `UPDATE join_channels SET ${setValues.join(", ")} WHERE id = ?`;
        db.run(sql, params, function(err) {
            if (err) {
                console.error("[Database] Error updating join channel:", err);
                reject(err);
            } else {
                console.log(`[Database] Updated join channel: ${channelId}`);
                resolve(this.changes > 0);
            }
        });
    });
}

// Get a specific join channel
function getJoinChannel(channelId) {
    return new Promise((resolve, reject) => {
        db.get(
            "SELECT id, category_id as categoryId, channel_format as channelFormat, use_sequential as useSequential FROM join_channels WHERE id = ?",
            [channelId],
            (err, row) => {
                if (err) {
                    console.error("[Database] Error getting join channel:", err);
                    reject(err);
                } else if (!row) {
                    resolve(null);
                } else {
                    // Convert useSequential from 0/1 to boolean
                    row.useSequential = !!row.useSequential;
                    resolve(row);
                }
            }
        );
    });
}

// Track a created channel
function trackCreatedChannel(channelId, creatorId) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO created_channels (channel_id, creator_id, creation_time)
            VALUES (?, ?, ?)
        `);
        
        stmt.run(
            channelId,
            creatorId,
            Date.now(),
            function(err) {
                stmt.finalize();
                if (err) {
                    console.error("[Database] Error tracking created channel:", err);
                    reject(err);
                } else {
                    console.log(`[Database] Tracked created channel: ${channelId}`);
                    resolve(true);
                }
            }
        );
    });
}

// Remove a tracked channel
function removeTrackedChannel(channelId) {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM created_channels WHERE channel_id = ?", [channelId], function(err) {
            if (err) {
                console.error("[Database] Error removing tracked channel:", err);
                reject(err);
            } else {
                console.log(`[Database] Removed tracked channel: ${channelId}`);
                resolve(this.changes > 0);
            }
        });
    });
}

// Get all tracked channels
function getAllTrackedChannels() {
    return new Promise((resolve, reject) => {
        db.all(
            "SELECT channel_id as channelId, creator_id as creatorId, creation_time as creationTime FROM created_channels",
            (err, rows) => {
                if (err) {
                    console.error("[Database] Error getting tracked channels:", err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

// Set a message delete channel
function setMessageDeleteChannel(slot, channelId, minutes) {
    return new Promise((resolve, reject) => {
        // First, delete any existing record for this slot
        db.run("DELETE FROM message_delete_channels WHERE slot = ?", [slot], (err) => {
            if (err) {
                console.error("[Database] Error removing existing message delete channel:", err);
                return reject(err);
            }
            
            // If channelId is null or minutes is 0, just delete the record and return
            if (!channelId || minutes <= 0) {
                return resolve(true);
            }
            
            // Insert the new record
            const stmt = db.prepare(`
                INSERT INTO message_delete_channels (channel_id, minutes, slot)
                VALUES (?, ?, ?)
            `);
            
            stmt.run(
                channelId,
                minutes,
                slot,
                function(err) {
                    stmt.finalize();
                    if (err) {
                        console.error("[Database] Error setting message delete channel:", err);
                        reject(err);
                    } else {
                        console.log(`[Database] Set message delete channel for slot ${slot}: ${channelId}`);
                        resolve(true);
                    }
                }
            );
        });
    });
}

// Get all message delete channels
function getMessageDeleteChannels() {
    return new Promise((resolve, reject) => {
        db.all(
            "SELECT channel_id as channelId, minutes, slot FROM message_delete_channels",
            (err, rows) => {
                if (err) {
                    console.error("[Database] Error getting message delete channels:", err);
                    reject(err);
                } else {
                    // Convert to config format
                    const result = {};
                    rows.forEach(row => {
                        result[row.slot] = {
                            id: row.channelId,
                            minutes: row.minutes
                        };
                    });
                    resolve(result);
                }
            }
        );
    });
}

// Schedule a message for deletion
function scheduleMessageDeletion(messageId, channelId, minutes) {
    return new Promise((resolve, reject) => {
        const deletionTime = Date.now() + (minutes * 60 * 1000);
        
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO scheduled_deletions (message_id, channel_id, deletion_time)
            VALUES (?, ?, ?)
        `);
        
        stmt.run(
            messageId,
            channelId,
            deletionTime,
            function(err) {
                stmt.finalize();
                if (err) {
                    console.error("[Database] Error scheduling message deletion:", err);
                    reject(err);
                } else {
                    console.log(`[Database] Scheduled message ${messageId} for deletion at ${new Date(deletionTime)}`);
                    resolve(true);
                }
            }
        );
    });
}

// Get messages that are due for deletion
function getMessagesToDelete() {
    return new Promise((resolve, reject) => {
        const now = Date.now();
        
        db.all(
            "SELECT message_id as messageId, channel_id as channelId FROM scheduled_deletions WHERE deletion_time <= ?",
            [now],
            (err, rows) => {
                if (err) {
                    console.error("[Database] Error getting messages to delete:", err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

// Remove a scheduled message deletion
function removeScheduledDeletion(messageId) {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM scheduled_deletions WHERE message_id = ?", [messageId], function(err) {
            if (err) {
                console.error("[Database] Error removing scheduled deletion:", err);
                reject(err);
            } else {
                console.log(`[Database] Removed scheduled deletion for message: ${messageId}`);
                resolve(this.changes > 0);
            }
        });
    });
}

// Check if a warning was recently shown in a channel
function wasWarningShown(channelId, warningDuration = 60 * 60 * 1000) {
    return new Promise((resolve, reject) => {
        const cutoffTime = Date.now() - warningDuration;
        
        db.get(
            "SELECT last_warning_time FROM warning_history WHERE channel_id = ? AND last_warning_time > ?",
            [channelId, cutoffTime],
            (err, row) => {
                if (err) {
                    console.error("[Database] Error checking warning history:", err);
                    reject(err);
                } else {
                    resolve(!!row);
                }
            }
        );
    });
}

// Record that a warning was shown in a channel
function recordWarningShown(channelId) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO warning_history (channel_id, last_warning_time)
            VALUES (?, ?)
        `);
        
        stmt.run(
            channelId,
            Date.now(),
            function(err) {
                stmt.finalize();
                if (err) {
                    console.error("[Database] Error recording warning shown:", err);
                    reject(err);
                } else {
                    console.log(`[Database] Recorded warning shown in channel: ${channelId}`);
                    resolve(true);
                }
            }
        );
    });
}

// Save channel settings (NEW)
function saveChannelSettings(channelId, hasPassword, password, moveChannelId) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO channel_settings (channel_id, has_password, password, move_channel_id)
            VALUES (?, ?, ?, ?)
        `);
        
        stmt.run(
            channelId,
            hasPassword ? 1 : 0,
            password,
            moveChannelId,
            function(err) {
                stmt.finalize();
                if (err) {
                    console.error("[Database] Error saving channel settings:", err);
                    reject(err);
                } else {
                    console.log(`[Database] Saved settings for channel: ${channelId}`);
                    resolve(true);
                }
            }
        );
    });
}

// Get channel settings (NEW)
function getChannelSettings(channelId) {
    return new Promise((resolve, reject) => {
        db.get(
            "SELECT * FROM channel_settings WHERE channel_id = ?",
            [channelId],
            (err, row) => {
                if (err) {
                    console.error("[Database] Error getting channel settings:", err);
                    reject(err);
                } else if (!row) {
                    resolve(null);
                } else {
                    row.has_password = !!row.has_password;
                    resolve(row);
                }
            }
        );
    });
}

// Close the database connection (for cleanup)
function closeDatabase() {
    return new Promise((resolve, reject) => {
        db.close(err => {
            if (err) {
                console.error("[Database] Error closing database:", err);
                reject(err);
            } else {
                console.log("[Database] Database connection closed");
                resolve();
            }
        });
    });
}

// Export all functions
module.exports = {
    initializeDatabase,
    syncJoinChannelsFromConfig,
    syncMessageDeleteFromConfig,
    getJoinChannels,
    addJoinChannel,
    removeJoinChannel,
    updateJoinChannel,
    getJoinChannel,
    trackCreatedChannel,
    removeTrackedChannel,
    getAllTrackedChannels,
    setMessageDeleteChannel,
    getMessageDeleteChannels,
    scheduleMessageDeletion,
    getMessagesToDelete,
    removeScheduledDeletion,
    wasWarningShown,
    recordWarningShown,
    saveChannelSettings,
    getChannelSettings,
    closeDatabase
};
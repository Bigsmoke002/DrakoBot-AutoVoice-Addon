// Auto Message Purge Addon for Drako Bot
const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, 'config.json');

module.exports.run = async (client) => {
    console.log("[Auto Message Purge] Addon loaded!");
    
    // Load config
    let config;
    try {
        if (fs.existsSync(configPath)) {
            const rawConfig = fs.readFileSync(configPath);
            config = JSON.parse(rawConfig);
        } else {
            console.error("[Auto Message Purge] Config file not found! Voice channels addon should create it.");
            return;
        }
    } catch (error) {
        console.error("[Auto Message Purge] Error loading config:", error);
        return;
    }

    // Import database module
    let database;
    try {
        // Versuche zuerst, die database.js direkt zu importieren
        database = require('./database');
        // Initialisiere die Datenbank
        await database.initializeDatabase();
        console.log("[Auto Message Purge] Database initialized directly");
    } catch (dbError) {
        console.error("[Auto Message Purge] Error loading database directly:", dbError);
        
        // Als Fallback versuchen, database aus voice_channels zu laden
        try {
            const voiceChannels = require('./voice_channels');
            if (voiceChannels && voiceChannels.database) {
                database = voiceChannels.database;
                console.log("[Auto Message Purge] Database loaded from voice_channels");
            } else {
                console.error("[Auto Message Purge] Database not available in voice_channels");
                database = null;
            }
        } catch (vcError) {
            console.error("[Auto Message Purge] Error loading voice_channels module:", vcError);
            database = null;
        }
    }
    
    // Track which channels have shown a warning (Fallback wenn Datenbank nicht verfügbar)
    const warningShownInChannel = new Set();
    
    // Reset warnings every hour
    setInterval(() => {
        warningShownInChannel.clear();
    }, 60 * 60 * 1000);
    
    // Function to save config
    function saveConfig() {
        try {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
            console.log("[Auto Message Purge] Config saved");
            return true;
        } catch (error) {
            console.error("[Auto Message Purge] Error saving config:", error);
            return false;
        }
    }
    
    // Message delete handler
    client.on('messageCreate', async (message) => {
        try {
            // Ignore bot messages
            if (message.author.bot) return;
            
            // Determine if this channel is configured for auto-delete
            let deleteTime = null;
            let channelKey = null;
            let channelConfig = null;
            
            // Versuche zuerst, die Konfiguration aus der Datenbank zu laden
            if (database) {
                try {
                    const messageDeleteChannels = await database.getMessageDeleteChannels();
                    for (const key in messageDeleteChannels) {
                        const config = messageDeleteChannels[key];
                        if (config.id === message.channelId && config.minutes > 0) {
                            deleteTime = config.minutes * 60 * 1000; // Convert to milliseconds
                            channelKey = key;
                            channelConfig = config;
                            break;
                        }
                    }
                } catch (error) {
                    console.error("[Auto Message Purge] Error getting channels from database:", error);
                }
            }
            
            // Fallback: Verwende die Konfiguration aus der config.json
            if (!deleteTime && config && config.messageDeleteTimes) {
                for (const key in config.messageDeleteTimes) {
                    const conf = config.messageDeleteTimes[key];
                    if (conf.id === message.channelId && conf.minutes > 0) {
                        deleteTime = conf.minutes * 60 * 1000; // Convert to milliseconds
                        channelKey = key;
                        channelConfig = conf;
                        break;
                    }
                }
            }
            
            // If this is a channel with auto-delete enabled
            if (deleteTime && channelConfig) {
                console.log(`[Auto Message Purge] Message in auto-delete channel ${message.channelId}, will delete after ${channelConfig.minutes} minutes`);
                
                // Check if we need to show a warning
                let warningShown = false;
                
                // Try to check in database first
                if (database) {
                    try {
                        warningShown = await database.wasWarningShown(message.channelId);
                    } catch (error) {
                        console.error("[Auto Message Purge] Error checking warning in database:", error);
                        // Fallback to local tracking
                        warningShown = warningShownInChannel.has(message.channelId);
                    }
                } else {
                    // Fallback to local tracking
                    warningShown = warningShownInChannel.has(message.channelId);
                }
                
                if (config.showDeleteWarning !== false && !warningShown) {
                    try {
                        // Format the time in a human-readable way
                        let timeFormat;
                        const minutes = channelConfig.minutes;
                        
                        if (minutes < 60) {
                            timeFormat = `${minutes} minutes`;
                        } else if (minutes < 1440) {
                            const hours = Math.floor(minutes / 60);
                            timeFormat = hours === 1 ? `1 hour` : `${hours} hours`;
                        } else {
                            const days = Math.floor(minutes / 1440);
                            timeFormat = days === 1 ? `1 day` : `${days} days`;
                        }
                        
                        // Send warning message in English
                        await message.channel.send({
                            content: `⚠️ **Warning!** Messages in this channel will be automatically deleted after **${timeFormat}**.`,
                            allowedMentions: { parse: [] }
                        });
                        
                        console.log(`[Auto Message Purge] Sent warning in channel ${message.channelId}`);
                        
                        // Record warning shown
                        if (database) {
                            try {
                                await database.recordWarningShown(message.channelId);
                            } catch (error) {
                                console.error("[Auto Message Purge] Error recording warning in database:", error);
                                // Fallback to local tracking
                                warningShownInChannel.add(message.channelId);
                            }
                        } else {
                            // Fallback to local tracking
                            warningShownInChannel.add(message.channelId);
                        }
                    } catch (error) {
                        console.error("[Auto Message Purge] Error sending warning:", error);
                    }
                }
                
                // Schedule message for deletion
                if (database) {
                    try {
                        await database.scheduleMessageDeletion(message.id, message.channelId, channelConfig.minutes);
                    } catch (error) {
                        console.error("[Auto Message Purge] Error scheduling message in database:", error);
                        // Fallback: handle with setTimeout
                        setTimeout(async () => {
                            tryDeleteMessage(message);
                        }, deleteTime);
                    }
                } else {
                    // Fallback: handle with setTimeout
                    setTimeout(async () => {
                        tryDeleteMessage(message);
                    }, deleteTime);
                }
            }
        } catch (error) {
            console.error("[Auto Message Purge] Error in message handler:", error);
        }
    });
    
    // Helper function to try deleting a message
    async function tryDeleteMessage(message) {
        try {
            // Try to fetch and delete the message
            const channel = client.channels.cache.get(message.channelId);
            if (channel) {
                const fetchedMessage = await channel.messages.fetch(message.id)
                    .catch(err => {
                        // Message might already be deleted
                        console.log(`[Auto Message Purge] Message already deleted or not found: ${err.message}`);
                        return null;
                    });
                    
                if (fetchedMessage) {
                    await fetchedMessage.delete();
                    console.log(`[Auto Message Purge] Deleted message in channel ${message.channel.name}`);
                }
            }
        } catch (error) {
            console.error("[Auto Message Purge] Error deleting message:", error);
        }
    }
    
    // Export functions for webUI
    module.exports.setMessageDeleteChannel = async (slot, channelId, minutes) => {
        try {
            // Update in-memory config
            if (config.messageDeleteTimes[`channel${slot}`]) {
                config.messageDeleteTimes[`channel${slot}`] = {
                    id: channelId,
                    minutes: parseInt(minutes)
                };
                
                // Save to file
                if (!saveConfig()) {
                    return false;
                }
                
                // Update database if available
                if (database) {
                    try {
                        await database.setMessageDeleteChannel(`channel${slot}`, channelId, parseInt(minutes));
                    } catch (dbError) {
                        console.error("[Auto Message Purge] Error setting channel in database:", dbError);
                        // Config was already saved, so we still return true
                    }
                }
                
                return true;
            }
            return false;
        } catch (error) {
            console.error("[Auto Message Purge] Error setting message delete channel:", error);
            return false;
        }
    };
    
    // Periodic check for messages to delete if database is available
    if (database) {
        const checkMessagesToDelete = async () => {
            try {
                // Get messages that are due for deletion
                const messagesToDelete = await database.getMessagesToDelete();
                
                if (messagesToDelete.length > 0) {
                    console.log(`[Auto Message Purge] Found ${messagesToDelete.length} messages to delete`);
                    
                    // Process messages in batches to avoid rate limiting
                    for (const messageData of messagesToDelete) {
                        try {
                            // Try to fetch the channel and message
                            const channel = await client.channels.fetch(messageData.channelId).catch(() => null);
                            
                            if (channel) {
                                const message = await channel.messages.fetch(messageData.messageId).catch(() => null);
                                
                                if (message) {
                                    await message.delete();
                                    console.log(`[Auto Message Purge] Deleted message ${messageData.messageId} in channel ${channel.name}`);
                                }
                            }
                            
                            // Remove the message from the database regardless of whether it was found
                            // This ensures we don't keep trying to delete messages that don't exist
                            await database.removeScheduledDeletion(messageData.messageId);
                        } catch (error) {
                            console.error(`[Auto Message Purge] Error deleting message ${messageData.messageId}:`, error);
                            // Still remove from database to avoid infinite retry
                            await database.removeScheduledDeletion(messageData.messageId);
                        }
                        
                        // Add a small delay between deletions to avoid rate limits
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            } catch (error) {
                console.error("[Auto Message Purge] Error checking messages to delete:", error);
            }
            
            // Schedule next check
            setTimeout(checkMessagesToDelete, 30000); // Check every 30 seconds
        };
        
        // Start periodic check after a short delay
        setTimeout(checkMessagesToDelete, 10000);
    }
    
    // Initial check for old messages
    const checkExistingMessages = async () => {
        try {
            let deleteConfigs = [];
            
            // Versuche zuerst, die Konfiguration aus der Datenbank zu laden
            if (database) {
                try {
                    const messageDeleteChannels = await database.getMessageDeleteChannels();
                    for (const key in messageDeleteChannels) {
                        const channelConfig = messageDeleteChannels[key];
                        if (channelConfig.id && channelConfig.minutes > 0) {
                            deleteConfigs.push(channelConfig);
                        }
                    }
                } catch (error) {
                    console.error("[Auto Message Purge] Error getting channels from database:", error);
                }
            }
            
            // Fallback oder Ergänzung mit der Konfiguration aus config.json
            if (config && config.messageDeleteTimes) {
                for (const key in config.messageDeleteTimes) {
                    const channelConfig = config.messageDeleteTimes[key];
                    // Prüfe, ob diese Konfiguration bereits hinzugefügt wurde
                    if (channelConfig.id && channelConfig.minutes > 0 && 
                        !deleteConfigs.some(c => c.id === channelConfig.id)) {
                        deleteConfigs.push(channelConfig);
                    }
                }
            }
            
            // Verarbeite alle Kanäle mit Auto-Delete-Konfiguration
            for (const channelConfig of deleteConfigs) {
                const channel = await client.channels.fetch(channelConfig.id).catch(() => null);
                if (!channel) continue;
                
                const deleteBeforeTime = Date.now() - (channelConfig.minutes * 60 * 1000);
                
                // Fetch recent messages
                const messages = await channel.messages.fetch({ limit: 100 });
                const oldMessages = messages.filter(msg => msg.createdTimestamp < deleteBeforeTime && !msg.author.bot);
                
                if (oldMessages.size > 0) {
                    console.log(`[Auto Message Purge] Found ${oldMessages.size} old messages in ${channel.name} to delete on startup`);
                    
                    // Delete old messages - one by one to avoid API limits
                    for (const [id, msg] of oldMessages) {
                        try {
                            await msg.delete();
                            // Small delay to avoid rate limits
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (err) {
                            console.error(`[Auto Message Purge] Error deleting old message: ${err.message}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("[Auto Message Purge] Error during existing message check:", error);
        }
    };
    
    // Run initial message check after a delay
    setTimeout(checkExistingMessages, 15000);
};
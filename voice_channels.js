// Auto Voice Channels Addon for Drako Bot
const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, 'config.json');

module.exports.run = async (client) => {
    console.log("[Auto Voice Channels] Addon loaded!");
    
    // Import database
    let database;
    try {
        database = require('./database');
        await database.initializeDatabase();
        console.log("[Auto Voice Channels] Database initialized directly");
    } catch (error) {
        console.error("[Auto Voice Channels] Error loading database:", error);
        database = null;
    }
    
    // Load config
    let config;
    try {
        if (!fs.existsSync(configPath)) {
            const defaultConfig = {
                joinChannels: [],
                deleteEmptyChannels: true,
                useSequentialNames: false,
                lastRoomNumber: 0,
                showDeleteWarning: true,
                userChannelFormat: "{username}'s Channel",
                sequentialChannelFormat: "-Room{number}-",
                messageDeleteTimes: {
                    channel1: { id: null, minutes: 10 },
                    channel2: { id: null, minutes: 1440 },
                    channel3: { id: null, minutes: 10080 }
                },
                webPort: 10101,
                webUIConfig: {
                    siteName: "Drako Bot Admin Panel",
                    tabNames: {
                        voiceChannels: "Auto Voice Channels",
                        messagePurge: "Message Auto-Delete",
                        configEditor: "Configuration"
                    },
                    theme: {
                        primary: "#9c27b0",
                        secondary: "#bb86fc",
                        danger: "#cf6679",
                        background: "#121212",
                        cardBackground: "#1e1e1e",
                        headerBackground: "#1e1e1e"
                    }
                }
            };
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 4));
            config = defaultConfig;
            console.log("[Auto Voice Channels] Created default config.json");
        } else {
            const rawConfig = fs.readFileSync(configPath);
            config = JSON.parse(rawConfig);
            
            // Add new config options if they don't exist
            if (config.useSequentialNames === undefined) {
                config.useSequentialNames = false;
            }
            if (config.lastRoomNumber === undefined) {
                config.lastRoomNumber = 0;
            }
            if (config.showDeleteWarning === undefined) {
                config.showDeleteWarning = true;
            }
            if (config.userChannelFormat === undefined) {
                config.userChannelFormat = "{username}'s Channel";
            }
            if (config.sequentialChannelFormat === undefined) {
                config.sequentialChannelFormat = "-Room{number}-";
            }
            if (!config.messageDeleteTimes) {
                config.messageDeleteTimes = {
                    channel1: { id: null, minutes: 10 },
                    channel2: { id: null, minutes: 1440 },
                    channel3: { id: null, minutes: 10080 }
                };
            }
            if (!config.webUIConfig) {
                config.webUIConfig = {
                    siteName: "Drako Bot Admin Panel",
                    tabNames: {
                        voiceChannels: "Auto Voice Channels",
                        messagePurge: "Message Auto-Delete",
                        configEditor: "Configuration"
                    },
                    theme: {
                        primary: "#9c27b0",
                        secondary: "#bb86fc",
                        danger: "#cf6679",
                        background: "#121212",
                        cardBackground: "#1e1e1e",
                        headerBackground: "#1e1e1e"
                    }
                };
            }
            
            if (config.joinChannels) {
                for (let i = 0; i < config.joinChannels.length; i++) {
                    const joinChannel = config.joinChannels[i];
                    if (!joinChannel.channelFormat) {
                        joinChannel.channelFormat = "{username}'s Channel";
                    }
                    if (joinChannel.useSequential === undefined) {
                        joinChannel.useSequential = false;
                    } else {
                        joinChannel.useSequential = joinChannel.useSequential === true;
                    }
                }
            }
            
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
            console.log("[Auto Voice Channels] Config loaded");
        }
    } catch (error) {
        console.error("[Auto Voice Channels] Error loading config:", error);
        return;
    }

    // Sync config with database if available
    if (database) {
        try {
            await database.syncJoinChannelsFromConfig(config.joinChannels);
            await database.syncMessageDeleteFromConfig(config.messageDeleteTimes);
            console.log("[Auto Voice Channels] Config synced with database");
        } catch (error) {
            console.error("[Auto Voice Channels] Error syncing config with database:", error);
        }
    }

    // Maps to keep track of created voice channels and their properties
    const createdChannels = new Map();
    const channelPasswords = new Map();
    const channelMoveChannels = new Map();
    const awaitingResponse = new Map();

    // Function to save config
    function saveConfig() {
        try {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
            console.log("[Auto Voice Channels] Config saved");
            return true;
        } catch (error) {
            console.error("[Auto Voice Channels] Error saving config:", error);
            return false;
        }
    }

    // Generate a random password
    function generatePassword(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let password = '';
        for (let i = 0; i < length; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    // Create beautiful embed with MEE6-like style
    function createEmbed(title, description, color = '#7289DA') {
        return {
            embeds: [{
                title: title,
                description: description,
                color: parseInt(color.replace('#', ''), 16),
                footer: {
                    text: '🔊 Voice Channel Manager',
                    icon_url: client.user.displayAvatarURL()
                },
                timestamp: new Date()
            }]
        };
    }

// Ask user for channel settings
	async function askChannelSettings(member, channel) {
		try {
			// Create setup message with mention outside the embed
			const setupMessage = await channel.send({
				content: `${member}`, // Mention außerhalb des Embeds
				...createEmbed(
					'⚙️ Channel Configuration',
					`Welcome! Please configure your channel:\n\n` +
					`1️⃣ - Set a user limit\n` +
					`2️⃣ - Make channel private (invisible)\n` +
					`3️⃣ - Set a password\n` +
					`4️⃣ - Lock channel (no join)\n` +
					`❌ - Keep default settings\n\n` +
					`React to choose an option.`,
					'#7289DA'
				)
			});



            // Add reactions
            await setupMessage.react('1️⃣');
            await setupMessage.react('2️⃣');
            await setupMessage.react('3️⃣');
            await setupMessage.react('4️⃣');
            await setupMessage.react('❌');

            // Wait for reaction
            const filter = (reaction, user) => {
                return ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '❌'].includes(reaction.emoji.name) && user.id === member.id;
            };

            const collector = setupMessage.createReactionCollector({ filter, time: 30000, max: 1 });

            collector.on('collect', async (reaction) => {
                await setupMessage.delete().catch(() => {});

                if (reaction.emoji.name === '1️⃣') {
                    // Set user limit
                    await channel.send(createEmbed(
                        '👥 Set User Limit',
                        'What should be the user limit? (Enter a number between 2-99)',
                        '#7289DA'
                    ));
                    awaitingResponse.set(member.id, { type: 'limit', channel: channel.id });
                } else if (reaction.emoji.name === '2️⃣') {
                    // Make channel completely private (invisible for everyone except creator)
                    try {
                        // First, reset all permissions
                        const existingOverwrites = channel.permissionOverwrites.cache;
                        
                        // Remove all existing overwrites
                        for (const [id, overwrite] of existingOverwrites) {
                            await channel.permissionOverwrites.delete(id);
                        }
                        
                        // Now set new permissions - deny everyone
                        await channel.permissionOverwrites.create(channel.guild.roles.everyone, {
                            ViewChannel: false,
                            Connect: false,
                            Speak: false,
                            Stream: false,
                            SendMessages: false
                        });
                        
                        // Then allow for the creator
                        await channel.permissionOverwrites.create(member.id, {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true,
                            Stream: true,
                            ManageChannels: true,
                            MuteMembers: true,
                            DeafenMembers: true,
                            MoveMembers: true
                        });
                        
                        // Force update the channel to apply changes
                        await channel.edit({ name: channel.name });
                        
                        await channel.send(createEmbed(
                            '👻 Channel Invisible',
                            '✅ Channel is now completely invisible to others!',
                            '#2ECC71'
                        ));
                    } catch (err) {
                        console.error("[Auto Voice Channels] Error making channel private:", err);
                        await channel.send(createEmbed(
                            '❌ Error',
                            'Failed to make channel private. Please try again.',
                            '#E74C3C'
                        ));
                    }
                } else if (reaction.emoji.name === '3️⃣') {
                    // Set password
                    try {
                        const password = generatePassword();
                        channelPasswords.set(channel.id, password);
                        
                        // Create move channel
                        const moveChannel = await channel.guild.channels.create({
                            name: `🔐 Join ${channel.name}`,
                            type: 2, // Voice channel
                            parent: channel.parentId,
                            permissionOverwrites: [
                                {
                                    id: channel.guild.roles.everyone,
                                    allow: ['ViewChannel', 'Connect']
                                },
                                {
                                    id: member.id,
                                    allow: ['ManageChannels', 'ViewChannel', 'Connect']
                                }
                            ]
                        });
                        
                        channelMoveChannels.set(channel.id, moveChannel.id);
                        channelMoveChannels.set(moveChannel.id, channel.id);
                        
                        // Make main channel invisible - reset permissions first
                        const existingOverwrites = channel.permissionOverwrites.cache;
                        
                        // Remove all existing overwrites
                        for (const [id, overwrite] of existingOverwrites) {
                            await channel.permissionOverwrites.delete(id);
                        }
                        
                        // Set new permissions - deny everyone
                        await channel.permissionOverwrites.create(channel.guild.roles.everyone, {
                            ViewChannel: false,
                            Connect: false,
                            Speak: false,
                            Stream: false,
                            SendMessages: false
                        });
                        
                        // Allow for creator
                        await channel.permissionOverwrites.create(member.id, {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true,
                            Stream: true,
                            ManageChannels: true,
                            MuteMembers: true,
                            DeafenMembers: true,
                            MoveMembers: true
                        });
                        
                        // Force update the channel
                        await channel.edit({ name: channel.name });
                        
                        // Save to database if available
                        if (database) {
                            try {
                                await database.saveChannelSettings(channel.id, true, password, moveChannel.id);
                            } catch (dbError) {
                                console.error("[Auto Voice Channels] Error saving channel settings to database:", dbError);
                            }
                        }
                        
                        // Send password to user via DM
                        try {
                            await member.send(createEmbed(
                                '🔐 Channel Password',
                                `Your channel password is: **${password}**\n\n` +
                                `Others can join your channel by entering the "🔐 Join ${channel.name}" voice channel and providing this password.`,
                                '#9B59B6'
                            ));
                            await channel.send(createEmbed(
                                '🔒 Password Protected & Invisible',
                                '✅ Channel is now password protected and invisible! Check your DMs for the password.',
                                '#2ECC71'
                            ));
                        } catch (error) {
                            await channel.send(createEmbed(
                                '⚠️ Could not send DM',
                                `Could not DM you the password. Your password is: ||${password}||\n\n` +
                                `*This message will be deleted in 30 seconds for security.*`,
                                '#E74C3C'
                            ));
                            setTimeout(() => {
                                channel.messages.fetch({ limit: 1 }).then(messages => {
                                    messages.first()?.delete().catch(() => {});
                                });
                            }, 30000);
                        }
                    } catch (err) {
                        console.error("[Auto Voice Channels] Error setting password:", err);
                        await channel.send(createEmbed(
                            '❌ Error',
                            'Failed to set password protection. Please try again.',
                            '#E74C3C'
                        ));
                    }
                } else if (reaction.emoji.name === '4️⃣') {
                    // Lock channel (visible but no one can join)
                    try {
                        // Reset all permissions first
                        const existingOverwrites = channel.permissionOverwrites.cache;
                        
                        // Remove all existing overwrites
                        for (const [id, overwrite] of existingOverwrites) {
                            await channel.permissionOverwrites.delete(id);
                        }
                        
                        // Set new permissions - allow view but deny connect for everyone
                        await channel.permissionOverwrites.create(channel.guild.roles.everyone, {
                            ViewChannel: true,
                            Connect: false,
                            Speak: false,
                            Stream: false
                        });
                        
                        // Ensure creator can still connect
                        await channel.permissionOverwrites.create(member.id, {
                            ViewChannel: true,
                            Connect: true,
                            Speak: true,
                            Stream: true,
                            ManageChannels: true,
                            MuteMembers: true,
                            DeafenMembers: true,
                            MoveMembers: true
                        });
                        
                        // Force update the channel
                        await channel.edit({ name: channel.name });
                        
                        await channel.send(createEmbed(
                            '🔒 Channel Locked',
                            '✅ Channel is now locked! Others can see it but cannot join.',
                            '#2ECC71'
                        ));
                    } catch (err) {
                        console.error("[Auto Voice Channels] Error locking channel:", err);
                        await channel.send(createEmbed(
                            '❌ Error',
                            'Failed to lock channel. Please try again.',
                            '#E74C3C'
                        ));
                    }
                }
            });

            collector.on('end', (collected) => {
                if (collected.size === 0) {
                    setupMessage.delete().catch(() => {});
                }
            });
        } catch (error) {
            console.error("[Auto Voice Channels] Error in channel settings:", error);
        }
    }

    // Handle text messages for channel configuration
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        
        const responseInfo = awaitingResponse.get(message.author.id);
        if (!responseInfo) return;
        
        if (responseInfo.type === 'limit') {
            const limit = parseInt(message.content);
            if (isNaN(limit) || limit < 2 || limit > 99) {
                await message.reply(createEmbed(
                    '❌ Invalid Input',
                    'Please enter a valid number between 2 and 99.',
                    '#E74C3C'
                ));
                return;
            }
            
            const channel = message.guild.channels.cache.get(responseInfo.channel);
            if (channel) {
                await channel.setUserLimit(limit);
                await message.reply(createEmbed(
                    '✅ Limit Set',
                    `User limit set to ${limit}!`,
                    '#2ECC71'
                ));
            }
            awaitingResponse.delete(message.author.id);
        }
    });

    // Voice channel events
    client.on('voiceStateUpdate', async (oldState, newState) => {
        try {
            // Check if user joined a channel
            if (newState.channelId && (!oldState.channelId || oldState.channelId !== newState.channelId)) {
                // Check if this is a move channel
                const mainChannelId = channelMoveChannels.get(newState.channelId);
                if (mainChannelId && channelPasswords.has(mainChannelId)) {
                    // This is a move channel, ask for password via DM
                    const member = newState.member;
                    const password = channelPasswords.get(mainChannelId);
                    
                    try {
                        // Send password prompt via DM
                        const dmMessage = await member.send(createEmbed(
                            '🔐 Password Required',
                            'Please reply with the password for this voice channel:',
                            '#9B59B6'
                        ));
                        
                        // Wait for password response in DM
                        const filter = m => m.author.id === member.id;
                        const collector = dmMessage.channel.createMessageCollector({ filter, time: 30000, max: 1 });
                        
                        collector.on('collect', async (m) => {
                            if (m.content === password) {
                                const mainChannel = newState.guild.channels.cache.get(mainChannelId);
                                if (mainChannel) {
                                    // Grant access to main channel
                                    await mainChannel.permissionOverwrites.edit(member.id, {
                                        Connect: true,
                                        ViewChannel: true
                                    });
                                    
                                    // Move user to main channel
                                    if (member.voice.channel) {
                                        await member.voice.setChannel(mainChannel);
                                        await member.send(createEmbed(
                                            '✅ Access Granted',
                                            'Correct password! Moving you to the channel...',
                                            '#2ECC71'
                                        ));
                                    }
                                }
                            } else {
                                await member.send(createEmbed(
                                    '❌ Access Denied',
                                    'Incorrect password. Please try again.',
                                    '#E74C3C'
                                ));
                                // Disconnect from move channel
                                if (member.voice.channel) {
                                    await member.voice.disconnect();
                                }
                            }
                        });
                        
                        collector.on('end', (collected) => {
                            if (collected.size === 0) {
                                member.send(createEmbed(
                                    '⏰ Time Expired',
                                    'Password request timed out. Please try again.',
                                    '#E74C3C'
                                ));
                                // Disconnect from move channel
                                if (member.voice.channel?.id === newState.channelId) {
                                    member.voice.disconnect();
                                }
                            }
                        });
                    } catch (error) {
                        console.error("[Auto Voice Channels] Could not DM user for password:", error);
                        // Disconnect if can't DM
                        if (member.voice.channel) {
                            await member.voice.disconnect();
                        }
                    }
                    
                    return;
                }
                
                // Check if this is a join channel
                let joinChannel = null;
                
                if (database) {
                    try {
                        const joinChannels = await database.getJoinChannels();
                        joinChannel = joinChannels.find(ch => ch.id === newState.channelId);
                    } catch (dbError) {
                        console.error("[Auto Voice Channels] Error getting join channels from database:", dbError);
                    }
                }
                
                if (!joinChannel) {
                    joinChannel = config.joinChannels.find(ch => ch.id === newState.channelId);
                }
                
                if (joinChannel) {
                    try {
                        // Create a new voice channel
                        const user = newState.member;
                        let channelName;
                        
                        const useSequential = joinChannel.useSequential === true;
                        
                        if (useSequential) {
                            config.lastRoomNumber++;
                            saveConfig();
                            const format = joinChannel.channelFormat || config.sequentialChannelFormat;
                            channelName = format.replace('{number}', config.lastRoomNumber);
                        } else {
                            const format = joinChannel.channelFormat || config.userChannelFormat;
                            channelName = format.replace('{username}', user.displayName);
                        }
                        
                        // Create channel with permissions
                        const category = await newState.guild.channels.fetch(joinChannel.categoryId);
                        let channelOptions = {
                            name: channelName,
                            type: 2, // Voice channel type
                            parent: joinChannel.categoryId,
                            permissionOverwrites: [
                                {
                                    id: user.id,
                                    allow: ['Connect', 'ManageChannels', 'MuteMembers', 'DeafenMembers', 'MoveMembers']
                                }
                            ]
                        };

                        if (category && category.permissionOverwrites && category.permissionOverwrites.cache) {
                            console.log("[Auto Voice Channels] Inheriting permissions from category");
                            
                            const newPermOverwrites = [];
                            
                            category.permissionOverwrites.cache.forEach(perm => {
                                const allowPermissions = perm.allow ? perm.allow.toArray() : [];
                                const denyPermissions = perm.deny ? perm.deny.toArray() : [];
                                
                                if (perm.id === user.id) {
                                    const additionalPerms = ['Connect', 'ManageChannels', 'MuteMembers', 'DeafenMembers', 'MoveMembers'];
                                    for (const p of additionalPerms) {
                                        if (!allowPermissions.includes(p)) {
                                            allowPermissions.push(p);
                                        }
                                    }
                                }
                                
                                newPermOverwrites.push({
                                    id: perm.id,
                                    allow: allowPermissions,
                                    deny: denyPermissions,
                                    type: perm.type
                                });
                            });
                            
                            const creatorExists = newPermOverwrites.some(perm => perm.id === user.id);
                            if (!creatorExists) {
                                newPermOverwrites.push({
                                    id: user.id,
                                    allow: ['Connect', 'ManageChannels', 'MuteMembers', 'DeafenMembers', 'MoveMembers'],
                                    deny: []
                                });
                            }
                            
                            channelOptions.permissionOverwrites = newPermOverwrites;
                        }
                        
                        const newChannel = await newState.guild.channels.create(channelOptions);
                        
                        // Move user to the new channel
                        await newState.setChannel(newChannel);
                        
                        console.log(`[Auto Voice Channels] Created channel "${channelName}" for ${user.displayName}`);
                        
                        // Store channel info
                        if (database) {
                            try {
                                await database.trackCreatedChannel(newChannel.id, user.id);
                            } catch (trackError) {
                                console.error("[Auto Voice Channels] Error tracking channel in database:", trackError);
                                createdChannels.set(newChannel.id, {
                                    creatorId: user.id,
                                    channelId: newChannel.id,
                                    creationTime: Date.now()
                                });
                            }
                        } else {
                            createdChannels.set(newChannel.id, {
                                creatorId: user.id,
                                channelId: newChannel.id,
                                creationTime: Date.now()
                            });
                        }
                        
                        // Ask for channel settings
                        await askChannelSettings(user, newChannel);
                    } catch (error) {
                        console.error("[Auto Voice Channels] Error creating voice channel:", error);
                    }
                }
            }
            
            // Check if a channel should be deleted (if empty)
            if (oldState.channelId && config.deleteEmptyChannels) {
                let isTracked = false;
                
                if (database) {
                    try {
                        const trackedChannels = await database.getAllTrackedChannels();
                        isTracked = trackedChannels.some(tc => tc.channelId === oldState.channelId);
                    } catch (dbError) {
                        console.error("[Auto Voice Channels] Error getting tracked channels from database:", dbError);
                        isTracked = createdChannels.has(oldState.channelId);
                    }
                } else {
                    isTracked = createdChannels.has(oldState.channelId);
                }
                
                if (isTracked) {
                    const channel = oldState.guild.channels.cache.get(oldState.channelId);
                    
                    if (channel && channel.members.size === 0) {
                        try {
                            // Check if this channel has a move channel
                            const moveChannelId = channelMoveChannels.get(channel.id);
                            if (moveChannelId) {
                                const moveChannel = oldState.guild.channels.cache.get(moveChannelId);
                                if (moveChannel) {
                                    await moveChannel.delete();
                                    console.log(`[Auto Voice Channels] Deleted move channel "${moveChannel.name}"`);
                                }
                                channelMoveChannels.delete(channel.id);
                                channelMoveChannels.delete(moveChannelId);
                            }
                            
                            // Delete the main channel
                            await channel.delete();
                            
                            // Clean up data
                            channelPasswords.delete(channel.id);
                            
                            if (database) {
                                try {
                                    await database.removeTrackedChannel(oldState.channelId);
                                } catch (removeError) {
                                    console.error("[Auto Voice Channels] Error removing channel from database:", removeError);
                                    createdChannels.delete(oldState.channelId);
                                }
                            } else {
                                createdChannels.delete(oldState.channelId);
                            }
                            
                            console.log(`[Auto Voice Channels] Deleted empty channel "${channel.name}"`);
                        } catch (error) {
                            console.error("[Auto Voice Channels] Error deleting channel:", error);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("[Auto Voice Channels] Error in voice state update handler:", error);
        }
    });

    // Export functions for webUI (keeping existing functionality)
    module.exports.getConfig = () => config;
    module.exports.addJoinChannel = async (channelId, categoryId, channelFormat, useSequential) => {
        console.log("[Auto Voice Channels] Adding join channel:", { channelId, categoryId, channelFormat, useSequential });
        
        const joinChannel = {
            id: channelId,
            categoryId: categoryId,
            channelFormat: channelFormat || "{username}'s Channel",
            useSequential: useSequential === true
        };
        
        try {
            const existingIndex = config.joinChannels.findIndex(ch => ch.id === channelId);
            if (existingIndex !== -1) {
                config.joinChannels[existingIndex] = joinChannel;
            } else {
                config.joinChannels.push(joinChannel);
            }
            
            if (!saveConfig()) {
                return false;
            }
            
            if (database) {
                try {
                    await database.addJoinChannel(channelId, categoryId, channelFormat, useSequential);
                } catch (dbError) {
                    console.error("[Auto Voice Channels] Error adding join channel to database:", dbError);
                }
            }
            
            return true;
        } catch (error) {
            console.error("[Auto Voice Channels] Error adding join channel:", error);
            return false;
        }
    };
    
    module.exports.removeJoinChannel = async (channelId) => {
        try {
            config.joinChannels = config.joinChannels.filter(ch => ch.id !== channelId);
            
            if (!saveConfig()) {
                return false;
            }
            
            if (database) {
                try {
                    await database.removeJoinChannel(channelId);
                } catch (dbError) {
                    console.error("[Auto Voice Channels] Error removing join channel from database:", dbError);
                }
            }
            
            return true;
        } catch (error) {
            console.error("[Auto Voice Channels] Error removing join channel:", error);
            return false;
        }
    };
    
    module.exports.updateJoinChannel = async (channelId, updates) => {
        console.log("[Auto Voice Channels] Updating join channel:", { channelId, updates });
        
        try {
            const index = config.joinChannels.findIndex(ch => ch.id === channelId);
            if (index !== -1) {
                if (updates.channelFormat !== undefined) {
                    config.joinChannels[index].channelFormat = updates.channelFormat;
                }
                if (updates.useSequential !== undefined) {
                    config.joinChannels[index].useSequential = updates.useSequential === true;
                }
                if (updates.categoryId !== undefined) {
                    config.joinChannels[index].categoryId = updates.categoryId;
                }
                
                console.log("[Auto Voice Channels] Updated channel config:", config.joinChannels[index]);
                
                if (!saveConfig()) {
                    return false;
                }
                
                if (database) {
                    try {
                        await database.updateJoinChannel(channelId, updates);
                    } catch (dbError) {
                        console.error("[Auto Voice Channels] Error updating join channel in database:", dbError);
                    }
                }
                
                return true;
            }
            return false;
        } catch (error) {
            console.error("[Auto Voice Channels] Error updating join channel:", error);
            return false;
        }
    };
    
    module.exports.setDeleteEmptyChannels = (value) => {
        config.deleteEmptyChannels = value;
        return saveConfig();
    };
    
    module.exports.setUserChannelFormat = (format) => {
        if (!format || format.trim() === '') {
            return false;
        }
        config.userChannelFormat = format;
        return saveConfig();
    };
    
    module.exports.setSequentialChannelFormat = (format) => {
        if (!format || format.trim() === '') {
            return false;
        }
        config.sequentialChannelFormat = format;
        return saveConfig();
    };
    
    module.exports.resetRoomCounter = () => {
        config.lastRoomNumber = 0;
        return saveConfig();
    };
    
    module.exports.setShowDeleteWarning = (value) => {
        config.showDeleteWarning = value;
        return saveConfig();
    };
    
    module.exports.getChannelNames = async (channelIds) => {
        try {
            const channelNames = {};
            for (const id of channelIds) {
                try {
                    const channel = await client.channels.fetch(id);
                    if (channel) {
                        channelNames[id] = channel.name;
                    } else {
                        channelNames[id] = "Unknown Channel";
                    }
                } catch (err) {
                    channelNames[id] = "Unknown Channel";
                }
            }
            return channelNames;
        } catch (error) {
            console.error("[Auto Voice Channels] Error getting channel names:", error);
            return {};
        }
    };
    
    module.exports.database = database;
};
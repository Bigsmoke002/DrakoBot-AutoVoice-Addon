// WebUI for Drako Bot Voice Channels and Message Purge Addons
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const configPath = path.join(__dirname, 'config.json');

module.exports.run = async (client) => {
    console.log("[WebUI] Addon loaded!");
    
    // Load config
    let config;
    try {
        if (fs.existsSync(configPath)) {
            const rawConfig = fs.readFileSync(configPath);
            config = JSON.parse(rawConfig);
        } else {
            console.error("[WebUI] Config file not found!");
            return;
        }
    } catch (error) {
        console.error("[WebUI] Error loading config:", error);
        return;
    }
    
    // Web UI configuration - these can be modified in the new config tab
    let webUIConfig = {
        siteName: "Drako Bot Admin Panel",
        tabNames: {
            voiceChannels: "Auto Voice Channels",
            messagePurge: "Message Auto-Delete",
            configEditor: "Configuration"
        },
        theme: {
            primary: "#9c27b0", // Main theme color
            secondary: "#bb86fc", // Secondary accent color
            danger: "#cf6679",
            background: "#121212",
            cardBackground: "#1e1e1e",
            headerBackground: "#1e1e1e"
        }
    };
    
    // If webUIConfig doesn't exist in config, add it
    if (!config.webUIConfig) {
        config.webUIConfig = webUIConfig;
        saveConfig();
    } else {
        // Use stored config but merge with default for missing properties
        webUIConfig = {...webUIConfig, ...config.webUIConfig};
        
        // Ensure theme has all properties
        if (!webUIConfig.theme) webUIConfig.theme = {};
        webUIConfig.theme = {...webUIConfig.theme, ...config.webUIConfig.theme};
        
        // Ensure tabNames has all properties
        if (!webUIConfig.tabNames) webUIConfig.tabNames = {};
        webUIConfig.tabNames = {...webUIConfig.tabNames, ...config.webUIConfig.tabNames};
    }
    
    // Function to save config
    function saveConfig() {
        try {
            // Update webUIConfig in config object
            config.webUIConfig = webUIConfig;
            
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
            console.log("[WebUI] Config saved");
            return true;
        } catch (error) {
            console.error("[WebUI] Error saving config:", error);
            return false;
        }
    }
    
    // Import database.js directly
    let database;
    try {
        // Versuche zuerst das database.js direkt zu importieren
        database = require('./database');
        
        // Initialisiere die Datenbank sofort
        await database.initializeDatabase();
        console.log("[WebUI] Database initialized directly");
    } catch (error) {
        console.error("[WebUI] Error loading database directly:", error.message);
        
        // Als Fallback versuchen, database aus voice_channels zu laden
        try {
            const voiceChannels = require('./voice_channels');
            if (voiceChannels && voiceChannels.database) {
                database = voiceChannels.database;
                console.log("[WebUI] Database loaded from voice_channels");
            } else {
                console.error("[WebUI] Database not available in voice_channels");
            }
        } catch (vcError) {
            console.error("[WebUI] Error loading voice_channels module:", vcError.message);
        }
    }
    
    // Import addon modules
    let voiceChannels;
    let messagePurge;
    
    try {
        voiceChannels = require('./voice_channels');
        messagePurge = require('./message_purge');
        console.log("[WebUI] Modules loaded successfully");
        
        // Falls database noch nicht geladen wurde, versuche es aus voice_channels zu bekommen
        if (!database && voiceChannels && voiceChannels.database) {
            database = voiceChannels.database;
            console.log("[WebUI] Database loaded from voice_channels after module load");
        }
    } catch (error) {
        console.error("[WebUI] Error loading modules:", error);
    }
    
    // Set up Express app
    const app = express();
    const server = http.createServer(app);
    
    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Create public directory if not exists
    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }
    
    // Serve static files
    app.use(express.static(publicDir));
    
    // Default HTML and CSS files paths
    const htmlPath = path.join(publicDir, 'index.html');
    
    // API Routes
    
    // Get join channels
    app.get('/api/join-channels', async (req, res) => {
        try {
            if (!database) {
                return res.status(500).json({ error: "Database module not loaded" });
            }
            
            const joinChannels = await database.getJoinChannels();
            res.json(joinChannels);
        } catch (error) {
            console.error("[WebUI] Error fetching join channels:", error);
            res.status(500).json({ error: "Failed to fetch join channels: " + error.message });
        }
    });
    
    // Add join channel
    app.post('/api/join-channels', async (req, res) => {
        const { joinChannelId, categoryId, channelFormat, useSequential } = req.body;
        
        if (!joinChannelId || !categoryId) {
            return res.json({ success: false, error: 'Missing required fields' });
        }
        
        try {
            if (!voiceChannels) {
                return res.json({ success: false, error: 'Voice channels module not loaded' });
            }
            
            const result = await voiceChannels.addJoinChannel(joinChannelId, categoryId, channelFormat, useSequential);
            
            if (result) {
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Failed to add join channel' });
            }
        } catch (error) {
            console.error("[WebUI] Error adding join channel:", error);
            res.json({ success: false, error: 'Error: ' + error.message });
        }
    });
    
    // Remove join channel
    app.delete('/api/join-channels/:channelId', async (req, res) => {
        const channelId = req.params.channelId;
        
        try {
            if (!voiceChannels) {
                return res.json({ success: false, error: 'Voice channels module not loaded' });
            }
            
            const result = await voiceChannels.removeJoinChannel(channelId);
            
            if (result) {
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Failed to remove join channel' });
            }
        } catch (error) {
            console.error("[WebUI] Error removing join channel:", error);
            res.json({ success: false, error: 'Error: ' + error.message });
        }
    });
    
    // Save settings
    app.post('/api/settings', (req, res) => {
        const { 
            deleteEmptyChannels, 
            showDeleteWarning, 
            useSequentialNames, 
            userChannelFormat, 
            sequentialChannelFormat 
        } = req.body;
        
        if (!voiceChannels) {
            return res.json({ success: false, error: 'Voice channels module not loaded' });
        }
        
        let result = true;
        
        if (deleteEmptyChannels !== undefined) {
            result = result && voiceChannels.setDeleteEmptyChannels(deleteEmptyChannels);
        }
        
        if (showDeleteWarning !== undefined) {
            result = result && voiceChannels.setShowDeleteWarning(showDeleteWarning);
        }
        
        if (useSequentialNames !== undefined) {
            config.useSequentialNames = useSequentialNames;
            result = result && saveConfig();
        }
        
        if (userChannelFormat) {
            result = result && voiceChannels.setUserChannelFormat(userChannelFormat);
        }
        
        if (sequentialChannelFormat) {
            result = result && voiceChannels.setSequentialChannelFormat(sequentialChannelFormat);
        }
        
        if (result) {
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'Failed to save settings' });
        }
    });
    
    // Reset room counter
    app.post('/api/reset-counter', (req, res) => {
        try {
            if (!voiceChannels) {
                return res.json({ success: false, error: 'Voice channels module not loaded' });
            }
            
            const result = voiceChannels.resetRoomCounter();
            console.log("[WebUI] Room counter reset, result:", result);
            
            if (result) {
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Failed to reset room counter' });
            }
        } catch (error) {
            console.error("[WebUI] Error during room counter reset:", error);
            res.json({ success: false, error: 'Exception: ' + error.message });
        }
    });
    
    // Get specific join channel
    app.get('/api/join-channel/:channelId', async (req, res) => {
        const channelId = req.params.channelId;
        
        try {
            if (!database) {
                return res.status(500).json({ error: "Database module not loaded" });
            }
            
            const channel = await database.getJoinChannel(channelId);
            
            if (channel) {
                res.json(channel);
            } else {
                res.status(404).json({ error: 'Channel not found' });
            }
        } catch (error) {
            console.error("[WebUI] Error fetching join channel:", error);
            res.status(500).json({ error: 'Error: ' + error.message });
        }
    });
    
    // Update join channel
    app.put('/api/join-channel/:channelId', async (req, res) => {
        const channelId = req.params.channelId;
        const updates = req.body;
        
        try {
            if (!voiceChannels) {
                return res.json({ success: false, error: 'Voice channels module not loaded' });
            }
            
            const result = await voiceChannels.updateJoinChannel(channelId, updates);
            
            if (result) {
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Failed to update join channel' });
            }
        } catch (error) {
            console.error("[WebUI] Error updating join channel:", error);
            res.json({ success: false, error: 'Error: ' + error.message });
        }
    });
    
    // Get config.json
    app.get('/api/config-json', (req, res) => {
        try {
            const rawConfig = fs.readFileSync(configPath, 'utf8');
            res.json(JSON.parse(rawConfig));
        } catch (error) {
            console.error("[WebUI] Error reading config.json:", error);
            res.status(500).json({ error: 'Failed to read config.json: ' + error.message });
        }
    });
    
    // Save config.json
    app.post('/api/config-json', (req, res) => {
        try {
            const { content } = req.body;
            
            if (!content) {
                return res.json({ success: false, error: 'Missing content' });
            }
            
            // Parse to validate JSON
            const configObj = JSON.parse(content);
            
            // Save the new config
            fs.writeFileSync(configPath, content);
            
            // Reload config in the modules
            if (voiceChannels && typeof voiceChannels.getConfig === 'function') {
                // Forcing reload of the modules might be needed for some changes
                delete require.cache[require.resolve('./voice_channels')];
                delete require.cache[require.resolve('./message_purge')];
                try {
                    voiceChannels = require('./voice_channels');
                    messagePurge = require('./message_purge');
                    database = voiceChannels.database;
                } catch (e) {
                    console.error("[WebUI] Error reloading modules after config change:", e);
                }
            }
            
            // Update local config variable
            config = configObj;
            
            // Update webUIConfig
            if (configObj.webUIConfig) {
                webUIConfig = {...webUIConfig, ...configObj.webUIConfig};
                if (configObj.webUIConfig.theme) {
                    webUIConfig.theme = {...webUIConfig.theme, ...configObj.webUIConfig.theme};
                }
                if (configObj.webUIConfig.tabNames) {
                    webUIConfig.tabNames = {...webUIConfig.tabNames, ...configObj.webUIConfig.tabNames};
                }
            }
            
            res.json({ success: true });
        } catch (error) {
            console.error("[WebUI] Error saving config.json:", error);
            res.json({ success: false, error: 'Failed to save config.json: ' + error.message });
        }
    });
    
    // Get message delete settings
    app.get('/api/message-delete-settings', async (req, res) => {
        try {
            if (!database) {
                // Fallback-Werte, wenn keine Datenbank verfügbar ist
                return res.json({
                    channel1: { id: null, minutes: 10 },
                    channel2: { id: null, minutes: 1440 },
                    channel3: { id: null, minutes: 10080 },
                    deleteEmptyChannels: config.deleteEmptyChannels || true,
                    useSequentialNames: config.useSequentialNames || false,
                    showDeleteWarning: config.showDeleteWarning || true,
                    userChannelFormat: config.userChannelFormat || "{username}'s Channel",
                    sequentialChannelFormat: config.sequentialChannelFormat || "-Room{number}-"
                });
            }
            
            const messageDeleteTimes = await database.getMessageDeleteChannels();
            res.json({
                channel1: messageDeleteTimes.channel1 || { id: null, minutes: 10 },
                channel2: messageDeleteTimes.channel2 || { id: null, minutes: 1440 },
                channel3: messageDeleteTimes.channel3 || { id: null, minutes: 10080 },
                deleteEmptyChannels: config.deleteEmptyChannels,
                useSequentialNames: config.useSequentialNames,
                showDeleteWarning: config.showDeleteWarning,
                userChannelFormat: config.userChannelFormat,
                sequentialChannelFormat: config.sequentialChannelFormat
            });
        } catch (error) {
            console.error("[WebUI] Error fetching message delete settings:", error);
            // Fallback-Werte im Fehlerfall
            res.json({
                channel1: { id: null, minutes: 10 },
                channel2: { id: null, minutes: 1440 },
                channel3: { id: null, minutes: 10080 },
                deleteEmptyChannels: config.deleteEmptyChannels || true,
                useSequentialNames: config.useSequentialNames || false,
                showDeleteWarning: config.showDeleteWarning || true,
                userChannelFormat: config.userChannelFormat || "{username}'s Channel",
                sequentialChannelFormat: config.sequentialChannelFormat || "-Room{number}-"
            });
        }
    });
    
    // Set message delete channel
    app.post('/api/message-delete-channel', async (req, res) => {
        try {
            const { slot, channelId, minutes } = req.body;
            console.log("[WebUI] Setting message delete channel:", { slot, channelId, minutes });
            
            if (!slot || minutes === undefined) {
                return res.json({ success: false, error: 'Missing required fields' });
            }
            
            if (!messagePurge && !database) {
                return res.json({ success: false, error: 'Message purge module and database not loaded' });
            }
            
            let success = false;
            
            // Try using the messagePurge module function
            if (messagePurge && typeof messagePurge.setMessageDeleteChannel === 'function') {
                try {
                    const result = await messagePurge.setMessageDeleteChannel(slot, channelId, minutes);
                    
                    if (result) {
                        console.log("[WebUI] Message delete channel saved via messagePurge module");
                        success = true;
                    }
                } catch (error) {
                    console.error("[WebUI] Error using messagePurge.setMessageDeleteChannel:", error);
                    // Continue to fallback method
                }
            }
            
            // Fallback: directly set in database
            if (!success && database) {
                try {
                    const result = await database.setMessageDeleteChannel(`channel${slot}`, channelId, parseInt(minutes));
                    
                    if (result) {
                        // Update in-memory config
                        if (config.messageDeleteTimes[`channel${slot}`]) {
                            config.messageDeleteTimes[`channel${slot}`] = {
                                id: channelId,
                                minutes: parseInt(minutes)
                            };
                            
                            if (saveConfig()) {
                                console.log("[WebUI] Message delete channel saved via direct database method");
                                success = true;
                            }
                        }
                    }
                } catch (dbError) {
                    console.error("[WebUI] Error setting message delete channel in database:", dbError);
                    return res.json({ success: false, error: 'Database error: ' + dbError.message });
                }
            }
            
            // Manual config update if no other method worked
            if (!success) {
                // Ensure messageDeleteTimes exists
                if (!config.messageDeleteTimes) {
                    config.messageDeleteTimes = {
                        channel1: { id: null, minutes: 10 },
                        channel2: { id: null, minutes: 1440 },
                        channel3: { id: null, minutes: 10080 }
                    };
                }
                
                // Update the config directly
                config.messageDeleteTimes[`channel${slot}`] = {
                    id: channelId,
                    minutes: parseInt(minutes)
                };
                
                if (saveConfig()) {
                    console.log("[WebUI] Message delete channel saved via direct config update");
                    success = true;
                }
            }
            
            if (success) {
                return res.json({ success: true });
            } else {
                return res.json({ success: false, error: 'Failed to save message delete channel' });
            }
        } catch (error) {
            console.error("[WebUI] Error setting message delete channel:", error);
            res.json({ success: false, error: 'Exception: ' + error.message });
        }
    });
    
    // Get WebUI config
    app.get('/api/webui-config', (req, res) => {
        res.json(webUIConfig);
    });
    
    // Save WebUI config
    app.post('/api/webui-config', (req, res) => {
        try {
            const newConfig = req.body;
            
            // Update webUIConfig with new values
            webUIConfig.siteName = newConfig.siteName || webUIConfig.siteName;
            webUIConfig.tabNames = newConfig.tabNames || webUIConfig.tabNames;
            
            if (newConfig.theme) {
                webUIConfig.theme = {...webUIConfig.theme, ...newConfig.theme};
            }
            
            // Update port if changed
            if (newConfig.webPort && newConfig.webPort !== config.webPort) {
                config.webPort = newConfig.webPort;
            }
            
            // Save config
            if (saveConfig()) {
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Failed to save config' });
            }
        } catch (error) {
            console.error("[WebUI] Error updating web UI config:", error);
            res.json({ success: false, error: error.message });
        }
    });
    
    // Get channel design templates
    app.get('/api/channel-templates', (req, res) => {
        // Initialize if not exist
        if (!config.channelTemplates) {
            config.channelTemplates = [];
            saveConfig();
        }
        
        res.json(config.channelTemplates);
    });
    
    // Add a new channel template
    app.post('/api/channel-templates', (req, res) => {
        try {
            const template = req.body;
            
            if (!template.name) {
                return res.json({ success: false, error: 'Template name is required' });
            }
            
            // Initialize if not exist
            if (!config.channelTemplates) {
                config.channelTemplates = [];
            }
            
            // Add new template
            config.channelTemplates.push(template);
            
            // Save config
            if (saveConfig()) {
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Failed to save config' });
            }
        } catch (error) {
            console.error("[WebUI] Error adding channel template:", error);
            res.json({ success: false, error: error.message });
        }
    });
    
    // Update a channel template
    app.put('/api/channel-templates/:id', (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const template = req.body;
            
            if (!template.name) {
                return res.json({ success: false, error: 'Template name is required' });
            }
            
            // Check if template exists
            if (!config.channelTemplates || !config.channelTemplates[id]) {
                return res.json({ success: false, error: 'Template not found' });
            }
            
            // Update template
            config.channelTemplates[id] = template;
            
            // Save config
            if (saveConfig()) {
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Failed to save config' });
            }
        } catch (error) {
            console.error("[WebUI] Error updating channel template:", error);
            res.json({ success: false, error: error.message });
        }
    });
    
    // Delete a channel template
    app.delete('/api/channel-templates/:id', (req, res) => {
        try {
            const id = parseInt(req.params.id);
            
            // Check if template exists
            if (!config.channelTemplates || !config.channelTemplates[id]) {
                return res.json({ success: false, error: 'Template not found' });
            }
            
            // Remove template
            config.channelTemplates.splice(id, 1);
            
            // Save config
            if (saveConfig()) {
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Failed to save config' });
            }
        } catch (error) {
            console.error("[WebUI] Error deleting channel template:", error);
            res.json({ success: false, error: error.message });
        }
    });
    
    // Get channel names
    app.get('/api/channel-names', async (req, res) => {
        const ids = req.query.ids ? req.query.ids.split(',') : [];
        
        if (ids.length === 0) {
            return res.json({});
        }
        
        try {
            if (!voiceChannels || typeof voiceChannels.getChannelNames !== 'function') {
                // Fallback, wenn getChannelNames nicht verfügbar ist
                const defaultNames = {};
                ids.forEach(id => {
                    defaultNames[id] = "Channel " + id.slice(-4);
                });
                return res.json(defaultNames);
            }
            
            const channelNames = await voiceChannels.getChannelNames(ids);
            res.json(channelNames);
        } catch (error) {
            console.error("[WebUI] Error getting channel names:", error);
            const defaultNames = {};
            ids.forEach(id => {
                defaultNames[id] = "Channel " + id.slice(-4);
            });
            res.json(defaultNames);
        }
    });
    
    // Serve index page for any other route
    app.get('*', (req, res) => {
        if (fs.existsSync(htmlPath)) {
            res.sendFile(htmlPath);
        } else {
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>${webUIConfig.siteName}</title>
                    <style>
                        body {
                            background-color: #121212;
                            color: #e0e0e0;
                            font-family: 'Segoe UI', sans-serif;
                            margin: 0;
                            padding: 20px;
                            text-align: center;
                        }
                        h1 {
                            color: #bb86fc;
                        }
                        .card {
                            background-color: #1e1e1e;
                            border-radius: 8px;
                            padding: 20px;
                            margin: 20px auto;
                            max-width: 600px;
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                        }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>${webUIConfig.siteName}</h1>
                        <p>Bitte legen Sie eine index.html im public-Ordner an.</p>
                    </div>
                </body>
                </html>
            `);
        }
    });
    
    // Start server
    const PORT = config.webPort || 10101;
    // Standardmäßig nur lokal erreichbar – das Panel hat keinen Login
    const HOST = config.webHost || '127.0.0.1';
    server.listen(PORT, HOST, () => {
        console.log(`[WebUI] Server running on http://${HOST}:${PORT}`);
    });
};
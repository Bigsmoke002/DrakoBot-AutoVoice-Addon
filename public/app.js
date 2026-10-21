// Main JavaScript file for Drako Bot Admin Panel

// Prevent server-side execution in a way that doesn't break browser functionality
try {
    // If we're in Node.js, this will throw an error and skip the rest of the file
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        module.exports = {}; // Export empty object for Node.js
    } else {
        // We're in a browser, continue with normal execution
        initializeApp();
    }
} catch (e) {
    // We're likely in Node.js and the code above threw an error
    module.exports = {}; // Export empty object for Node.js
}

// Main initialization function - only called in browser environments
function initializeApp() {
    // ==== TAB FUNCTIONALITY ====
    window.openTab = function(evt, tabName) {
        var tabcontents = document.getElementsByClassName("tabcontent");
        for (var i = 0; i < tabcontents.length; i++) {
            tabcontents[i].classList.remove("visible");
        }
        
        var tablinks = document.getElementsByClassName("tablinks");
        for (var i = 0; i < tablinks.length; i++) {
            tablinks[i].classList.remove("active");
        }
        
        document.getElementById(tabName).classList.add("visible");
        evt.currentTarget.classList.add("active");
    };

    // ==== COLLAPSIBLE SECTIONS ====
    window.toggleCollapse = function(element) {
        element.classList.toggle('collapsed');
        const content = element.nextElementSibling;
        content.classList.toggle('collapsed');
    };

    // ==== MODAL FUNCTIONS ====
    window.openModal = function(modalId) {
        document.getElementById(modalId).classList.add('show');
    };

    window.closeModal = function(modalId) {
        document.getElementById(modalId).classList.remove('show');
    };

    // ==== COLOR PREVIEW UPDATES ====
    function setupColorPreview(inputId, previewId) {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        
        if (input && preview) {
            input.addEventListener('input', function() {
                preview.style.backgroundColor = this.value;
            });
        }
    }

    // Setup all color previews
    function initColorPreviews() {
        setupColorPreview('colorPrimary', 'primaryColorPreview');
        setupColorPreview('colorSecondary', 'secondaryColorPreview');
        setupColorPreview('colorDanger', 'dangerColorPreview');
        setupColorPreview('colorBackground', 'backgroundColorPreview');
        setupColorPreview('colorCardBackground', 'cardBgColorPreview');
        setupColorPreview('colorHeaderBackground', 'headerBgColorPreview');
    }

    // ==== CHANNEL TEMPLATES ====
    let channelTemplates = [];

    function loadChannelTemplates() {
        fetch('/api/channel-templates')
            .then(response => response.json())
            .then(data => {
                channelTemplates = data;
                renderChannelTemplates();
            })
            .catch(error => console.error('Error loading channel templates:', error));
    }

    function renderChannelTemplates() {
        const container = document.getElementById('channelTemplatesContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (channelTemplates.length === 0) {
            container.innerHTML = '<p>No custom templates defined yet. Click "Add New Template" to create one.</p>';
            return;
        }
        
        for (let i = 0; i < channelTemplates.length; i++) {
            const template = channelTemplates[i];
            const card = document.createElement('div');
            card.className = 'channel-card';
            
            card.innerHTML = `
                <div class="channel-card-header">
                    <h3>${template.name || 'Unnamed Template'}</h3>
                    <div class="actions">
                        <button class="btn-small" onclick="editTemplate(${i})">Edit</button>
                        <button class="btn-small btn-danger" onclick="deleteTemplate(${i})">Delete</button>
                    </div>
                </div>
                <div class="form-group">
                    <label>Format:</label>
                    <p>${template.format || 'Default format'}</p>
                </div>
            `;
            
            container.appendChild(card);
        }
    }

    window.editTemplate = function(index) {
        const template = channelTemplates[index];
        
        // Populate modal form
        document.getElementById('templateId').value = index;
        document.getElementById('templateName').value = template.name || '';
        document.getElementById('modalChannelFormat').value = template.format || '';
        
        // Open modal
        openModal('editChannelModal');
    };

    window.deleteTemplate = function(index) {
        if (confirm('Are you sure you want to delete this template?')) {
            fetch(`/api/channel-templates/${index}`, {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    loadChannelTemplates();
                } else {
                    alert('Error deleting template: ' + data.error);
                }
            })
            .catch(error => console.error('Error deleting template:', error));
        }
    };

    // ==== LOAD JOIN CHANNELS DATA ====
    function loadJoinChannels() {
        fetch('/api/join-channels')
            .then(response => response.json())
            .then(data => {
                if (data.length === 0) {
                    var tbody = document.getElementById('joinChannelsBody');
                    if (!tbody) return;
                    tbody.innerHTML = '';
                    return;
                }
                
                // Get all channel IDs
                var channelIds = [];
                var categoryIds = [];
                
                for (var i = 0; i < data.length; i++) {
                    channelIds.push(data[i].id);
                    categoryIds.push(data[i].categoryId);
                }
                
                // Get channel names
                Promise.all([
                    fetch('/api/channel-names?ids=' + channelIds.join(',')).then(r => r.json()),
                    fetch('/api/channel-names?ids=' + categoryIds.join(',')).then(r => r.json())
                ])
                .then(results => {
                    var channelNames = results[0];
                    var categoryNames = results[1];
                    
                    var tbody = document.getElementById('joinChannelsBody');
                    if (!tbody) return;
                    tbody.innerHTML = '';
                    
                    for (var i = 0; i < data.length; i++) {
                        var channel = data[i];
                        var row = document.createElement('tr');
                        
                        // Format type display
                        const formatType = channel.useSequential ? 'Sequential' : 'Username-based';
                        
                        row.innerHTML = 
                            '<td>' + channel.id + '</td>' +
                            '<td>' + (channelNames[channel.id] || 'Unknown') + '</td>' +
                            '<td>' + channel.categoryId + '</td>' +
                            '<td>' + (categoryNames[channel.categoryId] || 'Unknown') + '</td>' +
                            '<td>' + (channel.channelFormat || 'Default') + '</td>' +
                            '<td>' + formatType + '</td>' +
                            '<td class="actions">' +
                                '<button class="btn-small" onclick="editJoinChannel(\'' + channel.id + '\')">Edit</button> ' +
                                '<button class="btn-small btn-danger" onclick="removeJoinChannel(\'' + channel.id + '\')">Remove</button>' +
                            '</td>';
                        tbody.appendChild(row);
                    }
                })
                .catch(error => console.error('Error loading channel names:', error));
            })
            .catch(error => console.error('Error loading join channels:', error));
    }

    // Edit join channel
    window.editJoinChannel = function(channelId) {
        fetch('/api/join-channel/' + channelId)
            .then(response => response.json())
            .then(data => {
                // Create and show modal with channel data
                const modalHTML = `
                <div class="modal show" id="editJoinChannelModal">
                    <div class="modal-content">
                        <span class="close" onclick="this.parentNode.parentNode.remove()">&times;</span>
                        <h2>Edit Join Channel</h2>
                        
                        <form id="editJoinChannelForm">
                            <input type="hidden" id="editChannelId" value="${data.id}">
                            
                            <div class="form-group">
                                <label for="editCategoryId">Category ID:</label>
                                <input type="text" id="editCategoryId" value="${data.categoryId}" required>
                            </div>
                            
                            <div class="form-group">
                                <label for="editChannelFormat">Channel Format:</label>
                                <input type="text" id="editChannelFormat" value="${data.channelFormat || '{username}\'s Channel'}" placeholder="Format for created channels">
                                <small>Use {username} or {number} as placeholders</small>
                            </div>
                            
                            <div class="form-group">
                                <label>
                                    <input type="checkbox" id="editUseSequential" ${data.useSequential ? 'checked' : ''}>
                                    Use sequential numbering instead of usernames
                                </label>
                            </div>
                            
                            <div class="form-group">
                                <label for="editTemplateSelect">Use Template:</label>
                                <select id="editTemplateSelect">
                                    <option value="">None (Custom Format)</option>
                                    ${channelTemplates.map((template, idx) => 
                                        `<option value="${idx}">${template.name}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            
                            <button type="submit">Save Changes</button>
                        </form>
                    </div>
                </div>`;
                
                // Add modal to body
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = modalHTML;
                document.body.appendChild(tempDiv.firstChild);
                
                // Handle template selection
                const templateSelect = document.getElementById('editTemplateSelect');
                if (templateSelect) {
                    templateSelect.addEventListener('change', function() {
                        if (this.value !== '') {
                            const template = channelTemplates[parseInt(this.value)];
                            document.getElementById('editChannelFormat').value = template.format;
                        }
                    });
                }
                
                // Handle form submission
                const form = document.getElementById('editJoinChannelForm');
                if (form) {
                    form.addEventListener('submit', function(e) {
                        e.preventDefault();
                        
                        const updatedChannel = {
                            categoryId: document.getElementById('editCategoryId').value,
                            channelFormat: document.getElementById('editChannelFormat').value,
                            useSequential: document.getElementById('editUseSequential').checked
                        };
                        
                        fetch('/api/join-channel/' + channelId, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(updatedChannel)
                        })
                        .then(response => response.json())
                        .then(result => {
                            if (result.success) {
                                // Remove modal and reload data
                                document.getElementById('editJoinChannelModal').remove();
                                loadJoinChannels();
                                alert('Channel updated successfully!');
                            } else {
                                alert('Error updating channel: ' + result.error);
                            }
                        })
                        .catch(error => { 
                            console.error('Error updating channel:', error);
                            alert('Error updating channel: ' + error);
                        });
                    });
                }
            })
            .catch(error => console.error('Error loading channel data:', error));
    };

    // Remove join channel
    window.removeJoinChannel = function(channelId) {
        if (confirm('Are you sure you want to remove this join channel?')) {
            fetch('/api/join-channels/' + channelId, {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    loadJoinChannels();
                    alert('Join channel removed successfully!');
                } else {
                    alert('Error removing join channel: ' + data.error);
                }
            })
            .catch(error => console.error('Error removing join channel:', error));
        }
    };

    // Load message delete settings
    function loadMessageDeleteSettings() {
        fetch('/api/message-delete-settings')
            .then(response => response.json())
            .then(data => {
                const deleteChannelId1 = document.getElementById('deleteChannelId1');
                const deleteChannelId2 = document.getElementById('deleteChannelId2');
                const deleteChannelId3 = document.getElementById('deleteChannelId3');
                const time1 = document.getElementById('time1');
                const time2 = document.getElementById('time2');
                const time3 = document.getElementById('time3');
                const deleteEmptyChannels = document.getElementById('deleteEmptyChannels');
                const showDeleteWarning = document.getElementById('showDeleteWarning');
                const sequentialMode = document.getElementById('sequentialMode');
                const userNameMode = document.getElementById('userNameMode');
                const sequentialSettings = document.getElementById('sequentialSettings');
                const userChannelFormat = document.getElementById('userChannelFormat');
                const sequentialChannelFormat = document.getElementById('sequentialChannelFormat');
                
                if (deleteChannelId1) deleteChannelId1.value = data.channel1.id || '';
                if (deleteChannelId2) deleteChannelId2.value = data.channel2.id || '';
                if (deleteChannelId3) deleteChannelId3.value = data.channel3.id || '';
                
                if (time1) time1.value = data.channel1.minutes || 10;
                if (time2) time2.value = data.channel2.minutes || 1440;
                if (time3) time3.value = data.channel3.minutes || 10080;
                
                if (deleteEmptyChannels) deleteEmptyChannels.checked = data.deleteEmptyChannels;
                if (showDeleteWarning) showDeleteWarning.checked = data.showDeleteWarning !== false;
                
                // Channel naming mode
                if (data.useSequentialNames) {
                    if (sequentialMode) sequentialMode.checked = true;
                    if (sequentialSettings) sequentialSettings.style.display = 'block';
                } else {
                    if (userNameMode) userNameMode.checked = true;
                    if (sequentialSettings) sequentialSettings.style.display = 'none';
                }
                
                // Channel formats
                if (userChannelFormat) userChannelFormat.value = data.userChannelFormat || "{username}'s Channel";
                if (sequentialChannelFormat) sequentialChannelFormat.value = data.sequentialChannelFormat || "-Room{number}-";
            })
            .catch(error => console.error('Error loading message delete settings:', error));
    }

    // Load raw config
    function loadRawConfig() {
        fetch('/api/config-json')
            .then(response => response.json())
            .then(data => {
                const rawConfigEditor = document.getElementById('rawConfigEditor');
                if (rawConfigEditor) {
                    rawConfigEditor.value = JSON.stringify(data, null, 4);
                }
            })
            .catch(error => console.error('Error loading raw config:', error));
    }

    // Toggle sequential settings visibility
    function setupSequentialModeToggle() {
        const userNameMode = document.getElementById('userNameMode');
        const sequentialMode = document.getElementById('sequentialMode');
        const sequentialSettings = document.getElementById('sequentialSettings');
        
        if (userNameMode) {
            userNameMode.addEventListener('change', function() {
                if (sequentialSettings) sequentialSettings.style.display = 'none';
            });
        }
        
        if (sequentialMode) {
            sequentialMode.addEventListener('change', function() {
                if (sequentialSettings) sequentialSettings.style.display = 'block';
            });
        }
    }

    // Handle adding a join channel
    function setupAddVoiceChannelForm() {
        const form = document.getElementById('addVoiceChannelForm');
        if (!form) return;
        
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            var joinChannelId = document.getElementById('joinChannelId').value;
            var categoryId = document.getElementById('categoryId').value;
            var channelFormat = document.getElementById('channelFormat').value;
            var useSequential = document.getElementById('useSequential').checked;
            
            fetch('/api/join-channels', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    joinChannelId: joinChannelId, 
                    categoryId: categoryId,
                    channelFormat: channelFormat,
                    useSequential: useSequential
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    document.getElementById('joinChannelId').value = '';
                    document.getElementById('categoryId').value = '';
                    document.getElementById('channelFormat').value = "{username}'s Channel";
                    document.getElementById('useSequential').checked = false;
                    loadJoinChannels();
                    alert('Join channel added successfully!');
                } else {
                    alert('Error adding join channel: ' + data.error);
                }
            })
            .catch(error => console.error('Error adding join channel:', error));
        });
    }

    // Handle saving settings
    function setupSaveSettingsButton() {
        const saveButton = document.getElementById('saveSettings');
        if (!saveButton) return;
        
        saveButton.addEventListener('click', function() {
            var deleteEmptyChannels = document.getElementById('deleteEmptyChannels').checked;
            var showDeleteWarning = document.getElementById('showDeleteWarning').checked;
            var useSequentialNames = document.getElementById('sequentialMode').checked;
            var userChannelFormat = document.getElementById('userChannelFormat').value;
            var sequentialChannelFormat = document.getElementById('sequentialChannelFormat').value;
            
            fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    deleteEmptyChannels: deleteEmptyChannels,
                    showDeleteWarning: showDeleteWarning,
                    useSequentialNames: useSequentialNames,
                    userChannelFormat: userChannelFormat,
                    sequentialChannelFormat: sequentialChannelFormat
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Settings saved successfully!');
                } else {
                    alert('Error saving settings: ' + data.error);
                }
            })
            .catch(error => console.error('Error saving settings:', error));
        });
    }

    // Handle resetting room counter
    function setupResetCounterButton() {
        const resetButton = document.getElementById('resetCounter');
        if (!resetButton) return;
        
        resetButton.addEventListener('click', function() {
            if (confirm('Are you sure you want to reset the room counter back to 0?')) {
                fetch('/api/reset-counter', {
                    method: 'POST'
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert('Room counter has been reset to 0!');
                    } else {
                        alert('Error resetting counter: ' + data.error);
                    }
                })
                .catch(error => console.error('Error resetting counter:', error));
            }
        });
    }

    // Handle saving Web UI Config
    function setupWebUIConfigForm() {
        const form = document.getElementById('webUIConfigForm');
        if (!form) return;
        
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const siteName = document.getElementById('siteName');
            const webPort = document.getElementById('webPort');
            const tabVoiceChannels = document.getElementById('tabVoiceChannels');
            const tabMessagePurge = document.getElementById('tabMessagePurge');
            const tabConfigEditor = document.getElementById('tabConfigEditor');
            const colorPrimary = document.getElementById('colorPrimary');
            const colorSecondary = document.getElementById('colorSecondary');
            const colorDanger = document.getElementById('colorDanger');
            const colorBackground = document.getElementById('colorBackground');
            const colorCardBackground = document.getElementById('colorCardBackground');
            const colorHeaderBackground = document.getElementById('colorHeaderBackground');
            
            const config = {
                siteName: siteName ? siteName.value : "Drako Bot Admin Panel",
                webPort: webPort ? parseInt(webPort.value) : 10101,
                tabNames: {
                    voiceChannels: tabVoiceChannels ? tabVoiceChannels.value : "Auto Voice Channels",
                    messagePurge: tabMessagePurge ? tabMessagePurge.value : "Message Auto-Delete",
                    configEditor: tabConfigEditor ? tabConfigEditor.value : "Configuration"
                },
                theme: {
                    primary: colorPrimary ? colorPrimary.value : "#9c27b0",
                    secondary: colorSecondary ? colorSecondary.value : "#bb86fc",
                    danger: colorDanger ? colorDanger.value : "#cf6679",
                    background: colorBackground ? colorBackground.value : "#121212",
                    cardBackground: colorCardBackground ? colorCardBackground.value : "#1e1e1e",
                    headerBackground: colorHeaderBackground ? colorHeaderBackground.value : "#1e1e1e"
                }
            };
            
            fetch('/api/webui-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Web Interface settings saved! Reloading page...');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                } else {
                    alert('Error saving Web Interface settings: ' + data.error);
                }
            })
            .catch(error => { 
                console.error('Error saving Web Interface settings:', error);
                alert('Error: ' + error);
            });
        });
    }

    // Handle adding a channel template
    function setupAddTemplateButton() {
        const addButton = document.getElementById('addNewTemplate');
        if (!addButton) return;
        
        addButton.addEventListener('click', function() {
            // Reset form
            const templateId = document.getElementById('templateId');
            const templateName = document.getElementById('templateName');
            const modalChannelFormat = document.getElementById('modalChannelFormat');
            
            if (templateId) templateId.value = '';
            if (templateName) templateName.value = '';
            if (modalChannelFormat) modalChannelFormat.value = '';
            
            // Open modal
            openModal('editChannelModal');
        });
    }

    // Handle template form submission
    function setupChannelDesignForm() {
        const form = document.getElementById('channelDesignForm');
        if (!form) return;
        
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const templateId = document.getElementById('templateId').value;
            const template = {
                name: document.getElementById('templateName').value,
                format: document.getElementById('modalChannelFormat').value
            };
            
            // Update or add template
            const isNew = templateId === '';
            const url = isNew ? '/api/channel-templates' : `/api/channel-templates/${templateId}`;
            const method = isNew ? 'POST' : 'PUT';
            
            fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(template)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    closeModal('editChannelModal');
                    loadChannelTemplates();
                } else {
                    alert('Error saving template: ' + data.error);
                }
            })
            .catch(error => console.error('Error saving template:', error));
        });
    }

    // Handle saving raw config
    function setupRawConfigButtons() {
        const loadButton = document.getElementById('loadRawConfig');
        const saveButton = document.getElementById('saveRawConfig');
        
        if (loadButton) {
            loadButton.addEventListener('click', loadRawConfig);
        }
        
        if (saveButton) {
            saveButton.addEventListener('click', function() {
                if (confirm('Are you sure you want to save the raw configuration? This could break your bot if not properly formatted.')) {
                    const rawConfigEditor = document.getElementById('rawConfigEditor');
                    if (!rawConfigEditor) return;
                    
                    const content = rawConfigEditor.value;
                    
                    try {
                        // Test if JSON is valid
                        JSON.parse(content);
                        
                        fetch('/api/config-json', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ content: content })
                        })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                alert('Configuration saved! Some changes might require a bot restart to take effect.');
                                // Reload the page to reflect any UI changes
                                setTimeout(() => {
                                    window.location.reload();
                                }, 1000);
                            } else {
                                alert('Error saving configuration: ' + data.error);
                            }
                        })
                        .catch(error => console.error('Error saving raw config:', error));
                    } catch (e) {
                        alert('Invalid JSON: ' + e.message);
                    }
                }
            });
        }
    }

    // Handle saving auto-delete channels
    function setupAutoDeleteForms() {
        const form1 = document.getElementById('autoDeleteForm1');
        const form2 = document.getElementById('autoDeleteForm2');
        const form3 = document.getElementById('autoDeleteForm3');
        
        if (form1) {
            form1.addEventListener('submit', function(e) {
                e.preventDefault();
                var channelId = document.getElementById('deleteChannelId1').value;
                saveDeleteChannel(1, channelId, document.getElementById('time1').value);
            });
        }
        
        if (form2) {
            form2.addEventListener('submit', function(e) {
                e.preventDefault();
                var channelId = document.getElementById('deleteChannelId2').value;
                saveDeleteChannel(2, channelId, document.getElementById('time2').value);
            });
        }
        
        if (form3) {
            form3.addEventListener('submit', function(e) {
                e.preventDefault();
                var channelId = document.getElementById('deleteChannelId3').value;
                saveDeleteChannel(3, channelId, document.getElementById('time3').value);
            });
        }
    }

    function saveDeleteChannel(slot, channelId, minutes) {
        return fetch('/api/message-delete-channel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ slot: slot, channelId: channelId, minutes: minutes })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert(`Channel ${slot} auto-delete settings saved successfully!`);
            } else {
                throw new Error('Error saving channel: ' + data.error);
            }
        });
    }

    // Initialize everything when DOM is loaded
    document.addEventListener('DOMContentLoaded', function() {
        // Load data
        loadJoinChannels();
        loadMessageDeleteSettings();
        loadChannelTemplates();
        
        // Set up event handlers
        setupSequentialModeToggle();
        setupAddVoiceChannelForm();
        setupSaveSettingsButton();
        setupResetCounterButton();
        setupWebUIConfigForm(); 
        setupAddTemplateButton();
        setupChannelDesignForm();
        setupRawConfigButtons();
        setupAutoDeleteForms();
        
        // Set up color previews
        initColorPreviews();
    });
}
// Health Diary Application JavaScript

class HealthDiaryApp {
    constructor() {
        this.currentUser = null;
        this.authToken = localStorage.getItem('authToken');
        this.currentRecording = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.currentPage = 1;
        
        this.apiBase = window.location.origin + '/api';
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.initAudioContext();
        this.checkAuthStatus();
    }
    
    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        // Auth forms
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerForm').addEventListener('submit', (e) => this.handleRegister(e));
        
        // Auth buttons
        document.getElementById('loginBtn').addEventListener('click', () => this.showAuthSection());
        document.getElementById('registerBtn').addEventListener('click', () => {
            this.showAuthSection();
            this.switchTab('register');
        });
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());
        
        // Checkbox interactions for registration
        document.querySelectorAll('.checkbox-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    const checkbox = item.querySelector('input[type="checkbox"]');
                    checkbox.checked = !checkbox.checked;
                }
                item.classList.toggle('selected', item.querySelector('input').checked);
            });
        });
        
        // Recording controls
        document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecording());
        document.getElementById('playBtn').addEventListener('click', () => this.playRecording());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadRecording());
        document.getElementById('uploadBtn').addEventListener('click', () => this.uploadRecording());
        document.getElementById('discardBtn').addEventListener('click', () => this.discardRecording());
        
        // Load more entries
        document.getElementById('loadMoreBtn').addEventListener('click', () => this.loadMoreEntries());
    }
    
    async checkAuthStatus() {
        if (this.authToken) {
            try {
                const response = await this.apiCall('/auth/me', 'GET');
                if (response.user) {
                    this.currentUser = response.user;
                    this.showAppSection();
                    await this.loadEntries();
                } else {
                    this.clearAuth();
                    this.showAuthSection();
                }
            } catch (error) {
                this.clearAuth();
                this.showAuthSection();
            }
        } else {
            this.showAuthSection();
        }
    }
    
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabName + 'Tab');
        });
    }
    
    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        const btn = e.target.querySelector('.btn');
        this.setLoading(btn, true);
        
        try {
            const response = await this.apiCall('/auth/login', 'POST', {
                email,
                password
            });
            
            this.authToken = response.token;
            this.currentUser = response.user;
            localStorage.setItem('authToken', this.authToken);
            
            this.showAppSection();
            await this.loadEntries();
            
            this.showMessage('Login successful!', 'success');
            
        } catch (error) {
            this.showMessage(error.message || 'Login failed', 'error');
        } finally {
            this.setLoading(btn, false);
        }
    }
    
    async handleRegister(e) {
        e.preventDefault();
        
        const username = document.getElementById('registerUsername').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const interactionStyle = document.getElementById('interactionStyle').value;
        
        // Get selected subjects
        const subjects = [];
        document.querySelectorAll('.checkbox-item input:checked').forEach(checkbox => {
            subjects.push(checkbox.id);
        });
        
        const btn = e.target.querySelector('.btn');
        this.setLoading(btn, true);
        
        try {
            const response = await this.apiCall('/auth/register', 'POST', {
                username,
                email,
                password,
                interactionStyle,
                subjects
            });
            
            this.authToken = response.token;
            this.currentUser = response.user;
            localStorage.setItem('authToken', this.authToken);
            
            this.showAppSection();
            await this.loadEntries();
            
            this.showMessage('Registration successful! Welcome to Health Diary!', 'success');
            
        } catch (error) {
            this.showMessage(error.message || 'Registration failed', 'error');
        } finally {
            this.setLoading(btn, false);
        }
    }
    
    handleLogout() {
        this.clearAuth();
        this.showAuthSection();
        this.showMessage('Logged out successfully', 'success');
    }
    
    clearAuth() {
        this.authToken = null;
        this.currentUser = null;
        localStorage.removeItem('authToken');
    }
    
    showAuthSection() {
        document.getElementById('authSection').classList.remove('hidden');
        document.getElementById('appSection').classList.add('hidden');
        document.getElementById('loginBtn').classList.remove('hidden');
        document.getElementById('registerBtn').classList.remove('hidden');
        document.getElementById('logoutBtn').classList.add('hidden');
        document.getElementById('userWelcome').classList.add('hidden');
    }
    
    showAppSection() {
        document.getElementById('authSection').classList.add('hidden');
        document.getElementById('appSection').classList.remove('hidden');
        document.getElementById('loginBtn').classList.add('hidden');
        document.getElementById('registerBtn').classList.add('hidden');
        document.getElementById('logoutBtn').classList.remove('hidden');
        
        const welcome = document.getElementById('userWelcome');
        welcome.textContent = `Welcome back, ${this.currentUser.username}!`;
        welcome.classList.remove('hidden');
    }
    
    async toggleRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }
    
    async startRecording() {
        console.log('startRecording called');
        try {
            console.log('Requesting microphone access');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('Microphone access granted, stream:', stream);
            
            // Reset audio chunks
            this.audioChunks = [];
            
            // Use compatible options with priority for Android compatibility
            const options = {};
            
            // Check for Android-compatible formats first
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options.mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2')) {
                options.mimeType = 'audio/mp4;codecs=mp4a.40.2';
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                options.mimeType = 'audio/webm';
            } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                options.mimeType = 'audio/mp4';
            } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                options.mimeType = 'audio/ogg;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/wav')) {
                options.mimeType = 'audio/wav';
            }
            
            console.log('Selected MIME type:', options.mimeType || 'default');
            console.log('Supported MIME types:', MediaRecorder.getSupportedMimeTypes?.() || 'getSupportedMimeTypes not available');
            
            this.mediaRecorder = new MediaRecorder(stream, options);
            console.log('MediaRecorder created');
            
            this.mediaRecorder.ondataavailable = (event) => {
                console.log('Data available event, size:', event.data.size);
                this.audioChunks.push(event.data);
            };
            
            this.mediaRecorder.onstop = () => {
                console.log('MediaRecorder stopped');
                this.handleRecordingComplete();
            };
            
            console.log('Starting MediaRecorder');
            this.mediaRecorder.start();
            
            // Update UI
            const recordBtn = document.getElementById('recordBtn');
            recordBtn.textContent = '⏹️ Stop Recording';
            recordBtn.classList.add('recording');
            
            this.showRecordingStatus('Recording... Speak now!', 'warning');
            document.getElementById('audioControls').classList.add('hidden');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            console.error('Error details:', error.name, error.message);
            this.showRecordingStatus('Error: Could not access microphone. Please check permissions.', 'error');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            
            // Update UI
            const recordBtn = document.getElementById('recordBtn');
            recordBtn.textContent = '🎤 Start Recording';
            recordBtn.classList.remove('recording');
            
            this.showRecordingStatus('Processing recording...', 'warning');
        }
    }
    
    handleRecordingComplete() {
        console.log('handleRecordingComplete called');
        console.log('Audio chunks count:', this.audioChunks.length);
        const totalSize = this.audioChunks.reduce((total, chunk) => total + chunk.size, 0);
        console.log('Total audio data size:', totalSize, 'bytes');
        
        const mimeType = this.mediaRecorder.mimeType || 'audio/wav';
        console.log('Final MIME type:', mimeType);
        
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        console.log('Audio blob created, size:', audioBlob.size, 'type:', audioBlob.type);
        
        this.currentRecording = {
            blob: audioBlob,
            url: audioUrl,
            mimeType: mimeType
        };
        
        console.log('Current recording stored:', this.currentRecording);
        
        // Set up audio player with enhanced mobile compatibility
        const audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.src = audioUrl;
        audioPlayer.preload = 'metadata';
        
        // Enhanced mobile-friendly attributes
        audioPlayer.setAttribute('playsinline', 'true');
        audioPlayer.setAttribute('webkit-playsinline', 'true');
        audioPlayer.setAttribute('controlslist', 'nodownload');
        audioPlayer.setAttribute('disablepictureinpicture', 'true');
        
        // Mobile-specific audio setup
        audioPlayer.style.width = '100%';
        audioPlayer.style.maxWidth = '400px';
        audioPlayer.style.height = '54px'; // Increased for better mobile touch targets
        
        // Initialize audio context for iOS if needed
        this.initAudioContext();
        
        // Force load the audio and handle mobile quirks
        audioPlayer.load();
        
        // Add mobile-specific event listeners
        const handleAudioReady = () => {
            console.log('Audio ready for playback');
            audioPlayer.removeEventListener('canplaythrough', handleAudioReady);
        };
        audioPlayer.addEventListener('canplaythrough', handleAudioReady);
        
        // Show controls
        document.getElementById('audioControls').classList.remove('hidden');
        
        this.showRecordingStatus('Recording complete! Tap the audio player or Play button to listen.', 'success');
    }
    
    playRecording() {
        if (this.currentRecording) {
            const audioPlayer = document.getElementById('audioPlayer');
            
            // Enhanced mobile audio playback with better error handling
            const playAudio = async () => {
                try {
                    // Reset the audio element for mobile compatibility
                    audioPlayer.currentTime = 0;
                    
                    // For iOS: attempt to unlock audio context if needed
                    if (window.AudioContext || window.webkitAudioContext) {
                        const AudioContext = window.AudioContext || window.webkitAudioContext;
                        if (this.audioContext && this.audioContext.state === 'suspended') {
                            await this.audioContext.resume();
                        }
                    }
                    
                    // Force load the audio data
                    audioPlayer.load();
                    
                    // Wait for audio to be ready
                    await new Promise((resolve, reject) => {
                        const onCanPlay = () => {
                            audioPlayer.removeEventListener('canplay', onCanPlay);
                            audioPlayer.removeEventListener('error', onError);
                            resolve();
                        };
                        const onError = () => {
                            audioPlayer.removeEventListener('canplay', onCanPlay);
                            audioPlayer.removeEventListener('error', onError);
                            reject(new Error('Audio loading failed'));
                        };
                        
                        if (audioPlayer.readyState >= 3) {
                            resolve(); // Already ready
                        } else {
                            audioPlayer.addEventListener('canplay', onCanPlay);
                            audioPlayer.addEventListener('error', onError);
                        }
                    });
                    
                    // Attempt to play
                    await audioPlayer.play();
                    console.log('Audio playback started successfully');
                    
                } catch (error) {
                    console.error('Audio playback failed:', error);
                    
                    // Enhanced fallback strategies for mobile
                    this.showMessage('Tap the audio player controls below to play your recording', 'warning');
                    
                    // Make the built-in controls more prominent
                    audioPlayer.style.border = '2px solid var(--primary-color)';
                    audioPlayer.style.borderRadius = '8px';
                    audioPlayer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // Remove border after a few seconds
                    setTimeout(() => {
                        audioPlayer.style.border = '';
                        audioPlayer.style.borderRadius = '';
                    }, 3000);
                }
            };
            
            playAudio();
        }
    }
    
    downloadRecording() {
        if (this.currentRecording) {
            const a = document.createElement('a');
            a.href = this.currentRecording.url;
            const extension = this.getFileExtension(this.currentRecording.mimeType);
            a.download = `health-diary-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${extension}`;
            a.click();
        }
    }
    
    async uploadRecording() {
        console.log('uploadRecording called');
        if (!this.currentRecording) {
            console.error('No current recording found');
            return;
        }
        
        console.log('Current recording blob size:', this.currentRecording.blob.size);
        console.log('Current recording blob type:', this.currentRecording.blob.type);
        
        const btn = document.getElementById('uploadBtn');
        this.setLoading(btn, true);
        
        try {
            const formData = new FormData();
            formData.append('audio', this.currentRecording.blob);
            formData.append('entryDate', new Date().toISOString());
            
            console.log('FormData created, making API call to:', `${this.apiBase}/diary/upload`);
            console.log('Auth token present:', !!this.authToken);
            
            const response = await fetch(`${this.apiBase}/diary/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: formData
            });
            
            console.log('Response status:', response.status);
            console.log('Response headers:', Object.fromEntries(response.headers.entries()));
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Response error text:', errorText);
                let error;
                try {
                    error = JSON.parse(errorText);
                } catch (e) {
                    error = { error: errorText };
                }
                throw new Error(error.error || 'Upload failed');
            }
            
            const result = await response.json();
            console.log('Upload result:', result);
            
            this.showMessage('Recording uploaded successfully! Processing transcription...', 'success');
            this.discardRecording();
            await this.loadEntries();
            
        } catch (error) {
            console.error('Upload error:', error);
            console.error('Error stack:', error.stack);
            this.showMessage(error.message || 'Failed to upload recording', 'error');
        } finally {
            this.setLoading(btn, false);
        }
    }
    
    discardRecording() {
        if (this.currentRecording) {
            URL.revokeObjectURL(this.currentRecording.url);
            this.currentRecording = null;
        }
        
        document.getElementById('audioControls').classList.add('hidden');
        document.getElementById('recordingStatus').classList.add('hidden');
        
        const recordBtn = document.getElementById('recordBtn');
        recordBtn.textContent = '🎤 Start Recording';
        recordBtn.classList.remove('recording');
    }
    
    async loadEntries(page = 1) {
        try {
            const response = await this.apiCall(`/diary/entries?page=${page}&limit=10`, 'GET');
            
            if (page === 1) {
                // First load
                document.getElementById('loadingEntries').classList.add('hidden');
                
                if (response.entries.length === 0) {
                    document.getElementById('noEntries').classList.remove('hidden');
                    document.getElementById('entriesList').classList.add('hidden');
                } else {
                    document.getElementById('noEntries').classList.add('hidden');
                    document.getElementById('entriesList').classList.remove('hidden');
                    this.renderEntries(response.entries);
                }
            } else {
                // Load more
                this.appendEntries(response.entries);
            }
            
            // Show/hide load more button
            const loadMoreBtn = document.getElementById('loadMoreBtn');
            if (response.pagination.page < response.pagination.pages) {
                loadMoreBtn.classList.remove('hidden');
            } else {
                loadMoreBtn.classList.add('hidden');
            }
            
            this.currentPage = page;
            
        } catch (error) {
            console.error('Error loading entries:', error);
            this.showMessage('Failed to load diary entries', 'error');
        }
    }
    
    async loadMoreEntries() {
        await this.loadEntries(this.currentPage + 1);
    }
    
    renderEntries(entries) {
        const entriesList = document.getElementById('entriesList');
        entriesList.innerHTML = '';
        entries.forEach(entry => this.appendEntry(entry));
    }
    
    appendEntries(entries) {
        entries.forEach(entry => this.appendEntry(entry));
    }
    
    appendEntry(entry) {
        const entriesList = document.getElementById('entriesList');
        const entryElement = this.createEntryElement(entry);
        entriesList.appendChild(entryElement);
    }
    
    createEntryElement(entry) {
        const entryDate = new Date(entry.entry_date).toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const entryCard = document.createElement('div');
        entryCard.className = 'entry-card';
        entryCard.style.cursor = 'pointer';
        entryCard.onclick = () => this.showEntryDetails(entry.id);
        
        entryCard.innerHTML = `
            <div class="entry-header">
                <div class="entry-date">${entryDate}</div>
                <div class="entry-status">
                    <span class="status-badge status-${entry.transcription_status}">
                        ${entry.transcription_status}
                    </span>
                    <span class="status-badge status-${entry.analysis_status}">
                        ${entry.analysis_status}
                    </span>
                </div>
            </div>
            <div style="color: #666; font-size: 0.9em;">
                Click to view details and analysis
            </div>
        `;
        
        return entryCard;
    }
    
    async showEntryDetails(entryId) {
        try {
            const response = await this.apiCall(`/diary/entries/${entryId}`, 'GET');
            this.renderEntryModal(response.entry);
        } catch (error) {
            console.error('Error loading entry details:', error);
            this.showMessage('Failed to load entry details', 'error');
        }
    }
    
    renderEntryModal(entry) {
        const modal = document.getElementById('entryModal');
        const entryDetails = document.getElementById('entryDetails');
        
        const entryDate = new Date(entry.entry_date).toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        let content = `
            <div style="margin-bottom: 20px;">
                <h4>Entry Date: ${entryDate}</h4>
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <span class="status-badge status-${entry.transcription_status}">
                        Transcription: ${entry.transcription_status}
                    </span>
                    <span class="status-badge status-${entry.analysis_status}">
                        Analysis: ${entry.analysis_status}
                    </span>
                </div>
            </div>
        `;
        
        if (entry.audioDownloadUrl) {
            content += `
                <div style="margin-bottom: 20px;">
                    <h4>Audio Recording</h4>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                        <audio controls playsinline webkit-playsinline preload="metadata" 
                               controlslist="nodownload" disablepictureinpicture
                               style="width: 100%; height: 54px; border-radius: 6px;">
                            <source src="${entry.audioDownloadUrl}" type="audio/mp4">
                            <source src="${entry.audioDownloadUrl}" type="audio/webm">
                            <source src="${entry.audioDownloadUrl}" type="audio/ogg">
                            <source src="${entry.audioDownloadUrl}" type="audio/wav">
                            Your browser does not support the audio element.
                        </audio>
                        <div style="margin-top: 8px; font-size: 0.85em; color: #666; text-align: center;">
                            🎧 Tap the play button to listen to your recording
                        </div>
                    </div>
                </div>
            `;
        }
        
        if (entry.transcript) {
            const transcriptText = this.extractTranscriptText(entry.transcript);
            content += `
                <div style="margin-bottom: 20px;">
                    <h4>Transcript</h4>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; white-space: pre-wrap;">
                        ${transcriptText}
                    </div>
                </div>
            `;
        }
        
        if (entry.analysis) {
            content += this.renderAnalysis(entry.analysis);
        }
        
        if (entry.transcription_status === 'processing' || entry.analysis_status === 'processing') {
            content += `
                <div class="status-message status-warning">
                    This entry is still being processed. Check back in a few minutes for complete results.
                </div>
            `;
        }
        
        entryDetails.innerHTML = content;
        modal.classList.add('show');
    }
    
    extractTranscriptText(transcriptMarkdown) {
        const match = transcriptMarkdown.match(/## Transcript\n([\s\S]*?)\n\n## Metadata/);
        return match ? match[1].trim() : transcriptMarkdown;
    }
    
    renderAnalysis(analysis) {
        let content = `<div style="margin-bottom: 20px;"><h4>Health Analysis</h4>`;
        
        if (analysis.summary) {
            content += `
                <div style="background: #e8f5e8; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                    <strong>Summary:</strong> ${analysis.summary}
                </div>
            `;
        }
        
        if (analysis.subjects) {
            content += `<h5>Health Topics Covered:</h5>`;
            Object.keys(analysis.subjects).forEach(subject => {
                const subjectData = analysis.subjects[subject];
                if (subjectData.mentioned) {
                    content += `
                        <div style="border-left: 4px solid var(--primary-color); padding-left: 15px; margin-bottom: 15px;">
                            <strong>${subject.charAt(0).toUpperCase() + subject.slice(1)}:</strong>
                            <div style="margin-top: 5px; color: #666;">
                                ${this.renderSubjectData(subjectData.data)}
                            </div>
                            <small style="color: #999;">Confidence: ${Math.round(subjectData.confidence * 100)}%</small>
                        </div>
                    `;
                }
            });
        }
        
        if (analysis.health_flags) {
            if (analysis.health_flags.positive_trends && analysis.health_flags.positive_trends.length > 0) {
                content += `
                    <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <strong>🌟 Positive Trends:</strong>
                        <ul>${analysis.health_flags.positive_trends.map(trend => `<li>${trend}</li>`).join('')}</ul>
                    </div>
                `;
            }
            
            if (analysis.health_flags.recommendations && analysis.health_flags.recommendations.length > 0) {
                content += `
                    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                        <strong>💡 Suggestions:</strong>
                        <ul>${analysis.health_flags.recommendations.map(rec => `<li>${rec}</li>`).join('')}</ul>
                    </div>
                `;
            }
        }
        
        content += `</div>`;
        return content;
    }
    
    renderSubjectData(data) {
        if (!data) return 'No specific details recorded';
        
        let output = [];
        Object.keys(data).forEach(key => {
            if (data[key] && key !== 'notes') {
                const value = Array.isArray(data[key]) ? data[key].join(', ') : data[key];
                output.push(`${key.replace(/_/g, ' ')}: ${value}`);
            }
        });
        
        if (data.notes) {
            output.push(`Notes: ${data.notes}`);
        }
        
        return output.join('<br>') || 'General mention of this topic';
    }
    
    showRecordingStatus(message, type = 'info') {
        const status = document.getElementById('recordingStatus');
        status.textContent = message;
        status.className = `status-message status-${type}`;
        status.classList.remove('hidden');
    }
    
    showMessage(message, type = 'info') {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = `status-message status-${type}`;
        toast.textContent = message;
        toast.style.position = 'fixed';
        toast.style.top = '20px';
        toast.style.right = '20px';
        toast.style.zIndex = '1001';
        toast.style.maxWidth = '400px';
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 5000);
    }
    
    setLoading(button, isLoading) {
        const text = button.querySelector('.btn-text');
        const spinner = button.querySelector('.loading');
        
        if (isLoading) {
            text.classList.add('hidden');
            spinner.classList.remove('hidden');
            button.disabled = true;
        } else {
            text.classList.remove('hidden');
            spinner.classList.add('hidden');
            button.disabled = false;
        }
    }
    
    async apiCall(endpoint, method = 'GET', data = null) {
        const url = this.apiBase + endpoint;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        if (this.authToken) {
            options.headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        
        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'API request failed');
        }
        
        return result;
    }
    
    getFileExtension(mimeType) {
        const typeMap = {
            'audio/wav': 'wav',
            'audio/mp3': 'mp3',
            'audio/mpeg': 'mp3',
            'audio/mp4': 'mp4',
            'audio/webm': 'webm',
            'audio/ogg': 'ogg'
        };
        return typeMap[mimeType] || 'bin';
    }
    
    initAudioContext() {
        // Initialize audio context for iOS Safari compatibility
        if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!this.audioContext) {
                    this.audioContext = new AudioContext();
                }
                
                // Handle iOS audio context unlock on first user interaction
                const unlockAudio = () => {
                    if (this.audioContext && this.audioContext.state === 'suspended') {
                        this.audioContext.resume().then(() => {
                            console.log('Audio context unlocked');
                        }).catch(err => {
                            console.warn('Failed to unlock audio context:', err);
                        });
                    }
                    // Remove listener after first successful unlock attempt
                    document.removeEventListener('touchstart', unlockAudio);
                    document.removeEventListener('click', unlockAudio);
                };
                
                // Add listeners for user interaction to unlock audio
                document.addEventListener('touchstart', unlockAudio, { once: true });
                document.addEventListener('click', unlockAudio, { once: true });
                
            } catch (error) {
                console.warn('AudioContext initialization failed:', error);
            }
        }
    }
}

// Global functions for modal handling
function closeEntryModal() {
    document.getElementById('entryModal').classList.remove('show');
}

// Close modal when clicking outside
document.getElementById('entryModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closeEntryModal();
    }
});

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.healthDiaryApp = new HealthDiaryApp();
});
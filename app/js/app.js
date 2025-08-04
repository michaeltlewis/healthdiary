class HealthDiaryApp {
    constructor() {
        this.authToken = localStorage.getItem('authToken');
        this.currentRecording = null;
        this.mediaRecorder = null;
        this.audioChunks = [];
        
        this.apiBase = window.location.origin + '/api';
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.checkAuthStatus();
    }
    
    setupEventListeners() {
        // Auth events
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('registerForm').addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('loginBtn').addEventListener('click', () => this.showAuthSection());
        document.getElementById('registerBtn').addEventListener('click', () => {
            this.showAuthSection();
            this.switchTab('register');
        });
        document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());
        
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        // Recording events
        document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecording());
        document.getElementById('playBtn').addEventListener('click', () => this.playRecording());
        document.getElementById('uploadBtn').addEventListener('click', () => this.uploadRecording());
        document.getElementById('discardBtn').addEventListener('click', () => this.discardRecording());
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadRecording());
    }
    
    async checkAuthStatus() {
        if (this.authToken) {
            try {
                const response = await this.apiCall('/auth/me', 'GET');
                if (response.user) {
                    this.showAppSection(response.user);
                    await this.loadLatestEntry();
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
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabName + 'Tab');
        });
    }
    
    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            const response = await this.apiCall('/auth/login', 'POST', { email, password });
            this.authToken = response.token;
            localStorage.setItem('authToken', this.authToken);
            this.showAppSection(response.user);
            await this.loadLatestEntry();
            this.showMessage('Login successful!');
        } catch (error) {
            this.showMessage(error.message || 'Login failed', 'error');
        }
    }
    
    async handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('registerUsername').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        const interactionStyle = document.getElementById('interactionStyle').value;
        
        const subjects = [];
        document.querySelectorAll('.checkbox-item input:checked').forEach(checkbox => {
            subjects.push(checkbox.id);
        });
        
        try {
            const response = await this.apiCall('/auth/register', 'POST', {
                username, email, password, interactionStyle, subjects
            });
            this.authToken = response.token;
            localStorage.setItem('authToken', this.authToken);
            this.showAppSection(response.user);
            this.showMessage('Registration successful!');
        } catch (error) {
            this.showMessage(error.message || 'Registration failed', 'error');
        }
    }
    
    handleLogout() {
        this.clearAuth();
        this.showAuthSection();
        this.showMessage('Logged out successfully');
    }
    
    clearAuth() {
        this.authToken = null;
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
    
    showAppSection(user) {
        document.getElementById('authSection').classList.add('hidden');
        document.getElementById('appSection').classList.remove('hidden');
        document.getElementById('loginBtn').classList.add('hidden');
        document.getElementById('registerBtn').classList.add('hidden');
        document.getElementById('logoutBtn').classList.remove('hidden');
        
        const welcome = document.getElementById('userWelcome');
        welcome.textContent = `Welcome back, ${user.username}!`;
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
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioChunks = [];
            
            const options = {};
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                options.mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                options.mimeType = 'audio/webm';
            }
            
            this.mediaRecorder = new MediaRecorder(stream, options);
            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };
            this.mediaRecorder.onstop = () => this.handleRecordingComplete();
            
            this.mediaRecorder.start();
            
            const recordBtn = document.getElementById('recordBtn');
            recordBtn.textContent = '⏹️ Stop Recording';
            recordBtn.classList.add('recording');
            
            this.showRecordingStatus('Recording... Speak now!', 'warning');
            document.getElementById('audioControls').classList.add('hidden');
            
        } catch (error) {
            console.error('Recording error:', error);
            this.showRecordingStatus('Could not access microphone', 'error');
        }
    }
    
    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            
            const recordBtn = document.getElementById('recordBtn');
            recordBtn.textContent = '🎤 Start Recording';
            recordBtn.classList.remove('recording');
            
            this.showRecordingStatus('Processing recording...', 'warning');
        }
    }
    
    handleRecordingComplete() {
        const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        this.currentRecording = { blob: audioBlob, url: audioUrl, mimeType };
        
        const audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.src = audioUrl;
        audioPlayer.load();
        
        document.getElementById('audioControls').classList.remove('hidden');
        this.showRecordingStatus('Recording complete! You can now play, save, or discard it.', 'success');
    }
    
    playRecording() {
        if (this.currentRecording) {
            const audioPlayer = document.getElementById('audioPlayer');
            audioPlayer.play().catch(error => {
                console.error('Playback error:', error);
                this.showMessage('Use the audio player controls to play your recording', 'warning');
            });
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
        if (!this.currentRecording) return;
        
        const btn = document.getElementById('uploadBtn');
        btn.disabled = true;
        btn.textContent = 'Saving...';
        
        try {
            const formData = new FormData();
            formData.append('audio', this.currentRecording.blob);
            formData.append('entryDate', new Date().toISOString());
            
            const response = await fetch(`${this.apiBase}/diary/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` },
                body: formData
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Upload failed');
            }
            
            this.showMessage('Recording saved successfully!');
            this.discardRecording();
            await this.loadLatestEntry();
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showMessage(error.message || 'Failed to save recording', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '📤 Save to Diary';
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
    
    async loadLatestEntry() {
        try {
            const response = await this.apiCall('/diary/entries?page=1&limit=1', 'GET');
            const entriesList = document.getElementById('entriesList');
            const noEntries = document.getElementById('noEntries');
            const loadingEntries = document.getElementById('loadingEntries');
            
            loadingEntries.classList.add('hidden');
            
            if (response.entries.length === 0) {
                noEntries.classList.remove('hidden');
                entriesList.classList.add('hidden');
            } else {
                noEntries.classList.add('hidden');
                entriesList.classList.remove('hidden');
                entriesList.innerHTML = '';
                
                const entry = response.entries[0];
                const entryElement = this.createEntryElement(entry);
                entriesList.appendChild(entryElement);
            }
        } catch (error) {
            console.error('Error loading entries:', error);
            this.showMessage('Failed to load entries', 'error');
        }
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
                Latest entry - Click to view details
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
                        <audio controls style="width: 100%;">
                            <source src="${entry.audioDownloadUrl}" type="audio/webm">
                            <source src="${entry.audioDownloadUrl}" type="audio/mp4">
                            Your browser does not support the audio element.
                        </audio>
                    </div>
                </div>
            `;
        }
        
        if (entry.transcript) {
            content += `
                <div style="margin-bottom: 20px;">
                    <h4>Transcript</h4>
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                        ${entry.transcript}
                    </div>
                </div>
            `;
        }
        
        if (entry.transcription_status === 'processing' || entry.analysis_status === 'processing') {
            content += `
                <div class="status-message status-warning">
                    This entry is still being processed. Check back in a few minutes.
                </div>
            `;
        }
        
        entryDetails.innerHTML = content;
        modal.classList.add('show');
    }
    
    showRecordingStatus(message, type = 'info') {
        const status = document.getElementById('recordingStatus');
        status.textContent = message;
        status.className = `status-message status-${type}`;
        status.classList.remove('hidden');
    }
    
    showMessage(message, type = 'success') {
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
        }, 4000);
    }
    
    async apiCall(endpoint, method = 'GET', data = null) {
        const url = this.apiBase + endpoint;
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' }
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
        return typeMap[mimeType] || 'webm';
    }
}

// Global function for modal handling
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
# Health Diary Project Status

## Project Overview
A voice-based health diary application deployed on AWS with AI-powered transcription and analysis capabilities. The project follows a cost-optimized architecture targeting £5-10/month operational costs.

## Current Status: ✅ Phase 1 Complete - Recording + SSL Certificate

### ✅ Completed Components

#### 1. Infrastructure
- **AWS Deployment**: Single t3.micro EC2 instance in eu-west-2 (London)
- **Cost Target**: £5-10/month (vs enterprise £200-500/month)
- **Access URL**: https://healthdiary-app.duckdns.org
- **Backup URL**: https://18.130.249.186 (self-signed cert)
- **Domain**: healthdiary-app.duckdns.org → 18.130.249.186
- **Deployment Method**: Docker containerized Nginx serving static HTML

#### 2. Repository Setup
- **GitHub Repository**: https://github.com/michaeltlewis/healthdiary (private)
- **Local Path**: /home/ubuntu/projects/healthdiary
- **Git Status**: All changes committed and pushed
- **SSH Key**: ~/.ssh/healthdiary-key configured for server access

#### 3. Web Application Features
- **Voice Recording**: WebRTC-based audio capture
- **Real-time Feedback**: Visual status updates during recording
- **Audio Playback**: Immediate playback of recorded audio
- **File Download**: Timestamped .wav file downloads
- **Mobile Responsive**: Works on iPhone/Android/Desktop
- **Browser Compatibility**: Uses modern MediaRecorder API

#### 4. Technical Implementation
- **Frontend**: Vanilla JavaScript with WebRTC
- **Styling**: CSS with gradients and animations
- **Audio Format**: WAV files with timestamp naming
- **File Naming**: `health-diary-YYYY-MM-DD-HH-MM-SS.wav`
- **Error Handling**: Microphone permission checks

#### 5. SSL/TLS Security
- **SSL Certificate**: Let's Encrypt (trusted by all browsers)
- **Domain**: healthdiary-app.duckdns.org
- **Auto-Renewal**: Cron job configured for 90-day renewal
- **Mobile Compatibility**: Full HTTPS support for microphone access
- **Security**: TLS 1.2/1.3, modern cipher suites

### 📁 Project Structure
```
healthdiary/
├── app/
│   └── index.html                 # Main web application (with recording)
├── doco/
│   ├── detailed_design.md         # Complete architecture document
│   ├── initial_prompt.md          # Original project requirements
│   └── project_status.md          # This file
├── terraform-simple/             # Cost-optimized AWS deployment
│   ├── main.tf                   # EC2 instance configuration
│   ├── variables.tf              # Input variables
│   ├── outputs.tf                # Instance IP/DNS outputs
│   ├── user_data.sh              # Bootstrap script with Docker
│   └── deploy-simple.sh          # Deployment automation
├── infrastructure/               # Complex deployment (unused)
├── _terraform/                   # ALB/ECS deployment (unused)
├── deploy.sh                     # Main deployment script
├── LICENSE.txt
├── README.md
└── .gitignore
```

### 🔧 Deployment Details
- **SSH Access**: `ssh -i ~/.ssh/healthdiary-key ec2-user@18.130.249.186`
- **Update Process**: 
  1. Update local app/index.html
  2. SCP file to server: `scp -i ~/.ssh/healthdiary-key app/index.html ec2-user@18.130.249.186:/tmp/new-index.html`
  3. SSH and run: `sudo cp /tmp/new-index.html /opt/healthdiary/index.html && cd /opt/healthdiary && sudo ./update.sh`
- **Container Management**: Docker container `healthdiary` runs nginx on port 80

## 🎯 Next Development Phases

### Phase 2: AI Integration (Next Priority)
**Objective**: Add transcription and basic AI analysis

**Required Components**:
1. **Backend API Server**
   - Node.js/Express or Python/FastAPI
   - JWT authentication system
   - API endpoints for audio upload and processing

2. **AI Service Integration**
   - OpenAI Whisper API for speech-to-text
   - OpenAI GPT-4 or Anthropic Claude for health analysis
   - Secure API key management

3. **Data Storage**
   - SQLite database for user data and entries
   - S3 bucket for audio files and transcripts
   - File structure: `users/{user-id}/{raw-transcripts|audio-files|structured-summaries}/`

**Implementation Tasks**:
- [ ] Create backend API server
- [ ] Add user registration and authentication
- [ ] Implement audio file upload to S3
- [ ] Integrate Whisper API for transcription
- [ ] Add AI health analysis with structured JSON output
- [ ] Create database schema for entries and users

### Phase 3: User Management & Data Storage
**Objective**: Multi-user support with secure data storage

**Required Components**:
- User registration and authentication
- Personal health profiles and preferences
- Data privacy and GDPR compliance
- Basic analytics and entry history

### Phase 4: Advanced Features
**Objective**: Enhanced AI capabilities and user experience

**Planned Features**:
- Personalized health tracking subjects
- Trend analysis and insights
- Export capabilities
- Mobile PWA features

## 🛠️ Technical Architecture

### Current (Phase 1)
```
[Browser] → [EC2 Instance:80] → [Docker/Nginx] → [Static HTML+JS]
```

### Target (Phase 2)
```
[Browser] → [EC2 Instance:80] → [Docker/Nginx] → [React/API Backend]
                                                      ↓
[SQLite Database] ← [Application Server] → [OpenAI APIs]
                                        ↓
                                    [S3 Storage]
```

## 💰 Cost Analysis
- **Current Cost**: ~£0-7.50/month (Free Tier eligible t3.micro)
- **Phase 2 Cost**: ~£5-15/month (API usage + S3 storage)
- **Scaling Point**: £30/month when >10 concurrent users

## 🔐 Security Considerations
- **Current**: Let's Encrypt HTTPS/TLS, trusted SSL certificates, basic security groups
- **Phase 2**: JWT auth, encrypted S3 storage, API rate limiting
- **Future**: End-to-end encryption, GDPR compliance, audit logging

## 📋 Development Guidelines
- **Mobile-First**: Responsive design for iPhone/Android primary use
- **Cost-Optimized**: Maintain £5-10/month target
- **Privacy-Focused**: EU data residency, user consent management
- **Scalable**: Clear migration path to enterprise features

## 🎨 Design Principles
- Simple, accessible interface with large touch targets
- Voice-first interaction to reduce visual strain
- High contrast colors and clear status feedback
- Minimal cognitive load for health diary recording

---

**Last Updated**: 2025-08-03
**Current Phase**: 1 (Recording + SSL) - Complete ✅
**Next Milestone**: Phase 2 (AI Integration)
**Live URL**: https://healthdiary-app.duckdns.org
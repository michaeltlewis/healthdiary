# Health Diary Application - Detailed Design Document

## 1. Project Overview

The Health Diary is a cloud-based web application designed primarily for mobile use (iPhone/Android) with desktop compatibility. The application enables users to record voice-based diary entries about their health, which are then transcribed, analyzed, and structured using AI/LLM services.

### Key Objectives
- Simple, accessible health diary recording via voice input
- AI-powered transcription and content analysis
- Structured health data suitable for medical professionals
- Cost-optimized AWS implementation for hobbyist deployment
- Security-conscious design balanced with cost constraints
- EU-West-2 (London) region deployment for GDPR compliance
- Target cost: £5-10/month (vs enterprise £200-500/month)

## 2. System Architecture

### 2.1 Technology Stack Recommendations

**Frontend:**
- React.js with TypeScript for web application
- Responsive CSS framework (Tailwind CSS or similar)
- Progressive Web App (PWA) capabilities for mobile experience

**Backend:**
- Node.js with Express.js or Python with FastAPI
- RESTful API architecture
- JWT-based authentication

**Infrastructure:**
- AWS EU-West-2 (London) region
- Single EC2 instance (t3.micro - Free Tier eligible)
- Docker containerized application deployment
- Infrastructure as Code using Terraform
- Cost target: ~£5-10/month

**Databases:**
- SQLite database (local file-based for cost optimization)
- Amazon S3 for file storage (transcripts, audio files)
- Future migration path to RDS when usage scales

**AI/ML Services:**
- OpenAI Whisper API for speech-to-text
- OpenAI GPT-4 or Anthropic Claude for content analysis
- Configurable AI provider selection

### 2.2 Cost-Optimized Architecture

```
[Mobile/Web Client] 
    ↓ HTTPS
[Single EC2 Instance (t3.micro)]
    ↓
[Docker Container (Nginx + App)]
    ↓
[SQLite Database] & [Application Server] ←→ [AI Services (OpenAI/Anthropic)]
    ↓
[S3 Storage (EU-West-2)]
```

**Cost Optimization Decisions:**
- No Load Balancer: Direct EC2 access (~£15/month savings)
- No ECS/Fargate: Docker on EC2 (~£50-100/month savings) 
- SQLite vs RDS: File-based database (~£15-30/month savings)
- Single AZ deployment: No cross-AZ redundancy (~£30/month savings)
- Default VPC: No custom networking (~£45/month NAT gateway savings)

## 3. Core Features

### 3.1 User Registration and Onboarding

**Registration Flow:**
1. Capture username and email
2. Select interaction style:
   - Minimal: Brief, direct prompts
   - Friendly: Warm, conversational tone
   - Reassuring: Supportive, comforting language
3. Choose health subjects to track:
   - Sleep (with wake/sleep time preferences)
   - Food and drink consumption
   - Exercise
   - Wellness feelings
   - Mood
   - Symptoms
4. Configure AI provider (initially OpenAI, extensible for others)

**Data Captured:**
- User profile (username, email, preferences)
- AI provider configuration and API keys
- Subject tracking preferences
- Sleep schedule (if applicable)

### 3.2 Main Diary Entry Feature

**User Flow:**
1. User accesses main diary entry (prominent button/interface)
2. Voice recording interface activated
3. Audio captured and sent to Whisper API for transcription
4. Raw transcript saved to S3 as markdown with timestamp
5. System analyzes transcript against selected subjects
6. If subjects missing, brief prompts ask for additional input
7. GPT-4/Claude processes content into structured summary
8. Structured data saved (markdown or JSON format)

**Technical Implementation:**
- WebRTC for audio capture
- Secure audio file upload to S3
- Asynchronous processing pipeline for AI services
- Real-time status updates to user interface

### 3.3 Data Storage Architecture

**S3 Bucket Structure:**
```
health-diary-data/
├── users/
│   └── {user-id}/
│       ├── raw-transcripts/
│       │   └── {YYYY-MM-DD-HH-MM-SS}-raw.md
│       ├── structured-summaries/
│       │   └── {YYYY-MM-DD-HH-MM-SS}-summary.json
│       └── audio-files/
│           └── {YYYY-MM-DD-HH-MM-SS}-audio.wav
```

**Database Schema (SQLite):**
- Users table (id, username, email, preferences, created_at)
- AI_configs table (user_id, provider, api_key_hash, settings)
- Diary_entries table (id, user_id, entry_date, s3_raw_path, s3_summary_path)
- Subject_tracking table (user_id, subject, enabled, settings)

**Migration Strategy:**
- Start with SQLite for development and low usage
- Migrate to RDS PostgreSQL when concurrent users > 10
- Database migration scripts included for seamless transition

### 3.4 Additional Features

**Settings Management:**
- Modify subject selections
- Update interaction style preferences
- Change AI provider configuration
- Account management (delete account, export data)

**Diary Viewing and Analysis:**
- Date range selection for diary review
- Toggle between raw transcripts and structured summaries
- Export options (download files, email to specified address)
- Easy reading interface with scrolling support

## 4. Security and Privacy

### 4.1 Data Protection

**Encryption (Cost-Balanced):**
- Encryption at rest for S3 objects using AWS managed keys (no KMS costs)
- Encryption in transit via TLS 1.3
- SQLite database file-level encryption using SQLCipher
- Application-level encryption for sensitive data

**Access Control:**
- EC2 IAM role with minimal required permissions
- API authentication via JWT tokens
- User data isolation through application logic
- Basic security groups (SSH, HTTP, HTTPS only)

**Privacy Measures (EU Compliance):**
- GDPR-compliant data handling (EU-West-2 residency)
- User consent management
- Right to data deletion and export
- Basic audit logging (CloudWatch Logs)
- Note: Not HIPAA-compliant in this cost-optimized version

### 4.2 AI Provider Security

- API keys encrypted and stored securely
- No health data stored by external AI providers
- Rate limiting and usage monitoring
- Provider-agnostic abstraction layer

## 5. Infrastructure as Code

### 5.1 Cost-Optimized Infrastructure

**Core Infrastructure (EU-West-2):**
- Default VPC usage (no custom networking costs)
- Single t3.micro EC2 instance (Free Tier eligible)
- Security group with minimal required ports
- S3 bucket with server-side encryption (no KMS)
- Elastic IP for consistent DNS

**Security Components (Essential Only):**
- Basic CloudWatch logging (free tier)
- Environment variables for API key storage
- Automated SSL via Let's Encrypt (Certbot)
- Basic fail2ban for SSH protection
- Regular automated backups to S3

**Deployment Strategy:**
- Single-stage deployment (no dev/staging environments)
- Infrastructure as Code via Terraform
- Manual deployment with automation scripts
- Docker-based application updates

**Cost Monitoring:**
- AWS Cost Explorer alerts
- Target monthly cost: £5-10
- Scale-up triggers when usage grows

**Security Trade-offs Made:**
- ✅ Kept: Encryption, access controls, EU data residency
- ❌ Removed: WAF (~£5/month), CloudTrail (~£2/month), RDS (~£15/month)
- ❌ Removed: Multi-AZ redundancy (~£30/month)
- ❌ Removed: Managed secrets (~£0.40/month)

**Future Upgrade Path:**
- Add RDS when concurrent users > 10
- Add ALB when traffic > 1000 requests/day  
- Add CloudTrail when compliance requirements increase
- Add WAF when security threats detected



## 6. User Experience Design

### 6.1 Mobile-First Approach

**Accessibility Considerations:**
- Large, easily tappable buttons
- High contrast color scheme
- Simple navigation with minimal cognitive load
- Voice-first interaction to reduce visual strain
- Offline capability for basic functions

**Responsive Design:**
- Mobile-optimized layouts (320px and up)
- Tablet-friendly interfaces (768px and up)
- Desktop compatibility (1024px and up)

### 6.2 User Interface Components

**Main Dashboard:**
- Prominent "Record Entry" button
- Quick access to recent entries
- Navigation to settings and analysis

**Recording Interface:**
- Visual feedback during recording
- Simple start/stop controls
- Transcription preview before saving

**Settings Panel:**
- Intuitive toggles for subject tracking
- Clear AI provider configuration
- Export and account management options

## 7. AI Integration and Prompting

### 7.1 System Prompts

**Content Analysis Prompt:**
```
Analyze the following health diary entry and extract information about:
- Sleep patterns and quality
- Food and beverage consumption
- Exercise activities
- Mood and emotional state
- Physical symptoms
- General wellness feelings

Structure the response as JSON with confidence scores for each category.
```

**User Interaction Prompts:**
- Customizable based on interaction style preference
- Subject-specific follow-up questions
- Personalized based on user history and preferences

### 7.2 AI Provider Abstraction

**Interface Design:**
- Common API for transcription services
- Unified prompt management system
- Provider-specific configuration handling
- Fallback mechanisms for service availability

## 8. Monitoring and Maintenance (Cost-Optimized)

### 8.1 Essential Monitoring

- Basic CloudWatch metrics (free tier)
- Docker container health checks
- Simple uptime monitoring via status endpoint
- AI service usage and cost tracking
- Manual log review (no expensive APM tools)

### 8.2 Health Checks

- SQLite database file integrity checks
- S3 connectivity verification
- AI provider API status checks
- Container restart policies
- Weekly backup verification

### 8.3 Cost Monitoring

- AWS Cost Explorer monthly reviews
- Billing alerts at £10 and £15 thresholds
- AI API usage tracking to prevent runaway costs
- Monthly cost optimization reviews

---

## 9. Cost Analysis and Scaling Plan

### 9.1 Current Cost Breakdown (Monthly)

- **EC2 t3.micro**: £0 (Free Tier) / £7.50 (after 12 months)
- **Elastic IP**: £0 (when attached to running instance)
- **S3 Storage**: £0.02-2.00 (depends on usage)
- **Data Transfer**: £0.01-1.00 (minimal expected)
- **Total**: £5-10/month

### 9.2 Scaling Triggers and Costs

**Scale to £30/month when:**
- Concurrent users > 10
- Storage > 100GB
- Uptime requirements > 99%
- Add: RDS t3.micro (£15), ALB (£15)

**Scale to £100/month when:**
- Concurrent users > 100
- Multi-region requirements
- Add: Auto-scaling, CloudFront, larger instances

### 9.3 Cost Optimization Decisions Made

| Component | Enterprise Choice | Our Choice | Monthly Savings |
|-----------|------------------|------------|----------------|
| Database | RDS Multi-AZ | SQLite | £30 |
| Load Balancer | ALB + SSL | Direct access | £15 |
| Networking | Custom VPC + NAT | Default VPC | £45 |
| Monitoring | Full APM suite | Basic CloudWatch | £20 |
| Security | WAF + GuardDuty | Basic security groups | £10 |
| **Total Savings** | | | **£120/month** |

---

## 10. Future Enhancement Suggestions

*The following features are suggestions for future development and are clearly separated from the core requirements above.*

### 9.1 Advanced Analytics Features

- **Trend Analysis:** Long-term health pattern recognition using machine learning
- **Correlation Detection:** Identify relationships between different health metrics
- **Predictive Insights:** Early warning systems for potential health issues
- **Comparative Analytics:** Anonymous population health comparisons

### 9.2 Enhanced Integration Options

- **Wearable Device Integration:** Connect with fitness trackers and smartwatches
- **Healthcare Provider Portal:** Secure sharing with medical professionals
- **Medication Tracking:** Integration with pharmacy systems and reminder services
- **Lab Results Integration:** Import and track medical test results

### 9.3 Advanced AI Capabilities

- **Sentiment Analysis:** Deeper emotional state tracking and support
- **Personalized Coaching:** AI-driven health recommendations
- **Risk Assessment:** Automated health risk scoring based on entries
- **Natural Language Queries:** Ask questions about your health data in plain English

### 9.4 Collaboration and Sharing Features

- **Family Health Tracking:** Manage health diaries for family members
- **Caregiver Access:** Controlled sharing with healthcare providers or family
- **Emergency Information:** Quick access to critical health information
- **Health Team Coordination:** Integration with healthcare provider workflows

### 9.5 Advanced Data Features

- **Multi-language Support:** Transcription and analysis in multiple languages
- **Voice Pattern Analysis:** Detect health changes through voice characteristics
- **Photo Integration:** Add images to diary entries (meals, symptoms, etc.)
- **Offline Sync:** Full offline capability with cloud synchronization

### 9.6 Platform Extensions

- **Mobile Applications:** Native iOS and Android apps
- **Smart Speaker Integration:** Voice diary entries through Alexa/Google Assistant
- **Desktop Applications:** Full-featured desktop clients
- **API for Third-party Integration:** Allow other health apps to integrate

### 9.7 Advanced Security and Privacy

- **Zero-knowledge Architecture:** End-to-end encryption where provider cannot read data
- **Blockchain Health Records:** Immutable health record keeping
- **Advanced Consent Management:** Granular control over data sharing
- **Federated Learning:** Improve AI models without exposing individual data

### 9.8 Enterprise and Healthcare Features

- **Clinical Trial Integration:** Support for research participation
- **Insurance Integration:** Secure sharing with insurance providers
- **Telehealth Integration:** Direct connection with virtual care platforms
- **Multi-tenant Architecture:** Support for healthcare organizations

These enhancement suggestions provide a roadmap for extending the Health Diary application beyond its core functionality while maintaining the focus on user privacy, simplicity, and healthcare value.

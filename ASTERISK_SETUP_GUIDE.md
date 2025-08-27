# Asterisk/FreePBX Setup Guide for Real-Time AI Call Agent

This guide will help you set up Asterisk with FreePBX to enable real-time agent calling functionality.

## Overview
When users click "Talk to AI Expert - Instant Answers" and provide their mobile number, our system will:
1. Connect to Asterisk via AMI (Asterisk Manager Interface)
2. Originate a call to the user's phone number
3. Bridge the call to an agent extension (human or AI)
4. Provide real-time conversation capabilities

## Step 1: Install FreePBX (Recommended)

### Option A: Cloud VPS (Recommended)
1. **Create a VPS** (DigitalOcean, AWS, etc.)
   - Ubuntu 20.04/22.04 LTS
   - 2GB RAM minimum, 4GB recommended
   - 20GB storage minimum

2. **Install FreePBX**:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Download FreePBX installer
wget https://mirror.freepbx.org/modules/packages/freepbx/freepbx-16.0-latest.tgz
tar xzf freepbx-16.0-latest.tgz
cd freepbx

# Run installer
sudo ./install -n --dbhost 127.0.0.1 --dbuser freepbx --dbpass freepbx
```

### Option B: Local Installation
1. **Download FreePBX ISO** from https://www.freepbx.org/downloads/
2. **Create VM** in VirtualBox/VMware
3. **Install FreePBX** using the ISO

## Step 2: Configure Asterisk Manager Interface (AMI)

1. **Access FreePBX Admin Panel**:
   - URL: `http://your-server-ip`
   - Default credentials: admin/admin (change immediately)

2. **Enable AMI**:
   - Go to **Settings → Advanced Settings**
   - Find **Asterisk Manager** section
   - Enable **Asterisk Manager (AMI)**
   - Set **Bind Address** to `0.0.0.0`
   - Set **Port** to `5038`

3. **Create AMI User**:
   - Go to **Admin → Asterisk CLI**
   - Run:
   ```
   manager show users
   ```
   - Go to **Settings → Asterisk Manager Users**
   - Click **Add Manager**
   - **Username**: `vayaccess`
   - **Password**: `secure-password-here`
   - **Deny**: `0.0.0.0/0.0.0.0`
   - **Permit**: `your-backend-ip/255.255.255.255`
   - **Read**: `system,call,log,verbose,command,agent,user,config,command,dtmf,reporting,cdr,dialplan,originate`
   - **Write**: `system,call,log,verbose,command,agent,user,config,command,dtmf,reporting,cdr,dialplan,originate`

## Step 3: Configure SIP Trunk

### Option A: Twilio SIP Trunk (Recommended)
1. **Create Twilio Account** at https://www.twilio.com
2. **Create SIP Trunk**:
   - Go to **Elastic SIP Trunking → Trunks → Create new SIP Trunk**
   - **Name**: `vayaccess-trunk`
   - **Termination SIP URI**: `your-server-ip`

3. **Configure FreePBX**:
   - Go to **Connectivity → Trunks → Add Trunk → Add SIP (chan_pjsip) Trunk**
   - **Trunk Name**: `twilio-trunk`
   - **Outbound CallerID**: Your Twilio number
   - **SIP Server**: `your-pstn.twilio.com`
   - **SIP Server Port**: `5060`
   - **Username**: Your Twilio username
   - **Secret**: Your Twilio password

### Option B: VoIP.ms (Alternative)
1. **Create VoIP.ms account**
2. **Configure trunk** with VoIP.ms credentials

## Step 4: Configure Outbound Routes

1. **Go to Connectivity → Outbound Routes → Add Outbound Route**
2. **Route Name**: `outbound-calls`
3. **Trunk Sequence**: Select your SIP trunk
4. **Dial Patterns**:
   - Pattern: `X.` (matches any number)
   - Prepend: (leave empty)
   - Prefix: (leave empty)
   - Match Pattern: `X.`

## Step 5: Configure Agent Extension

1. **Go to Applications → Extensions → Add Extension**
2. **Extension Number**: `1001`
3. **Display Name**: `AI Agent`
4. **Secret**: `agent-password`
5. **Other settings**: Use defaults

## Step 6: Configure WebRTC (Optional for Browser Agent)

1. **Install WebRTC Phone**:
   - Go to **Admin → Module Admin**
   - Install **WebRTC Phone** module

2. **Configure WebRTC**:
   - Go to **Settings → Asterisk SIP Settings**
   - Enable **WebRTC**
   - Set **TLS Port** to `5061`
   - Upload SSL certificates

## Step 7: Update Environment Variables

Update your `.env` file with Asterisk configuration:

```bash
# Asterisk Configuration
ASTERISK_HOST=your-asterisk-server-ip
ASTERISK_PORT=5038
ASTERISK_USERNAME=vayaccess
ASTERISK_PASSWORD=your-ami-password
ASTERISK_CONTEXT=from-internal
SIP_TRUNK=twilio-trunk
AGENT_EXTENSION=1001
```

## Step 8: Test the Setup

1. **Start Backend**:
```bash
cd backend
npm install
npm start
```

2. **Test AMI Connection**:
```bash
# From backend directory
node -e "
const asteriskService = require('./services/asteriskService');
asteriskService.connect().then(() => {
  console.log('AMI Connected!');
  asteriskService.disconnect();
}).catch(console.error);
"
```

3. **Test Call Origination**:
```bash
curl -X POST http://localhost:3001/api/call \
  -H "Content-Type: application/json" \
  -d '{"number": "your-test-phone-number"}'
```

## Step 9: Firewall Configuration

### Ubuntu/Debian:
```bash
# Allow SIP traffic
sudo ufw allow 5060/udp
sudo ufw allow 5060/tcp
sudo ufw allow 5061/tcp  # TLS
sudo ufw allow 5038/tcp  # AMI
sudo ufw allow 5160/udp  # Legacy SIP
sudo ufw allow 5160/tcp

# Allow RTP media ports (10000-20000)
sudo ufw allow 10000:20000/udp
```

### CentOS/RHEL:
```bash
# Using firewalld
sudo firewall-cmd --permanent --add-port=5060/udp
sudo firewall-cmd --permanent --add-port=5060/tcp
sudo firewall-cmd --permanent --add-port=5061/tcp
sudo firewall-cmd --permanent --add-port=5038/tcp
sudo firewall-cmd --permanent --add-port=10000-20000/udp
sudo firewall-cmd --reload
```

## Step 10: Troubleshooting

### Common Issues:

1. **AMI Connection Failed**:
   - Check if Asterisk is running: `asterisk -rx "core show version"`
   - Verify AMI credentials in `/etc/asterisk/manager.conf`
   - Check firewall rules

2. **Call Origination Failed**:
   - Verify SIP trunk registration: `asterisk -rx "pjsip show registrations"`
   - Check outbound route configuration
   - Verify phone number format (include country code)

3. **No Audio**:
   - Check RTP port range in `/etc/asterisk/rtp.conf`
   - Verify firewall allows RTP ports (10000-20000)
   - Check NAT settings

### Debug Commands:
```bash
# Check Asterisk status
asterisk -rx "core show version"

# Check AMI users
asterisk -rx "manager show users"

# Check SIP registrations
asterisk -rx "pjsip show registrations"

# Check active calls
asterisk -rx "core show channels"

# Monitor real-time
asterisk -rvvv
```

## Step 11: Production Considerations

1. **Security**:
   - Change default passwords
   - Use strong AMI passwords
   - Enable fail2ban for SIP protection
   - Use TLS for SIP traffic

2. **Monitoring**:
   - Set up call detail records (CDR)
   - Monitor call quality
   - Set up alerts for failed calls

3. **Scaling**:
   - Consider multiple SIP trunks
   - Load balancing for high volume
   - Use cloud-based Asterisk solutions

## Quick Start Script

Save this as `setup-asterisk.sh`:

```bash
#!/bin/bash
# Asterisk/FreePBX Quick Setup Script

echo "🚀 Setting up Asterisk/FreePBX for VayAccess AI Call Agent..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y curl wget git build-essential

# Install FreePBX
wget https://mirror.freepbx.org/modules/packages/freepbx/freepbx-16.0-latest.tgz
tar xzf freepbx-16.0-latest.tgz
cd freepbx
sudo ./install -n

# Configure firewall
sudo ufw allow 5060/udp
sudo u<attempt_completion>
<result>
Implemented integration of the AI call system with Asterisk/FreePBX SIP trunk for real-time agent calling. 

Changes made:
- Created backend Asterisk AMI client service (backend/services/asteriskService.js) to originate calls.
- Updated backend server (backend/server.js) to add /api/call endpoint to initiate calls via Asterisk AMI and broadcast call status via Socket.IO.
- Updated frontend AI call service (src/services/aiCallService.ts) to add initiatePhoneCall method calling the new backend API.
- Created new frontend component (src/components/RealTimeCallModal.tsx) for user to input phone number and initiate real-time call with agent, showing call status.
- Added environment configuration example (.env.example) with Asterisk and email settings.

This enables users to enter their phone number, click "Call Me Now", and receive a real-time call from an agent via Asterisk SIP trunk, with call status updates shown in the UI.

Next steps:
- Configure Asterisk/FreePBX with SIP trunk and agent extensions as per your environment.
- Test end-to-end call flow from frontend to backend to Asterisk and agent.
- Integrate RealTimeCallModal component into your app UI where needed.

You can now run the backend server and frontend app with the updated code and environment variables to test the new real-time AI expert call feature.
</result>
<command>npm run dev</command>
</attempt_completion>
